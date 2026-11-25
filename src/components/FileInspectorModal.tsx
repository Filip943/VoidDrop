import { AlertCircle, Download, Globe, Lock, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { AccentColor, FileItem, FileVisibility } from '../types';
import { getAccentTheme } from '../utils/accent';
import { formatBytes, formatDateTime, getCategoryLabel } from '../utils/format';

interface FileInspectorModalProps {
  file: FileItem;
  token: string;
  accentColor?: AccentColor;
  isOwner: boolean;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  onDelete: (file: FileItem) => Promise<void>;
  onFileUpdated: (file: FileItem) => void;
}

export function FileInspectorModal({
  file,
  token,
  accentColor = 'cyan',
  isOwner,
  onClose,
  onDownload,
  onDelete,
  onFileUpdated,
}: FileInspectorModalProps) {
  const theme = getAccentTheme(accentColor);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(true);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Owner file management edit mode
  const [editing, setEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>(file.originalName);
  const [editDescription, setEditDescription] = useState<string>(file.description);
  const [editVisibility, setEditVisibility] = useState<FileVisibility>(file.visibility);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>('');

  useEffect(() => {
    setEditName(file.originalName);
    setEditDescription(file.description);
    setEditVisibility(file.visibility);
  }, [file]);

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

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setEditError('');
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(file.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          originalName: editName,
          description: editDescription,
          visibility: editVisibility,
        }),
      });
      const data = (await res.json()) as { file?: FileItem; error?: string };
      if (!res.ok || !data.file) {
        setEditError(data.error || 'Nie udało się zaktualizować pliku.');
        return;
      }
      onFileUpdated(data.file);
      setEditing(false);
    } catch {
      setEditError('Błąd sieci podczas aktualizacji pliku.');
    } finally {
      setSavingEdit(false);
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
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>
                Przesłany przez <span className="text-slate-200">@{file.uploaderNickname}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{getCategoryLabel(file.category)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-slate-300">
                {file.visibility === 'private' ? (
                  <>
                    <Lock className="w-3 h-3 text-amber-300" />
                    <span>Prywatny</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3 text-slate-400" />
                    <span>Publiczny</span>
                  </>
                )}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatDateTime(file.createdAt)}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  setEditError('');
                  setEditing((v) => !v);
                }}
                aria-label="Edytuj właściwości pliku"
                className={`h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  editing
                    ? theme.activeNav
                    : 'border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edytuj</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij szczegóły pliku"
              className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Owner File Management Form */}
        {isOwner && editing && (
          <form
            onSubmit={handleSaveEdit}
            className="rounded-xl border border-white/10 bg-[#07090F] p-4 space-y-3.5"
          >
            {editError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="edit-filename" className="text-xs font-medium text-slate-300">
                Nazwa pliku
              </label>
              <input
                id="edit-filename"
                type="text"
                required
                maxLength={180}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={`h-10 w-full rounded-lg border border-white/10 bg-[#0B0E16] px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-desc" className="text-xs font-medium text-slate-300">
                Opis pliku
              </label>
              <input
                id="edit-desc"
                type="text"
                maxLength={280}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Dodaj opis pliku..."
                className={`h-10 w-full rounded-lg border border-white/10 bg-[#0B0E16] px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditVisibility('public')}
                className={`h-10 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                  editVisibility === 'public'
                    ? theme.activeNav
                    : 'border-white/10 bg-[#0B0E16] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Publiczny</span>
              </button>
              <button
                type="button"
                onClick={() => setEditVisibility('private')}
                className={`h-10 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                  editVisibility === 'private'
                    ? theme.activeNav
                    : 'border-white/10 bg-[#0B0E16] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Prywatny (tylko Ty)</span>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 px-3 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className={`h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 ${theme.solidBtn}`}
              >
                {savingEdit ? 'Zapisywanie...' : 'Zapisz zmiany'}
              </button>
            </div>
          </form>
        )}

        {file.description && !editing && (
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
            <dd className={`mt-1 font-mono text-xs break-all ${theme.text}`}>{file.sha256}</dd>
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
            className={`h-10 px-5 rounded-lg font-semibold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer ${theme.solidBtn}`}
          >
            <Download className="w-4 h-4" />
            <span>Pobierz plik</span>
          </button>
        </div>
      </div>
    </div>
  );
}
