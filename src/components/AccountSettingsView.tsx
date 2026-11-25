import {
  AlertCircle,
  Camera,
  CheckCircle2,
  KeyRound,
  Lock,
  Palette,
  ShieldAlert,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { AccentColor, UserProfile } from '../types';
import { ACCENT_THEMES, getAccentTheme } from '../utils/accent';
import { formatDateTime } from '../utils/format';
import { UserAvatar } from './UserAvatar';

interface AccountSettingsViewProps {
  token: string;
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onTokenUpdated: (token: string) => void;
  onNotify: (msg: string) => void;
  onRefreshNotifications: () => void;
}

const ACCENT_LIST: AccentColor[] = ['cyan', 'violet', 'emerald', 'amber', 'rose'];

export function AccountSettingsView({
  token,
  user,
  onUserUpdated,
  onTokenUpdated,
  onNotify,
  onRefreshNotifications,
}: AccountSettingsViewProps) {
  const theme = getAccentTheme(user.accentColor);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Profile fields
  const [nickname, setNickname] = useState(user.nickname);
  const [bio, setBio] = useState(user.bio || '');
  const [accentColor, setAccentColor] = useState<AccentColor>(user.accentColor || 'cyan');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [revokingSessions, setRevokingSessions] = useState(false);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname, bio, accentColor }),
      });

      const data = (await res.json()) as {
        user?: UserProfile;
        token?: string;
        error?: string;
      };

      if (!res.ok || !data.user) {
        setProfileError(data.error || 'Nie udało się zapisać zmian profilu.');
        return;
      }

      if (data.token) onTokenUpdated(data.token);
      onUserUpdated(data.user);
      onNotify('Zapisano ustawienia personalizacji.');
      onRefreshNotifications();
    } catch {
      setProfileError('Błąd sieci podczas zapisywania profilu.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAccentQuickChange = async (nextColor: AccentColor) => {
    setAccentColor(nextColor);
    setProfileError('');
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accentColor: nextColor }),
      });
      const data = (await res.json()) as { user?: UserProfile; error?: string };
      if (res.ok && data.user) {
        onUserUpdated(data.user);
        onNotify(`Zmieniono kolor akcentu: ${ACCENT_THEMES[nextColor].label}`);
        onRefreshNotifications();
      }
    } catch {
      // Keep UI responsive
    }
  };

  const handleAvatarSelected = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Awatar może mieć maksymalnie 2 MB.');
      return;
    }

    setProfileError('');
    setAvatarBusy(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/account/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = (await res.json()) as { user?: UserProfile; error?: string };
      if (!res.ok || !data.user) {
        setProfileError(data.error || 'Nie udało się zapisać awatara.');
        return;
      }

      onUserUpdated(data.user);
      onNotify('Zaktualizowano awatar profilu.');
      onRefreshNotifications();
    } catch {
      setProfileError('Błąd sieci podczas przesyłania awatara.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setProfileError('');
    setAvatarBusy(true);
    try {
      const res = await fetch('/api/account/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { user?: UserProfile; error?: string };
      if (!res.ok || !data.user) {
        setProfileError(data.error || 'Nie udało się usunąć awatara.');
        return;
      }
      onUserUpdated(data.user);
      onNotify('Usunięto własny awatar.');
    } catch {
      setProfileError('Błąd sieci podczas usuwania awatara.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Nowe hasła nie są identyczne.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        user?: UserProfile;
        error?: string;
      };

      if (!res.ok || !data.token || !data.user) {
        setPasswordError(data.error || 'Nie udało się zmienić hasła.');
        return;
      }

      onTokenUpdated(data.token);
      onUserUpdated(data.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess('Hasło zostało zmienione, a pozostałe sesje unieważnione.');
      onRefreshNotifications();
    } catch {
      setPasswordError('Błąd sieci podczas zmiany hasła.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRevokeSessions = async () => {
    setRevokingSessions(true);
    setPasswordError('');
    setPasswordSuccess('');
    try {
      const res = await fetch('/api/account/revoke-sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        user?: UserProfile;
        error?: string;
      };
      if (res.ok && data.token && data.user) {
        onTokenUpdated(data.token);
        onUserUpdated(data.user);
        onNotify('Wszystkie pozostałe sesje zostały wylogowane.');
        onRefreshNotifications();
      }
    } finally {
      setRevokingSessions(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Profile & Avatar & Accent Color */}
        <section className="xl:col-span-7 rounded-2xl border border-white/10 bg-[#0B0E16] p-6 space-y-6">
          <div className="border-b border-white/10 pb-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-white">
                Personalizacja profilu
              </h2>
              <p className="text-xs text-slate-400">
                Dostosuj swój awatar, nazwę wyświetlaną i wygląd przestrzeni VoidDrop.
              </p>
            </div>
            <UserIcon className={`w-5 h-5 ${theme.text} shrink-0`} />
          </div>

          {/* Avatar Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
            <div className="flex items-center gap-4 min-w-0">
              <UserAvatar
                nickname={user.nickname}
                avatarUrl={user.avatarUrl}
                accentColor={accentColor}
                size="lg"
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-white truncate">@{user.nickname}</p>
                <p className="text-xs text-slate-400 truncate">
                  {user.email} · Konto od{' '}
                  <span className="font-mono tabular-nums">{formatDateTime(user.createdAt)}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Format JPG, PNG, WEBP lub GIF · maks. 2 MB
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  void handleAvatarSelected(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${theme.solidBtn}`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{avatarBusy ? 'Przesyłanie...' : 'Zmień awatar'}</span>
              </button>
              {user.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={avatarBusy}
                  aria-label="Usuń własny awatar"
                  className="h-9 w-9 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSaveProfile} className="space-y-5">
            {profileError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{profileError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="settings-nick" className="text-xs font-medium text-slate-300">
                Nick (nazwa użytkownika)
              </label>
              <input
                id="settings-nick"
                type="text"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_-]{3,24}"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className={`h-11 w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 transition-colors ${theme.ringFocus}`}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="settings-bio" className="font-medium text-slate-300">
                  Opis profilu (Bio)
                </label>
                <span className="font-mono text-slate-500 tabular-nums">{bio.length}/160</span>
              </div>
              <textarea
                id="settings-bio"
                rows={3}
                maxLength={160}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Napisz kilka słów o sobie lub udostępnianych projektach..."
                className={`w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-colors resize-none ${theme.ringFocus}`}
              />
            </div>

            {/* Accent Color Picker */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Palette className={`w-3.5 h-3.5 ${theme.text}`} />
                <span>Kolor akcentu Neon Void</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {ACCENT_LIST.map((id) => {
                  const item = ACCENT_THEMES[id];
                  const selected = accentColor === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => void handleAccentQuickChange(id)}
                      className={`h-10 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                        selected
                          ? `${item.activeNav}`
                          : 'border-white/10 bg-[#07090F] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-sm shrink-0 ${item.swatchClass}`} />
                      <span className="truncate">{item.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className={`h-10 px-5 rounded-lg font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 ${theme.solidBtn}`}
              >
                {savingProfile ? 'Zapisywanie...' : 'Zapisz profil'}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Security & Session Controls */}
        <section className="xl:col-span-5 rounded-2xl border border-white/10 bg-[#0B0E16] p-6 space-y-6">
          <div className="border-b border-white/10 pb-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-white">
                Bezpieczeństwo konta
              </h2>
              <p className="text-xs text-slate-400">
                Zarządzaj hasłem oraz aktywnymi sesjami logowania.
              </p>
            </div>
            <ShieldAlert className={`w-5 h-5 ${theme.text} shrink-0`} />
          </div>

          {user.authProvider === 'local' ? (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {passwordError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="sec-current" className="text-xs font-medium text-slate-300">
                  Obecne hasło
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="sec-current"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Wpisz obecne hasło"
                    className={`h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sec-new" className="text-xs font-medium text-slate-300">
                  Nowe hasło
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="sec-new"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 znaków"
                    className={`h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sec-confirm" className="text-xs font-medium text-slate-300">
                  Powtórz nowe hasło
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="sec-confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Powtórz nowe hasło"
                    className={`h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#121724] hover:bg-[#192033] text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingPassword ? 'Aktualizowanie...' : 'Zmień hasło'}
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#07090F] p-4 text-xs leading-relaxed text-slate-300">
              To konto korzysta z uwierzytelniania Google OAuth. Zarządzanie hasłem odbywa się
              bezpośrednio w ustawieniach Twojego konta Google.
            </div>
          )}

          <div className="border-t border-white/10 pt-5 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-white">Aktywne sesje dostępu</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Jeśli logowałeś się na innym urządzeniu, możesz natychmiast unieważnić wszystkie
                poprzednie tokeny dostępu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRevokeSessions()}
              disabled={revokingSessions}
              className="h-10 w-full rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {revokingSessions ? 'Unieważnianie...' : 'Wyloguj wszystkie inne sesje'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
