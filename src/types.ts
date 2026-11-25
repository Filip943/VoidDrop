export type FileCategory = 'media' | 'docs' | 'archives';

export interface UserProfile {
  id: string;
  nickname: string;
  email: string;
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
}

export interface DevMailPreview {
  to: string;
  subject: string;
  code: string;
}
