import {
  Archive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FileItem } from '../types';

interface FilePreviewBadgeProps {
  file: FileItem;
  token: string;
  variant: 'thumb' | 'card';
}

const RASTER_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CODE_EXTENSIONS = new Set([
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'css',
  'html',
  'glsl',
  'yaml',
  'yml',
  'xml',
  'sh',
  'md',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a']);
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'xls', 'xlsx']);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2']);
const TEXT_PREVIEW_EXTENSIONS = new Set([
  'txt',
  'md',
  'json',
  'ts',
  'tsx',
  'js',
  'css',
  'html',
  'glsl',
  'csv',
  'yaml',
  'yml',
  'xml',
  'log',
]);

type VisualKind = 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'sheet' | 'archive' | 'doc';

function detectVisualKind(file: FileItem): VisualKind {
  const ext = file.extension.toLowerCase();
  if (RASTER_IMAGE_MIMES.has(file.mimeType) || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
    return 'image';
  }
  if (file.mimeType.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  if (file.mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
    return 'audio';
  }
  if (file.mimeType === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return 'code';
  }
  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return 'sheet';
  }
  if (file.category === 'archives' || ARCHIVE_EXTENSIONS.has(ext)) {
    return 'archive';
  }
  return 'doc';
}

function getKindMeta(kind: VisualKind, extension: string) {
  switch (kind) {
    case 'image':
      return {
        label: 'OBRAZ',
        accentClass: 'text-cyan-300 border-cyan-400/25 bg-cyan-400/10',
        Icon: ImageIcon,
      };
    case 'video':
      return {
        label: 'WIDEO',
        accentClass: 'text-fuchsia-300 border-fuchsia-400/25 bg-fuchsia-400/10',
        Icon: Film,
      };
    case 'audio':
      return {
        label: 'AUDIO',
        accentClass: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10',
        Icon: Music,
      };
    case 'pdf':
      return {
        label: 'PDF',
        accentClass: 'text-rose-300 border-rose-400/25 bg-rose-400/10',
        Icon: FileText,
      };
    case 'code':
      return {
        label: extension.toUpperCase(),
        accentClass: 'text-violet-300 border-violet-400/25 bg-violet-400/10',
        Icon: FileCode2,
      };
    case 'sheet':
      return {
        label: extension.toUpperCase(),
        accentClass: 'text-teal-300 border-teal-400/25 bg-teal-400/10',
        Icon: FileSpreadsheet,
      };
    case 'archive':
      return {
        label: extension.toUpperCase() || 'ARCHIWUM',
        accentClass: 'text-amber-300 border-amber-400/25 bg-amber-400/10',
        Icon: Archive,
      };
    default:
      return {
        label: extension.toUpperCase() || 'PLIK',
        accentClass: 'text-slate-300 border-white/15 bg-white/5',
        Icon: FileText,
      };
  }
}

export function FilePreviewBadge({ file, token, variant }: FilePreviewBadgeProps) {
  const kind = detectVisualKind(file);
  const canLoadRaster = RASTER_IMAGE_MIMES.has(file.mimeType);
  const canLoadTextSnippet =
    variant === 'card' &&
    (file.mimeType.startsWith('text/') ||
      file.mimeType === 'application/json' ||
      TEXT_PREVIEW_EXTENSIONS.has(file.extension.toLowerCase()));

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [textSnippet, setTextSnippet] = useState<string | null>(null);

  useEffect(() => {
    if (!canLoadRaster && !canLoadTextSnippet) return;

    let active = true;
    let objectUrl: string | null = null;

    async function fetchPreview() {
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(file.id)}/preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !active) return;

        const ct = res.headers.get('content-type') || '';
        if (canLoadRaster && ct.startsWith('image/')) {
          const blob = await res.blob();
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setThumbUrl(objectUrl);
        } else if (canLoadTextSnippet) {
          const data = (await res.json()) as { kind?: string; content?: string };
          if (active && data.kind === 'text' && typeof data.content === 'string') {
            setTextSnippet(data.content.slice(0, 320));
          }
        }
      } catch {
        // Fallback cleanly to type icon tile
      }
    }

    void fetchPreview();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canLoadRaster, canLoadTextSnippet, file.id, token]);

  const { label, accentClass, Icon } = getKindMeta(kind, file.extension);

  if (variant === 'thumb') {
    if (thumbUrl) {
      return (
        <div className="h-10 w-10 rounded-lg border border-white/10 bg-[#07090F] overflow-hidden shrink-0">
          <img
            src={thumbUrl}
            alt={`Miniatura ${file.originalName}`}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>
      );
    }

    return (
      <div
        className={`h-10 w-10 rounded-lg border flex flex-col items-center justify-center shrink-0 ${accentClass}`}
        aria-hidden="true"
      >
        <Icon className="w-4 h-4" />
      </div>
    );
  }

  // Card preview surface
  if (thumbUrl) {
    return (
      <div className="relative h-36 w-full rounded-lg border border-white/10 bg-[#07090F] overflow-hidden">
        <img
          src={thumbUrl}
          alt={`Podgląd ${file.originalName}`}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070B]/70 via-transparent to-transparent pointer-events-none" />
        <span className="absolute bottom-2 left-2.5 font-mono text-[11px] font-medium text-slate-200">
          {label}
        </span>
      </div>
    );
  }

  if (textSnippet !== null) {
    return (
      <div className="relative h-36 w-full rounded-lg border border-white/10 bg-[#07090F] p-3 overflow-hidden">
        <pre className="font-mono text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap break-words select-none">
          {textSnippet}
        </pre>
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#07090F] to-transparent pointer-events-none" />
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-[11px] font-mono text-violet-300">
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-36 w-full rounded-lg border border-white/10 bg-gradient-to-br from-[#0A0E18] to-[#06080D] flex flex-col items-center justify-center gap-2.5">
      <div className={`h-11 w-11 rounded-xl border flex items-center justify-center ${accentClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="font-mono text-xs font-medium tracking-wider text-slate-300">
        {label}
      </span>
    </div>
  );
}
