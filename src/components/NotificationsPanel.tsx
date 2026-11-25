import { Bell, CheckCheck, Download, Info, ShieldCheck, Upload, X } from 'lucide-react';
import type { AccentColor, NotificationItem, NotificationKind } from '../types';
import { getAccentTheme } from '../utils/accent';
import { formatDateTime } from '../utils/format';

interface NotificationsPanelProps {
  notifications: NotificationItem[];
  accentColor: AccentColor;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

function KindIcon({ kind }: { kind: NotificationKind }) {
  switch (kind) {
    case 'security':
      return <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />;
    case 'upload':
      return <Upload className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />;
    case 'download':
      return <Download className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />;
    default:
      return <Info className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />;
  }
}

export function NotificationsPanel({
  notifications,
  accentColor,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: NotificationsPanelProps) {
  const theme = getAccentTheme(accentColor);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className="absolute right-0 top-12 z-40 w-[340px] sm:w-[390px] rounded-2xl border border-white/15 bg-[#0B0E16] shadow-2xl shadow-black/70 overflow-hidden"
      role="region"
      aria-label="Centrum powiadomień"
    >
      <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className={`w-4 h-4 ${theme.text}`} />
          <h2 className="font-display text-sm font-semibold text-white">Powiadomienia</h2>
          {unreadCount > 0 && (
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              ({unreadCount})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className={`text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${theme.text} hover:underline`}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Oznacz wszystkie</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij powiadomienia"
            className="h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-white/10">
        {notifications.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-slate-400">
            Brak nowych powiadomień. Aktywność konta i pobrań pojawi się tutaj.
          </div>
        ) : (
          notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!item.read) onMarkRead(item.id);
              }}
              className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                item.read ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-white/[0.04] hover:bg-white/[0.06]'
              }`}
            >
              <KindIcon kind={item.kind} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-xs font-semibold truncate ${item.read ? 'text-slate-300' : 'text-white'}`}>
                    {item.title}
                  </p>
                  {!item.read && (
                    <span className={`text-[10px] font-medium shrink-0 ${theme.text}`}>Nowe</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.message}</p>
                <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {formatDateTime(item.createdAt)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
