import { AlertCircle, FileUp, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import type { FileItem } from '../types';
import { formatBytes } from '../utils/format';

interface UploadModalProps {
  token: string;
  initialFile?: File | null;
  onClose: () => void;
  onUploaded: (file: FileItem) => void;
}

export function UploadModal({ token, initialFile = null, onClose, onUploaded }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePick = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError('Plik przekracza maksymalny limit 50 MB.');
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFilePick(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Wybierz plik do przesłania.');
      return;
    }

    setError('');
    setProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (description.trim()) {
      formData.append('description', description.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as { file?: FileItem; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && payload.file) {
          onUploaded(payload.file);
          return;
        }
        setError(payload.error || 'Przesyłanie pliku nie powiodło się.');
        setProgress(null);
      } catch {
        setError('Nieprawidłowa odpowiedź serwera.');
        setProgress(null);
      }
    };

    xhr.onerror = () => {
      setError('Błąd połączenia podczas przesyłania pliku.');
      setProgress(null);
    };

    xhr.send(formData);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B0E16] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 id="upload-modal-title" className="font-display text-lg font-semibold text-white">
            Prześlij plik do VoidDrop
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno przesyłania"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border border-dashed p-7 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-cyan-400 bg-cyan-400/10'
                : 'border-white/15 bg-[#07090F] hover:border-cyan-400/50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFilePick(e.target.files?.[0])}
            />
            <div className="mx-auto mb-3 h-11 w-11 rounded-xl bg-cyan-400/10 border border-cyan-400/25 flex items-center justify-center text-cyan-300">
              {selectedFile ? <FileUp className="w-5 h-5" /> : <UploadCloud className="w-5 h-5" />}
            </div>
            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-white truncate max-w-sm mx-auto">
                  {selectedFile.name}
                </p>
                <p className="font-mono text-xs text-cyan-300 tabular-nums">
                  {formatBytes(selectedFile.size)}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">
                  Przeciągnij plik tutaj lub kliknij, aby wybrać
                </p>
                <p className="text-xs text-slate-400">
                  Dowolny format · maksymalny rozmiar 50 MB
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="upload-description" className="text-xs font-medium text-slate-300">
              Opis pliku (opcjonalny)
            </label>
            <input
              id="upload-description"
              type="text"
              maxLength={280}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Krótki opis ułatwiający wyszukanie pliku przez innych..."
              className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          {progress !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Przesyłanie na serwer</span>
                <span className="font-mono tabular-nums text-cyan-300">{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={progress !== null}
              className="h-10 px-4 rounded-lg border border-white/10 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={!selectedFile || progress !== null}
              className="h-10 px-5 rounded-lg bg-cyan-400 text-[#05070B] font-semibold text-sm hover:bg-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              {progress !== null ? 'Wysyłanie...' : 'Udostępnij plik'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
