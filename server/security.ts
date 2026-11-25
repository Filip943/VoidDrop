import crypto from 'node:crypto';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SECRET;
}

export interface SessionPayload {
  sub: string;
  email: string;
  nickname: string;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derivedBuf.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

export function signSessionToken(user: { id: string; email: string; nickname: string }): string {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    nickname: user.nickname,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.sub || !parsed.email || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generate6DigitCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeOriginalFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/[\x00-\x1f\x7f]/g, '').trim();
  return base.slice(0, 180) || 'plik';
}

// Server-side CAPTCHA store (single-use, 5 minute TTL)
interface CaptchaEntry {
  answerHash: string;
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();
const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pruneExpiredCaptchas(): void {
  const now = Date.now();
  for (const [id, entry] of captchaStore.entries()) {
    if (entry.expiresAt <= now) {
      captchaStore.delete(id);
    }
  }
  if (captchaStore.size > 2000) {
    const oldest = captchaStore.keys().next().value;
    if (oldest) captchaStore.delete(oldest);
  }
}

export function createCaptchaChallenge(): { captchaId: string; svg: string } {
  pruneExpiredCaptchas();

  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CAPTCHA_ALPHABET[crypto.randomInt(0, CAPTCHA_ALPHABET.length)];
  }

  const captchaId = crypto.randomUUID();
  captchaStore.set(captchaId, {
    answerHash: hashCode(code),
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // Render crisp Neon Void dark SVG challenge
  const width = 196;
  const height = 56;
  const noiseLines: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x1 = crypto.randomInt(0, 40);
    const y1 = crypto.randomInt(6, height - 6);
    const x2 = crypto.randomInt(width - 40, width);
    const y2 = crypto.randomInt(6, height - 6);
    const cx = crypto.randomInt(50, width - 50);
    const cy = crypto.randomInt(4, height - 4);
    const stroke = i % 2 === 0 ? 'rgba(34,211,238,0.28)' : 'rgba(139,92,246,0.32)';
    noiseLines.push(
      `<path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="1.4" />`
    );
  }

  const noiseDots: string[] = [];
  for (let i = 0; i < 24; i++) {
    const cx = crypto.randomInt(8, width - 8);
    const cy = crypto.randomInt(6, height - 6);
    const r = crypto.randomInt(1, 2);
    noiseDots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(148,163,184,0.28)" />`);
  }

  const chars = code
    .split('')
    .map((ch, idx) => {
      const x = 24 + idx * 34 + crypto.randomInt(-3, 4);
      const y = 37 + crypto.randomInt(-5, 6);
      const rot = crypto.randomInt(-18, 19);
      const fill = idx % 2 === 0 ? '#E2E8F0' : '#67E8F9';
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="JetBrains Mono, monospace" font-size="25" font-weight="700" fill="${fill}" letter-spacing="1">${ch}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Kod CAPTCHA">
    <rect width="100%" height="100%" rx="8" fill="#090C14" />
    ${noiseLines.join('')}
    ${noiseDots.join('')}
    ${chars}
  </svg>`;

  return { captchaId, svg };
}

export function verifyCaptchaChallenge(captchaId: string, answer: string): boolean {
  if (!captchaId || !answer) return false;
  const entry = captchaStore.get(captchaId);
  // Single-use: always delete on verification attempt
  captchaStore.delete(captchaId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) return false;

  const normalized = answer.trim().toUpperCase();
  if (normalized.length !== 5) return false;
  const submittedHash = hashCode(normalized);
  return crypto.timingSafeEqual(
    Buffer.from(submittedHash, 'hex'),
    Buffer.from(entry.answerHash, 'hex')
  );
}
