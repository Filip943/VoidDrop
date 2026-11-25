import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface CaptchaFieldProps {
  value: string;
  onChange: (value: string) => void;
  onCaptchaLoaded: (captchaId: string) => void;
  refreshSignal: number;
}

export function CaptchaField({
  value,
  onChange,
  onCaptchaLoaded,
  refreshSignal,
}: CaptchaFieldProps) {
  const [svgDataUrl, setSvgDataUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const loadCaptcha = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/captcha');
      if (!res.ok) return;
      const data = (await res.json()) as { captchaId: string; svg: string };
      setSvgDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(data.svg)}`);
      onCaptchaLoaded(data.captchaId);
    } finally {
      setLoading(false);
    }
  }, [onCaptchaLoaded]);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha, refreshSignal]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="captcha-input" className="text-xs font-medium text-slate-300">
          Weryfikacja CAPTCHA
        </label>
        <button
          type="button"
          onClick={() => {
            onChange('');
            void loadCaptcha();
          }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Nowy kod</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="h-14 w-full sm:w-[196px] shrink-0 rounded-lg border border-white/10 bg-[#090C14] overflow-hidden flex items-center justify-center">
          {svgDataUrl ? (
            <img
              src={svgDataUrl}
              alt="Obrazek weryfikacyjny CAPTCHA"
              className="h-full w-full object-contain select-none"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-xs text-slate-500">Ładowanie...</span>
          )}
        </div>

        <input
          id="captcha-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={5}
          required
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Przepisz 5 znaków"
          className="h-14 flex-1 rounded-lg border border-white/10 bg-[#07090F] px-3.5 font-mono text-base tracking-[0.22em] uppercase text-slate-100 placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
        />
      </div>
    </div>
  );
}
