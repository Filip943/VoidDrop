import { useState } from 'react';
import type { AccentColor } from '../types';
import { getAccentTheme } from '../utils/accent';

interface UserAvatarProps {
  nickname: string;
  avatarUrl: string | null;
  accentColor?: AccentColor;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({
  nickname,
  avatarUrl,
  accentColor = 'cyan',
  size = 'md',
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const theme = getAccentTheme(accentColor);

  const dims =
    size === 'lg'
      ? 'h-16 w-16 text-xl rounded-2xl'
      : size === 'sm'
        ? 'h-8 w-8 text-xs rounded-lg'
        : 'h-10 w-10 text-sm rounded-xl';

  const initials = nickname.slice(0, 2).toUpperCase() || 'VD';

  if (avatarUrl && !imgError) {
    return (
      <div className={`${dims} shrink-0 border border-white/15 bg-[#07090F] overflow-hidden`}>
        <img
          src={avatarUrl}
          alt={`Awatar użytkownika ${nickname}`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${dims} shrink-0 border font-display font-bold flex items-center justify-center select-none ${theme.activeNav}`}
      aria-label={`Awatar ${nickname}`}
    >
      {initials}
    </div>
  );
}
