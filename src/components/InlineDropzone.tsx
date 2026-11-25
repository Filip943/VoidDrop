import { AlertCircle, CheckCircle2, FilePlus2, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '../utils/format';

export interface UploadTaskItem {
  localId: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface InlineDropzoneProps {
  tasks: UploadTaskItem[];
  onFilesSelected: (files: File[]) => void;
  onOpenModalWithDescription: () => void;
  onDismissTask: (localId: string) => void;
}

export function InlineDropzone({
  tasks,
  onFilesSelected,
  onOpenModalWithDescription,
  onDismissTask,
}: InlineDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length > 0) {
      onFilesSelected(list);
    }
  };

  return (
    <section aria-label="Strefa przesyłania plików" className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed transition-colors px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          dragActive
            ? 'border-cyan-400 bg-cyan-400/10'
            : 'border-white/15 bg-[#090C14] hover:border-cyan-400/45'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files || []);
            if (list.length > 0) onFilesSelected(list);
            e.target.value = '';
          }}
        />

        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
              dragActive
                ? 'border-cyan-300 bg-cyan-400/20 text-cyan-200'
                : 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300'
            }`}
          >
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">
              {dragActive
                ? 'Upuść pliki, aby natychmiast rozpocząć przesyłanie'
                : 'Przeciągnij i upuść pliki tutaj lub w dowolne miejsce okna'}
            </p>
            <p className="text-xs text-slate-400 truncate">
              Natychmiastowe przesyłanie wielu plików · PDF, obrazy, wideo, kod i archiwa do 50 MB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-9 px-4 rounded-lg bg-cyan-400 text-[#05070B] font-semibold text-xs hover:bg-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
          >
            Wybierz pliki
          </button>
          <button
            type="button"
            onClick={onOpenModalWithDescription}
            className="h-9 px-3.5 rounded-lg border border-white/15 text-xs font-medium text-slate-200 hover:bg-white/5 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Z opisem</span>
          </button>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0B0E16] divide-y divide-white/10">
          {tasks.map((task) => (
            <div key={task.localId} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-slate-200 truncate">{task.name}</span>
                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                    <span className="text-slate-400">{formatBytes(task.size)}</span>
                    {task.status === 'uploading' && (
                      <span className="text-cyan-300">{task.progress}%</span>
                    )}
                    {task.status === 'done' && (
                      <span className="text-emerald-300 inline-flex items-center gap-1 font-sans">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Wysłano
                      </span>
                    )}
                    {task.status === 'error' && (
                      <span className="text-rose-300 inline-flex items-center gap-1 font-sans">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {task.error || 'Błąd'}
                      </span>
                    )}
                  </div>
                </div>
                {task.status === 'uploading' && (
                  <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-150"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>
              {task.status !== 'uploading' && (
                <button
                  type="button"
                  onClick={() => onDismissTask(task.localId)}
                  aria-label={`Zamknij status przesyłania ${task.name}`}
                  className="h-7 w-7 rounded-md text-slate-400 hover:text-white hover:bg-white/5 inline-flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
