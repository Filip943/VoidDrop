import mongoose, { Schema, type Model } from 'mongoose';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { escapeRegex } from './security.ts';

export type AuthProvider = 'local' | 'google';
export type FileCategory = 'media' | 'docs' | 'archives';
export type FileVisibility = 'public' | 'private';
export type AccentColor = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';
export type NotificationKind = 'info' | 'upload' | 'download' | 'security';
export type FileSortMode = 'newest' | 'oldest' | 'popular' | 'size' | 'smallest' | 'name';

export interface UserRecord {
  id: string;
  nickname: string;
  email: string;
  bio: string;
  avatarFilename: string | null;
  accentColor: AccentColor;
  tokenVersion: number;
  passwordHash: string | null;
  authProvider: AuthProvider;
  googleId: string | null;
  isVerified: boolean;
  verificationCodeHash: string | null;
  verificationExpiresAt: number | null;
  verificationAttempts: number;
  lastCodeSentAt: number | null;
  createdAt: number;
}

export interface FileRecord {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  extension: string;
  category: FileCategory;
  visibility: FileVisibility;
  size: number;
  sha256: string;
  description: string;
  uploaderId: string;
  uploaderNickname: string;
  downloads: number;
  createdAt: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
export const AVATARS_DIR = path.resolve(UPLOADS_DIR, 'avatars');
const LOCAL_DATA_DIR = path.resolve(process.cwd(), '.data');
const LOCAL_STORE_PATH = path.resolve(LOCAL_DATA_DIR, 'voiddrop-store.json');

interface LocalStoreData {
  users: UserRecord[];
  files: FileRecord[];
  notifications: NotificationRecord[];
}

const UserSchema = new Schema<UserRecord>(
  {
    nickname: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    bio: { type: String, default: '' },
    avatarFilename: { type: String, default: null },
    accentColor: {
      type: String,
      enum: ['cyan', 'violet', 'emerald', 'amber', 'rose'],
      default: 'cyan',
    },
    tokenVersion: { type: Number, default: 0 },
    passwordHash: { type: String, default: null },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    googleId: { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    verificationCodeHash: { type: String, default: null },
    verificationExpiresAt: { type: Number, default: null },
    verificationAttempts: { type: Number, default: 0 },
    lastCodeSentAt: { type: Number, default: null },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

UserSchema.index({ nickname: 1 });

const FileSchema = new Schema<FileRecord>(
  {
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    extension: { type: String, required: true },
    category: { type: String, enum: ['media', 'docs', 'archives'], required: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'public', index: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    description: { type: String, default: '' },
    uploaderId: { type: String, required: true, index: true },
    uploaderNickname: { type: String, required: true, index: true },
    downloads: { type: Number, default: 0 },
    createdAt: { type: Number, default: () => Date.now(), index: true },
  },
  { versionKey: false }
);

FileSchema.index({ originalName: 'text', uploaderNickname: 'text', description: 'text' });

const NotificationSchema = new Schema<NotificationRecord>(
  {
    userId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['info', 'upload', 'download', 'security'], default: 'info' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Number, default: () => Date.now(), index: true },
  },
  { versionKey: false }
);

let UserModel: Model<UserRecord> | null = null;
let FileModel: Model<FileRecord> | null = null;
let NotificationModel: Model<NotificationRecord> | null = null;
let usingMongo = false;

let localStore: LocalStoreData = { users: [], files: [], notifications: [] };

function normalizeLocalUser(u: Partial<UserRecord> & { id: string; nickname: string; email: string }): UserRecord {
  return {
    id: u.id,
    nickname: u.nickname,
    email: u.email,
    bio: typeof u.bio === 'string' ? u.bio : '',
    avatarFilename: u.avatarFilename ?? null,
    accentColor: u.accentColor || 'cyan',
    tokenVersion: typeof u.tokenVersion === 'number' ? u.tokenVersion : 0,
    passwordHash: u.passwordHash ?? null,
    authProvider: u.authProvider || 'local',
    googleId: u.googleId ?? null,
    isVerified: Boolean(u.isVerified),
    verificationCodeHash: u.verificationCodeHash ?? null,
    verificationExpiresAt: u.verificationExpiresAt ?? null,
    verificationAttempts: u.verificationAttempts ?? 0,
    lastCodeSentAt: u.lastCodeSentAt ?? null,
    createdAt: u.createdAt ?? Date.now(),
  };
}

function normalizeLocalFile(f: FileRecord): FileRecord {
  return {
    ...f,
    visibility: f.visibility === 'private' ? 'private' : 'public',
  };
}

function loadLocalStore(): void {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  if (fs.existsSync(LOCAL_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
      localStore = {
        users: Array.isArray(parsed.users) ? parsed.users.map(normalizeLocalUser) : [],
        files: Array.isArray(parsed.files) ? parsed.files.map(normalizeLocalFile) : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      };
      return;
    } catch {
      localStore = { users: [], files: [], notifications: [] };
    }
  }
  saveLocalStore();
}

function saveLocalStore(): void {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(localStore, null, 2), 'utf8');
}

function mapMongoUser(doc: mongoose.HydratedDocument<UserRecord>): UserRecord {
  const obj = doc.toObject();
  return {
    id: String(doc._id),
    nickname: obj.nickname,
    email: obj.email,
    bio: obj.bio ?? '',
    avatarFilename: obj.avatarFilename ?? null,
    accentColor: obj.accentColor || 'cyan',
    tokenVersion: obj.tokenVersion ?? 0,
    passwordHash: obj.passwordHash ?? null,
    authProvider: obj.authProvider,
    googleId: obj.googleId ?? null,
    isVerified: Boolean(obj.isVerified),
    verificationCodeHash: obj.verificationCodeHash ?? null,
    verificationExpiresAt: obj.verificationExpiresAt ?? null,
    verificationAttempts: obj.verificationAttempts ?? 0,
    lastCodeSentAt: obj.lastCodeSentAt ?? null,
    createdAt: obj.createdAt,
  };
}

function mapMongoFile(doc: mongoose.HydratedDocument<FileRecord>): FileRecord {
  const obj = doc.toObject();
  return {
    id: String(doc._id),
    originalName: obj.originalName,
    storedName: obj.storedName,
    mimeType: obj.mimeType,
    extension: obj.extension,
    category: obj.category,
    visibility: obj.visibility === 'private' ? 'private' : 'public',
    size: obj.size,
    sha256: obj.sha256,
    description: obj.description ?? '',
    uploaderId: obj.uploaderId,
    uploaderNickname: obj.uploaderNickname,
    downloads: obj.downloads ?? 0,
    createdAt: obj.createdAt,
  };
}

function mapMongoNotification(doc: mongoose.HydratedDocument<NotificationRecord>): NotificationRecord {
  const obj = doc.toObject();
  return {
    id: String(doc._id),
    userId: obj.userId,
    kind: obj.kind,
    title: obj.title,
    message: obj.message,
    read: Boolean(obj.read),
    createdAt: obj.createdAt,
  };
}

export function classifyFileCategory(mimeType: string, extension: string): FileCategory {
  const ext = extension.toLowerCase();
  if (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav'].includes(ext)
  ) {
    return 'media';
  }
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/json' ||
    ['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'ts', 'tsx', 'js', 'py', 'css', 'html', 'glsl', 'csv', 'yaml', 'yml'].includes(ext)
  ) {
    return 'docs';
  }
  return 'archives';
}

export async function initDatabase(): Promise<{ mode: 'mongodb' | 'local-fallback' }> {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  const mongoUri = process.env.MONGODB_URI?.trim();

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 6000 });
      UserModel = (mongoose.models.User as Model<UserRecord>) || mongoose.model<UserRecord>('User', UserSchema);
      FileModel = (mongoose.models.File as Model<FileRecord>) || mongoose.model<FileRecord>('File', FileSchema);
      NotificationModel =
        (mongoose.models.Notification as Model<NotificationRecord>) ||
        mongoose.model<NotificationRecord>('Notification', NotificationSchema);
      usingMongo = true;
      await seedInitialFilesIfEmpty();
      return { mode: 'mongodb' };
    } catch (err) {
      console.warn(
        '[VoidDrop DB] Nie udało się połączyć z MONGODB_URI, używam lokalnego magazynu dokumentów:',
        (err as Error).message
      );
    }
  }

  usingMongo = false;
  loadLocalStore();
  await seedInitialFilesIfEmpty();
  return { mode: 'local-fallback' };
}

