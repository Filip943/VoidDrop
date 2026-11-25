import {
  Archive,
  Bell,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  Menu,
  Search,
  Settings,
  Trash2,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type {
  DashboardStats,
  FileCategory,
  FileItem,
  FileSortMode,
  FileVisibility,
  NotificationItem,
  UserProfile,
} from '../types';
import { getAccentTheme } from '../utils/accent';
import { formatBytes, formatDateTime, getCategoryLabel } from '../utils/format';
import { AccountSettingsView } from './AccountSettingsView';
import { FileInspectorModal } from './FileInspectorModal';
import { FilePreviewBadge } from './FilePreviewBadge';
import { InlineDropzone, type UploadTaskItem } from './InlineDropzone';
import { NotificationsPanel } from './NotificationsPanel';
import { UploadModal } from './UploadModal';
import { UserAvatar } from './UserAvatar';

interface DashboardProps {
  token: string;
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onTokenUpdated: (token: string) => void;
  onLogout: () => void;
}

type NavSection = 'all' | 'mine' | 'private' | FileCategory | 'settings';
type ViewMode = 'list' | 'grid';

export function Dashboard({
  token,
  user,
  onUserUpdated,
  onTokenUpdated,
  onLogout,
}: DashboardProps) {
  const theme = getAccentTheme(user.accentColor);

  const [section, setSection] = useState<NavSection>('all');
  const [sort, setSort] = useState<FileSortMode>('newest');
  const [extFilter, setExtFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [files, setFiles] = useState<FileItem[]>([]);
  const [availableExtensions, setAvailableExtensions] = useState<string[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    totalSize: 0,
    totalDownloads: 0,
    myFiles: 0,
    privateFiles: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [defaultDropVisibility, setDefaultDropVisibility] = useState<FileVisibility>('public');
  const [workspaceDragActive, setWorkspaceDragActive] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTaskItem[]>([]);
  const dragDepthRef = useRef(0);

  const [inspectedFile, setInspectedFile] = useState<FileItem | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');

  // Debounce search query
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotificationItem[] };
      setNotifications(data.notifications);
    } catch {
      // Non-blocking background sync
    }
  }, [onLogout, token]);

  const fetchFiles = useCallback(async () => {
    if (section === 'settings') return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        category: section,
        sort,
      });
      if (debouncedQuery.trim()) {
        params.set('q', debouncedQuery.trim());
      }
      if (extFilter) {
        params.set('ext', extFilter);
      }

      const res = await fetch(`/api/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        onLogout();
        return;
      }

      if (!res.ok) {
        setError('Nie udało się pobrać listy plików.');
        return;
      }

      const data = (await res.json()) as {
        files: FileItem[];
        extensions: string[];
        stats: DashboardStats;
      };
      setFiles(data.files);
      setAvailableExtensions(data.extensions || []);
      setStats(data.stats);
    } catch {
      setError('Błąd sieci podczas ładowania plików.');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, extFilter, onLogout, section, sort, token]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    void fetchNotifications();
    const timer = window.setInterval(() => {
      void fetchNotifications();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [fetchNotifications]);

  const handleMarkNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const handleMarkAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(file.id)}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) {
        setToast('Nie udało się pobrać pliku.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setFiles((prev) =>
        prev.map((item) =>
          item.id === file.id ? { ...item, downloads: item.downloads + 1 } : item
        )
      );
      setStats((prev) => ({ ...prev, totalDownloads: prev.totalDownloads + 1 }));
      if (inspectedFile?.id === file.id) {
        setInspectedFile((prev) => (prev ? { ...prev, downloads: prev.downloads + 1 } : null));
      }
      setToast(`Pobrano: ${file.originalName}`);
    } catch {
      setToast('Błąd podczas pobierania pliku.');
    }
  };

  const handleDelete = async (file: FileItem) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(file.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setToast('Nie udało się usunąć pliku.');
        return;
      }
      setPendingDeleteId(null);
      if (inspectedFile?.id === file.id) setInspectedFile(null);
      setToast(`Usunięto: ${file.originalName}`);
      await fetchFiles();
      void fetchNotifications();
    } catch {
      setToast('Błąd sieci podczas usuwania pliku.');
    }
  };

  const uploadSingleFileDirect = useCallback(
    (file: File) => {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (file.size > 50 * 1024 * 1024) {
        setUploadTasks((prev) => [
          {
            localId,
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'error',
            error: 'Przekroczono limit 50 MB',
          },
          ...prev,
        ]);
        return;
      }

      setUploadTasks((prev) => [
        {
          localId,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'uploading',
        },
        ...prev,
      ]);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('visibility', defaultDropVisibility);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setUploadTasks((prev) =>
          prev.map((t) => (t.localId === localId ? { ...t, progress: pct } : t))
        );
      };

      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText) as { file?: FileItem; error?: string };
          if (xhr.status >= 200 && xhr.status < 300 && payload.file) {
            setUploadTasks((prev) =>
              prev.map((t) =>
                t.localId === localId ? { ...t, progress: 100, status: 'done' } : t
              )
            );
            setToast(`Przesłano plik: ${payload.file.originalName}`);
            void fetchFiles();
            void fetchNotifications();
            return;
          }
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.localId === localId
                ? { ...t, status: 'error', error: payload.error || 'Błąd przesyłania' }
                : t
            )
          );
        } catch {
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.localId === localId
                ? { ...t, status: 'error', error: 'Błąd odpowiedzi serwera' }
                : t
            )
          );
        }
      };

      xhr.onerror = () => {
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.localId === localId ? { ...t, status: 'error', error: 'Błąd połączenia' } : t
          )
        );
      };

      xhr.send(formData);
    },
    [defaultDropVisibility, fetchFiles, fetchNotifications, token]
  );

  const startDirectUploads = useCallback(
    (droppedFiles: File[]) => {
      if (section === 'settings') setSection('all');
      for (const file of droppedFiles) {
        uploadSingleFileDirect(file);
      }
    },
    [section, uploadSingleFileDirect]
  );

  const handleWorkspaceDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setWorkspaceDragActive(true);
  };

  const handleWorkspaceDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  };

  const handleWorkspaceDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setWorkspaceDragActive(false);
    }
  };

  const handleWorkspaceDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setWorkspaceDragActive(false);
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length > 0) {
      startDirectUploads(list);
    }
  };

  const navItems: Array<{ id: NavSection; label: string; icon: typeof FolderOpen; count?: number }> = [
    { id: 'all', label: 'Wszystkie pliki', icon: FolderOpen, count: stats.totalFiles },
    { id: 'mine', label: 'Moje pliki', icon: UserIcon, count: stats.myFiles },
    { id: 'private', label: 'Pliki prywatne', icon: Lock, count: stats.privateFiles },
    { id: 'media', label: 'Obrazy i media', icon: ImageIcon },
    { id: 'docs', label: 'Dokumenty i kod', icon: FileText },
    { id: 'archives', label: 'Archiwa i inne', icon: Archive },
  ];

  const activeTitle =
    section === 'settings'
      ? 'Ustawienia konta'
      : navItems.find((n) => n.id === section)?.label || 'Wszystkie pliki';

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className="min-h-screen bg-[#06070B] text-slate-100 flex"
      onDragEnter={handleWorkspaceDragEnter}
      onDragOver={handleWorkspaceDragOver}
      onDragLeave={handleWorkspaceDragLeave}
      onDrop={handleWorkspaceDrop}
    >
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 border-r border-white/10 bg-[#090C14] flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 space-y-6 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap">
              VoidDrop
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Zamknij menu"
              className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setDroppedFile(null);
              setUploadOpen(true);
              setMobileMenuOpen(false);
            }}
            className={`h-11 w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${theme.solidBtn}`}
          >
            <Upload className="w-4 h-4" />
            <span>Prześlij plik</span>
          </button>

          <nav className="space-y-1" aria-label="Nawigacja główna">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full h-10 px-3 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? `${theme.activeNav} border`
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && (
                    <span className="font-mono text-xs opacity-70 tabular-nums">{item.count}</span>
                  )}
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setSection('settings');
                  setMobileMenuOpen(false);
                }}
                className={`w-full h-10 px-3 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                  section === 'settings'
                    ? `${theme.activeNav} border`
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className="truncate">Ustawienia konta</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Bottom User Profile */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <button
            type="button"
            onClick={() => {
              setSection('settings');
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-3 text-left rounded-lg p-1 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <UserAvatar
              nickname={user.nickname}
              avatarUrl={user.avatarUrl}
              accentColor={user.accentColor}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">@{user.nickname}</p>
              <p className="text-xs text-slate-400 truncate">
                {user.bio || user.email}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="h-9 w-full px-3 rounded-lg border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Wyloguj się</span>
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#06070B]/95 backdrop-blur-md px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Otwórz menu nawigacji"
              className="lg:hidden h-10 w-10 rounded-lg border border-white/10 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-lg font-semibold text-white truncate">
              {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 flex-1 max-w-2xl justify-end">
            {section !== 'settings' && (
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Szukaj pliku, autora lub rozszerzenia..."
                  aria-label="Wyszukaj pliki"
                  className={`h-10 w-full rounded-lg border border-white/10 bg-[#0B0E16] pl-9 pr-8 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Wyczyść wyszukiwanie"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Notification Bell + Drawer */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setNotificationsOpen((v) => !v)}
                aria-label="Otwórz powiadomienia"
                className="relative h-10 w-10 rounded-lg border border-white/10 bg-[#0B0E16] text-slate-300 hover:text-white hover:border-white/25 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span
                    className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-mono font-bold flex items-center justify-center tabular-nums ${theme.solidBtn}`}
                  >
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <NotificationsPanel
                  notifications={notifications}
                  accentColor={user.accentColor}
                  onMarkRead={(id) => void handleMarkNotificationRead(id)}
                  onMarkAllRead={() => void handleMarkAllNotificationsRead()}
                  onClose={() => setNotificationsOpen(false)}
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => setSection('settings')}
              aria-label="Przejdź do ustawień profilu"
              className="hidden sm:block cursor-pointer"
            >
              <UserAvatar
                nickname={user.nickname}
                avatarUrl={user.avatarUrl}
                accentColor={user.accentColor}
                size="sm"
              />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 space-y-6 max-w-7xl w-full mx-auto">
          {section === 'settings' ? (
            <AccountSettingsView
              token={token}
              user={user}
              onUserUpdated={onUserUpdated}
              onTokenUpdated={onTokenUpdated}
              onNotify={(msg) => setToast(msg)}
              onRefreshNotifications={() => void fetchNotifications()}
            />
          ) : (
            <>
              {/* Unboxed Summary Strip */}
              <section
                aria-label="Podsumowanie zasobów"
                className="grid grid-cols-1 sm:grid-cols-3 border border-white/10 rounded-xl bg-[#0B0E16] divide-y sm:divide-y-0 sm:divide-x divide-white/10"
              >
                <div className="px-5 py-4 flex items-baseline justify-between sm:block">
                  <p className="text-xs text-slate-400">Dostępne pliki w chmurze</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                    {stats.totalFiles}
                  </p>
                </div>
                <div className="px-5 py-4 flex items-baseline justify-between sm:block">
                  <p className="text-xs text-slate-400">Łączny rozmiar zasobów</p>
                  <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${theme.text}`}>
                    {formatBytes(stats.totalSize)}
                  </p>
                </div>
                <div className="px-5 py-4 flex items-baseline justify-between sm:block">
                  <p className="text-xs text-slate-400">Łączna liczba pobrań</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                    {stats.totalDownloads}
                  </p>
                </div>
              </section>

              {/* Direct Drag-and-Drop Upload Area */}
              <InlineDropzone
                tasks={uploadTasks}
                accentColor={user.accentColor}
                defaultVisibility={defaultDropVisibility}
                onChangeDefaultVisibility={setDefaultDropVisibility}
                onFilesSelected={startDirectUploads}
                onOpenModalWithDescription={() => {
                  setDroppedFile(null);
                  setUploadOpen(true);
                }}
                onDismissTask={(localId) =>
                  setUploadTasks((prev) => prev.filter((t) => t.localId !== localId))
                }
              />

              {/* Enhanced File Explorer Toolbar */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">
                    {loading ? (
                      'Ładowanie zasobów...'
                    ) : (
                      <>
                        Wyświetlono{' '}
                        <span className="font-mono text-slate-200 tabular-nums">{files.length}</span>{' '}
                        {files.length === 1 ? 'plik' : 'plików'}
                        {debouncedQuery ? ` dla zapytania „${debouncedQuery}”` : ''}
                        {extFilter ? ` · format .${extFilter}` : ''}
                      </>
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Sortowanie plików"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as FileSortMode)}
                      className="h-9 rounded-lg border border-white/10 bg-[#0B0E16] px-3 text-xs text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="newest">Najnowsze</option>
                      <option value="oldest">Najstarsze</option>
                      <option value="name">Nazwa (A–Z)</option>
                      <option value="popular">Najpopularniejsze</option>
                      <option value="size">Największe</option>
                      <option value="smallest">Najmniejsze</option>
                    </select>

                    <div className="flex items-center rounded-lg border border-white/10 bg-[#0B0E16] p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        aria-label="Widok listy"
                        className={`h-8 px-2.5 rounded-md flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${
                          viewMode === 'list'
                            ? `${theme.activeNav}`
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Lista</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        aria-label="Widok siatki"
                        className={`h-8 px-2.5 rounded-md flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${
                          viewMode === 'grid'
                            ? `${theme.activeNav}`
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Siatka</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Interactive Extension Filter Tabs */}
                {availableExtensions.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setExtFilter('')}
                      className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        extFilter === ''
                          ? `${theme.activeNav}`
                          : 'border-white/10 bg-[#0B0E16] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Wszystkie formaty
                    </button>
                    {availableExtensions.map((ext) => (
                      <button
                        key={ext}
                        type="button"
                        onClick={() => setExtFilter((cur) => (cur === ext ? '' : ext))}
                        className={`h-8 px-3 rounded-lg border font-mono text-xs uppercase transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          extFilter === ext
                            ? `${theme.activeNav}`
                            : 'border-white/10 bg-[#0B0E16] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        .{ext}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Data States */}
              {error ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center space-y-3">
                  <p className="text-sm text-rose-200">{error}</p>
                  <button
                    type="button"
                    onClick={() => void fetchFiles()}
                    className="h-9 px-4 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-400 cursor-pointer"
                  >
                    Spróbuj ponownie
                  </button>
                </div>
              ) : loading ? (
                <div className="rounded-xl border border-white/10 bg-[#0B0E16] divide-y divide-white/10">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 px-5 flex items-center justify-between animate-pulse">
                      <div className="h-4 w-56 rounded bg-white/10" />
                      <div className="h-4 w-24 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
              ) : files.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#0B0E16] px-6 py-14 text-center space-y-4">
                  <p className="text-base font-medium text-slate-200">
                    Brak plików spełniających wybrane kryteria
                  </p>
                  <p className="text-sm text-slate-400 max-w-md mx-auto">
                    {debouncedQuery || extFilter
                      ? 'Zmień wyszukiwaną frazę lub wyczyść filtry, aby zobaczyć pozostałe zasoby.'
                      : 'Prześlij swój pierwszy plik do przestrzeni VoidDrop lub przeciągnij go bezpośrednio na stronę.'}
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    {(debouncedQuery || extFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setExtFilter('');
                          setSection('all');
                        }}
                        className="h-10 px-4 rounded-lg border border-white/15 text-sm text-slate-200 hover:bg-white/5 cursor-pointer"
                      >
                        Wyczyść filtry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDroppedFile(null);
                        setUploadOpen(true);
                      }}
                      className={`h-10 px-5 rounded-lg font-semibold text-sm cursor-pointer ${theme.solidBtn}`}
                    >
                      Prześlij plik
                    </button>
                  </div>
                </div>
              ) : viewMode === 'list' ? (
                <div className="rounded-xl border border-white/10 bg-[#0B0E16] overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead>
                      <tr className="border-b border-white/10 text-xs font-medium text-slate-400">
                        <th className="py-3 pl-5 pr-3">Nazwa pliku</th>
                        <th className="py-3 px-3">Autor</th>
                        <th className="py-3 px-3">Format</th>
                        <th className="py-3 px-3 text-right">Rozmiar</th>
                        <th className="py-3 px-3 text-right">Pobrania</th>
                        <th className="py-3 px-3">Dodano</th>
                        <th className="py-3 pl-3 pr-5 text-right">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-sm">
                      {files.map((file) => {
                        const isOwner = file.uploaderId === user.id;
                        const confirmingDelete = pendingDeleteId === file.id;
                        return (
                          <tr
                            key={file.id}
                            className="hover:bg-white/[0.03] transition-colors group"
                          >
                            <td className="py-3 pl-5 pr-3 max-w-xs">
                              <button
                                type="button"
                                onClick={() => setInspectedFile(file)}
                                className="flex items-center gap-3 text-left min-w-0 w-full cursor-pointer"
                              >
                                <FilePreviewBadge file={file} token={token} variant="thumb" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="font-medium text-slate-100 group-hover:text-white transition-colors truncate">
                                      {file.originalName}
                                    </p>
                                    {file.visibility === 'private' && (
                                      <Lock
                                        className="w-3.5 h-3.5 text-amber-300 shrink-0"
                                        aria-label="Plik prywatny"
                                      />
                                    )}
                                  </div>
                                  {file.description && (
                                    <p className="text-xs text-slate-500 truncate">
                                      {file.description}
                                    </p>
                                  )}
                                </div>
                              </button>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-300 text-xs">
                              <span>@{file.uploaderNickname}</span>
                              {isOwner && <span className={`ml-1.5 ${theme.text}`}>(Ty)</span>}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-xs uppercase text-slate-400">
                              {file.extension}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-right font-mono text-xs text-slate-300 tabular-nums">
                              {formatBytes(file.size)}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-right font-mono text-xs text-slate-300 tabular-nums">
                              {file.downloads}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-xs text-slate-400 tabular-nums">
                              {formatDateTime(file.createdAt)}
                            </td>
                            <td className="py-3 pl-3 pr-5 whitespace-nowrap text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setInspectedFile(file)}
                                  title="Podgląd i zarządzanie"
                                  aria-label={`Szczegóły pliku ${file.originalName}`}
                                  className="h-8 w-8 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/25 inline-flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDownload(file)}
                                  className={`h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${theme.softBtn}`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Pobierz</span>
                                </button>
                                {isOwner &&
                                  (confirmingDelete ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDelete(file)}
                                      className="h-8 px-2.5 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-400 cursor-pointer"
                                    >
                                      Potwierdź
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPendingDeleteId(file.id)}
                                      title="Usuń własny plik"
                                      aria-label={`Usuń plik ${file.originalName}`}
                                      className="h-8 w-8 rounded-lg border border-rose-500/25 text-rose-300 hover:bg-rose-500/15 inline-flex items-center justify-center transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Grid View */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {files.map((file) => {
                    const isOwner = file.uploaderId === user.id;
                    const confirmingDelete = pendingDeleteId === file.id;
                    return (
                      <article
                        key={file.id}
                        className="rounded-xl border border-white/10 bg-[#0B0E16] p-4 flex flex-col justify-between gap-4 hover:border-white/25 transition-colors group"
                      >
                        <div className="space-y-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => setInspectedFile(file)}
                            aria-label={`Otwórz podgląd pliku ${file.originalName}`}
                            className="block w-full text-left cursor-pointer"
                          >
                            <FilePreviewBadge file={file} token={token} variant="card" />
                          </button>

                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setInspectedFile(file)}
                              className="flex items-center gap-1.5 text-left min-w-0 cursor-pointer"
                            >
                              {file.visibility === 'private' && (
                                <Lock
                                  className="w-3.5 h-3.5 text-amber-300 shrink-0"
                                  aria-label="Plik prywatny"
                                />
                              )}
                              <h3 className="font-medium text-sm text-slate-100 group-hover:text-white transition-colors truncate">
                                {file.originalName}
                              </h3>
                            </button>
                            <span className="font-mono text-xs uppercase text-slate-400 shrink-0">
                              {file.extension}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 line-clamp-2 min-h-[2rem]">
                            {file.description || getCategoryLabel(file.category)}
                          </p>

                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-slate-300">
                              @{file.uploaderNickname}
                              {isOwner ? ' (Ty)' : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{formatBytes(file.size)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{file.downloads} pobrań</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10">
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatDateTime(file.createdAt)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectedFile(file)}
                              aria-label={`Szczegóły ${file.originalName}`}
                              className="h-8 w-8 rounded-lg border border-white/10 text-slate-300 hover:text-white inline-flex items-center justify-center cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownload(file)}
                              className={`h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${theme.softBtn}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Pobierz</span>
                            </button>
                            {isOwner &&
                              (confirmingDelete ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(file)}
                                  className="h-8 px-2.5 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-400 cursor-pointer"
                                >
                                  Usuń
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(file.id)}
                                  aria-label={`Usuń ${file.originalName}`}
                                  className="h-8 w-8 rounded-lg border border-rose-500/25 text-rose-300 hover:bg-rose-500/15 inline-flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Full-window Drop Overlay */}
      {workspaceDragActive && (
        <div className="fixed inset-0 z-50 bg-[#06070B]/85 border-2 border-dashed border-white/40 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-2">
            <Upload className={`w-10 h-10 mx-auto ${theme.text}`} />
            <p className="font-display text-xl font-semibold text-white">
              Upuść pliki, aby natychmiast przesłać je do VoidDrop
            </p>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadOpen && (
        <UploadModal
          token={token}
          accentColor={user.accentColor}
          initialFile={droppedFile}
          onClose={() => {
            setUploadOpen(false);
            setDroppedFile(null);
          }}
          onUploaded={(created) => {
            setUploadOpen(false);
            setDroppedFile(null);
            setToast(`Udostępniono plik: ${created.originalName}`);
            void fetchFiles();
            void fetchNotifications();
          }}
        />
      )}

      {/* File Inspector Modal */}
      {inspectedFile && (
        <FileInspectorModal
          file={inspectedFile}
          token={token}
          accentColor={user.accentColor}
          isOwner={inspectedFile.uploaderId === user.id}
          onClose={() => setInspectedFile(null)}
          onDownload={(f) => void handleDownload(f)}
          onDelete={handleDelete}
          onFileUpdated={(updated) => {
            setInspectedFile(updated);
            setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
            setToast(`Zapisano zmiany: ${updated.originalName}`);
            void fetchFiles();
            void fetchNotifications();
          }}
        />
      )}

      {/* Quiet Toast Feedback */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-xl border border-white/15 bg-[#0B0E16] px-4 py-3 text-sm text-slate-100 shadow-2xl flex items-center gap-2.5"
        >
          <CheckCircle2 className={`w-4 h-4 shrink-0 ${theme.text}`} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
