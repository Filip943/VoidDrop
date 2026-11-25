import { Download, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FileItem } from '../types';
import { formatBytes, formatDateTime, getCategoryLabel } from '../utils/format';

interface FileInspectorModalProps {
  file: FileItem;
  token: string;
  isOwner: boolean;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  onDelete: (file: FileItem) => Promise<void>;
}

export function FileInspectorModal({
  file,
  token,
  isOwner,
  onClose,
  onDownload,
  onDelete,
}: FileInspectorModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(true);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let objectUrlToRevoke: string | null = null;

    async function loadPreview() {
      setPreviewLoading(true);
      setImageUrl(null);
      setTextPreview(null);
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(file.id)}/preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !active) return;

        const contentType = res.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const blob = await res.blob();
          if (!active) return;
          objectUrlToRevoke = URL.createObjectURL(blob);
          setImageUrl(objectUrlToRevoke);
        } else {
          const payload = (await res.json()) as { kind?: string; content?: string };
          if (active && payload.kind === 'text' && typeof payload.content === 'string') {
            setTextPreview(payload.content);
          }
        }
      } finally {
        if (active) setPreviewLoading(false);
      }
    }

    void loadPreview();
    return () => {
      active = false;
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    };
  }, [file.id, token]);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(file);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0B0E16] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="min-w-0 space-y-1">
            <h2
              id="inspector-title"
              className="font-display text-lg font-semibold text-white truncate"
            >
              {file.originalName}
            </h2>
            <p className="text-xs text-slate-400">
              Przesłany przez <span className="text-slate-200">@{file.uploaderNickname}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>{getCategoryLabel(file.category)}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatDateTime(file.createdAt)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij szczegóły pliku"
            className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {file.description && (
          <p className="text-sm text-slate-300 leading-relaxed">{file.description}</p>
        )}

        {/* Preview Region */}
        {previewLoading ? (
          <div className="h-48 rounded-xl border border-white/10 bg-[#07090F] animate-pulse" />
        ) : imageUrl ? (
          <div className="rounded-xl border border-white/10 bg-[#07090F] overflow-hidden max-h-80 flex items-center justify-center">
            <img
              src={imageUrl}
              alt={file.originalName}
              referrerPolicy="no-referrer"
              className="max-h-80 w-auto object-contain"
            />
          </div>
        ) : textPreview !== null ? (
          <pre className="rounded-xl border border-white/10 bg-[#07090F] p-4 font-mono text-xs text-slate-200 overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap">
            {textPreview}
          </pre>
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#07090F] px-4 py-6 text-center text-xs text-slate-400">
            Podgląd bezpośredni niedostępny dla formatu .{file.extension}. Pobierz plik, aby go otworzyć.
          </div>
        )}

        {/* Metadata Table */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-b border-white/10 py-4 text-xs">
          <div>
            <dt className="text-slate-500">Rozmiar</dt>
            <dd className="mt-1 font-mono text-sm text-slate-100 tabular-nums">
              {formatBytes(file.size)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Pobrania</dt>
            <dd className="mt-1 font-mono text-sm text-slate-100 tabular-nums">
              {file.downloads}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Typ MIME</dt>
            <dd className="mt-1 font-mono text-xs text-slate-300 truncate">{file.mimeType}</dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-slate-500">Suma kontrolna SHA-256</dt>
            <dd className="mt-1 font-mono text-xs text-cyan-300 break-all">{file.sha256}</dd>
          </div>
        </dl>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isOwner ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-300">Usunąć bezpowrotnie?</span>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="h-9 px-3 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-400 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deleting ? 'Usuwanie...' : 'Potwierdź'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-9 px-3 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  Anuluj
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="h-10 px-3.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Usuń plik</span>
              </button>
            )
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => onDownload(file)}
            className="h-10 px-5 rounded-lg bg-cyan-400 text-[#05070B] font-semibold text-sm hover:bg-cyan-300 inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Pobierz plik</span>
          </button>
        </div>
      </div>
    </div>
  );
}