export const db = {
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (usingMongo && UserModel) {
      const doc = await UserModel.findOne({ email: normalized });
      return doc ? mapMongoUser(doc) : null;
    }
    return localStore.users.find((u) => u.email === normalized) ?? null;
  },

  async findUserByNickname(nickname: string): Promise<UserRecord | null> {
    const target = nickname.trim().toLowerCase();
    if (usingMongo && UserModel) {
      const regex = new RegExp(`^${escapeRegex(target)}$`, 'i');
      const doc = await UserModel.findOne({ nickname: regex });
      return doc ? mapMongoUser(doc) : null;
    }
    return localStore.users.find((u) => u.nickname.toLowerCase() === target) ?? null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    if (usingMongo && UserModel) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await UserModel.findById(id);
      return doc ? mapMongoUser(doc) : null;
    }
    return localStore.users.find((u) => u.id === id) ?? null;
  },

  async createUser(input: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    if (usingMongo && UserModel) {
      const doc = await UserModel.create(input);
      return mapMongoUser(doc);
    }
    const created: UserRecord = { ...input, id: crypto.randomUUID() };
    localStore.users.push(created);
    saveLocalStore();
    return created;
  },

  async updateUser(id: string, patch: Partial<Omit<UserRecord, 'id'>>): Promise<UserRecord | null> {
    if (usingMongo && UserModel) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true });
      return doc ? mapMongoUser(doc) : null;
    }
    const idx = localStore.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    localStore.users[idx] = { ...localStore.users[idx], ...patch };
    saveLocalStore();
    return localStore.users[idx];
  },

  async updateUploaderNickname(userId: string, newNickname: string): Promise<void> {
    if (usingMongo && FileModel) {
      await FileModel.updateMany({ uploaderId: userId }, { $set: { uploaderNickname: newNickname } });
      return;
    }
    let changed = false;
    for (const f of localStore.files) {
      if (f.uploaderId === userId) {
        f.uploaderNickname = newNickname;
        changed = true;
      }
    }
    if (changed) saveLocalStore();
  },

  async createFile(input: Omit<FileRecord, 'id'>): Promise<FileRecord> {
    if (usingMongo && FileModel) {
      const doc = await FileModel.create(input);
      return mapMongoFile(doc);
    }
    const created: FileRecord = { ...input, id: crypto.randomUUID() };
    localStore.files.unshift(created);
    saveLocalStore();
    return created;
  },

  async updateFile(
    id: string,
    patch: Partial<Pick<FileRecord, 'originalName' | 'description' | 'visibility' | 'extension' | 'category'>>
  ): Promise<FileRecord | null> {
    if (usingMongo && FileModel) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await FileModel.findByIdAndUpdate(id, { $set: patch }, { new: true });
      return doc ? mapMongoFile(doc) : null;
    }
    const idx = localStore.files.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    localStore.files[idx] = { ...localStore.files[idx], ...patch };
    saveLocalStore();
    return localStore.files[idx];
  },

  async findFiles(params: {
    query?: string;
    category?: 'all' | 'mine' | 'private' | FileCategory;
    extensionFilter?: string;
    userId: string;
    sort?: FileSortMode;
  }): Promise<{
    files: FileRecord[];
    extensions: string[];
    stats: { totalFiles: number; totalSize: number; totalDownloads: number; myFiles: number; privateFiles: number };
  }> {
    const q = (params.query || '').trim();
    const category = params.category || 'all';
    const sort = params.sort || 'newest';
    const extFilter = (params.extensionFilter || '').trim().toLowerCase();

    if (usingMongo && FileModel) {
      // Strict access control: only public files or caller's own private files
      const accessFilter: Record<string, unknown> = {
        $or: [{ visibility: { $ne: 'private' } }, { uploaderId: params.userId }],
      };

      const andFilters: Record<string, unknown>[] = [accessFilter];

      if (category === 'mine') {
        andFilters.push({ uploaderId: params.userId });
      } else if (category === 'private') {
        andFilters.push({ uploaderId: params.userId, visibility: 'private' });
      } else if (category === 'media' || category === 'docs' || category === 'archives') {
        andFilters.push({ category });
      }

      if (extFilter) {
        andFilters.push({ extension: extFilter });
      }

      if (q) {
        const safeRegex = new RegExp(escapeRegex(q), 'i');
        andFilters.push({
          $or: [
            { originalName: safeRegex },
            { uploaderNickname: safeRegex },
            { extension: safeRegex },
            { description: safeRegex },
          ],
        });
      }

      const sortSpec: Record<string, 1 | -1> =
        sort === 'oldest'
          ? { createdAt: 1 }
          : sort === 'popular'
            ? { downloads: -1, createdAt: -1 }
            : sort === 'size'
              ? { size: -1, createdAt: -1 }
              : sort === 'smallest'
                ? { size: 1, createdAt: -1 }
                : sort === 'name'
                  ? { originalName: 1, createdAt: -1 }
                  : { createdAt: -1 };

      const [docs, visibleAll] = await Promise.all([
        FileModel.find({ $and: andFilters }).sort(sortSpec).limit(250),
        FileModel.find(accessFilter).select('size downloads uploaderId visibility extension'),
      ]);

      const extSet = new Set<string>();
      let totalSize = 0;
      let totalDownloads = 0;
      let myFiles = 0;
      let privateFiles = 0;

      for (const item of visibleAll) {
        totalSize += item.size;
        totalDownloads += item.downloads ?? 0;
        if (item.uploaderId === params.userId) {
          myFiles += 1;
          if (item.visibility === 'private') privateFiles += 1;
        }
        if (item.extension) extSet.add(item.extension.toLowerCase());
      }

      return {
        files: docs.map(mapMongoFile),
        extensions: Array.from(extSet).sort(),
        stats: {
          totalFiles: visibleAll.length,
          totalSize,
          totalDownloads,
          myFiles,
          privateFiles,
        },
      };
    }

    // Local fallback store with identical strict access control
    const accessible = localStore.files.filter(
      (f) => f.visibility !== 'private' || f.uploaderId === params.userId
    );

    const extSet = new Set<string>();
    let totalSize = 0;
    let totalDownloads = 0;
    let myFiles = 0;
    let privateFiles = 0;

    for (const item of accessible) {
      totalSize += item.size;
      totalDownloads += item.downloads;
      if (item.uploaderId === params.userId) {
        myFiles += 1;
        if (item.visibility === 'private') privateFiles += 1;
      }
      if (item.extension) extSet.add(item.extension.toLowerCase());
    }

    let items = [...accessible];

    if (category === 'mine') {
      items = items.filter((f) => f.uploaderId === params.userId);
    } else if (category === 'private') {
      items = items.filter((f) => f.uploaderId === params.userId && f.visibility === 'private');
    } else if (category === 'media' || category === 'docs' || category === 'archives') {
      items = items.filter((f) => f.category === category);
    }

    if (extFilter) {
      items = items.filter((f) => f.extension.toLowerCase() === extFilter);
    }

    if (q) {
      const needle = q.toLowerCase();
      items = items.filter(
        (f) =>
          f.originalName.toLowerCase().includes(needle) ||
          f.uploaderNickname.toLowerCase().includes(needle) ||
          f.extension.toLowerCase().includes(needle) ||
          f.description.toLowerCase().includes(needle)
      );
    }

    items.sort((a, b) => {
      if (sort === 'oldest') return a.createdAt - b.createdAt;
      if (sort === 'popular') return b.downloads - a.downloads || b.createdAt - a.createdAt;
      if (sort === 'size') return b.size - a.size || b.createdAt - a.createdAt;
      if (sort === 'smallest') return a.size - b.size || b.createdAt - a.createdAt;
      if (sort === 'name') return a.originalName.localeCompare(b.originalName, 'pl');
      return b.createdAt - a.createdAt;
    });

    return {
      files: items,
      extensions: Array.from(extSet).sort(),
      stats: {
        totalFiles: accessible.length,
        totalSize,
        totalDownloads,
        myFiles,
        privateFiles,
      },
    };
  },

  async findFileById(id: string): Promise<FileRecord | null> {
    if (usingMongo && FileModel) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await FileModel.findById(id);
      return doc ? mapMongoFile(doc) : null;
    }
    return localStore.files.find((f) => f.id === id) ?? null;
  },

  async incrementDownloads(id: string): Promise<void> {
    if (usingMongo && FileModel) {
      if (!mongoose.isValidObjectId(id)) return;
      await FileModel.findByIdAndUpdate(id, { $inc: { downloads: 1 } });
      return;
    }
    const item = localStore.files.find((f) => f.id === id);
    if (item) {
      item.downloads += 1;
      saveLocalStore();
    }
  },

  async deleteFileById(id: string): Promise<void> {
    if (usingMongo && FileModel) {
      if (!mongoose.isValidObjectId(id)) return;
      await FileModel.findByIdAndDelete(id);
      return;
    }
    localStore.files = localStore.files.filter((f) => f.id !== id);
    saveLocalStore();
  },

  async countFiles(): Promise<number> {
    if (usingMongo && FileModel) {
      return FileModel.countDocuments();
    }
    return localStore.files.length;
  },

  async createNotification(input: Omit<NotificationRecord, 'id'>): Promise<NotificationRecord> {
    if (usingMongo && NotificationModel) {
      const doc = await NotificationModel.create(input);
      // Trim older notifications beyond 50 per user
      const oldDocs = await NotificationModel.find({ userId: input.userId })
        .sort({ createdAt: -1 })
        .skip(50)
        .select('_id');
      if (oldDocs.length > 0) {
        await NotificationModel.deleteMany({ _id: { $in: oldDocs.map((d) => d._id) } });
      }
      return mapMongoNotification(doc);
    }
    const created: NotificationRecord = { ...input, id: crypto.randomUUID() };
    localStore.notifications.unshift(created);
    const userNotifs = localStore.notifications.filter((n) => n.userId === input.userId);
    if (userNotifs.length > 50) {
      const idsToDrop = new Set(userNotifs.slice(50).map((n) => n.id));
      localStore.notifications = localStore.notifications.filter((n) => !idsToDrop.has(n.id));
    }
    saveLocalStore();
    return created;
  },

  async findNotifications(userId: string): Promise<NotificationRecord[]> {
    if (usingMongo && NotificationModel) {
      const docs = await NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(50);
      return docs.map(mapMongoNotification);
    }
    return localStore.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  },

  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    if (usingMongo && NotificationModel) {
      if (!mongoose.isValidObjectId(notificationId)) return;
      await NotificationModel.findOneAndUpdate(
        { _id: notificationId, userId },
        { $set: { read: true } }
      );
      return;
    }
    const found = localStore.notifications.find((n) => n.id === notificationId && n.userId === userId);
    if (found) {
      found.read = true;
      saveLocalStore();
    }
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (usingMongo && NotificationModel) {
      await NotificationModel.updateMany({ userId, read: false }, { $set: { read: true } });
      return;
    }
    let changed = false;
    for (const n of localStore.notifications) {
      if (n.userId === userId && !n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) saveLocalStore();
  },
};

function computeSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const LEGACY_SAMPLE_NAMES = [
  'Specyfikacja_Protokolu_VoidSync.md',
  'Obsidian_UI_Tokens.json',
  'Shader_Grid_Pulse.glsl',
  'Notatki_Kryptografia_Klient_Serwer.txt',
];

async function seedInitialFilesIfEmpty(): Promise<void> {
  if (usingMongo && FileModel) {
    const legacyDocs = await FileModel.find({
      originalName: { $in: LEGACY_SAMPLE_NAMES },
      uploaderId: { $regex: /^community_/ },
    });
    for (const doc of legacyDocs) {
      const p = path.resolve(UPLOADS_DIR, doc.storedName);
      if (p.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
      await FileModel.findByIdAndDelete(doc._id);
    }
  } else {
    const toRemove = localStore.files.filter(
      (f) => LEGACY_SAMPLE_NAMES.includes(f.originalName) && f.uploaderId.startsWith('community_')
    );
    if (toRemove.length > 0) {
      for (const f of toRemove) {
        const p = path.resolve(UPLOADS_DIR, f.storedName);
        if (p.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
      localStore.files = localStore.files.filter(
        (f) => !(LEGACY_SAMPLE_NAMES.includes(f.originalName) && f.uploaderId.startsWith('community_'))
      );
      saveLocalStore();
    }
  }

  const existing = await db.countFiles();
  if (existing > 0) return;

  const wallpaperPath = path.resolve(
    process.cwd(),
    'src/assets/images/voiddrop_wallpaper_sample_1795638662419.jpg'
  );
  if (!fs.existsSync(wallpaperPath)) return;

  const buffer = fs.readFileSync(wallpaperPath);
  const storedName = `${crypto.randomUUID()}.jpg`;
  const destPath = path.resolve(UPLOADS_DIR, storedName);
  fs.writeFileSync(destPath, buffer);

  await db.createFile({
    originalName: 'VoidDrop_Topography_4K.jpg',
    storedName,
    mimeType: 'image/jpeg',
    extension: 'jpg',
    category: 'media',
    visibility: 'public',
    size: buffer.length,
    sha256: computeSha256(buffer),
    description: 'Tapeta wektorowo-geometryczna Neon Void w wysokiej rozdzielczości.',
    uploaderId: 'community_kamil_vortex',
    uploaderNickname: 'Kamil_Vortex',
    downloads: 42,
    createdAt: Date.now() - 1000 * 60 * 50,
  });
}
