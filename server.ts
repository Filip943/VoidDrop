import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  AVATARS_DIR,
  classifyFileCategory,
  db,
  initDatabase,
  type AccentColor,
  type FileCategory,
  type FileSortMode,
  type FileVisibility,
  UPLOADS_DIR,
} from './server/db.ts';
import { sendActivationCodeEmail } from './server/mailer.ts';
import {
  checkRateLimit,
  createCaptchaChallenge,
  detectRasterImageType,
  generate6DigitCode,
  hashCode,
  hashPassword,
  sanitizeOriginalFilename,
  signSessionToken,
  verifyCaptchaChallenge,
  verifyPassword,
  verifySessionToken,
} from './server/security.ts';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    nickname: string;
    tokenVersion: number;
  };
}

const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const OAUTH_STATES = new Map<string, number>();
const VALID_ACCENT_COLORS = new Set<AccentColor>(['cyan', 'violet', 'emerald', 'amber', 'rose']);

function getClientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  return fwd || req.ip || 'unknown';
}

function getAppBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0] || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function serializeUser(user: {
  id: string;
  nickname: string;
  email: string;
  bio: string;
  avatarFilename: string | null;
  accentColor: AccentColor;
  authProvider: string;
  isVerified: boolean;
  createdAt: number;
}) {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    bio: user.bio,
    avatarUrl: user.avatarFilename ? `/api/avatars/${encodeURIComponent(user.avatarFilename)}` : null,
    accentColor: user.accentColor,
    authProvider: user.authProvider,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
  };
}

function resolveSafePathIn(baseDir: string, filename: string): string | null {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const resolved = path.resolve(baseDir, filename);
  if (!resolved.startsWith(baseDir + path.sep)) return null;
  return resolved;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Wymagane zalogowanie.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesja wygasła lub jest nieprawidłowa.' });
    return;
  }

  const user = await db.findUserById(payload.sub);
  if (!user || user.tokenVersion !== payload.ver) {
    res.status(401).json({ error: 'Sesja została unieważniona. Zaloguj się ponownie.' });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    tokenVersion: user.tokenVersion,
  };
  next();
}

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const cleanOrig = sanitizeOriginalFilename(file.originalname);
    const ext = path.extname(cleanOrig).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES },
});

