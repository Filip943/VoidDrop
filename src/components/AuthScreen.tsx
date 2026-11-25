import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { DevMailPreview, UserProfile } from '../types';
import { CaptchaField } from './CaptchaField';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: UserProfile) => void;
}

type AuthMode = 'login' | 'register' | 'verify';

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [error, setError] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register fields
  const [regNick, setRegNick] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  // CAPTCHA state
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaRefreshSignal, setCaptchaRefreshSignal] = useState(0);

  // 6-digit Activation state
  const [verifyEmail, setVerifyEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devMailPreview, setDevMailPreview] = useState<DevMailPreview | null>(null);
  const [showDevMail, setShowDevMail] = useState(true);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Google OAuth setup notice when unconfigured
  const [googleNotice, setGoogleNotice] = useState<string>('');

  const handleCaptchaLoaded = useCallback((id: string) => {
    setCaptchaId(id);
  }, []);

  const refreshCaptcha = () => {
    setCaptchaAnswer('');
    setCaptchaRefreshSignal((n) => n + 1);
  };

  // Cooldown timer for resending 6-digit code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  // Listen for Google OAuth popup postMessage
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; token?: string; error?: string } | null;
      if (!data) return;

      if (data.type === 'GOOGLE_AUTH_ERROR') {
        setError(data.error || 'Logowanie przez Google nie powiodło się.');
        return;
      }

      if (data.type === 'GOOGLE_AUTH_SUCCESS' && data.token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${data.token}` },
          });
          if (!res.ok) {
            setError('Nie udało się zweryfikować sesji Google.');
            return;
          }
          const payload = (await res.json()) as { user: UserProfile };
          onAuthenticated(data.token, payload.user);
        } catch {
          setError('Błąd połączenia podczas logowania przez Google.');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticated]);

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setInfoMsg('');
    setGoogleNotice('');
    refreshCaptcha();
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setGoogleNotice('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          captchaId,
          captchaAnswer,
        }),
      });

      const data = (await res.json()) as {
        token?: string;
        user?: UserProfile;
        requiresVerification?: boolean;
        email?: string;
        devMailPreview?: DevMailPreview;
        error?: string;
      };

      if (res.status === 403 && data.requiresVerification && data.email) {
        setVerifyEmail(data.email);
        setDevMailPreview(data.devMailPreview ?? null);
        setOtpDigits(['', '', '', '', '', '']);
        setMode('verify');
        setInfoMsg(data.error || 'Wpisz 6-cyfrowy kod aktywacyjny wysłany na Twój e-mail.');
        return;
      }

      if (!res.ok || !data.token || !data.user) {
        setError(data.error || 'Logowanie nie powiodło się.');
        refreshCaptcha();
        return;
      }

      onAuthenticated(data.token, data.user);
    } catch {
      setError('Błąd sieci podczas próby logowania.');
      refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setGoogleNotice('');

    if (regPassword !== regConfirmPassword) {
      setError('Podane hasła nie są identyczne.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: regNick,
          email: regEmail,
          password: regPassword,
          confirmPassword: regConfirmPassword,
          captchaId,
          captchaAnswer,
        }),
      });

      const data = (await res.json()) as {
        requiresVerification?: boolean;
        email?: string;
        smtpConfigured?: boolean;
        devMailPreview?: DevMailPreview;
        error?: string;
      };

      if (!res.ok || !data.requiresVerification || !data.email) {
        setError(data.error || 'Rejestracja nie powiodła się.');
        refreshCaptcha();
        return;
      }

      setVerifyEmail(data.email);
      setDevMailPreview(data.devMailPreview ?? null);
      setOtpDigits(['', '', '', '', '', '']);
      setResendCooldown(25);
      setMode('verify');
      setInfoMsg(`Wysłaliśmy 6-cyfrowy kod aktywacyjny na adres ${data.email}.`);
    } catch {
      setError('Błąd sieci podczas rejestracji.');
      refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleNotice('');
    try {
      const res = await fetch('/api/auth/google/url');
      if (!res.ok) {
        setError('Nie udało się przygotować logowania Google.');
        return;
      }
      const data = (await res.json()) as {
        configured: boolean;
        url: string | null;
        callbackUrl: string;
      };

      if (!data.configured || !data.url) {
        setGoogleNotice(
          `Logowanie Google wymaga zmiennych GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET. Adres przekierowania OAuth: ${data.callbackUrl}`
        );
        return;
      }

      const popup = window.open(data.url, 'voiddrop_google_oauth', 'width=560,height=680');
      if (!popup) {
        setError('Przeglądarka zablokowała wyskakujące okno. Zezwól na pop-upy dla tej strony.');
      }
    } catch {
      setError('Błąd połączenia z usługą Google OAuth.');
    }
  };

  const handleOtpChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtpDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Wpisz pełny 6-cyfrowy kod aktywacyjny.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail, code }),
      });

      const data = (await res.json()) as {
        token?: string;
        user?: UserProfile;
        error?: string;
      };

      if (!res.ok || !data.token || !data.user) {
        setError(data.error || 'Weryfikacja kodu nie powiodła się.');
        return;
      }

      onAuthenticated(data.token, data.user);
    } catch {
      setError('Błąd sieci podczas weryfikacji konta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setInfoMsg('');
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        devMailPreview?: DevMailPreview;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error || 'Nie udało się wysłać kodu ponownie.');
        return;
      }

      setResendCooldown(25);
      if (data.devMailPreview) {
        setDevMailPreview(data.devMailPreview);
      }
      setInfoMsg('Wysłaliśmy nowy 6-cyfrowy kod na podany adres e-mail.');
    } catch {
      setError('Błąd sieci podczas ponownego wysyłania kodu.');
    }
  };

  const passwordStrength = (() => {
    if (!regPassword) return null;
    let score = 0;
    if (regPassword.length >= 8) score++;
    if (/[A-Z]/.test(regPassword) && /[a-z]/.test(regPassword)) score++;
    if (/\d/.test(regPassword)) score++;
    if (/[^A-Za-z0-9]/.test(regPassword)) score++;
    if (score <= 1) return { label: 'Słabe hasło', color: 'bg-rose-500', text: 'text-rose-400', width: 'w-1/4' };
    if (score === 2) return { label: 'Średnie hasło', color: 'bg-amber-400', text: 'text-amber-300', width: 'w-2/4' };
    if (score === 3) return { label: 'Dobre hasło', color: 'bg-cyan-400', text: 'text-cyan-300', width: 'w-3/4' };
    return { label: 'Silne hasło', color: 'bg-emerald-400', text: 'text-emerald-300', width: 'w-full' };
  })();

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-100 grid grid-cols-1 lg:grid-cols-12 items-stretch">
      {/* Left Neon Void Visual Showcase */}
      <aside className="hidden lg:flex lg:col-span-5 relative overflow-hidden border-r border-white/10 bg-[#05060A]">
        <img
          src="/src/assets/images/voiddrop_monolith_bg_1795638661992.jpg"
          alt="Monolit VoidDrop w estetyce Neon Void"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070B] via-[#06070B]/55 to-[#06070B]/35" />

        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-12 w-full">
          <div>
            <span className="font-display text-2xl font-bold tracking-tight text-white">
              VoidDrop
            </span>
          </div>

          <div className="space-y-8 max-w-md">
            <div className="space-y-3">
              <h1 className="font-display text-4xl font-semibold tracking-tight text-white text-balance leading-[1.12]">
                Przestrzeń plików bez granic
              </h1>
              <p className="text-[15px] leading-relaxed text-slate-300">
                Przesyłaj własne zasoby do chmury, odkrywaj zbiory udostępnione przez innych
                użytkowników i pobieraj dowolny plik jednym kliknięciem.
              </p>
            </div>

            <div className="border-t border-white/15 pt-6 space-y-4 text-sm text-slate-300">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
                <span className="font-medium text-white">Wspólny katalog plików</span>
                <span className="font-mono text-xs text-cyan-300">MongoDB</span>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
                <span className="font-medium text-white">Weryfikacja konta</span>
                <span className="font-mono text-xs text-cyan-300">Kod 6-cyfrowy + CAPTCHA</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-white">Maksymalny rozmiar pliku</span>
                <span className="font-mono text-xs text-cyan-300 tabular-nums">50 MB</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Authentication Workspace */}
      <main className="col-span-1 lg:col-span-7 flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[460px] space-y-6">
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center justify-between">
            <span className="font-display text-2xl font-bold tracking-tight text-white">
              VoidDrop
            </span>
            <span className="text-xs text-slate-400">Chmura plików</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0E16] p-6 sm:p-8 shadow-2xl shadow-black/50">
            {mode !== 'verify' ? (
              <>
                {/* Mode Switcher */}
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#07090F] p-1 border border-white/10 mb-6">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`h-10 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      mode === 'login'
                        ? 'bg-[#151B2B] text-cyan-300 border border-cyan-400/25'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Logowanie
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className={`h-10 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      mode === 'register'
                        ? 'bg-[#151B2B] text-cyan-300 border border-cyan-400/25'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Rejestracja
                  </button>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {googleNotice && (
                  <div className="mb-5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-3 text-xs leading-relaxed text-cyan-100 break-all">
                    {googleNotice}
                  </div>
                )}

                {mode === 'login' ? (
                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="login-email" className="text-xs font-medium text-slate-300">
                        Adres e-mail
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="twoj@email.pl"
                          className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="login-password" className="text-xs font-medium text-slate-300">
                        Hasło
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-password"
                          type={showLoginPass ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Wpisz hasło"
                          className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPass((v) => !v)}
                          aria-label={showLoginPass ? 'Ukryj hasło' : 'Pokaż hasło'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <CaptchaField
                      value={captchaAnswer}
                      onChange={setCaptchaAnswer}
                      onCaptchaLoaded={handleCaptchaLoaded}
                      refreshSignal={captchaRefreshSignal}
                    />

                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 w-full rounded-lg bg-cyan-400 text-[#05070B] font-semibold text-sm hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? 'Logowanie...' : 'Zaloguj się'}
                    </button>

                    <div className="relative py-2 flex items-center">
                      <div className="flex-grow border-t border-white/10" />
                      <span className="mx-3 text-xs text-slate-500">lub</span>
                      <div className="flex-grow border-t border-white/10" />
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="h-11 w-full rounded-lg border border-white/15 bg-[#0E121D] hover:bg-[#141A29] text-slate-100 font-medium text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.25 0-6-2.19-6.98-5.15H1.02v3.14C3.05 21.2 7.21 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.02 14.02c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.16H1.02C.37 7.45 0 8.9 0 11.66s.37 4.21 1.02 5.5l4-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.05 2.8 1.02 6.84l4 3.14c.98-2.96 3.73-5.23 6.98-5.23Z"
                        />
                      </svg>
                      <span>Zaloguj przez Google</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegisterSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="reg-nick" className="text-xs font-medium text-slate-300">
                        Nick (nazwa użytkownika)
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reg-nick"
                          type="text"
                          required
                          minLength={3}
                          maxLength={24}
                          pattern="[a-zA-Z0-9_-]{3,24}"
                          value={regNick}
                          onChange={(e) => setRegNick(e.target.value)}
                          placeholder="np. CyberWilk_99"
                          className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="reg-email" className="text-xs font-medium text-slate-300">
                        Adres e-mail
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reg-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="twoj@email.pl"
                          className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label htmlFor="reg-pass" className="text-xs font-medium text-slate-300">
                          Hasło
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="reg-pass"
                            type={showRegPass ? 'text' : 'password'}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Min. 8 znaków"
                            className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPass((v) => !v)}
                            aria-label={showRegPass ? 'Ukryj hasło' : 'Pokaż hasło'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="reg-confirm" className="text-xs font-medium text-slate-300">
                          Powtórz hasło
                        </label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="reg-confirm"
                            type={showRegPass ? 'text' : 'password'}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            value={regConfirmPassword}
                            onChange={(e) => setRegConfirmPassword(e.target.value)}
                            placeholder="Powtórz hasło"
                            className="h-11 w-full rounded-lg border border-white/10 bg-[#07090F] pl-10 pr-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    {passwordStrength && (
                      <div className="space-y-1">
                        <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full transition-all duration-200 ${passwordStrength.color} ${passwordStrength.width}`} />
                        </div>
                        <p className={`text-xs ${passwordStrength.text}`}>{passwordStrength.label}</p>
                      </div>
                    )}

                    <CaptchaField
                      value={captchaAnswer}
                      onChange={setCaptchaAnswer}
                      onCaptchaLoaded={handleCaptchaLoaded}
                      refreshSignal={captchaRefreshSignal}
                    />

                    <button
                      type="submit"
                      disabled={submitting}
                      className="h-11 w-full rounded-lg bg-cyan-400 text-[#05070B] font-semibold text-sm hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? 'Tworzenie konta...' : 'Zarejestruj się i wyślij kod'}
                    </button>
                  </form>
                )}
              </>
            ) : (
              /* 6-digit Email Activation View */
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Wróć do logowania</span>
                  </button>
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="font-display text-xl font-semibold text-white">
                    Aktywacja konta
                  </h2>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Wpisz 6-cyfrowy kod aktywacyjny wysłany na adres{' '}
                    <span className="text-slate-200 font-medium">{verifyEmail}</span>.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {infoMsg && !error && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-3 text-sm text-cyan-100">
                    <CheckCircle2 className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                <form onSubmit={handleVerifySubmit} className="space-y-5">
                  <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          otpRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        aria-label={`Cyfra ${index + 1} z 6`}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={handleOtpPaste}
                        className="h-14 w-full rounded-lg border border-white/15 bg-[#07090F] text-center font-mono text-xl font-semibold text-cyan-300 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 transition-colors"
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-11 w-full rounded-lg bg-cyan-400 text-[#05070B] font-semibold text-sm hover:bg-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Weryfikowanie...' : 'Aktywuj konto'}
                  </button>
                </form>

                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                  <span className="text-slate-400">Nie otrzymałeś wiadomości?</span>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCooldown > 0}
                    className="font-medium text-cyan-300 hover:text-cyan-200 disabled:text-slate-500 transition-colors cursor-pointer tabular-nums"
                  >
                    {resendCooldown > 0
                      ? `Wyślij ponownie (${resendCooldown} s)`
                      : 'Wyślij kod ponownie'}
                  </button>
                </div>

                {devMailPreview && (
                  <div className="rounded-xl border border-violet-400/25 bg-[#0E1220] p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-violet-300">
                        Podgląd wiadomości e-mail (brak konfiguracji SMTP)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDevMail((v) => !v)}
                        className="text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showDevMail ? 'Ukryj' : 'Pokaż'}
                      </button>
                    </div>
                    {showDevMail && (
                      <div className="space-y-1.5 text-xs text-slate-300">
                        <p className="text-slate-400 truncate">Do: {devMailPreview.to}</p>
                        <p className="text-slate-400 truncate">Temat: {devMailPreview.subject}</p>
                        <div className="pt-1 flex items-center justify-between">
                          <span>Twój kod aktywacyjny:</span>
                          <button
                            type="button"
                            onClick={() => setOtpDigits(devMailPreview.code.split(''))}
                            className="font-mono text-base font-bold tracking-widest text-cyan-300 hover:text-cyan-200 cursor-pointer"
                            title="Kliknij, aby wpisać kod automatycznie"
                          >
                            {devMailPreview.code}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
