import mongoose, { Schema, type Model } from 'mongoose';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { escapeRegex } from './security.ts';

export type AuthProvider = 'local' | 'google';
export type FileCategory = 'media' | 'docs' | 'archives';

export interface UserRecord {
  id: string;
  nickname: string;
  email: string;
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
  size: number;
  sha256: string;
  description: string;
  uploaderId: string;
  uploaderNickname: string;
  downloads: number;
  createdAt: number;
}

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const LOCAL_DATA_DIR = path.resolve(process.cwd(), '.data');
const LOCAL_STORE_PATH = path.resolve(LOCAL_DATA_DIR, 'voiddrop-store.json');

interface LocalStoreData {
  users: UserRecord[];
  files: FileRecord[];
}

// Mongoose Schemas (used when MONGODB_URI is configured)
const UserSchema = new Schema<UserRecord>(
  {
    nickname: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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

let UserModel: Model<UserRecord> | null = null;
let FileModel: Model<FileRecord> | null = null;
let usingMongo = false;

let localStore: LocalStoreData = { users: [], files: [] };

function loadLocalStore(): void {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  if (fs.existsSync(LOCAL_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
      localStore = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        files: Array.isArray(parsed.files) ? parsed.files : [],
      };
      return;
    } catch {
      localStore = { users: [], files: [] };
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
    size: obj.size,
    sha256: obj.sha256,
    description: obj.description ?? '',
    uploaderId: obj.uploaderId,
    uploaderNickname: obj.uploaderNickname,
    downloads: obj.downloads ?? 0,
    createdAt: obj.createdAt,
  };
}

export function classifyFileCategory(mimeType: string, extension: string): FileCategory {
  const ext = extension.toLowerCase();
  if (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mp3', 'wav'].includes(ext)
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
  const mongoUri = process.env.MONGODB_URI?.trim();

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 6000 });
      UserModel = (mongoose.models.User as Model<UserRecord>) || mongoose.model<UserRecord>('User', UserSchema);
      FileModel = (mongoose.models.File as Model<FileRecord>) || mongoose.model<FileRecord>('File', FileSchema);
      usingMongo = true;
      await seedInitialFilesIfEmpty();
      return { mode: 'mongodb' };
    } catch (err) {
      console.warn('[VoidDrop DB] Nie udało się połączyć z MONGODB_URI, używam lokalnego magazynu dokumentów:', (err as Error).message);
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

  async findFiles(params: {
    query?: string;
    category?: 'all' | 'mine' | FileCategory;
    userId?: string;
    sort?: 'newest' | 'popular' | 'size';
  }): Promise<{
    files: FileRecord[];
    stats: { totalFiles: number; totalSize: number; totalDownloads: number };
  }> {
    const q = (params.query || '').trim();
    const category = params.category || 'all';
    const sort = params.sort || 'newest';

    if (usingMongo && FileModel) {
      const filter: Record<string, unknown> = {};
      if (category === 'mine' && params.userId) {
        filter.uploaderId = params.userId;
      } else if (category === 'media' || category === 'docs' || category === 'archives') {
        filter.category = category;
      }

      if (q) {
        const safeRegex = new RegExp(escapeRegex(q), 'i');
        filter.$or = [
          { originalName: safeRegex },
          { uploaderNickname: safeRegex },
          { extension: safeRegex },
          { description: safeRegex },
        ];
      }

      const sortSpec: Record<string, 1 | -1> =
        sort === 'popular'
          ? { downloads: -1, createdAt: -1 }
          : sort === 'size'
            ? { size: -1, createdAt: -1 }
            : { createdAt: -1 };

      const [docs, agg] = await Promise.all([
        FileModel.find(filter).sort(sortSpec).limit(250),
        FileModel.aggregate<{ totalFiles: number; totalSize: number; totalDownloads: number }>([
          {
            $group: {
              _id: null,
              totalFiles: { $sum: 1 },
              totalSize: { $sum: '$size' },
              totalDownloads: { $sum: '$downloads' },
            },
          },
        ]),
      ]);

      const stats = agg[0]
        ? {
            totalFiles: agg[0].totalFiles,
            totalSize: agg[0].totalSize,
            totalDownloads: agg[0].totalDownloads,
          }
        : { totalFiles: 0, totalSize: 0, totalDownloads: 0 };

      return { files: docs.map(mapMongoFile), stats };
    }

    let items = [...localStore.files];
    const totalFiles = items.length;
    const totalSize = items.reduce((acc, f) => acc + f.size, 0);
    const totalDownloads = items.reduce((acc, f) => acc + f.downloads, 0);

    if (category === 'mine' && params.userId) {
      items = items.filter((f) => f.uploaderId === params.userId);
    } else if (category === 'media' || category === 'docs' || category === 'archives') {
      items = items.filter((f) => f.category === category);
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
      if (sort === 'popular') return b.downloads - a.downloads || b.createdAt - a.createdAt;
      if (sort === 'size') return b.size - a.size || b.createdAt - a.createdAt;
      return b.createdAt - a.createdAt;
    });

    return {
      files: items,
      stats: { totalFiles, totalSize, totalDownloads },
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
  // Remove the 4 legacy sample files if they were previously seeded
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
    size: buffer.length,
    sha256: computeSha256(buffer),
    description: 'Tapeta wektorowo-geometryczna Neon Void w wysokiej rozdzielczości.',
    uploaderId: 'community_kamil_vortex',
    uploaderNickname: 'Kamil_Vortex',
    downloads: 42,
    createdAt: Date.now() - 1000 * 60 * 50,
  });
}