async function startServer(): Promise<void> {
  const dbStatus = await initDatabase();
  console.log(`[VoidDrop] Baza danych gotowa (${dbStatus.mode})`);

  const app = express();
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // 1. CAPTCHA endpoint
  app.get('/api/auth/captcha', (_req, res) => {
    const challenge = createCaptchaChallenge();
    res.json(challenge);
  });

  // 2. Register with Nickname + Email + Password + Repeat Password + CAPTCHA -> sends 6-digit email code
  app.post('/api/auth/register', async (req, res) => {
    try {
      if (!checkRateLimit(`register:${getClientIp(req)}`, 12, 5 * 60 * 1000)) {
        res.status(429).json({ error: 'Zbyt wiele prób rejestracji. Odczekaj kilka minut.' });
        return;
      }

      const { nickname, email, password, confirmPassword, captchaId, captchaAnswer } = req.body ?? {};

      if (
        typeof nickname !== 'string' ||
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        typeof confirmPassword !== 'string' ||
        typeof captchaId !== 'string' ||
        typeof captchaAnswer !== 'string'
      ) {
        res.status(400).json({ error: 'Wszystkie pola formularza są wymagane.' });
        return;
      }

      if (!verifyCaptchaChallenge(captchaId, captchaAnswer)) {
        res.status(400).json({ error: 'Nieprawidłowy lub wygasły kod CAPTCHA.' });
        return;
      }

      const cleanNick = nickname.trim();
      const cleanEmail = email.trim().toLowerCase();

      if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanNick)) {
        res.status(400).json({
          error: 'Nick musi mieć od 3 do 24 znaków (litery, cyfry, _ lub -).',
        });
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 160) {
        res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
        return;
      }

      if (password.length < 8 || password.length > 128) {
        res.status(400).json({ error: 'Hasło musi mieć co najmniej 8 znaków.' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Podane hasła nie są identyczne.' });
        return;
      }

      const existingByEmail = await db.findUserByEmail(cleanEmail);
      if (existingByEmail && existingByEmail.isVerified) {
        res.status(409).json({ error: 'Konto z tym adresem e-mail już istnieje.' });
        return;
      }

      const existingByNick = await db.findUserByNickname(cleanNick);
      if (existingByNick && (!existingByEmail || existingByNick.id !== existingByEmail.id)) {
        res.status(409).json({ error: 'Ten nick jest już zajęty przez innego użytkownika.' });
        return;
      }

      const code = generate6DigitCode();
      const codeHash = hashCode(code);
      const now = Date.now();
      const passwordHash = hashPassword(password);

      if (existingByEmail && !existingByEmail.isVerified) {
        await db.updateUser(existingByEmail.id, {
          nickname: cleanNick,
          passwordHash,
          authProvider: 'local',
          verificationCodeHash: codeHash,
          verificationExpiresAt: now + 15 * 60 * 1000,
          verificationAttempts: 0,
          lastCodeSentAt: now,
        });
      } else {
        await db.createUser({
          nickname: cleanNick,
          email: cleanEmail,
          bio: '',
          avatarFilename: null,
          accentColor: 'cyan',
          tokenVersion: 0,
          passwordHash,
          authProvider: 'local',
          googleId: null,
          isVerified: false,
          verificationCodeHash: codeHash,
          verificationExpiresAt: now + 15 * 60 * 1000,
          verificationAttempts: 0,
          lastCodeSentAt: now,
          createdAt: now,
        });
      }

      const emailResult = await sendActivationCodeEmail({
        to: cleanEmail,
        nickname: cleanNick,
        code,
      });

      res.status(201).json({
        requiresVerification: true,
        email: cleanEmail,
        smtpConfigured: emailResult.smtpConfigured,
        devMailPreview: emailResult.devMailPreview,
      });
    } catch (err) {
      console.error('[VoidDrop Register Error]', err);
      res.status(500).json({ error: 'Wystąpił błąd podczas rejestracji.' });
    }
  });

  // 3. Verify 6-digit activation code
  app.post('/api/auth/verify-code', async (req, res) => {
    try {
      if (!checkRateLimit(`verify:${getClientIp(req)}`, 15, 5 * 60 * 1000)) {
        res.status(429).json({ error: 'Zbyt wiele prób weryfikacji. Odczekaj chwilę.' });
        return;
      }

      const { email, code } = req.body ?? {};
      if (typeof email !== 'string' || typeof code !== 'string') {
        res.status(400).json({ error: 'Podaj adres e-mail i 6-cyfrowy kod aktywacyjny.' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.trim();
      if (!/^\d{6}$/.test(cleanCode)) {
        res.status(400).json({ error: 'Kod aktywacyjny musi składać się z dokładnie 6 cyfr.' });
        return;
      }

      const user = await db.findUserByEmail(cleanEmail);
      if (!user) {
        res.status(404).json({ error: 'Nie znaleziono konta dla tego adresu e-mail.' });
        return;
      }

      if (user.isVerified) {
        const token = signSessionToken(user);
        res.json({ token, user: serializeUser(user) });
        return;
      }

      if (!user.verificationCodeHash || !user.verificationExpiresAt) {
        res.status(400).json({ error: 'Brak aktywnego kodu. Wyślij kod ponownie.' });
        return;
      }

      if (Date.now() > user.verificationExpiresAt) {
        res.status(400).json({ error: 'Kod aktywacyjny wygasł. Wyślij nowy kod.' });
        return;
      }

      if (user.verificationAttempts >= 5) {
        res.status(429).json({
          error: 'Przekroczono limit błędnych prób. Wyślij nowy kod aktywacyjny.',
        });
        return;
      }

      const candidateHash = hashCode(cleanCode);
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(candidateHash, 'hex'),
        Buffer.from(user.verificationCodeHash, 'hex')
      );

      if (!isMatch) {
        await db.updateUser(user.id, {
          verificationAttempts: user.verificationAttempts + 1,
        });
        res.status(400).json({ error: 'Nieprawidłowy 6-cyfrowy kod aktywacyjny.' });
        return;
      }

      const verifiedUser = await db.updateUser(user.id, {
        isVerified: true,
        verificationCodeHash: null,
        verificationExpiresAt: null,
        verificationAttempts: 0,
      });

      const finalUser = verifiedUser || { ...user, isVerified: true };

      await db.createNotification({
        userId: finalUser.id,
        kind: 'security',
        title: 'Konto zostało aktywowane',
        message: 'Witamy w VoidDrop! Możesz teraz personalizować profil i przesyłać pliki.',
        read: false,
        createdAt: Date.now(),
      });

      const token = signSessionToken(finalUser);
      res.json({ token, user: serializeUser(finalUser) });
    } catch (err) {
      console.error('[VoidDrop Verify Error]', err);
      res.status(500).json({ error: 'Nie udało się zweryfikować kodu.' });
    }
  });

  // 4. Resend 6-digit activation code
  app.post('/api/auth/resend-code', async (req, res) => {
    try {
      if (!checkRateLimit(`resend:${getClientIp(req)}`, 8, 5 * 60 * 1000)) {
        res.status(429).json({ error: 'Zbyt wiele żądań ponownego wysłania kodu.' });
        return;
      }

      const { email } = req.body ?? {};
      if (typeof email !== 'string') {
        res.status(400).json({ error: 'Podaj adres e-mail.' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);
      if (!user) {
        res.status(404).json({ error: 'Nie znaleziono konta dla podanego adresu e-mail.' });
        return;
      }

      if (user.isVerified) {
        res.status(400).json({ error: 'To konto jest już aktywne. Możesz się zalogować.' });
        return;
      }

      const now = Date.now();
      if (user.lastCodeSentAt && now - user.lastCodeSentAt < 25_000) {
        const waitSec = Math.ceil((25_000 - (now - user.lastCodeSentAt)) / 1000);
        res.status(429).json({ error: `Odczekaj jeszcze ${waitSec} s przed wysłaniem kolejnego kodu.` });
        return;
      }

      const code = generate6DigitCode();
      await db.updateUser(user.id, {
        verificationCodeHash: hashCode(code),
        verificationExpiresAt: now + 15 * 60 * 1000,
        verificationAttempts: 0,
        lastCodeSentAt: now,
      });

      const emailResult = await sendActivationCodeEmail({
        to: user.email,
        nickname: user.nickname,
        code,
      });

      res.json({
        ok: true,
        smtpConfigured: emailResult.smtpConfigured,
        devMailPreview: emailResult.devMailPreview,
      });
    } catch (err) {
      console.error('[VoidDrop Resend Error]', err);
      res.status(500).json({ error: 'Nie udało się wysłać kodu aktywacyjnego.' });
    }
  });

  // 5. Login with Email + Password + CAPTCHA
  app.post('/api/auth/login', async (req, res) => {
    try {
      if (!checkRateLimit(`login:${getClientIp(req)}`, 20, 5 * 60 * 1000)) {
        res.status(429).json({ error: 'Zbyt wiele prób logowania. Odczekaj kilka minut.' });
        return;
      }

      const { email, password, captchaId, captchaAnswer } = req.body ?? {};
      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        typeof captchaId !== 'string' ||
        typeof captchaAnswer !== 'string'
      ) {
        res.status(400).json({ error: 'Wszystkie pola logowania są wymagane.' });
        return;
      }

      if (!verifyCaptchaChallenge(captchaId, captchaAnswer)) {
        res.status(400).json({ error: 'Nieprawidłowy lub wygasły kod CAPTCHA.' });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Nieprawidłowy adres e-mail lub hasło.' });
        return;
      }

      if (!user.isVerified) {
        const now = Date.now();
        let emailResult: { smtpConfigured: boolean; devMailPreview?: { to: string; subject: string; code: string } } = {
          smtpConfigured: Boolean(process.env.SMTP_HOST?.trim()),
        };

        if (!user.verificationExpiresAt || now > user.verificationExpiresAt) {
          const code = generate6DigitCode();
          await db.updateUser(user.id, {
            verificationCodeHash: hashCode(code),
            verificationExpiresAt: now + 15 * 60 * 1000,
            verificationAttempts: 0,
            lastCodeSentAt: now,
          });
          emailResult = await sendActivationCodeEmail({
            to: user.email,
            nickname: user.nickname,
            code,
          });
        }

        res.status(403).json({
          requiresVerification: true,
          email: user.email,
          smtpConfigured: emailResult.smtpConfigured,
          devMailPreview: emailResult.devMailPreview,
          error: 'Konto nie zostało jeszcze aktywowane. Wpisz 6-cyfrowy kod z wiadomości e-mail.',
        });
        return;
      }

      const token = signSessionToken(user);
      res.json({ token, user: serializeUser(user) });
    } catch (err) {
      console.error('[VoidDrop Login Error]', err);
      res.status(500).json({ error: 'Błąd podczas logowania.' });
    }
  });

  // 6. Google OAuth URL endpoint
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const baseUrl = getAppBaseUrl(req);
    const callbackUrl = `${baseUrl}/auth/google/callback`;

    if (!clientId || !clientSecret) {
      res.json({
        configured: false,
        callbackUrl,
        url: null,
      });
      return;
    }

    const now = Date.now();
    for (const [k, exp] of OAUTH_STATES.entries()) {
      if (exp < now) OAUTH_STATES.delete(k);
    }

    const state = crypto.randomBytes(24).toString('hex');
    OAUTH_STATES.set(state, now + 10 * 60 * 1000);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });

    res.json({
      configured: true,
      callbackUrl,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  });

  // 7. Google OAuth Callback (Popup postMessage handler)
  app.get(['/auth/google/callback', '/auth/google/callback/'], async (req, res) => {
    const sendPopupResult = (payload: { type: string; token?: string; error?: string }) => {
      const jsonPayload = JSON.stringify(payload).replace(/</g, '\\u003c');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html>
<html lang="pl">
  <head><meta charset="utf-8" /><title>VoidDrop — Autoryzacja Google</title></head>
  <body style="background:#06070B;color:#E2E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>Zamykanie okna autoryzacji...</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${jsonPayload}, window.location.origin);
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
    };

    try {
      const { code, state, error } = req.query;
      if (typeof error === 'string') {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Autoryzacja Google została anulowana.' });
        return;
      }

      if (typeof code !== 'string' || typeof state !== 'string') {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Brak parametrów autoryzacji Google.' });
        return;
      }

      const stateExp = OAUTH_STATES.get(state);
      OAUTH_STATES.delete(state);
      if (!stateExp || Date.now() > stateExp) {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Sesja logowania Google wygasła.' });
        return;
      }

      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Brak konfiguracji OAuth Google na serwerze.' });
        return;
      }

      const callbackUrl = `${getAppBaseUrl(req)}/auth/google/callback`;
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResp.ok) {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Nie udało się wymienić tokenu Google.' });
        return;
      }

      const tokenData = (await tokenResp.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Brak tokenu dostępu Google.' });
        return;
      }

      const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileResp.ok) {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Nie udało się pobrać profilu Google.' });
        return;
      }

      const profile = (await profileResp.json()) as {
        id?: string;
        email?: string;
        name?: string;
      };

      if (!profile.email) {
        sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Konto Google nie udostępniło adresu e-mail.' });
        return;
      }

      const cleanEmail = profile.email.trim().toLowerCase();
      let user = await db.findUserByEmail(cleanEmail);

      if (!user) {
        const rawBase = (profile.name || cleanEmail.split('@')[0] || 'User')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 18);
        let candidateNick = rawBase.length >= 3 ? rawBase : `user_${rawBase}`;
        const existingNick = await db.findUserByNickname(candidateNick);
        if (existingNick) {
          candidateNick = `${candidateNick.slice(0, 18)}_${crypto.randomInt(100, 999)}`;
        }

        user = await db.createUser({
          nickname: candidateNick,
          email: cleanEmail,
          bio: '',
          avatarFilename: null,
          accentColor: 'cyan',
          tokenVersion: 0,
          passwordHash: null,
          authProvider: 'google',
          googleId: profile.id || null,
          isVerified: true,
          verificationCodeHash: null,
          verificationExpiresAt: null,
          verificationAttempts: 0,
          lastCodeSentAt: null,
          createdAt: Date.now(),
        });

        await db.createNotification({
          userId: user.id,
          kind: 'security',
          title: 'Konto utworzone przez Google',
          message: 'Możesz spersonalizować profil, awatar i kolor akcentu w Ustawieniach.',
          read: false,
          createdAt: Date.now(),
        });
      } else if (!user.isVerified || !user.googleId) {
        user =
          (await db.updateUser(user.id, {
            isVerified: true,
            googleId: profile.id || user.googleId,
          })) || user;
      }

      const sessionToken = signSessionToken(user);
      sendPopupResult({ type: 'GOOGLE_AUTH_SUCCESS', token: sessionToken });
    } catch (err) {
      console.error('[VoidDrop Google OAuth Error]', err);
      sendPopupResult({ type: 'GOOGLE_AUTH_ERROR', error: 'Błąd podczas autoryzacji Google.' });
    }
  });

  // 8. Current user session
  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = await db.findUserById(req.user!.id);
    if (!user) {
      res.status(401).json({ error: 'Konto nie istnieje.' });
      return;
    }
    res.json({ user: serializeUser(user) });
  });

  // 9. Account Personalization & Settings: Update Profile (nickname, bio, accentColor)
  app.patch('/api/account/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!checkRateLimit(`profile:${req.user!.id}`, 20, 5 * 60 * 1000)) {
        res.status(429).json({ error: 'Zbyt wiele zmian profilu w krótkim czasie.' });
        return;
      }

      const { nickname, bio, accentColor } = req.body ?? {};
      const user = await db.findUserById(req.user!.id);
      if (!user) {
        res.status(404).json({ error: 'Nie znaleziono konta.' });
        return;
      }

      const patch: Partial<{ nickname: string; bio: string; accentColor: AccentColor }> = {};
      let nickChanged = false;

      if (typeof nickname === 'string') {
        const cleanNick = nickname.trim();
        if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanNick)) {
          res.status(400).json({
            error: 'Nick musi mieć od 3 do 24 znaków (litery, cyfry, _ lub -).',
          });
          return;
        }
        if (cleanNick.toLowerCase() !== user.nickname.toLowerCase()) {
          const conflict = await db.findUserByNickname(cleanNick);
          if (conflict && conflict.id !== user.id) {
            res.status(409).json({ error: 'Ten nick jest już zajęty przez innego użytkownika.' });
            return;
          }
          patch.nickname = cleanNick;
          nickChanged = true;
        } else if (cleanNick !== user.nickname) {
          patch.nickname = cleanNick;
          nickChanged = true;
        }
      }

      if (typeof bio === 'string') {
        const cleanBio = bio.trim();
        if (cleanBio.length > 160) {
          res.status(400).json({ error: 'Opis profilu może mieć maksymalnie 160 znaków.' });
          return;
        }
        patch.bio = cleanBio;
      }

      if (typeof accentColor === 'string') {
        if (!VALID_ACCENT_COLORS.has(accentColor as AccentColor)) {
          res.status(400).json({ error: 'Wybrano nieprawidłowy kolor akcentu.' });
          return;
        }
        patch.accentColor = accentColor as AccentColor;
      }

      const updated = (await db.updateUser(user.id, patch)) || user;
      if (nickChanged) {
        await db.updateUploaderNickname(user.id, updated.nickname);
      }

      await db.createNotification({
        userId: user.id,
        kind: 'info',
        title: 'Zaktualizowano profil',
        message: 'Twoje ustawienia personalizacji zostały zapisane.',
        read: false,
        createdAt: Date.now(),
      });

      const nextToken = nickChanged ? signSessionToken(updated) : undefined;
      res.json({ user: serializeUser(updated), token: nextToken });
    } catch (err) {
      console.error('[VoidDrop Profile Update Error]', err);
      res.status(500).json({ error: 'Nie udało się zapisać zmian profilu.' });
    }
  });

  // 10. Upload Custom Avatar (verified via magic bytes)
  app.post(
    '/api/account/avatar',
    requireAuth,
    (req, res, next) => {
      avatarUpload.single('avatar')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'Awatar przekracza maksymalny rozmiar 2 MB.' });
            return;
          }
          res.status(400).json({ error: 'Błąd przesyłania awatara.' });
          return;
        }
        if (err) {
          res.status(400).json({ error: 'Nieprawidłowy plik awatara.' });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          res.status(400).json({ error: 'Wybierz obraz awatara (JPG, PNG, WEBP lub GIF).' });
          return;
        }

        const detected = detectRasterImageType(req.file.buffer);
        if (!detected) {
          res.status(400).json({
            error: 'Nieobsługiwany lub uszkodzony format obrazu. Dozwolone: JPG, PNG, WEBP, GIF.',
          });
          return;
        }

        const user = await db.findUserById(req.user!.id);
        if (!user) {
          res.status(404).json({ error: 'Konto nie istnieje.' });
          return;
        }

        fs.mkdirSync(AVATARS_DIR, { recursive: true });
        const newFilename = `${crypto.randomUUID()}.${detected.ext}`;
        const destPath = resolveSafePathIn(AVATARS_DIR, newFilename);
        if (!destPath) {
          res.status(500).json({ error: 'Błąd zapisu pliku awatara.' });
          return;
        }

        fs.writeFileSync(destPath, req.file.buffer);

        // Remove previous avatar safely
        if (user.avatarFilename) {
          const oldPath = resolveSafePathIn(AVATARS_DIR, user.avatarFilename);
          if (oldPath && fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }

        const updated = (await db.updateUser(user.id, { avatarFilename: newFilename })) || user;
        await db.createNotification({
          userId: user.id,
          kind: 'info',
          title: 'Zmieniono awatar',
          message: 'Twój nowy awatar jest już widoczny w panelu VoidDrop.',
          read: false,
          createdAt: Date.now(),
        });

        res.json({ user: serializeUser(updated) });
      } catch (err) {
        console.error('[VoidDrop Avatar Upload Error]', err);
        res.status(500).json({ error: 'Nie udało się zapisać awatara.' });
      }
    }
  );

  // 11. Remove Custom Avatar
  app.delete('/api/account/avatar', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = await db.findUserById(req.user!.id);
      if (!user) {
        res.status(404).json({ error: 'Konto nie istnieje.' });
        return;
      }

      if (user.avatarFilename) {
        const oldPath = resolveSafePathIn(AVATARS_DIR, user.avatarFilename);
        if (oldPath && fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const updated = (await db.updateUser(user.id, { avatarFilename: null })) || user;
      res.json({ user: serializeUser(updated) });
    } catch (err) {
      console.error('[VoidDrop Avatar Delete Error]', err);
      res.status(500).json({ error: 'Nie udało się usunąć awatara.' });
    }
  });

  // 12. Serve Avatar safely
  app.get('/api/avatars/:filename', (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(filename)) {
      res.status(404).end();
      return;
    }
    const safePath = resolveSafePathIn(AVATARS_DIR, filename);
    if (!safePath || !fs.existsSync(safePath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(safePath);
  });

  // 13. Account Security: Change Password (requires current password, bumps tokenVersion)
  app.patch('/api/account/password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!checkRateLimit(`pwd:${req.user!.id}`, 6, 10 * 60 * 1000)) {
        res.status(429).json({ error: 'Zbyt wiele prób zmiany hasła. Odczekaj kilka minut.' });
        return;
      }

      const { currentPassword, newPassword, confirmNewPassword } = req.body ?? {};
      if (
        typeof currentPassword !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmNewPassword !== 'string'
      ) {
        res.status(400).json({ error: 'Wszystkie pola zmiany hasła są wymagane.' });
        return;
      }

      const user = await db.findUserById(req.user!.id);
      if (!user) {
        res.status(404).json({ error: 'Konto nie istnieje.' });
        return;
      }

      if (user.authProvider !== 'local' || !user.passwordHash) {
        res.status(400).json({
          error: 'Konto powiązane z Google nie korzysta z lokalnego hasła.',
        });
        return;
      }

      if (!verifyPassword(currentPassword, user.passwordHash)) {
        res.status(403).json({ error: 'Obecne hasło jest nieprawidłowe.' });
        return;
      }

      if (newPassword.length < 8 || newPassword.length > 128) {
        res.status(400).json({ error: 'Nowe hasło musi mieć od 8 do 128 znaków.' });
        return;
      }

      if (newPassword !== confirmNewPassword) {
        res.status(400).json({ error: 'Nowe hasła nie są identyczne.' });
        return;
      }

      if (newPassword === currentPassword) {
        res.status(400).json({ error: 'Nowe hasło musi różnić się od obecnego.' });
        return;
      }

      const updated =
        (await db.updateUser(user.id, {
          passwordHash: hashPassword(newPassword),
          tokenVersion: user.tokenVersion + 1,
        })) || user;

      await db.createNotification({
        userId: user.id,
        kind: 'security',
        title: 'Zmieniono hasło konta',
        message: 'Poprzednie sesje zostały wylogowane ze względów bezpieczeństwa.',
        read: false,
        createdAt: Date.now(),
      });

      const freshToken = signSessionToken(updated);
      res.json({ ok: true, token: freshToken, user: serializeUser(updated) });
    } catch (err) {
      console.error('[VoidDrop Password Change Error]', err);
      res.status(500).json({ error: 'Nie udało się zmienić hasła.' });
    }
  });

  // 14. Account Security: Revoke all other sessions
  app.post('/api/account/revoke-sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = await db.findUserById(req.user!.id);
      if (!user) {
        res.status(404).json({ error: 'Konto nie istnieje.' });
        return;
      }

      const updated =
        (await db.updateUser(user.id, {
          tokenVersion: user.tokenVersion + 1,
        })) || user;

      await db.createNotification({
        userId: user.id,
        kind: 'security',
        title: 'Unieważniono pozostałe sesje',
        message: 'Wszystkie inne aktywne tokeny dostępu zostały wylogowane.',
        read: false,
        createdAt: Date.now(),
      });

      const freshToken = signSessionToken(updated);
      res.json({ ok: true, token: freshToken, user: serializeUser(updated) });
    } catch (err) {
      console.error('[VoidDrop Revoke Sessions Error]', err);
      res.status(500).json({ error: 'Nie udało się unieważnić sesji.' });
    }
  });

  // 15. Notification System Endpoints
  app.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const notifications = await db.findNotifications(req.user!.id);
      res.json({ notifications });
    } catch (err) {
      console.error('[VoidDrop Notifications Error]', err);
      res.status(500).json({ error: 'Nie udało się pobrać powiadomień.' });
    }
  });

  app.patch('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await db.markAllNotificationsRead(req.user!.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Błąd aktualizacji powiadomień.' });
    }
  });

  app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id || '');
      await db.markNotificationRead(req.user!.id, id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Błąd aktualizacji powiadomienia.' });
    }
  });

  // 16. List & search files (enforces private/public visibility access control)
  app.get('/api/files', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
      const rawCat = typeof req.query.category === 'string' ? req.query.category : 'all';
      const category: 'all' | 'mine' | 'private' | FileCategory =
        rawCat === 'mine' ||
        rawCat === 'private' ||
        rawCat === 'media' ||
        rawCat === 'docs' ||
        rawCat === 'archives'
          ? rawCat
          : 'all';

      const ext = typeof req.query.ext === 'string' ? req.query.ext.slice(0, 12) : '';
      const rawSort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
      const sort: FileSortMode =
        rawSort === 'oldest' ||
        rawSort === 'popular' ||
        rawSort === 'size' ||
        rawSort === 'smallest' ||
        rawSort === 'name'
          ? rawSort
          : 'newest';

      const result = await db.findFiles({
        query: q,
        category,
        extensionFilter: ext,
        userId: req.user!.id,
        sort,
      });

      res.json(result);
    } catch (err) {
      console.error('[VoidDrop List Files Error]', err);
      res.status(500).json({ error: 'Nie udało się pobrać listy plików.' });
    }
  });

  // 17. Upload file (supports visibility: public | private)
  app.post(
    '/api/files/upload',
    requireAuth,
    (req, res, next) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'Plik przekracza maksymalny rozmiar 50 MB.' });
            return;
          }
          res.status(400).json({ error: 'Błąd przesyłania pliku.' });
          return;
        }
        if (err) {
          res.status(400).json({ error: 'Nieprawidłowe żądanie przesyłania.' });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Nie wybrano pliku do przesłania.' });
          return;
        }

        const safePath = resolveSafePathIn(UPLOADS_DIR, req.file.filename);
        if (!safePath || !fs.existsSync(safePath)) {
          res.status(500).json({ error: 'Błąd zapisu pliku na serwerze.' });
          return;
        }

        const originalName = sanitizeOriginalFilename(req.file.originalname);
        const extRaw = path.extname(originalName).replace(/^\./, '').toLowerCase();
        const extension = extRaw.slice(0, 12) || 'bin';
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const category = classifyFileCategory(mimeType, extension);
        const description =
          typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 280) : '';
        const visibility: FileVisibility =
          req.body?.visibility === 'private' ? 'private' : 'public';

        const fileBuffer = fs.readFileSync(safePath);
        const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const created = await db.createFile({
          originalName,
          storedName: req.file.filename,
          mimeType,
          extension,
          category,
          visibility,
          size: req.file.size,
          sha256,
          description,
          uploaderId: req.user!.id,
          uploaderNickname: req.user!.nickname,
          downloads: 0,
          createdAt: Date.now(),
        });

        await db.createNotification({
          userId: req.user!.id,
          kind: 'upload',
          title: 'Przesłano nowy plik',
          message: `${created.originalName} (${visibility === 'private' ? 'prywatny' : 'publiczny'})`,
          read: false,
          createdAt: Date.now(),
        });

        res.status(201).json({ file: created });
      } catch (err) {
        console.error('[VoidDrop Upload Error]', err);
        res.status(500).json({ error: 'Nie udało się zapisać metadanych pliku.' });
      }
    }
  );

  // 18. Edit file metadata (rename, description, visibility) — Owner only
  app.patch('/api/files/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id || '');
      const record = await db.findFileById(id);
      if (!record) {
        res.status(404).json({ error: 'Plik nie został znaleziony.' });
        return;
      }

      if (record.uploaderId !== req.user!.id) {
        res.status(403).json({ error: 'Możesz edytować wyłącznie własne pliki.' });
        return;
      }

      const { originalName, description, visibility } = req.body ?? {};
      const patch: Partial<{
        originalName: string;
        description: string;
        visibility: FileVisibility;
        extension: string;
        category: FileCategory;
      }> = {};

      if (typeof originalName === 'string') {
        const cleaned = sanitizeOriginalFilename(originalName);
        if (!cleaned || cleaned.length < 1) {
          res.status(400).json({ error: 'Nazwa pliku nie może być pusta.' });
          return;
        }
        patch.originalName = cleaned;
        const extRaw = path.extname(cleaned).replace(/^\./, '').toLowerCase();
        if (extRaw) {
          patch.extension = extRaw.slice(0, 12);
          patch.category = classifyFileCategory(record.mimeType, patch.extension);
        }
      }

      if (typeof description === 'string') {
        patch.description = description.trim().slice(0, 280);
      }

      if (typeof visibility === 'string') {
        if (visibility !== 'public' && visibility !== 'private') {
          res.status(400).json({ error: 'Nieprawidłowy tryb widoczności pliku.' });
          return;
        }
        patch.visibility = visibility;
      }

      const updated = (await db.updateFile(record.id, patch)) || record;
      if (patch.visibility && patch.visibility !== record.visibility) {
        await db.createNotification({
          userId: req.user!.id,
          kind: 'security',
          title: 'Zmieniono widoczność pliku',
          message: `${updated.originalName} jest teraz ${updated.visibility === 'private' ? 'prywatny' : 'publiczny'}.`,
          read: false,
          createdAt: Date.now(),
        });
      }

      res.json({ file: updated });
    } catch (err) {
      console.error('[VoidDrop Update File Error]', err);
      res.status(500).json({ error: 'Nie udało się zaktualizować metadanych pliku.' });
    }
  });

  // 19. Download file (enforces private access control + notifies owner)
  app.get('/api/files/:id/download', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id || '');
      const record = await db.findFileById(id);
      if (!record) {
        res.status(404).json({ error: 'Plik nie został znaleziony.' });
        return;
      }

      if (record.visibility === 'private' && record.uploaderId !== req.user!.id) {
        res.status(403).json({ error: 'Ten plik jest prywatny i nie masz do niego dostępu.' });
        return;
      }

      const filePath = resolveSafePathIn(UPLOADS_DIR, record.storedName);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Zawartość pliku nie jest dostępna na dysku.' });
        return;
      }

      await db.incrementDownloads(record.id);

      if (record.uploaderId !== req.user!.id && !record.uploaderId.startsWith('community_')) {
        await db.createNotification({
          userId: record.uploaderId,
          kind: 'download',
          title: 'Pobrano Twój plik',
          message: `@${req.user!.nickname} pobrał plik ${record.originalName}.`,
          read: false,
          createdAt: Date.now(),
        });
      }

      const encodedName = encodeURIComponent(record.originalName);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
      res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(filePath);
    } catch (err) {
      console.error('[VoidDrop Download Error]', err);
      res.status(500).json({ error: 'Błąd podczas pobierania pliku.' });
    }
  });

  // 20. Preview file (images & safe text/code, enforces private access control)
  app.get('/api/files/:id/preview', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id || '');
      const record = await db.findFileById(id);
      if (!record) {
        res.status(404).json({ error: 'Plik nie został znaleziony.' });
        return;
      }

      if (record.visibility === 'private' && record.uploaderId !== req.user!.id) {
        res.status(403).json({ error: 'Brak dostępu do podglądu pliku prywatnego.' });
        return;
      }

      const filePath = resolveSafePathIn(UPLOADS_DIR, record.storedName);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Plik niedostępny.' });
        return;
      }

      const safeRasterImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (safeRasterImages.includes(record.mimeType)) {
        res.setHeader('Content-Type', record.mimeType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(filePath);
        return;
      }

      const textExts = ['txt', 'md', 'json', 'ts', 'tsx', 'js', 'css', 'html', 'glsl', 'csv', 'yaml', 'yml', 'xml', 'log'];
      if (record.mimeType.startsWith('text/') || record.mimeType === 'application/json' || textExts.includes(record.extension)) {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(64 * 1024);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        res.json({
          kind: 'text',
          content: buf.subarray(0, bytesRead).toString('utf8'),
          truncated: record.size > bytesRead,
        });
        return;
      }

      res.json({ kind: 'unsupported' });
    } catch (err) {
      console.error('[VoidDrop Preview Error]', err);
      res.status(500).json({ error: 'Nie udało się wygenerować podglądu.' });
    }
  });

  // 21. Delete own file
  app.delete('/api/files/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id || '');
      const record = await db.findFileById(id);
      if (!record) {
        res.status(404).json({ error: 'Plik nie został znaleziony.' });
        return;
      }

      if (record.uploaderId !== req.user!.id) {
        res.status(403).json({ error: 'Możesz usuwać wyłącznie własne pliki.' });
        return;
      }

      const filePath = resolveSafePathIn(UPLOADS_DIR, record.storedName);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await db.deleteFileById(record.id);
      await db.createNotification({
        userId: req.user!.id,
        kind: 'info',
        title: 'Usunięto plik',
        message: `Plik ${record.originalName} został trwale usunięty.`,
        read: false,
        createdAt: Date.now(),
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[VoidDrop Delete Error]', err);
      res.status(500).json({ error: 'Nie udało się usunąć pliku.' });
    }
  });

  // Vite dev middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VoidDrop] Serwer uruchomiony na porcie ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[VoidDrop Fatal Startup Error]', err);
  process.exit(1);
});
