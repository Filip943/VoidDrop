export type FileCategory = 'media' | 'docs' | 'archives';
export type FileVisibility = 'public' | 'private';
export type AccentColor = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';
export type FileSortMode = 'newest' | 'oldest' | 'popular' | 'size' | 'smallest' | 'name';
export type NotificationKind = 'info' | 'upload' | 'download' | 'security';

export interface UserProfile {
  id: string;
  nickname: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  accentColor: AccentColor;
  authProvider: 'local' | 'google';
  isVerified: boolean;
  createdAt: number;
}

export interface FileItem {
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

export interface DashboardStats {
  totalFiles: number;
  totalSize: number;
  totalDownloads: number;
  myFiles: number;
  privateFiles: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export interface DevMailPreview {
  to: string;
  subject: string;
  code: string;
}
