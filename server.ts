// Load .env BEFORE server/db.ts is evaluated. With ESM, calling
// `dotenv.config()` in this module body is too late: every static dependency is
// evaluated first, so the database used to miss DEFAULT_ADMIN_PASSWORD,
// POS_DATA_DIR and NODE_ENV from .env. That could seed Admin with a different
// password (and even write the database to the wrong directory).
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { APP_ROOT, DIST_DIR, resolveDataDir } from './server/paths.ts';
import { db, User, Product, ProductVariant, Category, Company, OrderItem, HeldBill, KOT, Bill, StockMovement, Room, RoomBooking, StockImport, StockImportRowResult, StockImportType, KitchenIngredient, KitchenStockMovement, KitchenRecipe, KitchenRecipeItem, KitchenWastageRecord, KitchenPhysicalCount, KitchenAdjustmentRequest, KITCHEN_WASTAGE_CATEGORIES, KitchenWastageCategory, KitchenDeductionSnapshot } from './server/db.ts';

const app = express();

// Port must be a valid TCP port; a typo like PORT=abc previously fell back to
// 3000 silently and a proxy expecting another port just saw connection refused.
const RAW_PORT = process.env.PORT?.trim();
const PORT = (() => {
  if (!RAW_PORT) return 3000;
  const parsed = Number(RAW_PORT);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`[FATAL] Invalid PORT value: "${RAW_PORT}". Must be an integer 1-65535.`);
    process.exit(1);
  }
  return parsed;
})();

/** Single source of truth for the version, read from package.json. */
const APP_VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf-8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

// === Security & Middleware ===
app.set('trust proxy', 1); // For rate limiting behind proxy

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline styles for POS UI
  crossOriginEmbedderPolicy: false,
}));

// CORS - Reflect any origin by default (a POS floor is a mix of tablets,
// phones and the admin PC), but allow a strict allowlist to be pinned in
// production via CORS_ORIGINS (comma-separated). Auth is Bearer-token based
// (no cookies), so a reflected origin cannot be used to steal a session, but
// pinning the allowlist still hardens against cross-site requests from a
// malicious page that somehow obtains a token.
const CORS_ALLOWLIST = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Matches the `cors` package's StaticOrigin type so the delegate is assignable
// under strictFunctionTypes without importing the package's internal types.
type CorsOriginValue = boolean | string | RegExp | (string | RegExp)[];

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: CorsOriginValue) => void): void => {
  // Non-browser clients (curl, the POS hardware) send no Origin header.
  if (!origin || CORS_ALLOWLIST.length === 0) {
    callback(null, true);
    return;
  }
  if (CORS_ALLOWLIST.includes(origin)) {
    callback(null, true);
    return;
  }
  // Disallowed origin → no CORS headers are set, so the browser's same-origin
  // policy blocks the cross-origin request. Returning false (rather than an
  // Error) keeps this a clean policy rejection instead of a 500.
  callback(null, false);
};

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Gzip responses. The main JS bundle is ~1.6 MB uncompressed vs ~457 kB gzipped
// — a large difference on the tablets/phones a POS floor runs on.
app.use(compression());

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Global rate limiter for API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// === Session & Token Management ===
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Session secret resolution.
 *
 * Resolution order:
 *   1. `SESSION_SECRET` env var (explicit, highest priority).
 *   2. A persisted secret file (`<dataDir>/.session-secret`) — auto-generated
 *      on first boot and reused on every subsequent start so tokens survive
 *      restarts, redeploys and PM2 reloads without any manual .env setup.
 *   3. (Development only) An ephemeral random secret with a clear warning.
 *
 * In production the placeholder values from .env.example are rejected (they
 * are publicly known and would let anyone forge a super-admin token). When
 * neither the env var nor the persisted file provides a usable secret, one is
 * generated, written to the data directory with restrictive permissions, and
 * used immediately — the server NEVER crashes for a missing SESSION_SECRET.
 */
const PLACEHOLDER_SECRETS = new Set([
  'change_this_to_a_very_long_random_secret_key_at_least_64_characters!',
  'changeme',
  'secret',
]);

function resolveSessionSecret(): string {
  const provided = process.env.SESSION_SECRET?.trim();

  // 1) Explicit env var — validate it isn't a placeholder or too short.
  if (provided && !PLACEHOLDER_SECRETS.has(provided) && provided.length >= 32) {
    return provided;
  }

  if (provided && IS_PRODUCTION) {
    const problems: string[] = [];
    if (PLACEHOLDER_SECRETS.has(provided)) problems.push('SESSION_SECRET is still the example placeholder value.');
    if (provided.length < 32) problems.push(`SESSION_SECRET is too short (${provided.length} chars, need 32+).`);
    console.warn('[SECURITY] Ignoring invalid SESSION_SECRET from .env:');
    problems.forEach(p => console.warn(`  - ${p}`));
  }

  // 2) Persisted secret file — survives restarts without any env configuration.
  const secretFilePath = path.join(resolveDataDir(), '.session-secret');
  try {
    if (fs.existsSync(secretFilePath)) {
      const saved = fs.readFileSync(secretFilePath, 'utf-8').trim();
      if (saved.length >= 32 && !PLACEHOLDER_SECRETS.has(saved)) {
        console.log('[SECURITY] Using persisted SESSION_SECRET from ' + secretFilePath);
        return saved;
      }
      // Corrupted or placeholder — regenerate below.
      console.warn('[SECURITY] Persisted secret file is invalid — regenerating.');
    }
  } catch (err) {
    console.warn('[SECURITY] Could not read persisted secret file:', err);
  }

  // 3) Generate a new secret and persist it so it survives the next restart.
  const generated = crypto.randomBytes(48).toString('hex');

  if (IS_PRODUCTION) {
    console.warn('[SECURITY] No valid SESSION_SECRET found — generated a new one and saved it to:');
    console.warn(`[SECURITY]   ${secretFilePath}`);
    console.warn('[SECURITY] This secret persists across restarts. All existing login tokens are now invalid.');
    console.warn('[SECURITY] To use your own secret, set SESSION_SECRET in .env (minimum 32 characters).');
  } else {
    console.warn('[SECURITY] SESSION_SECRET not set — generated and persisted to ' + secretFilePath);
  }

  try {
    // Write with restrictive permissions (owner-only on POSIX).
    fs.writeFileSync(secretFilePath, generated, { mode: 0o600 });
  } catch (err) {
    console.warn('[SECURITY] Could not persist generated secret to file:', err);
    console.warn('[SECURITY] Secret will be ephemeral — logins will not survive a restart.');
  }

  return generated;
}

const SESSION_SECRET = resolveSessionSecret();

// Revoked tokens with TTL auto-cleanup
const revokedTokens = new Map<string, number>(); // token -> expiresAt
const activeSessions = new Map<string, { user: User; expiresAt: number }>();

// Cleanup expired revoked tokens and sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of revokedTokens.entries()) {
    if (exp < now) revokedTokens.delete(token);
  }
  for (const [token, sess] of activeSessions.entries()) {
    if (sess.expiresAt < now) activeSessions.delete(token);
  }
  // Also cleanup failed login attempts
  for (const [ip, rec] of failedAttemptsMap.entries()) {
    if (rec.lockedUntil < now && rec.count < 5) {
      // Keep recent failures for 15 min, then clear
      if (now - rec.lastAttempt > 15 * 60 * 1000) {
        failedAttemptsMap.delete(ip);
      }
    } else if (rec.lockedUntil < now - 60 * 60 * 1000) {
      failedAttemptsMap.delete(ip);
    }
  }
}, 10 * 60 * 1000);

interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
}

function signTokenPayload(payload: TokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `rh_${data}.${signature}`;
}

function verifyTokenPayload(token: string): TokenPayload | null {
  if (!token) return null;
  const revokedExp = revokedTokens.get(token);
  if (revokedExp && revokedExp > Date.now()) return null;
  if (revokedExp && revokedExp <= Date.now()) revokedTokens.delete(token);
  
  if (!token.startsWith('rh_') && !token.startsWith('rgg_')) return null; // Support both old and new prefix during migration

  const raw = token.slice(token.startsWith('rh_') ? 3 : 4);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  // Use timingSafeEqual to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expectedSignature, 'base64url');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload: TokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.expiresAt < Date.now()) return null;
    // Validate payload structure
    if (!payload.userId || !payload.username || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

function generateAuthToken(user: User): string {
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  const token = signTokenPayload(payload);
  activeSessions.set(token, { user, expiresAt: payload.expiresAt });
  return token;
}

// Authentication Middleware - SECURE: No backdoor tokens
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Invalid token format.' });
  }

  // Check revoked list
  const revokedExp = revokedTokens.get(token);
  if (revokedExp && revokedExp > Date.now()) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  let session = activeSessions.get(token);
  let user: User | undefined;

  if (session && session.expiresAt >= Date.now()) {
    user = db.raw.users.find(u => u.id === session!.user.id && u.isActive);
    if (!user) {
      activeSessions.delete(token);
    }
  } else {
    if (session) activeSessions.delete(token);
    // Verify HMAC signature for persistent tokens across restarts
    const payload = verifyTokenPayload(token);
    if (payload) {
      user = db.raw.users.find(u => u.id === payload.userId && u.isActive);
      if (user) {
        activeSessions.set(token, { user, expiresAt: payload.expiresAt });
      }
    }
    // REMOVED: pos_tok_ legacy backdoor that allowed admin impersonation
  }

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Session expired or account deactivated. Please log in again.' });
  }

  (req as any).user = user;
  (req as any).token = token;
  next();
}

function requireRole(role: 'super_admin' | 'cashier') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (role === 'super_admin' && user.role !== 'super_admin') {
      // Also blocks KITCHEN_MANAGER from every Super Admin endpoint (users,
      // settings, payments/bills void, reports, inventory, backups, …)
      return res.status(403).json({ error: 'Access Denied: Super Admin permissions required.' });
    }
    next();
  };
}

// ==========================================
// FOOD & KITCHEN MODULE RBAC (v1.2.0)
// ==========================================
// The existing RBAC system is ROLE-BASED (requireRole). The Kitchen module
// follows the same architecture: permissions are granted BY ROLE through the
// middleware below. No second auth system, no separate permission tables.
//
//   super_admin      → holds ALL kitchen permissions (complete control) plus
//                      the exclusive KITCHEN_REQUEST_APPROVE permission
//                      (high-risk adjustments) — see requireKitchenAdmin().
//   kitchen_manager  → holds every KITCHEN_* operating permission below.
//   cashier          → holds NONE. Every /api/kitchen/* endpoint returns 403.
//
// Permission map (endpoint → permission):
//   KITCHEN_DASHBOARD_VIEW        GET  /api/kitchen/dashboard
//   KITCHEN_INGREDIENT_VIEW       GET  /api/kitchen/ingredients
//   KITCHEN_INGREDIENT_CREATE     POST /api/kitchen/ingredients
//   KITCHEN_INGREDIENT_EDIT       PUT  /api/kitchen/ingredients/:id
//   KITCHEN_STOCK_VIEW            GET  /api/kitchen/stock | /api/kitchen/movements
//   KITCHEN_STOCK_IN              POST /api/kitchen/stock-in
//   KITCHEN_STOCK_OUT             POST /api/kitchen/stock-out
//   KITCHEN_RECIPE_VIEW           GET  /api/kitchen/recipes | /api/kitchen/menu-items
//   KITCHEN_RECIPE_CREATE         POST /api/kitchen/recipes
//   KITCHEN_RECIPE_EDIT           PUT  /api/kitchen/recipes/:id
//   KITCHEN_RECIPE_ARCHIVE        PATCH /api/kitchen/recipes/:id/archive
//   KITCHEN_PRODUCTION_VIEW       GET  /api/kitchen/movements?type=sale (POS auto production)
//   KITCHEN_WASTAGE_VIEW          GET  /api/kitchen/wastage
//   KITCHEN_WASTAGE_CREATE        POST /api/kitchen/wastage
//   KITCHEN_PHYSICAL_COUNT_VIEW   GET  /api/kitchen/counts
//   KITCHEN_PHYSICAL_COUNT_CREATE POST /api/kitchen/counts
//   KITCHEN_VARIANCE_VIEW         GET  /api/kitchen/counts (+ variance reports)
//   KITCHEN_FOOD_COST_VIEW        GET  /api/kitchen/food-cost
//   KITCHEN_REPORT_VIEW           GET  /api/kitchen/reports
//   KITCHEN_REQUEST_APPROVE       POST /api/kitchen/requests/:id/approve|reject  (Super Admin ONLY)

const KITCHEN_ROLES: User['role'][] = ['super_admin', 'kitchen_manager'];

/** Grants access to Kitchen operating endpoints (kitchen_manager + super_admin). */
function requireKitchenPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!KITCHEN_ROLES.includes(user.role)) {
      return res.status(403).json({ error: `Access Denied: Kitchen Manager permissions required (${permission}).` });
    }
    next();
  };
}

/** High-risk kitchen actions (approving large stock adjustments) — Super Admin only. */
function requireKitchenAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as User;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access Denied: Super Admin approval required for this action.' });
  }
  next();
}

// Input validation schemas using Zod
const loginSchema = z.object({
  username: z.string().trim().min(1).max(128).optional(),
  password: z.string().min(1).max(128).optional(),
  pin: z.string().trim().min(1).max(32).optional(),
}).refine(data => data.username || data.pin, { message: 'Username or PIN required' });

const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(128),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscore, dot and hyphen'),
  email: z.string().trim().email().max(128).optional().or(z.literal('')),
  role: z.enum(['super_admin', 'cashier', 'kitchen_manager']),
  password: z.string().min(4).max(128),
  pin: z.string().trim().min(2).max(16).optional().or(z.literal('')),
});

// Brute-force protection with proper cleanup
const failedAttemptsMap = new Map<string, { count: number; lockedUntil: number; lastAttempt: number }>();

function getClientIp(req: Request): string {
  // Use express req.ip which respects trust proxy
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
  // Report the REAL state: a health check that always says "ok" is worse than
  // none, because a load balancer keeps routing sales to a node that can no
  // longer write them to disk.
  const persistError = db.getLastPersistError();
  const healthy = !persistError;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    uptime: process.uptime(),
    database: {
      writable: healthy,
      ...(persistError ? { lastError: persistError.message } : {}),
    },
  });
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid username or password.', details: parsed.error.flatten() });
    }
    const { username, password, pin } = parsed.data;

    const ipKey = getClientIp(req);
    const attemptRecord = failedAttemptsMap.get(ipKey);

    if (attemptRecord && attemptRecord.lockedUntil > Date.now()) {
      const remainingSeconds = Math.ceil((attemptRecord.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        error: `Too many failed login attempts. Please wait ${remainingSeconds} seconds before trying again.`
      });
    }

    let user: User | undefined;

    if (username) {
      const normalizedUser = username.toLowerCase();
      user = db.raw.users.find(u =>
        String(u?.username || '').toLowerCase() === normalizedUser ||
        String(u?.email || '').toLowerCase() === normalizedUser
      );
    } else if (pin) {
      user = db.raw.users.find(u => u.pin === pin);
    }

    if (!user) {
      const curr = failedAttemptsMap.get(ipKey) || { count: 0, lockedUntil: 0, lastAttempt: 0 };
      curr.count += 1;
      curr.lastAttempt = Date.now();
      if (curr.count >= 5) {
        curr.lockedUntil = Date.now() + 60 * 1000;
      }
      failedAttemptsMap.set(ipKey, curr);

      db.logAudit('system', 'Anonymous', 'cashier', 'LOGIN_FAILED', 'AUTH', 'unknown', `Failed login attempt for username: ${username || 'PIN'} from IP ${ipKey}`);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact your Super Administrator.' });
    }

    let isValid = false;
    if (password && user.passwordHash) {
      try {
        isValid = await bcrypt.compare(password, user.passwordHash);
      } catch {
        // A malformed legacy hash is an invalid credential, not a server error.
        isValid = false;
      }
    } else if (pin && user.pin) {
      // Use timingSafeEqual for PIN as well
      try {
        const a = Buffer.from(user.pin);
        const b = Buffer.from(pin);
        isValid = a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        isValid = user.pin === pin;
      }
    }

    if (!isValid) {
      const curr = failedAttemptsMap.get(ipKey) || { count: 0, lockedUntil: 0, lastAttempt: 0 };
      curr.count += 1;
      curr.lastAttempt = Date.now();
      if (curr.count >= 5) {
        curr.lockedUntil = Date.now() + 60 * 1000;
      }
      failedAttemptsMap.set(ipKey, curr);

      db.logAudit(user.id, user.name, user.role, 'LOGIN_FAILED', 'AUTH', user.id, `Incorrect password attempt for user: ${user.username} from IP ${ipKey}`);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    failedAttemptsMap.delete(ipKey);

    user.lastLogin = new Date().toISOString();
    user.lastLoginAt = new Date().toISOString();
    db.save();

    const token = generateAuthToken(user);

    db.logAudit(user.id, user.name, user.role, 'USER_LOGIN', 'AUTH', user.id, `User logged in from ${ipKey}`);

    const { passwordHash, ...safeUser } = user;
    res.json({
      token,
      user: safeUser
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed due to server error.' });
  }
});

app.post('/api/auth/logout', authMiddleware, (req: Request, res: Response) => {
  const token = (req as any).token;
  const user = (req as any).user;
  if (token) {
    activeSessions.delete(token);
    // Add to revoked with TTL of 30 days
    revokedTokens.set(token, Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  if (user) {
    db.logAudit(user.id, user.name, user.role, 'USER_LOGOUT', 'AUTH', user.id, 'User logged out.');
  }
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post('/api/auth/change-password', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be between 4 and 128 characters long.' });
  }

  // Current password is ALWAYS required - previously it could be omitted entirely,
  // which let anyone holding a session token silently take over the account.
  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Current password is required.' });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from the current password.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  db.save();
  db.logAudit(user.id, user.name, user.role, 'PASSWORD_CHANGE', 'USER', user.id, 'User changed password.');

  res.json({ message: 'Password updated successfully.' });
});

// ==========================================
// USER MANAGEMENT
// ==========================================

app.get('/api/users', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const safeUsers = db.raw.users.map(({ passwordHash, ...u }) => u);
  res.json(safeUsers);
});

app.post('/api/users', authMiddleware, requireRole('super_admin'), async (req: Request, res: Response) => {
  const currentUser = (req as any).user as User;
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { name, username, email, role, password, pin } = parsed.data;

  const existing = db.raw.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A user with this username already exists.' });
  }

  if (email) {
    const emailExists = db.raw.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }
  }

  const newUser: User = {
    id: `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    name: name.trim(),
    username: username.toLowerCase(),
    email: (email || `${username.toLowerCase()}@pos.local`).trim().toLowerCase(),
    role: role === 'super_admin' ? 'super_admin' : role === 'kitchen_manager' ? 'kitchen_manager' : 'cashier',
    passwordHash: await bcrypt.hash(password, 10),
    isActive: true,
    pin: pin?.trim() || undefined,
    createdAt: new Date().toISOString()
  };

  db.raw.users.push(newUser);
  db.save();

  db.logAudit(currentUser.id, currentUser.name, currentUser.role, 'CREATE_USER', 'USER', newUser.id, `Created new ${newUser.role}: ${newUser.name} (${newUser.username})`);

  const { passwordHash, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});

app.put('/api/users/:id', authMiddleware, requireRole('super_admin'), async (req: Request, res: Response) => {
  const currentUser = (req as any).user as User;
  const user = db.raw.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { name, email, role, password, pin, isActive } = req.body;

  if (name && typeof name === 'string') {
    if (name.trim().length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters' });
    user.name = name.trim();
  }
  if (email && typeof email === 'string') {
    const emailTrim = email.trim().toLowerCase();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    // Check duplicate
    if (emailTrim && db.raw.users.some(u => u.id !== user.id && u.email.toLowerCase() === emailTrim)) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    user.email = emailTrim;
  }
  if (role && ['super_admin', 'cashier', 'kitchen_manager'].includes(role)) user.role = role;
  if (pin !== undefined) user.pin = pin ? String(pin).trim() : undefined;
  if (isActive !== undefined) user.isActive = Boolean(isActive);

  if (password && typeof password === 'string' && password.trim()) {
    if (password.trim().length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    user.passwordHash = await bcrypt.hash(password.trim(), 10);
  }

  db.save();
  db.logAudit(currentUser.id, currentUser.name, currentUser.role, 'UPDATE_USER', 'USER', user.id, `Updated user profile: ${user.name}`);

  const { passwordHash, ...safeUser } = user;
  res.json(safeUser);
});

app.patch('/api/users/:id/toggle', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const currentUser = (req as any).user as User;
  const user = db.raw.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.id === currentUser.id) {
    return res.status(400).json({ error: 'You cannot disable your own Super Admin account.' });
  }

  user.isActive = !user.isActive;
  db.save();

  db.logAudit(currentUser.id, currentUser.name, currentUser.role, 'TOGGLE_USER_STATUS', 'USER', user.id, `Set status of ${user.username} to ${user.isActive ? 'ACTIVE' : 'DISABLED'}`);

  const { passwordHash, ...safeUser } = user;
  res.json(safeUser);
});

app.delete('/api/users/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const currentUser = (req as any).user as User;
  const index = db.raw.users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'User not found.' });

  const user = db.raw.users[index];

  if (user.id === currentUser.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  if (user.role === 'super_admin') {
    const otherAdmins = db.raw.users.filter(u => u.role === 'super_admin' && u.isActive && u.id !== user.id);
    if (otherAdmins.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the last active Super Admin account.' });
    }
  }

  db.raw.users.splice(index, 1);
  db.save();

  db.logAudit(currentUser.id, currentUser.name, currentUser.role, 'DELETE_USER', 'USER', user.id, `Deleted user account: ${user.username} (${user.name}, ${user.role})`);

  res.json({ success: true, message: `User ${user.username} deleted successfully.` });
});

// ==========================================
// CATEGORIES & COMPANIES
// ==========================================

app.get('/api/categories', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.categories);
});

app.post('/api/categories', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, type, icon, hiddenInPOS } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Category name is required.' });
  if (name.trim().length > 128) return res.status(400).json({ error: 'Category name too long (max 128)' });

  const validTypes = ['bar', 'restaurant', 'service', 'other'];
  const catType = validTypes.includes(type) ? type : 'bar';

  const newCat: Category = {
    id: `cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    type: catType as any,
    icon: (icon && typeof icon === 'string') ? icon.trim().slice(0, 64) : 'tag',
    isActive: true,
    displayOrder: db.raw.categories.length + 1,
    hiddenInPOS: Boolean(hiddenInPOS)
  };

  db.raw.categories.push(newCat);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'CREATE_CATEGORY', 'CATEGORY', newCat.id, `Added category: ${newCat.name}`);
  res.status(201).json(newCat);
});

app.put('/api/categories/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const cat = db.raw.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found.' });

  const { name, type, icon, isActive, displayOrder, hiddenInPOS } = req.body;
  if (name && typeof name === 'string' && name.trim()) cat.name = name.trim().slice(0, 128);
  if (type && ['bar', 'restaurant', 'service', 'other'].includes(type)) cat.type = type;
  if (icon && typeof icon === 'string') cat.icon = icon.trim().slice(0, 64);
  if (isActive !== undefined) cat.isActive = Boolean(isActive);
  if (displayOrder !== undefined) cat.displayOrder = Math.max(0, Number(displayOrder) || 0);
  if (hiddenInPOS !== undefined) cat.hiddenInPOS = Boolean(hiddenInPOS);

  db.save();
  db.logAudit(user.id, user.name, user.role, 'UPDATE_CATEGORY', 'CATEGORY', cat.id, `Updated category: ${cat.name}`);
  res.json(cat);
});

app.delete('/api/categories/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const catIndex = db.raw.categories.findIndex(c => c.id === req.params.id);
  if (catIndex === -1) return res.status(404).json({ error: 'Category not found.' });

  const cat = db.raw.categories[catIndex];
  const inUse = db.raw.products.some(p => p.categoryId === cat.id && !p.isArchived);
  if (inUse) {
    cat.isActive = false;
    db.save();
    db.logAudit(user.id, user.name, user.role, 'DEACTIVATE_CATEGORY', 'CATEGORY', cat.id, `Deactivated in-use category: ${cat.name}`);
    return res.json({ message: 'Category is assigned to active products and was deactivated instead of deleted.', category: cat });
  }

  db.raw.categories.splice(catIndex, 1);
  db.save();
  db.logAudit(user.id, user.name, user.role, 'DELETE_CATEGORY', 'CATEGORY', cat.id, `Deleted category: ${cat.name}`);
  res.json({ message: 'Category deleted successfully.' });
});

app.get('/api/companies', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.companies);
});

app.post('/api/companies', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Company name is required.' });

  const newComp: Company = {
    id: `comp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim().slice(0, 128),
    description: description?.trim().slice(0, 500),
    isActive: true
  };

  db.raw.companies.push(newComp);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'CREATE_COMPANY', 'COMPANY', newComp.id, `Added brand/company: ${newComp.name}`);
  res.status(201).json(newComp);
});

app.put('/api/companies/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const comp = db.raw.companies.find(c => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Company not found.' });

  const { name, description, isActive } = req.body;
  if (name && typeof name === 'string' && name.trim()) comp.name = name.trim().slice(0, 128);
  if (description !== undefined) comp.description = typeof description === 'string' ? description.trim().slice(0, 500) : undefined;
  if (isActive !== undefined) comp.isActive = Boolean(isActive);

  db.save();
  db.logAudit(user.id, user.name, user.role, 'UPDATE_COMPANY', 'COMPANY', comp.id, `Updated brand/company: ${comp.name}`);
  res.json(comp);
});

app.delete('/api/companies/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const compIndex = db.raw.companies.findIndex(c => c.id === req.params.id);
  if (compIndex === -1) return res.status(404).json({ error: 'Company not found.' });

  const comp = db.raw.companies[compIndex];
  const inUse = db.raw.products.some(p => p.companyId === comp.id && !p.isArchived);
  if (inUse) {
    comp.isActive = false;
    db.save();
    db.logAudit(user.id, user.name, user.role, 'DEACTIVATE_COMPANY', 'COMPANY', comp.id, `Deactivated in-use brand: ${comp.name}`);
    return res.json({ message: 'Company is assigned to active products and was deactivated.', company: comp });
  }

  db.raw.companies.splice(compIndex, 1);
  db.save();
  db.logAudit(user.id, user.name, user.role, 'DELETE_COMPANY', 'COMPANY', comp.id, `Deleted company: ${comp.name}`);
  res.json({ message: 'Company deleted successfully.' });
});

// ==========================================
// PRODUCTS & MULTI-SIZE VARIANTS
// ==========================================

app.get('/api/products', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  if (user.role === 'cashier') {
    const activeProducts = db.raw.products
      .filter(p => p.isActive && !p.isArchived)
      .map(p => productForClient(p))
      .map(p => ({
        ...p,
        variants: p.variants.filter((v: ProductVariant) => v.isActive)
      }));
    return res.json(activeProducts);
  }

  const includeArchived = req.query.archived === 'true';
  const products = includeArchived
    ? db.raw.products
    : db.raw.products.filter(p => !p.isArchived);

  res.json(products.map(p => productForClient(p)));
});

app.get('/api/products/:id', authMiddleware, (req: Request, res: Response) => {
  const product = db.raw.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(productForClient(product));
});

/** Returns an error message when a SKU / barcode is duplicated inside the payload or already used by another product. */
function validateVariantCodes(variants: any[], excludeProductId?: string): string | null {
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();

  for (const v of variants) {
    const sku = v?.sku ? String(v.sku).trim().toLowerCase() : '';
    const barcode = v?.barcode ? String(v.barcode).trim().toLowerCase() : '';

    if (sku) {
      if (seenSku.has(sku)) return `Duplicate SKU "${v.sku}" used twice in this product.`;
      seenSku.add(sku);
    }
    if (barcode) {
      if (seenBarcode.has(barcode)) return `Duplicate barcode "${v.barcode}" used twice in this product.`;
      seenBarcode.add(barcode);
    }

    for (const p of db.raw.products) {
      if (excludeProductId && p.id === excludeProductId) continue;
      for (const existing of p.variants) {
        if (sku && existing.sku && existing.sku.trim().toLowerCase() === sku) {
          return `SKU "${v.sku}" is already used by "${p.name}" (${existing.size}).`;
        }
        if (barcode && existing.barcode && existing.barcode.trim().toLowerCase() === barcode) {
          return `Barcode "${v.barcode}" is already used by "${p.name}" (${existing.size}).`;
        }
      }
    }
  }
  return null;
}

/** Builds a SKU that is guaranteed not to collide with any existing variant SKU. */
function makeUniqueSku(base: string, taken: Set<string>): string {
  const clean = (base || 'SKU').trim().slice(0, 120).replace(/\s+/g, '-').toUpperCase() || 'SKU';
  const existing = new Set<string>(taken);
  for (const p of db.raw.products) {
    for (const v of p.variants) {
      if (v.sku) existing.add(v.sku.trim().toUpperCase());
    }
  }
  if (!existing.has(clean)) return clean;
  let i = 2;
  while (existing.has(`${clean}-${i}`) && i < 10000) i++;
  return `${clean}-${i}`;
}

/** Validates prices so a variant can never be saved with an unusable/NaN/zero selling price. */
function validateVariantPrices(variants: any[]): string | null {
  for (const v of variants) {
    const selling = Number(v?.sellingPrice);
    const cost = Number(v?.costPrice ?? 0);
    if (!Number.isFinite(selling) || selling <= 0) {
      return `Selling price for "${v?.size || 'variant'}" must be a number greater than 0.`;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return `Cost price for "${v?.size || 'variant'}" cannot be negative.`;
    }
    if (selling > 100000000 || cost > 100000000) {
      return `Price for "${v?.size || 'variant'}" is out of range.`;
    }
  }
  return null;
}

/** Validates shot configuration: shot rows need a valid pour volume and a 750ml source bottle must exist. */
function validateShotSetup(servesShots: boolean, variants: any[]): string | null {
  const shotRows = (variants || []).filter((v: any) => v && v.isShot);
  if (!servesShots) {
    if (shotRows.length > 0) return 'Shot sizes defined but "Serves Shots" is turned off. Enable it or remove the shot sizes.';
    return null;
  }
  if (shotRows.length === 0) {
    return 'Serves Shots is enabled but no shot sizes (100ml / 50ml / 25ml) were defined.';
  }
  for (const v of shotRows) {
    const vol = Number(v.shotVolumeMl) || parseMlFromSize(String(v.size || '')) || 0;
    if (!(vol > 0 && vol < BOTTLE_ML)) {
      return `Shot size "${v.size || 'shot'}" must have a pour volume between 1ml and 749ml (e.g. 100ml, 50ml, 25ml).`;
    }
  }
  const hasBottle = (variants || []).some((v: any) => v && !v.isShot && parseMlFromSize(String(v.size || '')) === BOTTLE_ML);
  if (!hasBottle) {
    return 'A 750ml Bottle size is required to serve shots — shots are deducted from the 750ml bottle total stock.';
  }
  return null;
}

/** Shot cost derived proportionally from the 750ml bottle cost when the shot row has no cost of its own. */
function deriveShotCostPrice(rawVariants: any[], shotVolumeMl: number | undefined): number {
  const bottle = (rawVariants || []).find((v: any) => v && !v.isShot && parseMlFromSize(String(v.size || '')) === BOTTLE_ML);
  const bottleCost = Math.max(0, Number(bottle?.costPrice || 0));
  const vol = Number(shotVolumeMl) || 0;
  if (!bottleCost || !vol) return 0;
  return Number(((bottleCost / BOTTLE_ML) * vol).toFixed(2));
}

app.post('/api/products', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, categoryId, companyId, description, image, isKitchenItem, taxRate, variants, servesShots } = req.body;

  if (!name || typeof name !== 'string' || !name.trim() || !categoryId || !Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: 'Product name, category, and at least one size/variant are required.' });
  }

  // Validate category exists
  if (!db.raw.categories.some(c => c.id === categoryId)) {
    return res.status(400).json({ error: 'Invalid category ID' });
  }

  const priceError = validateVariantPrices(variants);
  if (priceError) return res.status(400).json({ error: priceError });

  const codeError = validateVariantCodes(variants);
  if (codeError) return res.status(400).json({ error: codeError });

  const shotError = validateShotSetup(Boolean(servesShots), variants);
  if (shotError) return res.status(400).json({ error: shotError });

  const productId = `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const usedSkus = new Set<string>();
  const formattedVariants: ProductVariant[] = variants.map((v: any, index: number) => {
    const variantId = `var-${productId.replace('prod-', '')}-${index + 1}-${crypto.randomBytes(2).toString('hex')}`;
    const isShot = Boolean(servesShots) && Boolean(v.isShot);
    const shotVolumeMl = isShot ? (Number(v.shotVolumeMl) || parseMlFromSize(String(v.size || '')) || 0) : undefined;
    const initialStock = isShot ? 0 : Math.max(0, Number(v.stock || 0));
    // Shot rows with no cost get an automatic proportional cost from the 750ml bottle
    const costPrice = isShot && !(Number(v.costPrice) > 0)
      ? deriveShotCostPrice(variants, shotVolumeMl)
      : Math.max(0, Number(v.costPrice || 0));
    const sellingPrice = Math.max(0, Number(v.sellingPrice || 0));

    if (sellingPrice < costPrice) {
      console.warn(`[PRODUCT] Selling price less than cost price for variant ${v.size}`);
    }

    return {
      id: variantId,
      productId,
      size: String(v.size || 'Standard').trim().slice(0, 64),
      sku: (() => {
        const sku = v.sku
          ? String(v.sku).trim().slice(0, 128)
          : makeUniqueSku(`${name.substring(0, 3)}-${v.size || 'STD'}-${index + 1}`, usedSkus);
        usedSkus.add(sku.toUpperCase());
        return sku;
      })(),
      barcode: v.barcode ? String(v.barcode).trim().slice(0, 128) : undefined,
      costPrice,
      sellingPrice,
      stock: initialStock,
      minStockLevel: isShot ? 0 : Math.max(0, Number(v.minStockLevel || db.raw.settings.lowStockDefaultThreshold || 5)),
      isActive: v.isActive !== false,
      isShot: isShot || undefined,
      shotVolumeMl: isShot ? shotVolumeMl : undefined
    };
  });

  const newProduct: Product = {
    id: productId,
    name: name.trim().slice(0, 191),
    categoryId,
    companyId: companyId || undefined,
    description: description?.trim().slice(0, 1000),
    image: image || undefined,
    isKitchenItem: Boolean(isKitchenItem),
    taxRate: taxRate ? Math.max(0, Math.min(100, Number(taxRate))) : undefined,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: formattedVariants,
    servesShots: Boolean(servesShots),
    openBottleUsedMl: 0
  };

  db.raw.products.push(newProduct);

  formattedVariants.forEach(v => {
    if (v.stock > 0) {
      db.recordStockMovement(
        newProduct.id,
        newProduct.name,
        v.id,
        v.size,
        v.stock,
        0,
        v.stock,
        'opening_stock',
        user.id,
        user.name,
        'Opening stock set during product creation'
      );
    }
  });

  db.save();
  db.logAudit(user.id, user.name, user.role, 'CREATE_PRODUCT', 'PRODUCT', newProduct.id, `Created product "${newProduct.name}" with ${formattedVariants.length} variants.${newProduct.servesShots ? ' Serves shots from 750ml bottle stock.' : ''}`);

  res.status(201).json(productForClient(newProduct));
});

app.put('/api/products/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const product = db.raw.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const { name, categoryId, companyId, description, image, isKitchenItem, taxRate, isActive, variants, servesShots } = req.body;

  if (name && typeof name === 'string' && name.trim()) product.name = name.trim().slice(0, 191);
  if (categoryId && db.raw.categories.some(c => c.id === categoryId)) product.categoryId = categoryId;
  if (companyId !== undefined) product.companyId = companyId || undefined;
  if (description !== undefined) product.description = typeof description === 'string' ? description.trim().slice(0, 1000) : undefined;
  if (image !== undefined) product.image = image;
  if (isKitchenItem !== undefined) product.isKitchenItem = Boolean(isKitchenItem);
  if (taxRate !== undefined) product.taxRate = Math.max(0, Math.min(100, Number(taxRate)));
  if (isActive !== undefined) product.isActive = Boolean(isActive);
  if (servesShots !== undefined) {
    product.servesShots = Boolean(servesShots);
    if (!product.servesShots) product.openBottleUsedMl = 0;
    else if (!Number.isFinite(Number(product.openBottleUsedMl))) product.openBottleUsedMl = 0;
  }

  if (Array.isArray(variants) && variants.length > 0) {
    const priceError = validateVariantPrices(variants);
    if (priceError) return res.status(400).json({ error: priceError });

    const codeError = validateVariantCodes(variants, product.id);
    if (codeError) return res.status(400).json({ error: codeError });

    const shotError = validateShotSetup(Boolean(product.servesShots), variants);
    if (shotError) return res.status(400).json({ error: shotError });

    const updatedSkus = new Set<string>();
    const updatedVariants: ProductVariant[] = variants.map((v: any, index: number) => {
      const existingVar = product.variants.find(oldV => oldV.id === v.id);
      const varId = v.id || `var-${product.id.replace('prod-', '')}-${Date.now()}-${index}-${crypto.randomBytes(2).toString('hex')}`;

      const isShot = Boolean(product.servesShots) && Boolean(v.isShot);
      const shotVolumeMl = isShot ? (Number(v.shotVolumeMl) || parseMlFromSize(String(v.size || '')) || 0) : undefined;

      // Shot variants never hold independent stock — they pour from the 750ml bottle
      const newStock = isShot ? 0 : Math.max(0, Number(v.stock !== undefined ? v.stock : (existingVar?.stock ?? 0)));
      const oldStock = existingVar ? existingVar.stock : 0;

      // Check negative stock policy
      if (!db.raw.settings.allowNegativeStock && newStock < 0) {
        throw new Error('Negative stock not allowed');
      }

      if (existingVar && newStock !== oldStock) {
        db.recordStockMovement(
          product.id,
          product.name,
          varId,
          v.size || existingVar.size,
          newStock - oldStock,
          oldStock,
          newStock,
          'adjustment',
          user.id,
          user.name,
          isShot
            ? 'Converted to shot size — stock now pours from the 750ml bottle'
            : 'Manual stock correction via product edit'
        );
      }

      return {
        id: varId,
        productId: product.id,
        size: String(v.size || 'Standard').trim().slice(0, 64),
        sku: (() => {
          const sku = v.sku
            ? String(v.sku).trim().slice(0, 128)
            : (existingVar?.sku || makeUniqueSku(`${product.name.substring(0, 3)}-${v.size || 'STD'}`, updatedSkus));
          updatedSkus.add(sku.toUpperCase());
          return sku;
        })(),
        barcode: v.barcode ? String(v.barcode).trim().slice(0, 128) : undefined,
        costPrice: isShot && !(Number(v.costPrice) > 0)
          ? deriveShotCostPrice(variants, shotVolumeMl)
          : Math.max(0, Number(v.costPrice || 0)),
        sellingPrice: Math.max(0, Number(v.sellingPrice || 0)),
        stock: newStock,
        minStockLevel: isShot ? 0 : Math.max(0, Number(v.minStockLevel || 5)),
        isActive: v.isActive !== false,
        isShot: isShot || undefined,
        shotVolumeMl: isShot ? shotVolumeMl : undefined
      };
    });

    product.variants = updatedVariants;
  }

  try {
    db.save();
    db.logAudit(user.id, user.name, user.role, 'UPDATE_PRODUCT', 'PRODUCT', product.id, `Updated product "${product.name}" details and variants.`);
    res.json(productForClient(product));
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Failed to update product' });
  }
});

app.delete('/api/products/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const product = db.raw.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  product.isArchived = true;
  product.isActive = false;
  db.save();

  db.logAudit(user.id, user.name, user.role, 'ARCHIVE_PRODUCT', 'PRODUCT', product.id, `Safely archived product "${product.name}" preserving sales history.`);

  res.json({ message: 'Product successfully archived and removed from POS while preserving transaction history.' });
});

// ==========================================
// INVENTORY & STOCK MANAGEMENT
// ==========================================

app.get('/api/inventory', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const inventoryList = [];

  for (const product of db.raw.products) {
    if (product.isArchived) continue;
    const category = db.raw.categories.find(c => c.id === product.categoryId);
    const company = db.raw.companies.find(c => c.id === product.companyId);

    for (const variant of product.variants) {
      const isShot = isShotVariant(product, variant);
      const shotVol = isShot ? getShotVolumeMl(variant) : 0;
      // Shot variants show DERIVED stock: how many shots remain in the 750ml bottle pool
      const effectiveStock = isShot && shotVol > 0
        ? Math.floor(Math.max(0, getAvailableShotMl(product)) / shotVol)
        : variant.stock;

      const isLowStock = !isShot && variant.stock <= variant.minStockLevel && variant.stock > 0;
      const isOutOfStock = effectiveStock <= 0;
      // Shot variants carry no valuation of their own (the liquid is already valued in the 750ml bottle stock)
      const stockValue = isShot ? 0 : variant.stock * (variant.costPrice || 0);
      const retailValue = isShot ? 0 : variant.stock * (variant.sellingPrice || 0);

      // Show how much has been poured from the currently open bottle on the 750ml row
      const bottleOfProduct = product.servesShots ? getBottleVariant(product) : null;
      const isShotSourceBottle = Boolean(bottleOfProduct && bottleOfProduct.id === variant.id);
      const openBottleUsedMl = isShotSourceBottle ? Math.max(0, Number(product.openBottleUsedMl) || 0) : undefined;
      // Total liquid still in the bar for this product = full bottles + the open bottle remainder.
      // Every shot sale visibly shrinks this number by the poured ml.
      const poolMl = isShot || isShotSourceBottle ? Math.max(0, getAvailableShotMl(product)) : undefined;
      const remainingMl = isShotSourceBottle ? poolMl : undefined;

      inventoryList.push({
        id: variant.id,
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        categoryName: category ? category.name : 'Unknown',
        companyId: product.companyId,
        companyName: company ? company.name : 'In-House / Other',
        size: variant.size,
        sku: variant.sku,
        barcode: variant.barcode,
        costPrice: variant.costPrice,
        sellingPrice: variant.sellingPrice,
        stock: effectiveStock,
        minStockLevel: variant.minStockLevel,
        status: isOutOfStock ? 'OUT_OF_STOCK' : isLowStock ? 'LOW_STOCK' : 'IN_STOCK',
        isLowStock,
        isOutOfStock,
        stockValue,
        retailValue,
        isActive: variant.isActive && product.isActive,
        isShot: isShot || undefined,
        shotVolumeMl: isShot ? shotVol : undefined,
        isShotSourceBottle: isShotSourceBottle || undefined,
        openBottleUsedMl,
        // ml visibility: shots and their source bottle expose the shared 750ml pool
        shotPoolMl: isShot ? poolMl : undefined,
        remainingMl
      });
    }
  }

  res.json(inventoryList);
});

function findVariantById(variantId: string): { product: Product; variant: ProductVariant } | null {
  for (const p of db.raw.products) {
    const v = p.variants.find(varItem => varItem.id === variantId);
    if (v) return { product: p, variant: v };
  }
  return null;
}

// ==========================================
// SHOT POURING SYSTEM (100ml / 50ml / 25ml FROM 750ml BOTTLE STOCK)
// ==========================================

/** Volume of the source bottle every shot pours from. */
const BOTTLE_ML = 750;

/** Extracts the ml volume from a size label like "750ml Bottle" -> 750. */
function parseMlFromSize(size: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*ml/i.exec(size || '');
  return m ? Number(m[1]) : null;
}

/** Pour volume (ml) of a shot variant — explicit shotVolumeMl or parsed from the size label. */
function getShotVolumeMl(v: ProductVariant): number {
  const vol = Number(v.shotVolumeMl) || parseMlFromSize(v.size) || 0;
  return vol > 0 && vol <= BOTTLE_ML ? vol : 0;
}

/** True when this variant is a shot that must be deducted from the 750ml bottle stock. */
function isShotVariant(product: Product, v: ProductVariant): boolean {
  return Boolean(product.servesShots && v.isShot && getShotVolumeMl(v) > 0);
}

/** The 750ml bottle variant shots are poured from. */
function getBottleVariant(product: Product): ProductVariant | null {
  const candidates = product.variants.filter(v => !v.isShot && parseMlFromSize(v.size) === BOTTLE_ML);
  return candidates.find(v => v.isActive) || candidates[0] || null;
}

/** Total ml still available for shots = (750ml bottle stock × 750) − ml already poured from the open bottle. */
function getAvailableShotMl(product: Product): number {
  if (!product.servesShots) return 0;
  const bottle = getBottleVariant(product);
  if (!bottle) return 0;
  const used = Math.max(0, Number(product.openBottleUsedMl) || 0);
  return bottle.stock * BOTTLE_ML - used;
}

/**
 * Deducts `totalMl` of shot sales from the product's 750ml bottle stock.
 * Whenever the open bottle is finished (750ml poured) the bottle count drops by 1.
 */
function deductShotMl(
  product: Product,
  totalMl: number,
  user: User,
  reference: string,
  referenceId?: string
): void {
  const bottle = getBottleVariant(product);
  if (!bottle || totalMl <= 0) return;

  const used = Math.max(0, Number(product.openBottleUsedMl) || 0) + totalMl;
  const bottlesConsumed = Math.floor(used / BOTTLE_ML);
  product.openBottleUsedMl = used % BOTTLE_ML;

  if (bottlesConsumed > 0) {
    const beforeQty = bottle.stock;
    bottle.stock -= bottlesConsumed;
    db.recordStockMovement(
      product.id,
      product.name,
      bottle.id,
      bottle.size,
      -bottlesConsumed,
      beforeQty,
      bottle.stock,
      'sale',
      user.id,
      user.name,
      `Shot sales (${totalMl}ml poured) emptied ${bottlesConsumed} x 750ml bottle(s) — ${reference}`,
      referenceId
    );
  }
}

/** Reverses shot sales (bill void) — returns ml to the open bottle, restoring full bottles when needed. */
function restoreShotMl(
  product: Product,
  totalMl: number,
  user: User,
  reference: string,
  referenceId?: string
): void {
  const bottle = getBottleVariant(product);
  if (!bottle || totalMl <= 0) return;

  let used = Math.max(0, Number(product.openBottleUsedMl) || 0) - totalMl;
  let bottlesRestored = 0;
  while (used < 0) {
    used += BOTTLE_ML;
    bottlesRestored++;
  }
  product.openBottleUsedMl = used;

  if (bottlesRestored > 0) {
    const beforeQty = bottle.stock;
    bottle.stock += bottlesRestored;
    db.recordStockMovement(
      product.id,
      product.name,
      bottle.id,
      bottle.size,
      bottlesRestored,
      beforeQty,
      bottle.stock,
      'return',
      user.id,
      user.name,
      `Shot sale reversal (${totalMl}ml returned) — ${reference}`,
      referenceId
    );
  }
}

/**
 * API-safe view of a product: shot variants get a DERIVED stock
 * (how many shots can still be poured from the 750ml bottle stock)
 * plus the raw ml pool so the POS can do live cart math.
 */
function productForClient(product: Product): any {
  if (!product.servesShots) return product;
  const availableMl = Math.max(0, getAvailableShotMl(product));
  return {
    ...product,
    availableShotMl: availableMl,
    variants: product.variants.map(v => {
      if (!isShotVariant(product, v)) return v;
      const vol = getShotVolumeMl(v);
      return { ...v, stock: vol > 0 ? Math.floor(availableMl / vol) : 0 };
    })
  };
}


// ==========================================
// ORDER ITEM SANITIZATION & PRICING (SERVER AUTHORITATIVE)
// ==========================================

/**
 * Validates and rebuilds order items from the server-side catalogue.
 * Prevents:
 *  - negative / zero / fractional quantities (which used to INCREASE stock on checkout)
 *  - unknown variant IDs silently ending up on a bill
 *  - client-supplied prices overriding the real selling price
 */
function sanitizeOrderItems(rawItems: unknown): { items: OrderItem[]; error?: string } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: [], error: 'Order must contain at least one item.' };
  }
  if (rawItems.length > 500) {
    return { items: [], error: 'Too many items in a single order (max 500).' };
  }

  const items: OrderItem[] = [];

  for (const raw of rawItems as any[]) {
    if (!raw || typeof raw !== 'object') {
      return { items: [], error: 'Invalid order item received.' };
    }

    const variantId = typeof raw.variantId === 'string' ? raw.variantId : '';
    if (!variantId) {
      return { items: [], error: 'Every order item must reference a product variant.' };
    }

    const found = findVariantById(variantId);
    if (!found) {
      return { items: [], error: `Product variant no longer exists (${variantId}). Please remove it from the cart and try again.` };
    }

    const quantity = Number(raw.quantity);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      return { items: [], error: `Invalid quantity for ${found.product.name} (${found.variant.size}). Quantity must be a whole number between 1 and 10,000.` };
    }

    const unitPrice = Math.max(0, Number(found.variant.sellingPrice) || 0);
    // Item-level discounts sent by the client are intentionally ignored: the
    // pricing model only applies a single bill-level discount (clamped by
    // maxDiscountPercentage) on the server. Accepting raw.discount here used
    // to store line totals that summed to LESS than the bill's subtotal even
    // though the customer was charged the full amount.
    const lineDiscount = 0;
    const lineTotal = Number((unitPrice * quantity - lineDiscount).toFixed(2));

    items.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : `item-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      productId: found.product.id,
      productName: String(found.product.name).slice(0, 191),
      variantId: found.variant.id,
      size: String(found.variant.size).slice(0, 64),
      unitPrice,
      costPrice: Math.max(0, Number(found.variant.costPrice) || 0),
      quantity,
      discount: lineDiscount,
      tax: 0,
      total: lineTotal,
      notes: raw.notes ? String(raw.notes).slice(0, 500) : undefined,
      isKitchenItem: Boolean(found.product.isKitchenItem)
    });
  }

  return { items };
}

/** Recomputes all money values on the server so a tampered/stale client cannot decide the price. */
function computeOrderTotals(
  items: OrderItem[],
  opts: { discountPercentage?: unknown; discount?: unknown }
) {
  const settings = db.raw.settings;
  const subtotal = Number(items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0).toFixed(2));

  const maxDiscountPct = Number.isFinite(Number(settings.maxDiscountPercentage))
    ? Math.max(0, Math.min(100, Number(settings.maxDiscountPercentage)))
    : 100;

  const rawPct = Number(opts.discountPercentage);
  const rawAmt = Number(opts.discount);

  let discountPercentage = 0;
  let discount = 0;

  if (Number.isFinite(rawPct) && rawPct > 0) {
    discountPercentage = Math.min(rawPct, maxDiscountPct, 100);
    discount = (subtotal * discountPercentage) / 100;
  } else if (Number.isFinite(rawAmt) && rawAmt > 0) {
    const maxDiscountAmount = (subtotal * maxDiscountPct) / 100;
    discount = Math.min(rawAmt, subtotal, maxDiscountAmount);
    discountPercentage = subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0;
  }

  discount = Number(discount.toFixed(2));

  const taxableAmount = Math.max(0, Number((subtotal - discount).toFixed(2)));
  const serviceChargeRate = Math.max(0, Math.min(100, Number(settings.serviceChargeRate) || 0));
  const taxRate = Math.max(0, Math.min(100, Number(settings.taxRate) || 0));

  const serviceCharge = Number(((taxableAmount * serviceChargeRate) / 100).toFixed(2));
  const tax = Number(((taxableAmount * taxRate) / 100).toFixed(2));
  const grandTotal = Number((taxableAmount + serviceCharge + tax).toFixed(2));

  return { subtotal, discount, discountPercentage, serviceCharge, serviceChargeRate, tax, taxRate, grandTotal };
}

app.post('/api/inventory/stock-in', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, quantity, costPrice, reason, reference, date } = req.body;

  const numQty = Number(quantity);
  if (!variantId || isNaN(numQty) || numQty <= 0 || numQty > 100000) {
    return res.status(400).json({ error: 'Valid variant ID and positive quantity (max 100,000) are required.' });
  }

  const found = findVariantById(variantId);
  if (!found) return res.status(404).json({ error: 'Product variant not found.' });
  const { product: targetProduct, variant: targetVariant } = found;

  if (isShotVariant(targetProduct, targetVariant)) {
    return res.status(400).json({ error: `"${targetProduct.name} (${targetVariant.size})" is a shot size poured from the 750ml bottle. Adjust the 750ml Bottle stock instead.` });
  }

  const beforeQty = targetVariant.stock;
  targetVariant.stock += numQty;
  const numCost = costPrice && Number(costPrice) > 0 ? Number(costPrice) : targetVariant.costPrice;
  if (costPrice && Number(costPrice) > 0) {
    targetVariant.costPrice = Math.max(0, Number(costPrice));
  }

  const recordTime = date ? (date.includes('T') ? new Date(date).toISOString() : new Date(`${date}T12:00:00.000Z`).toISOString()) : new Date().toISOString();

  db.recordStockMovement(
    targetProduct.id,
    targetProduct.name,
    targetVariant.id,
    targetVariant.size,
    numQty,
    beforeQty,
    targetVariant.stock,
    'stock_in',
    user.id,
    user.name,
    (reason && typeof reason === 'string') ? reason.slice(0, 500) : 'Stock in / replenishment',
    reference ? String(reference).slice(0, 128) : undefined,
    numCost,
    recordTime
  );

  db.logAudit(user.id, user.name, user.role, 'STOCK_IN', 'INVENTORY', targetVariant.id, `Stock in +${numQty} for ${targetProduct.name} (${targetVariant.size}). New Stock: ${targetVariant.stock}`);

  res.json({ message: 'Stock added successfully', variant: targetVariant });
});

app.post('/api/inventory/stock-out', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, quantity, type, reason, reference } = req.body;

  const numQty = Number(quantity);
  if (!variantId || isNaN(numQty) || numQty <= 0 || numQty > 100000) {
    return res.status(400).json({ error: 'Valid variant ID and positive quantity (max 100,000) are required.' });
  }

  const found = findVariantById(variantId);
  if (!found) return res.status(404).json({ error: 'Product variant not found.' });
  const { product: targetProduct, variant: targetVariant } = found;

  if (isShotVariant(targetProduct, targetVariant)) {
    return res.status(400).json({ error: `"${targetProduct.name} (${targetVariant.size})" is a shot size poured from the 750ml bottle. Adjust the 750ml Bottle stock instead.` });
  }

  if (!db.raw.settings.allowNegativeStock && targetVariant.stock - numQty < 0) {
    return res.status(400).json({ error: `Cannot reduce stock below zero. Current stock: ${targetVariant.stock}, requested: ${numQty}. Enable negative stock in settings if needed.` });
  }

  const beforeQty = targetVariant.stock;
  targetVariant.stock -= numQty;

  const movementType: StockMovement['movementType'] = (type === 'damaged' || type === 'expired') ? type : 'stock_out';

  db.recordStockMovement(
    targetProduct.id,
    targetProduct.name,
    targetVariant.id,
    targetVariant.size,
    -numQty,
    beforeQty,
    targetVariant.stock,
    movementType,
    user.id,
    user.name,
    (reason && typeof reason === 'string') ? reason.slice(0, 500) : `Stock reduced due to ${movementType}`,
    reference ? String(reference).slice(0, 128) : undefined
  );

  db.logAudit(user.id, user.name, user.role, 'STOCK_OUT', 'INVENTORY', targetVariant.id, `Stock out -${numQty} for ${targetProduct.name} (${targetVariant.size}). New Stock: ${targetVariant.stock}`);

  res.json({ message: 'Stock removed successfully', variant: targetVariant });
});

app.post('/api/inventory/adjust', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, type, quantity, newStock, reason, reference } = req.body;

  if (!variantId) {
    return res.status(400).json({ error: 'Valid variant ID is required.' });
  }

  const found = findVariantById(variantId);
  if (!found) return res.status(404).json({ error: 'Product variant not found.' });
  const { product: targetProduct, variant: targetVariant } = found;

  if (isShotVariant(targetProduct, targetVariant)) {
    return res.status(400).json({ error: `"${targetProduct.name} (${targetVariant.size})" is a shot size poured from the 750ml bottle. Adjust the 750ml Bottle stock instead.` });
  }

  const beforeQty = targetVariant.stock;
  let diff = 0;
  let moveType: StockMovement['movementType'] = 'adjustment';

  if (type === 'IN') {
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0 || numQty > 100000) {
      return res.status(400).json({ error: 'Valid positive quantity required for Stock In (max 100,000).' });
    }
    targetVariant.stock += numQty;
    diff = numQty;
    moveType = 'stock_in';
  } else if (type === 'OUT') {
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0 || numQty > 100000) {
      return res.status(400).json({ error: 'Valid positive quantity required for Stock Out (max 100,000).' });
    }
    if (!db.raw.settings.allowNegativeStock && targetVariant.stock - numQty < 0) {
      return res.status(400).json({ error: `Cannot reduce below zero. Current: ${targetVariant.stock}` });
    }
    targetVariant.stock -= numQty;
    diff = -numQty;
    moveType = 'stock_out';
  } else {
    const targetStock = newStock !== undefined ? Number(newStock) : Number(quantity);
    if (isNaN(targetStock) || targetStock < 0 || targetStock > 1000000) {
      return res.status(400).json({ error: 'Valid non-negative stock quantity required for Adjustment (max 1,000,000).' });
    }
    if (!db.raw.settings.allowNegativeStock && targetStock < 0) {
      return res.status(400).json({ error: 'Negative stock not allowed' });
    }
    diff = targetStock - beforeQty;
    targetVariant.stock = targetStock;
    moveType = 'adjustment';
  }

  db.recordStockMovement(
    targetProduct.id,
    targetProduct.name,
    targetVariant.id,
    targetVariant.size,
    diff,
    beforeQty,
    targetVariant.stock,
    moveType,
    user.id,
    user.name,
    (reason && typeof reason === 'string') ? reason.slice(0, 500) : 'Inventory stock modification',
    reference ? String(reference).slice(0, 128) : undefined
  );

  db.logAudit(user.id, user.name, user.role, 'STOCK_ADJUSTMENT', 'INVENTORY', targetVariant.id, `Stock updated for ${targetProduct.name} (${targetVariant.size}) from ${beforeQty} to ${targetVariant.stock}.`);

  res.json({ message: 'Stock updated successfully', variant: targetVariant });
});

// ==========================================
// POS DAMAGE / BREAKAGE REPORTING (CASHIER-ACCESSIBLE)
// ==========================================

/**
 * Lets ANY logged-in user (cashier included) note damaged / broken bottles
 * straight from the POS. Deducts stock with a 'damaged' movement and a full
 * audit trail so admins can review every report.
 */
app.post('/api/inventory/damage-report', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, quantity, reason, openBottle } = req.body;

  const note = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (note.length < 3) {
    return res.status(400).json({ error: 'Please write a short note describing how the damage/breakage happened.' });
  }

  const found = findVariantById(typeof variantId === 'string' ? variantId : '');
  if (!found) return res.status(404).json({ error: 'Product variant not found.' });
  const { product, variant } = found;

  if (isShotVariant(product, variant)) {
    return res.status(400).json({ error: 'Shot sizes have no bottles of their own — report the damage on the 750ml Bottle instead.' });
  }

  // Breaking the currently OPEN bottle of a shot-serving product:
  // one bottle is lost AND the remaining ml inside it is written off.
  const bottle = product.servesShots ? getBottleVariant(product) : null;
  const usedMl = Math.max(0, Number(product.openBottleUsedMl) || 0);
  const isOpenBottleBreak = Boolean(openBottle) && Boolean(bottle) && bottle!.id === variant.id && usedMl > 0;

  const numQty = isOpenBottleBreak ? 1 : Number(quantity);
  if (!Number.isFinite(numQty) || !Number.isInteger(numQty) || numQty < 1 || numQty > 1000) {
    return res.status(400).json({ error: 'Damaged quantity must be a whole number between 1 and 1,000.' });
  }

  if (!db.raw.settings.allowNegativeStock && variant.stock - numQty < 0) {
    return res.status(400).json({ error: `Cannot report more than the stock on hand. Current stock: ${variant.stock}, reported: ${numQty}.` });
  }

  const beforeQty = variant.stock;
  variant.stock -= numQty;

  let extraDetail = '';
  if (isOpenBottleBreak) {
    extraDetail = ` [OPEN bottle broken — ${BOTTLE_ML - usedMl}ml remaining liquid lost]`;
    product.openBottleUsedMl = 0;
  }

  db.recordStockMovement(
    product.id,
    product.name,
    variant.id,
    variant.size,
    -numQty,
    beforeQty,
    variant.stock,
    'damaged',
    user.id,
    user.name,
    `POS damage/breakage report by ${user.name}: ${note}${extraDetail}`
  );

  db.save();
  db.logAudit(
    user.id,
    user.name,
    user.role,
    'DAMAGE_REPORT',
    'INVENTORY',
    variant.id,
    `Reported ${numQty} damaged x ${product.name} (${variant.size}). Note: ${note}${extraDetail}. New stock: ${variant.stock}`
  );

  res.status(201).json({
    message: isOpenBottleBreak
      ? `Open bottle breakage recorded — 1 x ${variant.size} written off (${BOTTLE_ML - usedMl}ml liquid lost). Admin has been notified via the audit log.`
      : `${numQty} x ${product.name} (${variant.size}) recorded as damaged. Admin has been notified via the audit log.`,
    newStock: variant.stock
  });
});

// ==========================================
// SMART STOCK IMPORT (EXCEL / CSV / PDF) — SUPER ADMIN
// ==========================================
// Additive module: reuses products/variants/categories/companies,
// stock_movements ledger and audit logging. Fully preview-first and
// transactional (snapshot + rollback on failure).

interface RawImportRow {
  rowNumber?: number;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  productName?: string;
  size?: string;
  buyingPrice?: string | number | null;
  sellingPrice?: string | number | null;
  quantity?: string | number | null;
  minStock?: string | number | null;
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
}

interface ImportRowDecision {
  excluded?: boolean;
  applyBuyingPrice?: boolean;
  applySellingPrice?: boolean;
  /** Manually resolved match for NEEDS_REVIEW rows ('new' = create as new item). */
  resolvedVariantId?: string;
  /** Admin-corrected quantity (e.g. for PDF rows). */
  quantity?: number;
}

interface ImportPreviewRow {
  rowId: number;
  rowNumber: number;
  productName: string;
  size: string;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  quantity: number;
  buyingPrice?: number;
  sellingPrice?: number;
  minStock?: number;
  status: 'MATCHED' | 'NEW_ITEM' | 'PRICE_CHANGE' | 'DUPLICATE' | 'NEEDS_REVIEW' | 'INVALID';
  note?: string;
  excluded: boolean;
  matchedVariantId?: string;
  matchedProductId?: string;
  matchedLabel?: string;
  targetProductId?: string; // new size for an existing product
  existingStock?: number;
  finalStock?: number;
  adjustment?: number;
  oldCost?: number;
  newCost?: number;
  oldSell?: number;
  newSell?: number;
  priceChange?: boolean;
  isNewCategory?: boolean;
  isNewCompany?: boolean;
  candidates?: { variantId: string; label: string }[];
}

type ImportScope = 'bar' | 'all';

interface ImportMeta {
  fileName?: string;
  fileType?: string;
  fileHash?: string;
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  /** 'bar' (default) matches & creates only Bar-category items; 'all' matches anything. */
  scope?: ImportScope;
}

const IMPORT_MAX_ROWS = 2000;
const IMPORT_DEFAULT_SCOPE: ImportScope = 'bar';
/** Fuzzy name scores above this auto-match (when unambiguous). */
const IMPORT_AUTO_MATCH_SCORE = 0.55;
/** Fuzzy name scores at/above this are offered as NEEDS_REVIEW candidates. */
const IMPORT_CANDIDATE_SCORE = 0.3;

/** Normalizes text for matching: lowercase, collapse whitespace, strip punctuation, unify "750 ML" -> "750ml". */
function importNormText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*m\s*l\b/g, '$1ml')
    .replace(/[.,;:_\-\/\\'"()\[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Size identity key: the ml volume when present ("750 ML Bottle" -> "750ml"), else the normalized label. */
function importSizeKey(s: unknown): string {
  const ml = parseMlFromSize(String(s ?? ''));
  if (ml) return `${ml}ml`;
  return importNormText(s);
}

/** Generic words that don't identify a product — dropped before fuzzy name scoring. */
const IMPORT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'for', 'with', 'on', 'in', 'x', '&', 'plus',
  'serves', 'bottle', 'bottles', 'can', 'cans', 'ml', 'size', 'pack', 'gen', 'new',
]);

/** Splits a name into meaningful tokens for fuzzy matching (drops stopwords & pure numbers). */
function importNameTokens(s: string): string[] {
  return importNormText(s)
    .split(/\s+/)
    .filter(t => t.length >= 2 && !IMPORT_STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * 0..1 similarity between an uploaded row name and a product name.
 * Favours the short upload name being fully covered by the product name (so
 * "Lion Lager" reliably resolves to "Lion Lager Beer 4.8%"), and boosts the
 * Jaccard overlap to avoid wildly different names colliding.
 */
function importNameScore(rowName: string, productName: string): number {
  const a = importNameTokens(rowName);
  const b = importNameTokens(productName);
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const common = a.filter(t => bSet.has(t)).length;
  const coverage = common / a.length;
  const unionSize = new Set([...a, ...b]).size;
  const jaccard = unionSize > 0 ? common / unionSize : 0;
  return Number((coverage * 0.7 + jaccard * 0.3).toFixed(3));
}

/** Parses money values like "Rs. 3,200", "3,200", "3200.50". Returns undefined when blank, NaN when invalid. */
function importParseMoney(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const cleaned = String(v).replace(/rs\.?|lkr|රු|\s/gi, '').replace(/,/g, '');
  if (cleaned === '' || !/^-?\d*(\.\d+)?$/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Parses quantities. Returns undefined when blank, NaN when invalid. */
function importParseQty(v: unknown): number | undefined {
  const n = importParseMoney(v);
  if (n === undefined) return undefined;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
  return n;
}

interface MatchHit { product: Product; variant: ProductVariant; }

function importVariantLabel(hit: MatchHit): string {
  return `${hit.product.name} — ${hit.variant.size} [${hit.variant.sku || hit.variant.id}]`;
}

/** True when a product belongs to a Bar-type category. */
function importProductIsBar(p: Product, categoryTypeById: Map<string, Category['type']>): boolean {
  return categoryTypeById.get(p.categoryId) === 'bar';
}

/** Builds lookup indexes across all live products for the matching engine. */
function buildImportMatchIndex(scope: ImportScope = IMPORT_DEFAULT_SCOPE) {
  const byBarcode = new Map<string, MatchHit>();
  const bySku = new Map<string, MatchHit>();
  const byNameSizeBrand = new Map<string, MatchHit[]>();
  const byNameSize = new Map<string, MatchHit[]>();
  const bySizeKey = new Map<string, MatchHit[]>();
  const productByName = new Map<string, Product[]>();
  const companyByName = new Map<string, Company>();
  const categoryByName = new Map<string, Category>();
  const categoryTypeById = new Map(db.raw.categories.map(c => [c.id, c.type]));

  db.raw.companies.forEach(c => companyByName.set(importNormText(c.name), c));
  db.raw.categories.forEach(c => categoryByName.set(importNormText(c.name), c));

  for (const p of db.raw.products) {
    if (p.isArchived) continue;
    // Bar-only scope: the matching engine must never touch food/restaurant/service items.
    if (scope === 'bar' && !importProductIsBar(p, categoryTypeById)) continue;
    const nName = importNormText(p.name);
    const comp = p.companyId ? db.raw.companies.find(c => c.id === p.companyId) : undefined;
    const nComp = comp ? importNormText(comp.name) : '';

    if (!productByName.has(nName)) productByName.set(nName, []);
    productByName.get(nName)!.push(p);

    for (const v of p.variants) {
      const hit: MatchHit = { product: p, variant: v };
      if (v.barcode && v.barcode.trim()) {
        byBarcode.set(v.barcode.trim().toLowerCase(), hit);
      }
      if (v.sku && v.sku.trim()) {
        bySku.set(v.sku.trim().toLowerCase(), hit);
      }
      const sKey = importSizeKey(v.size);
      if (!bySizeKey.has(sKey)) bySizeKey.set(sKey, []);
      bySizeKey.get(sKey)!.push(hit);
      const k2 = `${nName}|${sKey}`;
      if (!byNameSize.has(k2)) byNameSize.set(k2, []);
      byNameSize.get(k2)!.push(hit);
      const k3 = `${nName}|${sKey}|${nComp}`;
      if (!byNameSizeBrand.has(k3)) byNameSizeBrand.set(k3, []);
      byNameSizeBrand.get(k3)!.push(hit);
    }
  }
  return { byBarcode, bySku, byNameSizeBrand, byNameSize, bySizeKey, productByName, companyByName, categoryByName, categoryTypeById };
}

/** Infers a sensible category type for auto-created categories. */
function inferCategoryType(name: string): Category['type'] {
  const n = importNormText(name);
  if (/beer|wine|arrack|whisky|whiskey|vodka|gin|rum|brandy|spirit|liquor|stout|lager|toddy|sake|cider/.test(n)) return 'bar';
  if (/food|meal|rice|kottu|bites|starter|dessert|drink|juice|soft/.test(n)) return 'restaurant';
  return 'other';
}

/**
 * Core engine: sanitizes, matches, validates and stages every uploaded row.
 * NEVER mutates the database — used by both /preview and /confirm.
 */
function processImportRows(
  importType: StockImportType,
  rawRows: RawImportRow[],
  decisions: Record<string, ImportRowDecision> = {},
  scope: ImportScope = IMPORT_DEFAULT_SCOPE
): {
  rows: ImportPreviewRow[];
  summary: {
    totalRows: number; matched: number; newItems: number; priceChanges: number;
    newCategories: string[]; newCompanies: string[]; unitsToAdd: number; totalAdjustment: number;
    needsReview: number; invalid: number; duplicates: number; excluded: number;
  };
} {
  const idx = buildImportMatchIndex(scope);
  const rows: ImportPreviewRow[] = [];
  const seenIdentity = new Map<string, ImportPreviewRow>();
  const newCategorySet = new Set<string>();
  const newCompanySet = new Set<string>();

  rawRows.slice(0, IMPORT_MAX_ROWS).forEach((raw, i) => {
    const decision = decisions[String(i)] || {};
    const row: ImportPreviewRow = {
      rowId: i,
      rowNumber: Number(raw.rowNumber) || i + 2,
      productName: String(raw.productName ?? '').trim().slice(0, 191),
      size: String(raw.size ?? '').trim().slice(0, 64),
      sku: raw.sku ? String(raw.sku).trim().slice(0, 128) : undefined,
      barcode: raw.barcode ? String(raw.barcode).trim().slice(0, 128) : undefined,
      category: raw.category ? String(raw.category).trim().slice(0, 128) : undefined,
      brand: raw.brand ? String(raw.brand).trim().slice(0, 128) : undefined,
      quantity: 0,
      status: 'MATCHED',
      excluded: Boolean(decision.excluded),
    };

    // Skip fully blank rows silently
    if (!row.productName && !row.sku && !row.barcode && !row.size &&
        (raw.quantity === undefined || raw.quantity === null || String(raw.quantity).trim() === '')) {
      return;
    }

    // ---- Size folded into the product name ----
    // Supplier sheets / price-list photos often print ONE label per line
    // ("Rockland Old (Gal ) 750ml") with no separate Size column. Split a
    // trailing ml size off the name so the matching engine still receives a
    // Product Name + Size identity for these rows. A ml size in the MIDDLE of
    // a label ("Lion Lager Beer 625ml Large Bottle") is extracted as the size
    // while the original label text is kept for review/fuzzy matching.
    if (!row.size && row.productName) {
      const trailing = /^(.*?)[\s(\[{/\-]*(\d+(?:\.\d+)?)\s*m\s*l\b[\s)}\]]*$/i.exec(row.productName);
      if (trailing && trailing[1].trim().length > 0) {
        row.productName = trailing[1].replace(/[\s(\[{/\-]+$/, '').trim().slice(0, 191);
        row.size = `${Number(trailing[2])}ml`;
      } else {
        const mid = /(\d+(?:\.\d+)?)\s*m\s*l\b/i.exec(row.productName);
        if (mid && parseMlFromSize(mid[0])) row.size = `${parseMlFromSize(mid[0])}ml`;
      }
    }

    // ---- Quantity ----
    const qtyOverride = decision.quantity !== undefined ? decision.quantity : undefined;
    const qty = qtyOverride !== undefined ? importParseQty(qtyOverride) : importParseQty(raw.quantity);
    if (importType === 'purchase') {
      if (qty === undefined) {
        row.quantity = 0; // price-update-only rows are allowed
      } else if (Number.isNaN(qty) || qty < 0 || qty > 100000) {
        row.status = 'INVALID';
        row.note = 'Invalid quantity — must be a whole number (0 – 100,000). Negative receipts are not allowed.';
      } else {
        row.quantity = qty;
      }
    } else {
      if (qty === undefined || Number.isNaN(qty) || qty < 0 || qty > 1000000) {
        row.status = 'INVALID';
        row.note = 'Invalid physical count — a counted quantity (0 or more) is required.';
      } else {
        row.quantity = qty;
      }
    }

    // ---- Prices ----
    const buy = importParseMoney(raw.buyingPrice);
    const sell = importParseMoney(raw.sellingPrice);
    if (buy !== undefined && (Number.isNaN(buy) || buy < 0 || buy > 100000000)) {
      row.status = 'INVALID';
      row.note = row.note ? `${row.note} Invalid buying price.` : 'Invalid buying price.';
    } else if (buy !== undefined) {
      row.buyingPrice = buy;
    }
    if (sell !== undefined && (Number.isNaN(sell) || sell < 0 || sell > 100000000)) {
      row.status = 'INVALID';
      row.note = row.note ? `${row.note} Invalid selling price.` : 'Invalid selling price.';
    } else if (sell !== undefined) {
      row.sellingPrice = sell;
    }
    const minStock = importParseQty(raw.minStock);
    if (minStock !== undefined && !Number.isNaN(minStock) && minStock >= 0) row.minStock = minStock;

    // ---- Identity ----
    const hasIdentity = Boolean(row.barcode || row.sku || (row.productName && row.size));
    if (!hasIdentity && row.status !== 'INVALID') {
      row.status = 'INVALID';
      row.note = 'Missing product identity — provide SKU, Barcode, or Product Name + Size.';
    }

    if (row.status === 'INVALID') {
      rows.push(row);
      return;
    }

    // ---- Matching engine (Barcode > SKU > Name+Size+Brand > Name+Size) ----
    let hit: MatchHit | null = null;
    let ambiguous: MatchHit[] = [];

    if (decision.resolvedVariantId && decision.resolvedVariantId !== 'new') {
      const resolved = findVariantById(decision.resolvedVariantId);
      if (resolved) hit = resolved;
    } else if (decision.resolvedVariantId === 'new') {
      hit = null; // force create-as-new
    } else {
      if (row.barcode) hit = idx.byBarcode.get(row.barcode.toLowerCase()) || null;
      if (!hit && row.sku) hit = idx.bySku.get(row.sku.toLowerCase()) || null;
      if (!hit && row.productName && row.size) {
        const nName = importNormText(row.productName);
        const sKey = importSizeKey(row.size);
        if (row.brand) {
          const k3 = `${nName}|${sKey}|${importNormText(row.brand)}`;
          const hits3 = idx.byNameSizeBrand.get(k3) || [];
          if (hits3.length === 1) hit = hits3[0];
          else if (hits3.length > 1) ambiguous = hits3;
        }
        if (!hit && ambiguous.length === 0) {
          const hits4 = idx.byNameSize.get(`${nName}|${sKey}`) || [];
          if (hits4.length === 1) hit = hits4[0];
          else if (hits4.length > 1) ambiguous = hits4;
        }
      }
    }

    if (ambiguous.length > 1 && !hit) {
      row.status = 'NEEDS_REVIEW';
      row.note = 'Multiple existing items match this row — pick the correct one.';
      row.candidates = ambiguous.slice(0, 10).map(h => ({ variantId: h.variant.id, label: importVariantLabel(h) }));
      rows.push(row);
      return;
    }

    // Purchase mode: fuzzy auto-match by name within the SAME size/ML, so short invoice
    // names ("Lion Lager", "Rockland Gal Arrack") resolve to the correct existing product
    // instead of being surfaced for review or (worse) created as a duplicate. Only runs
    // when no exact Barcode/SKU/Name+Size match was found, so it never overrides a correct one.
    if (row.productName && row.size && !decision.resolvedVariantId && !hit) {
      const nName = importNormText(row.productName);
      const sameSize = idx.bySizeKey.get(importSizeKey(row.size)) || [];
      const scored = sameSize
        .filter(h => importNormText(h.product.name) !== nName)
        .map(h => ({ hit: h, score: importNameScore(nName, h.product.name) }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        const best = scored[0];
        const second = scored[1];
        // Auto-match only when the best candidate is clearly better / the only strong one.
        const isUnambiguous = best.score >= IMPORT_AUTO_MATCH_SCORE &&
          (!second || second.score < best.score - 0.15 || second.score < 0.5);
        if (isUnambiguous) {
          hit = best.hit;
        } else if (best.score >= IMPORT_CANDIDATE_SCORE) {
          row.status = 'NEEDS_REVIEW';
          row.note = `Possible matches found — confirm the correct item (or create as NEW).`;
          row.candidates = scored
            .filter(s => s.score >= IMPORT_CANDIDATE_SCORE)
            .slice(0, 10)
            .map(s => ({ variantId: s.hit.variant.id, label: importVariantLabel(s.hit) }));
          seenIdentity.set(`n:${importNormText(row.productName)}|${importSizeKey(row.size)}`, row);
          rows.push(row);
          return;
        }
      }
    }


    // ---- In-file duplicate detection / merging ----
    const identityKey = hit
      ? `v:${hit.variant.id}`
      : `n:${importNormText(row.productName)}|${importSizeKey(row.size)}`;
    const firstRow = seenIdentity.get(identityKey);
    if (firstRow) {
      if (importType === 'purchase') {
        if (!row.excluded && !firstRow.excluded) {
          firstRow.quantity += row.quantity;
          if (firstRow.matchedVariantId && firstRow.existingStock !== undefined) {
            firstRow.finalStock = firstRow.existingStock + firstRow.quantity;
          }
          firstRow.note = firstRow.note
            ? `${firstRow.note} (+${row.quantity} merged from row ${row.rowNumber})`
            : `Merged duplicate row ${row.rowNumber} (+${row.quantity})`;
        }
        row.status = 'DUPLICATE';
        row.excluded = true;
        row.note = `Duplicate of row ${firstRow.rowNumber} — quantity merged there.`;
      } else {
        if (firstRow.quantity === row.quantity) {
          row.status = 'DUPLICATE';
          row.excluded = true;
          row.note = `Duplicate of row ${firstRow.rowNumber} — same count.`;
        } else {
          row.status = 'NEEDS_REVIEW';
          row.note = `Conflicting counts in file (row ${firstRow.rowNumber}: ${firstRow.quantity}, this row: ${row.quantity}).`;
        }
      }
      rows.push(row);
      return;
    }

    if (hit) {
      // ---- MATCHED path ----
      // Bar-only scope must never update a food/restaurant/service item, even if a
      // row was manually resolved to one.
      if (scope === 'bar' && !importProductIsBar(hit.product, idx.categoryTypeById)) {
        row.status = 'INVALID';
        row.note = 'Only Bar items can be updated in this mode — this row matched a non-Bar item. Switch the scope to "All items" if you need it.';
        rows.push(row);
        return;
      }
      if (isShotVariant(hit.product, hit.variant)) {
        row.status = 'INVALID';
        row.note = 'Shot size — shots pour from the 750ml Bottle stock. Import to the 750ml Bottle row instead.';
        rows.push(row);
        return;
      }
      row.matchedVariantId = hit.variant.id;
      row.matchedProductId = hit.product.id;
      row.matchedLabel = importVariantLabel(hit);
      row.productName = row.productName || hit.product.name;
      row.size = row.size || hit.variant.size;
      row.existingStock = hit.variant.stock;

      if (importType === 'purchase') {
        row.finalStock = hit.variant.stock + row.quantity;
        row.oldCost = hit.variant.costPrice;
        row.oldSell = hit.variant.sellingPrice;
        const costChanged = row.buyingPrice !== undefined && Math.abs(row.buyingPrice - hit.variant.costPrice) > 0.009;
        const sellChanged = row.sellingPrice !== undefined && Math.abs(row.sellingPrice - hit.variant.sellingPrice) > 0.009;
        if (costChanged) row.newCost = row.buyingPrice;
        if (sellChanged) row.newSell = row.sellingPrice;
        if (costChanged || sellChanged) {
          row.priceChange = true;
          row.status = 'PRICE_CHANGE';
        }
        if (row.quantity === 0 && !row.priceChange) {
          row.note = 'No quantity and no price change — nothing to do.';
        }
      } else {
        row.adjustment = row.quantity - hit.variant.stock;
        row.finalStock = row.quantity;
        if (row.adjustment === 0) row.note = 'Count matches system stock — no adjustment needed.';
      }
      seenIdentity.set(identityKey, row);
      rows.push(row);
      return;
    }

    // ---- Unmatched ----
    if (importType === 'physical_count') {
      row.status = 'NEEDS_REVIEW';
      row.note = 'Item not found — physical count can only adjust existing items. Pick the matching item or exclude this row.';
      if (row.productName && row.size) {
        const nName = importNormText(row.productName);
        const sameSize = idx.bySizeKey.get(importSizeKey(row.size)) || [];
        row.candidates = sameSize
          .filter(h => {
            const hn = importNormText(h.product.name);
            return nName.length >= 4 && (hn.includes(nName) || nName.includes(hn));
          })
          .slice(0, 10)
          .map(h => ({ variantId: h.variant.id, label: importVariantLabel(h) }));
      }
      seenIdentity.set(identityKey, row);
      rows.push(row);
      return;
    }

    // Purchase mode: NEW ITEM (new product or new size of an existing product)
    row.status = 'NEW_ITEM';
    if (!row.productName || !row.size) {
      row.status = 'NEEDS_REVIEW';
      row.note = 'Cannot create a new item without both Product Name and Size.';
      seenIdentity.set(identityKey, row);
      rows.push(row);
      return;
    }

    // In Bar-only mode a NEW item must belong to a Bar category (never create a food
    // duplicate). If the row's category maps to an existing non-Bar category, refuse it.
    if (scope === 'bar') {
      const catName = row.category || 'General';
      const existingCat = db.raw.categories.find(c => importNormText(c.name) === importNormText(catName));
      if (existingCat && existingCat.type !== 'bar') {
        row.status = 'INVALID';
        row.note = 'Only Bar items can be imported in this mode — "' + (row.category || 'General') + '" is a non-Bar category. Switch the scope to "All items" or fix the category.';
        rows.push(row);
        return;
      }
    }
    if (row.sellingPrice === undefined || row.sellingPrice <= 0) {
      row.status = 'INVALID';
      row.note = 'New items need a Selling Price greater than 0.';
      rows.push(row);
      return;
    }

    const sameNameProducts = idx.productByName.get(importNormText(row.productName)) || [];
    if (sameNameProducts.length > 0) {
      const brandNorm = row.brand ? importNormText(row.brand) : '';
      const preferred = brandNorm
        ? sameNameProducts.find(p => {
            const comp = p.companyId ? db.raw.companies.find(c => c.id === p.companyId) : undefined;
            return comp && importNormText(comp.name) === brandNorm;
          }) || sameNameProducts[0]
        : sameNameProducts[0];
      row.targetProductId = preferred.id;
      row.note = `New size "${row.size}" will be added to existing product "${preferred.name}".`;
    } else {
      row.note = 'Brand-new product will be created after confirmation.';
      const catName = row.category || 'General';
      if (!idx.categoryByName.has(importNormText(catName))) {
        row.isNewCategory = true;
        newCategorySet.add(catName);
      }
      if (row.brand && !idx.companyByName.has(importNormText(row.brand))) {
        row.isNewCompany = true;
        newCompanySet.add(row.brand);
      }
    }
    row.existingStock = 0;
    row.finalStock = row.quantity;
    seenIdentity.set(identityKey, row);
    rows.push(row);
  });

  // ---- Summary ----
  const active = rows.filter(r => !r.excluded);
  const summary = {
    totalRows: rows.length,
    matched: active.filter(r => r.matchedVariantId && (r.status === 'MATCHED' || r.status === 'PRICE_CHANGE')).length,
    newItems: active.filter(r => r.status === 'NEW_ITEM').length,
    priceChanges: active.filter(r => r.priceChange).length,
    newCategories: Array.from(newCategorySet),
    newCompanies: Array.from(newCompanySet),
    unitsToAdd: importType === 'purchase'
      ? active.filter(r => r.status !== 'INVALID' && r.status !== 'NEEDS_REVIEW').reduce((s, r) => s + r.quantity, 0)
      : 0,
    totalAdjustment: importType === 'physical_count'
      ? active.filter(r => r.adjustment !== undefined).reduce((s, r) => s + (r.adjustment || 0), 0)
      : 0,
    needsReview: active.filter(r => r.status === 'NEEDS_REVIEW').length,
    invalid: active.filter(r => r.status === 'INVALID').length,
    duplicates: rows.filter(r => r.status === 'DUPLICATE').length,
    excluded: rows.filter(r => r.excluded).length,
  };

  return { rows, summary };
}

/** Detects a previously processed import for the same invoice / file. */
function findDuplicateImport(meta: ImportMeta, importType: StockImportType): StockImport | null {
  const list = db.raw.stockImports || [];
  const hash = meta.fileHash && String(meta.fileHash).trim();
  const inv = meta.invoiceNumber && importNormText(meta.invoiceNumber);
  const sup = meta.supplier && importNormText(meta.supplier);
  for (const imp of list) {
    if (hash && imp.fileHash && imp.fileHash === hash) return imp;
    if (inv && imp.invoiceNumber && importNormText(imp.invoiceNumber) === inv &&
        imp.importType === importType &&
        (!sup || !imp.supplier || importNormText(imp.supplier) === sup)) {
      return imp;
    }
  }
  return null;
}

function sanitizeImportMeta(body: any): ImportMeta {
  return {
    fileName: body?.fileName ? String(body.fileName).slice(0, 191) : undefined,
    fileType: body?.fileType ? String(body.fileType).slice(0, 16) : undefined,
    fileHash: body?.fileHash ? String(body.fileHash).slice(0, 128) : undefined,
    supplier: body?.supplier ? String(body.supplier).trim().slice(0, 191) : undefined,
    invoiceNumber: body?.invoiceNumber ? String(body.invoiceNumber).trim().slice(0, 128) : undefined,
    invoiceDate: body?.invoiceDate ? String(body.invoiceDate).trim().slice(0, 32) : undefined,
    scope: body?.scope === 'all' ? 'all' : 'bar',
  };
}

function parseImportRequest(body: any): { importType: StockImportType; rows: RawImportRow[]; decisions: Record<string, ImportRowDecision>; meta: ImportMeta } | { error: string } {
  const importType: StockImportType = body?.importType === 'physical_count' ? 'physical_count' : body?.importType === 'purchase' ? 'purchase' : (null as any);
  if (!importType) return { error: 'Import type must be "purchase" (Stock In) or "physical_count".' };
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return { error: 'No valid product rows found in the uploaded file.' };
  }
  if (body.rows.length > IMPORT_MAX_ROWS) {
    return { error: `Too many rows (max ${IMPORT_MAX_ROWS} per import). Split the file and try again.` };
  }
  const decisions: Record<string, ImportRowDecision> = {};
  if (body.decisions && typeof body.decisions === 'object') {
    for (const [k, v] of Object.entries(body.decisions as Record<string, any>)) {
      if (!v || typeof v !== 'object') continue;
      decisions[k] = {
        excluded: Boolean(v.excluded),
        applyBuyingPrice: v.applyBuyingPrice === undefined ? undefined : Boolean(v.applyBuyingPrice),
        applySellingPrice: v.applySellingPrice === undefined ? undefined : Boolean(v.applySellingPrice),
        resolvedVariantId: typeof v.resolvedVariantId === 'string' ? v.resolvedVariantId.slice(0, 128) : undefined,
        quantity: v.quantity === undefined || v.quantity === null || v.quantity === '' ? undefined : Number(v.quantity),
      };
    }
  }
  return { importType, rows: body.rows as RawImportRow[], decisions, meta: sanitizeImportMeta(body) };
}

// ---- PREVIEW (never touches the database) ----
app.post('/api/inventory/import/preview', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const parsed = parseImportRequest(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  try {
    const { rows, summary } = processImportRows(parsed.importType, parsed.rows, parsed.decisions, parsed.meta.scope || IMPORT_DEFAULT_SCOPE);
    const duplicateImport = findDuplicateImport(parsed.meta, parsed.importType);
    res.json({
      rows,
      summary,
      duplicateImport: duplicateImport
        ? {
            id: duplicateImport.id,
            invoiceNumber: duplicateImport.invoiceNumber,
            supplier: duplicateImport.supplier,
            fileName: duplicateImport.fileName,
            importedAt: duplicateImport.createdAt,
            importedBy: duplicateImport.userName,
          }
        : null,
    });
  } catch (e: any) {
    console.error('[IMPORT] Preview failed:', e);
    res.status(500).json({ error: 'Unable to analyse the uploaded rows. Please check the file and try again.' });
  }
});

// ---- CONFIRM (transactional commit with rollback) ----
app.post('/api/inventory/import/confirm', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const parsed = parseImportRequest(req.body);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const force = Boolean(req.body?.force);

  // Re-run the full engine server-side — never trust client-computed results
  const { rows, summary } = processImportRows(parsed.importType, parsed.rows, parsed.decisions, parsed.meta.scope || IMPORT_DEFAULT_SCOPE);

  const problems = rows.filter(r => !r.excluded && (r.status === 'INVALID' || r.status === 'NEEDS_REVIEW'));
  if (problems.length > 0) {
    return res.status(400).json({
      error: `Import contains ${problems.length} problematic row(s). Fix, resolve or exclude them before confirming.`,
      problemRows: problems.map(r => ({ rowId: r.rowId, rowNumber: r.rowNumber, status: r.status, note: r.note })),
    });
  }

  const duplicateImport = findDuplicateImport(parsed.meta, parsed.importType);
  if (duplicateImport && !force) {
    return res.status(409).json({
      error: `Duplicate import detected. ${duplicateImport.invoiceNumber ? `Invoice ${duplicateImport.invoiceNumber}` : `File "${duplicateImport.fileName || ''}"`} was already imported on ${new Date(duplicateImport.createdAt).toLocaleDateString()} by ${duplicateImport.userName} (${duplicateImport.id}). Stock will NOT be added twice unless you explicitly force it.`,
      duplicateImport: { id: duplicateImport.id, importedAt: duplicateImport.createdAt },
    });
  }

  const applyRows = rows.filter(r =>
    !r.excluded && r.status !== 'DUPLICATE' && r.status !== 'INVALID' && r.status !== 'NEEDS_REVIEW'
  );
  if (applyRows.length === 0) {
    return res.status(400).json({ error: 'Nothing to import — every row is excluded, duplicate or empty.' });
  }

  // ==== TRANSACTION: snapshot -> apply -> rollback on ANY failure ====
  const snapshot = {
    products: JSON.parse(JSON.stringify(db.raw.products)),
    categories: JSON.parse(JSON.stringify(db.raw.categories)),
    companies: JSON.parse(JSON.stringify(db.raw.companies)),
    stockMovements: JSON.parse(JSON.stringify(db.raw.stockMovements)),
    stockImports: JSON.parse(JSON.stringify(db.raw.stockImports || [])),
    counters: JSON.parse(JSON.stringify(db.raw.counters)),
  };

  try {
    const importId = db.getNextImportId();
    const now = new Date().toISOString();
    const refText = [
      parsed.meta.invoiceNumber ? `Invoice ${parsed.meta.invoiceNumber}` : '',
      parsed.meta.supplier ? `from ${parsed.meta.supplier}` : '',
      parsed.meta.fileName ? `(${parsed.meta.fileName})` : '',
    ].filter(Boolean).join(' ');

    const createdCategories: string[] = [];
    const createdCompanies: string[] = [];
    const createdProducts: string[] = [];
    const resultRows: StockImportRowResult[] = [];
    const priceAudits: string[] = [];
    let totalUnitsAdded = 0;
    let totalAdjustment = 0;
    let newVariants = 0;

    const catCache = new Map<string, Category>();
    db.raw.categories.forEach(c => catCache.set(importNormText(c.name), c));
    const compCache = new Map<string, Company>();
    db.raw.companies.forEach(c => compCache.set(importNormText(c.name), c));

    const ensureCategory = (name: string): Category => {
      const key = importNormText(name);
      const existing = catCache.get(key);
      if (existing) return existing;
      // Bar-only scope: new categories are Bar categories (a bar import never spawns food).
      const type: Category['type'] = (parsed.meta.scope || IMPORT_DEFAULT_SCOPE) === 'bar' ? 'bar' : inferCategoryType(name);
      const cat: Category = {
        id: `cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        name: name.trim().slice(0, 128),
        type,
        isActive: true,
        displayOrder: db.raw.categories.length + 1,
      };
      db.raw.categories.push(cat);
      catCache.set(key, cat);
      createdCategories.push(cat.name);
      return cat;
    };

    const ensureCompany = (name: string): Company => {
      const key = importNormText(name);
      const existing = compCache.get(key);
      if (existing) return existing;
      const comp: Company = {
        id: `comp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        name: name.trim().slice(0, 128),
        description: `Auto-created by Smart Import ${importId}`,
        isActive: true,
      };
      db.raw.companies.push(comp);
      compCache.set(key, comp);
      createdCompanies.push(comp.name);
      return comp;
    };

    const usedSkus = new Set<string>();
    // Products created earlier in this same import run (so multiple sizes group together)
    const runProductByName = new Map<string, Product>();

    for (const row of applyRows) {
      const movementReason = `Smart Import ${importId}${refText ? ` — ${refText}` : ''}`;

      if (row.matchedVariantId) {
        const found = findVariantById(row.matchedVariantId);
        if (!found) throw new Error(`Variant disappeared during import: ${row.matchedVariantId}`);
        const { product, variant } = found;
        const decision = parsed.decisions[String(row.rowId)] || {};

        const result: StockImportRowResult = {
          productName: product.name,
          size: variant.size,
          sku: variant.sku,
          productId: product.id,
          variantId: variant.id,
          status: row.status,
          quantity: row.quantity,
          stockBefore: variant.stock,
        };

        if (parsed.importType === 'purchase') {
          // Price updates (Accept New Price unless the admin chose Keep Existing)
          if (row.priceChange) {
            if (row.newCost !== undefined && decision.applyBuyingPrice !== false) {
              priceAudits.push(`${product.name} (${variant.size}): buying ${variant.costPrice} → ${row.newCost}`);
              result.oldCostPrice = variant.costPrice;
              result.newCostPrice = row.newCost;
              variant.costPrice = row.newCost;
            }
            if (row.newSell !== undefined && decision.applySellingPrice !== false) {
              priceAudits.push(`${product.name} (${variant.size}): selling ${variant.sellingPrice} → ${row.newSell}`);
              result.oldSellingPrice = variant.sellingPrice;
              result.newSellingPrice = row.newSell;
              variant.sellingPrice = row.newSell;
            }
          }
          if (row.quantity > 0) {
            const before = variant.stock;
            variant.stock += row.quantity;
            totalUnitsAdded += row.quantity;
            db.recordStockMovement(
              product.id, product.name, variant.id, variant.size,
              row.quantity, before, variant.stock, 'stock_in',
              user.id, user.name, movementReason, importId,
              row.buyingPrice !== undefined ? row.buyingPrice : variant.costPrice
            );
          }
          result.stockAfter = variant.stock;
        } else {
          // Physical count → controlled adjustment
          const diff = row.quantity - variant.stock;
          result.adjustment = diff;
          if (diff !== 0) {
            const before = variant.stock;
            variant.stock = row.quantity;
            totalAdjustment += diff;
            db.recordStockMovement(
              product.id, product.name, variant.id, variant.size,
              diff, before, variant.stock, 'adjustment',
              user.id, user.name, `Physical stock count via ${movementReason}`, importId
            );
          }
          result.stockAfter = variant.stock;
        }
        resultRows.push(result);
        continue;
      }

      // ---- NEW ITEM (purchase mode only) ----
      if (row.status === 'NEW_ITEM') {
        let product: Product | undefined = row.targetProductId
          ? db.raw.products.find(p => p.id === row.targetProductId)
          : runProductByName.get(importNormText(row.productName));

        if (!product) {
          const category = ensureCategory(row.category || 'General');
          const company = row.brand ? ensureCompany(row.brand) : undefined;
          product = {
            id: `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            name: row.productName.slice(0, 191),
            categoryId: category.id,
            companyId: company?.id,
            description: `Created by Smart Import ${importId}`,
            isKitchenItem: false,
            isActive: true,
            createdAt: now,
            variants: [],
          };
          db.raw.products.push(product);
          runProductByName.set(importNormText(product.name), product);
          createdProducts.push(product.name);
        }

        const sku = row.sku && row.sku.trim()
          ? row.sku.trim().slice(0, 128)
          : makeUniqueSku(`${row.productName.substring(0, 3)}-${row.size}`, usedSkus);
        usedSkus.add(sku.toUpperCase());

        const variant: ProductVariant = {
          id: `var-${product.id.replace('prod-', '')}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          productId: product.id,
          size: row.size.slice(0, 64),
          sku,
          barcode: row.barcode || undefined,
          costPrice: row.buyingPrice !== undefined ? row.buyingPrice : 0,
          sellingPrice: row.sellingPrice !== undefined ? row.sellingPrice : 0,
          stock: 0,
          minStockLevel: row.minStock !== undefined ? row.minStock : (db.raw.settings.lowStockDefaultThreshold || 5),
          isActive: true,
        };
        product.variants.push(variant);
        newVariants++;

        if (row.quantity > 0) {
          variant.stock = row.quantity;
          totalUnitsAdded += row.quantity;
          db.recordStockMovement(
            product.id, product.name, variant.id, variant.size,
            row.quantity, 0, variant.stock, 'stock_in',
            user.id, user.name, `New item received via ${movementReason}`, importId,
            variant.costPrice
          );
        }

        resultRows.push({
          productName: product.name,
          size: variant.size,
          sku: variant.sku,
          productId: product.id,
          variantId: variant.id,
          status: 'NEW_ITEM',
          quantity: row.quantity,
          stockBefore: 0,
          stockAfter: variant.stock,
          newCostPrice: variant.costPrice,
          newSellingPrice: variant.sellingPrice,
          note: row.note,
        });
      }
    }

    const importRecord: StockImport = {
      id: importId,
      importType: parsed.importType,
      fileName: parsed.meta.fileName,
      fileType: parsed.meta.fileType,
      fileHash: parsed.meta.fileHash,
      supplier: parsed.meta.supplier,
      invoiceNumber: parsed.meta.invoiceNumber,
      invoiceDate: parsed.meta.invoiceDate,
      summary: {
        matched: summary.matched,
        newProducts: createdProducts.length,
        newVariants,
        newCategories: createdCategories.length,
        newCompanies: createdCompanies.length,
        priceChanges: priceAudits.length,
        totalUnitsAdded,
        totalAdjustment,
        rowsImported: applyRows.length,
        rowsExcluded: summary.excluded,
      },
      createdCategories,
      createdCompanies,
      createdProducts,
      rows: resultRows,
      userId: user.id,
      userName: user.name,
      createdAt: now,
    };
    if (!Array.isArray(db.raw.stockImports)) db.raw.stockImports = [];
    db.raw.stockImports.unshift(importRecord);
    if (db.raw.stockImports.length > 500) db.raw.stockImports.length = 500;

    db.save();

    db.logAudit(
      user.id, user.name, user.role, 'STOCK_IMPORT', 'INVENTORY', importId,
      `Smart Import ${importId} (${parsed.importType === 'purchase' ? 'Purchase / Stock In' : 'Physical Stock Count'})${refText ? ` ${refText}` : ''}: ` +
      `${applyRows.length} rows, ${createdProducts.length} new products, ${newVariants} new sizes, ` +
      (parsed.importType === 'purchase' ? `+${totalUnitsAdded} units` : `net adjustment ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment}`) +
      (priceAudits.length ? `. Price changes: ${priceAudits.join('; ').slice(0, 900)}` : '')
    );

    res.status(201).json({ message: 'Import committed successfully.', import: importRecord });
  } catch (e: any) {
    // ---- ROLLBACK: restore every touched collection ----
    console.error('[IMPORT] Commit failed, rolling back:', e);
    db.raw.products = snapshot.products;
    db.raw.categories = snapshot.categories;
    db.raw.companies = snapshot.companies;
    db.raw.stockMovements = snapshot.stockMovements;
    db.raw.stockImports = snapshot.stockImports;
    db.raw.counters = snapshot.counters;
    try { db.save(); } catch { /* best-effort persist of rollback */ }
    res.status(500).json({ error: 'Database import failed. No changes were made.' });
  }
});

// ---- IMPORT HISTORY ----
app.get('/api/inventory/import/history', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const list = (db.raw.stockImports || []).map(imp => ({
    id: imp.id,
    importType: imp.importType,
    fileName: imp.fileName,
    fileType: imp.fileType,
    supplier: imp.supplier,
    invoiceNumber: imp.invoiceNumber,
    invoiceDate: imp.invoiceDate,
    summary: imp.summary,
    userName: imp.userName,
    createdAt: imp.createdAt,
  }));
  res.json(list);
});

app.get('/api/inventory/import/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const imp = (db.raw.stockImports || []).find(i => i.id === req.params.id);
  if (!imp) return res.status(404).json({ error: 'Import record not found.' });
  res.json(imp);
});

// ---- PDF PARSING (safe, best-effort, always preview-first) ----
app.post('/api/inventory/import/parse-pdf', authMiddleware, requireRole('super_admin'), async (req: Request, res: Response) => {
  const { dataBase64, fileName } = req.body || {};
  if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
    return res.status(400).json({ error: 'No PDF data received.' });
  }
  if (dataBase64.length > 4.8 * 1024 * 1024) {
    return res.status(400).json({ error: 'PDF is too large (max ~3.5 MB). Please use the Excel template for big invoices.' });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid PDF upload.' });
  }
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return res.status(400).json({ error: 'The uploaded file is not a valid PDF document.' });
  }

  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer);
    const text = String(data.text || '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Heuristic: rows usually contain "<name> <size ml> ... numbers (qty / prices)"
    const rows: RawImportRow[] = [];
    const sizeRe = /(\d+(?:\.\d+)?)\s*ml\b/i;
    for (const line of lines) {
      const sizeMatch = sizeRe.exec(line);
      if (!sizeMatch) continue;
      const name = line.slice(0, sizeMatch.index).replace(/[\d.,]+\s*$/, '').trim();
      if (!name || name.length < 2) continue;
      const after = line.slice(sizeMatch.index + sizeMatch[0].length);
      const numbers = (after.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => Number(n.replace(/,/g, ''))).filter(n => Number.isFinite(n));
      if (numbers.length === 0) continue;

      const qty = numbers.find(n => Number.isInteger(n) && n > 0 && n <= 10000);
      const priceCandidates = numbers.filter(n => n !== qty && n > 0);
      rows.push({
        productName: name.slice(0, 191),
        size: `${sizeMatch[1]}ml`,
        quantity: qty !== undefined ? qty : undefined,
        buyingPrice: priceCandidates.length > 0 ? priceCandidates[0] : undefined,
        sellingPrice: priceCandidates.length > 1 ? priceCandidates[priceCandidates.length - 1] : undefined,
      });
      if (rows.length >= IMPORT_MAX_ROWS) break;
    }

    if (rows.length === 0) {
      return res.status(422).json({
        error: 'Unable to confidently extract product rows from this PDF. Please review the document or use the Excel template instead.',
      });
    }

    res.json({
      rows,
      pages: data.numpages,
      note: `Best-effort extraction from "${fileName || 'PDF'}" — verify every quantity and price in the preview before confirming.`,
    });
  } catch (e: any) {
    console.error('[IMPORT] PDF parse failed:', e?.message || e);
    res.status(422).json({
      error: 'Unable to confidently extract this invoice. Please review or use the Excel template.',
    });
  }
});

const getStockMovementsHandler = (req: Request, res: Response) => {
  const categoriesMap = new Map(db.raw.categories.map(c => [c.id, c.name]));
  const companiesMap = new Map(db.raw.companies.map(c => [c.id, c.name]));
  const productsMap = new Map(db.raw.products.map(p => [p.id, p]));

  const movements = (db.raw.stockMovements || []).map(m => {
    const prod = productsMap.get(m.productId);
    const compName = m.companyName || (prod?.companyId ? companiesMap.get(prod.companyId) : undefined) || 'In-House / Other';
    const catName = m.categoryName || (prod?.categoryId ? categoriesMap.get(prod.categoryId) : undefined) || 'General';

    return {
      ...m,
      companyName: compName,
      categoryName: catName,
      size: m.variantSize || (m as any).size,
      type: m.movementType || (m as any).type,
      quantity: m.quantityChange !== undefined ? m.quantityChange : (m as any).quantity,
      previousStock: m.quantityBefore !== undefined ? m.quantityBefore : (m as any).previousStock,
      newStock: m.quantityAfter !== undefined ? m.quantityAfter : (m as any).newStock,
      reference: m.referenceId || (m as any).reference || '',
    };
  });
  res.json(movements);
};

app.get('/api/inventory/movements', authMiddleware, requireRole('super_admin'), getStockMovementsHandler);
app.get('/api/stock-movements', authMiddleware, requireRole('super_admin'), getStockMovementsHandler);

// ==========================================
// HELD BILLS - FIXED: Use HOLD- prefix to not consume BILL sequence
// ==========================================

app.get('/api/orders/held', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.heldBills);
});

app.post('/api/orders/hold', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { items, orderType, tableNumber, customerName, customerPhone, discount, discountPercentage, notes, existingHeldId } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cannot hold an empty cart.' });
  }

  const sanitizedHold = sanitizeOrderItems(items);
  if (sanitizedHold.error) {
    return res.status(400).json({ error: sanitizedHold.error });
  }
  const holdItems = sanitizedHold.items;
  const holdTotals = computeOrderTotals(holdItems, { discount, discountPercentage });

  if (existingHeldId) {
    const existingIndex = db.raw.heldBills.findIndex(h => h.id === existingHeldId);
    if (existingIndex !== -1) {
      const updated: HeldBill = {
        ...db.raw.heldBills[existingIndex],
        items: holdItems,
        orderType: orderType || 'dine_in',
        tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
        customerName: customerName ? String(customerName).slice(0, 128) : undefined,
        customerPhone: customerPhone ? String(customerPhone).slice(0, 32) : undefined,
        subtotal: holdTotals.subtotal,
        discount: holdTotals.discount,
        discountPercentage: holdTotals.discountPercentage,
        tax: holdTotals.tax,
        grandTotal: holdTotals.grandTotal,
        notes: notes ? String(notes).slice(0, 1000) : undefined,
        updatedAt: new Date().toISOString()
      };
      db.raw.heldBills[existingIndex] = updated;
      db.save();
      db.logAudit(user.id, user.name, user.role, 'UPDATE_HELD_BILL', 'BILL', updated.id, `Updated held order ${updated.billNumber}`);
      return res.json(updated);
    }
  }

  // Held bills use their own sequence so every hold gets a unique reference
  // (previously every hold reused the current bill sequence => duplicate HOLD-xxxx numbers)
  const heldBill: HeldBill = {
    id: `held-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    billNumber: db.getNextHoldNumber(),
    tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
    customerName: customerName ? String(customerName).slice(0, 128) : undefined,
    customerPhone: customerPhone ? String(customerPhone).slice(0, 32) : undefined,
    cashierId: user.id,
    cashierName: user.name,
    orderType: orderType || 'dine_in',
    items: holdItems,
    subtotal: holdTotals.subtotal,
    discount: holdTotals.discount,
    discountPercentage: holdTotals.discountPercentage,
    tax: holdTotals.tax,
    grandTotal: holdTotals.grandTotal,
    notes: notes ? String(notes).slice(0, 1000) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.raw.heldBills.push(heldBill);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'HOLD_BILL', 'BILL', heldBill.id, `Held bill ${heldBill.billNumber} with ${holdItems.length} items (Total: Rs. ${heldBill.grandTotal})`);

  res.status(201).json(heldBill);
});

app.delete('/api/orders/held/:id', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const index = db.raw.heldBills.findIndex(h => h.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Held bill not found.' });

  const held = db.raw.heldBills[index];
  db.raw.heldBills.splice(index, 1);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'DELETE_HELD_BILL', 'BILL', held.id, `Discarded held bill ${held.billNumber}`);
  res.json({ message: 'Held bill cleared.' });
});

// ==========================================
// KOT (KITCHEN ORDER TICKET)
// ==========================================

app.get('/api/kot', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.kots);
});

app.post('/api/kot', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { items, orderType, tableNumber, notes, billNumber } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cannot create KOT with no items.' });
  }

  const sanitizedKot = sanitizeOrderItems(items);
  if (sanitizedKot.error) {
    return res.status(400).json({ error: sanitizedKot.error });
  }

  const newKot: KOT = {
    id: `kot-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    kotNumber: db.getNextKOTNumber(),
    billNumber: billNumber ? String(billNumber).slice(0, 64) : undefined,
    tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
    orderType: orderType || 'dine_in',
    cashierId: user.id,
    cashierName: user.name,
    items: sanitizedKot.items,
    status: 'pending',
    notes: notes ? String(notes).slice(0, 1000) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.raw.kots.unshift(newKot);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'CREATE_KOT', 'KOT', newKot.id, `Generated Kitchen Ticket ${newKot.kotNumber} for Table: ${newKot.tableNumber || 'Bar'}`);

  res.status(201).json(newKot);
});

app.patch('/api/kot/:id/status', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const kot = db.raw.kots.find(k => k.id === req.params.id);
  if (!kot) return res.status(404).json({ error: 'KOT not found.' });

  const { status } = req.body;
  const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid KOT status.' });
  }

  // Validate status transitions
  const transitions: Record<string, string[]> = {
    pending: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  if (kot.status !== status && !transitions[kot.status]?.includes(status)) {
    return res.status(400).json({ error: `Cannot transition from ${kot.status} to ${status}` });
  }

  kot.status = status;
  kot.updatedAt = new Date().toISOString();
  db.save();

  db.logAudit(user.id, user.name, user.role, 'UPDATE_KOT_STATUS', 'KOT', kot.id, `Changed ${kot.kotNumber} status to ${status.toUpperCase()}`);

  res.json(kot);
});

// ==========================================
// BILLS, INVOICES & CHECKOUT
// ==========================================

app.get('/api/bills', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.bills);
});

app.get('/api/bills/:id', authMiddleware, (req: Request, res: Response) => {
  const bill = db.raw.bills.find(b => b.id === req.params.id || b.billNumber === req.params.id || b.invoiceNumber === req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill/Invoice not found.' });
  res.json(bill);
});

// ==========================================
// KITCHEN PRODUCTION ENGINE (FOOD & KITCHEN MODULE v1.2.0)
// ==========================================
// Automatic recipe ingredient deduction when food items are sold through the
// EXISTING POS checkout. Menu items WITHOUT a recipe are completely unaffected
// (their variant-level stock keeps working exactly as before).

/** Finds the ACTIVE kitchen recipe attached to a POS variant. */
function findRecipeForVariant(variantId: string): KitchenRecipe | undefined {
  return db.raw.kitchenRecipes.find(r => r.isActive && r.variantId === variantId);
}

/**
 * Aggregates the total ingredient quantities required to fulfil a bill
 * (recipe quantities × item quantities, merged per ingredient).
 * Returns null when no item on the bill is recipe-linked.
 */
function aggregateIngredientRequirements(items: { variantId: string; quantity: number }[]): Map<KitchenIngredient, number> | null {
  const required = new Map<string, number>();
  let any = false;
  for (const item of items) {
    const recipe = findRecipeForVariant(item.variantId);
    if (!recipe) continue;
    any = true;
    const servings = recipe.servings > 0 ? recipe.servings : 1;
    for (const line of recipe.items) {
      const perPortion = line.quantity / servings;
      required.set(line.ingredientId, (required.get(line.ingredientId) || 0) + perPortion * item.quantity);
    }
  }
  if (!any) return null;
  const resolved = new Map<KitchenIngredient, number>();
  for (const [ingId, qty] of required) {
    const ing = db.raw.kitchenIngredients.find(i => i.id === ingId && i.isActive);
    if (ing) resolved.set(ing, qty);
  }
  return resolved;
}

/**
 * Deducts recipe ingredients from the kitchen store with a full movement
 * ledger record per ingredient (never a raw quantity mutation).
 */
function deductKitchenIngredientsForSale(
  requirements: Map<KitchenIngredient, number>,
  user: User,
  billNumber: string,
  billId: string
): void {
  for (const [ing, qty] of requirements) {
    const rounded = Number(qty.toFixed(3));
    if (rounded <= 0) continue;
    const before = ing.currentStock;
    ing.currentStock = Number((ing.currentStock - rounded).toFixed(3));
    ing.updatedAt = new Date().toISOString();
    db.recordKitchenMovement(
      ing,
      -rounded,
      before,
      ing.currentStock,
      'sale',
      user.id,
      user.name,
      `Auto production for sale on ${billNumber}`,
      billNumber
    );
  }
}

/**
 * Restores recipe ingredients back to the kitchen store when a bill is voided.
 *
 * Uses the EXACT deduction snapshot stored on the bill at sale time, so a void
 * returns precisely what the sale took — even if the recipe was edited,
 * archived or replaced after the sale. Without the snapshot (legacy bills
 * created before the snapshot existed) it falls back to recomputing from the
 * current recipe.
 */
function restoreKitchenIngredientsForVoid(
  bill: Bill,
  user: User
): void {
  if (Array.isArray(bill.kitchenDeductions) && bill.kitchenDeductions.length > 0) {
    for (const line of bill.kitchenDeductions) {
      // Look up regardless of isActive: deactivated ingredients must still
      // get their stock back.
      const ing = db.raw.kitchenIngredients.find(i => i.id === line.ingredientId);
      if (!ing) continue;
      const rounded = Number(Number(line.quantity).toFixed(3));
      if (!Number.isFinite(rounded) || rounded <= 0) continue;
      const before = ing.currentStock;
      ing.currentStock = Number((ing.currentStock + rounded).toFixed(3));
      ing.updatedAt = new Date().toISOString();
      db.recordKitchenMovement(
        ing,
        rounded,
        before,
        ing.currentStock,
        'adjustment',
        user.id,
        user.name,
        `Bill void reversal: ingredients returned for ${bill.billNumber}`,
        bill.billNumber
      );
    }
    return;
  }

  // Legacy fallback: recompute from the current recipe (best effort).
  const requirements = aggregateIngredientRequirements(
    bill.items.map(i => ({ variantId: i.variantId, quantity: i.quantity }))
  );
  if (!requirements) return;
  for (const [ing, qty] of requirements) {
    const rounded = Number(qty.toFixed(3));
    if (rounded <= 0) continue;
    const before = ing.currentStock;
    ing.currentStock = Number((ing.currentStock + rounded).toFixed(3));
    ing.updatedAt = new Date().toISOString();
    db.recordKitchenMovement(
      ing,
      rounded,
      before,
      ing.currentStock,
      'adjustment',
      user.id,
      user.name,
      `Bill void reversal: ingredients returned for ${bill.billNumber}`,
      bill.billNumber
    );
  }
}

/** Recipe cost per portion (Rs.) using current ingredient costs. */
function computeRecipeCostPerServing(recipe: KitchenRecipe): number {
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  let cost = 0;
  for (const line of recipe.items) {
    const ing = db.raw.kitchenIngredients.find(i => i.id === line.ingredientId);
    const cpu = ing ? ing.costPerUnit : 0;
    cost += (line.quantity / servings) * cpu;
  }
  return Number(cost.toFixed(2));
}

app.post('/api/bills/checkout', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const {
    items,
    orderType,
    tableNumber,
    customerName,
    customerPhone,
    discount,
    discountPercentage,
    amountReceived,
    paymentMethod,
    paymentDetails,
    notes,
    heldBillId
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cannot checkout with an empty cart.' });
  }

  // Rebuild items from the catalogue (blocks tampered prices, unknown variants, bad quantities)
  const sanitized = sanitizeOrderItems(items);
  if (sanitized.error) {
    return res.status(400).json({ error: sanitized.error });
  }
  const safeItems = sanitized.items;

  // Must stay in sync with the PaymentMethod union in src/types.ts
  const validPaymentMethods = ['cash', 'card', 'bank_transfer', 'other', 'split'];
  const safePaymentMethod = validPaymentMethods.includes(paymentMethod) ? paymentMethod : 'cash';

  // Server recomputes every money value - never trust the client
  const totals = computeOrderTotals(safeItems, { discount, discountPercentage });
  const numGrandTotal = totals.grandTotal;

  const numReceived = amountReceived === undefined || amountReceived === null || amountReceived === ''
    ? numGrandTotal
    : Number(amountReceived);

  if (!Number.isFinite(numReceived) || numReceived < 0) {
    return res.status(400).json({ error: 'Invalid amount received' });
  }

  if (safePaymentMethod === 'cash' && numReceived + 0.01 < numGrandTotal) {
    return res.status(400).json({ error: `Received amount cannot be less than Grand Total (Rs. ${numGrandTotal.toFixed(2)}).` });
  }

  // For non-cash, ensure amountReceived >= grandTotal or at least grandTotal if split not fully implemented
  if (safePaymentMethod !== 'cash' && safePaymentMethod !== 'split' && numReceived + 0.01 < numGrandTotal) {
    return res.status(400).json({ error: `Payment amount cannot be less than Grand Total (Rs. ${numGrandTotal.toFixed(2)}) for this payment method.` });
  }

  // Split cart into normal items and shot items (shots pour from the 750ml bottle stock)
  const requested = new Map<string, number>();          // non-shot variantId -> qty
  const shotMlByProduct = new Map<string, number>();    // productId -> total ml of shots requested
  const bottleQtyByProduct = new Map<string, number>(); // productId -> 750ml bottles requested directly

  for (const item of safeItems) {
    const found = findVariantById(item.variantId);
    if (!found) continue;
    if (isShotVariant(found.product, found.variant)) {
      const ml = getShotVolumeMl(found.variant) * item.quantity;
      shotMlByProduct.set(found.product.id, (shotMlByProduct.get(found.product.id) || 0) + ml);
    } else {
      requested.set(item.variantId, (requested.get(item.variantId) || 0) + item.quantity);
      if (found.product.servesShots) {
        const bottle = getBottleVariant(found.product);
        if (bottle && bottle.id === found.variant.id) {
          bottleQtyByProduct.set(found.product.id, (bottleQtyByProduct.get(found.product.id) || 0) + item.quantity);
        }
      }
    }
  }

  // Stock check (aggregate per variant so the same variant sent twice cannot oversell)
  if (!db.raw.settings.allowNegativeStock) {
    for (const [variantId, qty] of requested) {
      const found = findVariantById(variantId);
      if (found && found.variant.stock < qty) {
        return res.status(400).json({
          error: `Insufficient stock for ${found.product.name} (${found.variant.size}). Available: ${found.variant.stock}, Requested: ${qty}.`
        });
      }
    }

    // Shot check: requested shot ml must fit in the remaining 750ml bottle stock
    // (after reserving any full 750ml bottles also being sold on this bill)
    for (const [productId, neededMl] of shotMlByProduct) {
      const product = db.raw.products.find(p => p.id === productId);
      if (!product) continue;
      const reservedBottlesMl = (bottleQtyByProduct.get(productId) || 0) * BOTTLE_ML;
      const availableMl = getAvailableShotMl(product) - reservedBottlesMl;
      if (neededMl > availableMl) {
        return res.status(400).json({
          error: `Insufficient 750ml bottle stock for ${product.name} shots. Available: ${Math.max(0, availableMl)}ml, Requested: ${neededMl}ml. Shots are poured from the 750ml bottle stock.`
        });
      }
    }
  }

  // Kitchen ingredient pre-check (Food & Kitchen module): recipe-linked menu
  // items must have their ingredients available before ANY stock is touched.
  // Items without recipes are unaffected. Respects the same negative-stock
  // setting as the existing product stock check above.
  const kitchenRequirements = aggregateIngredientRequirements(
    safeItems.map(i => ({ variantId: i.variantId, quantity: i.quantity }))
  );
  if (kitchenRequirements && !db.raw.settings.allowNegativeStock) {
    for (const [ing, qty] of kitchenRequirements) {
      if (ing.currentStock + 0.001 < qty) {
        return res.status(400).json({
          error: `Insufficient kitchen ingredient: ${ing.name}. Available: ${ing.currentStock}${ing.unit}, Required: ${Number(qty.toFixed(3))}${ing.unit}. Please update the kitchen store (Stock In / Physical Count).`
        });
      }
    }
  }

  const billId = `bill-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const billNumber = db.getNextBillNumber();
  const invoiceNumber = db.getNextInvoiceNumber();

  // 1) Deduct normal (non-shot) items directly from their own stock
  for (const item of safeItems) {
    const found = findVariantById(item.variantId);
    if (found && !isShotVariant(found.product, found.variant)) {
      const beforeQty = found.variant.stock;
      found.variant.stock -= item.quantity;

      db.recordStockMovement(
        found.product.id,
        found.product.name,
        found.variant.id,
        found.variant.size,
        -item.quantity,
        beforeQty,
        found.variant.stock,
        'sale',
        user.id,
        user.name,
        `Sale on ${billNumber} / ${invoiceNumber}`,
        billId
      );
    }
  }

  // 2) Deduct shot sales (100ml / 50ml / 25ml) from the 750ml bottle total stock
  for (const [productId, totalMl] of shotMlByProduct) {
    const product = db.raw.products.find(p => p.id === productId);
    if (product) {
      deductShotMl(product, totalMl, user, `Sale on ${billNumber} / ${invoiceNumber}`, billId);
    }
  }

  // 3) Auto-deduct recipe ingredients from the kitchen store (Food & Kitchen
  //    module). Runs only when recipe-linked items were sold; every deduction
  //    gets a kitchen movement ledger record. Cashier never enters ingredients.
  //    The exact deductions are snapshotted on the bill so a later void can
  //    restore precisely what was deducted, even if the recipe was edited or
  //    archived in the meantime.
  let kitchenDeductions: KitchenDeductionSnapshot[] | undefined;
  if (kitchenRequirements) {
    deductKitchenIngredientsForSale(kitchenRequirements, user, billNumber, billId);
    kitchenDeductions = [];
    for (const [ing, qty] of kitchenRequirements) {
      const rounded = Number(qty.toFixed(3));
      if (rounded > 0) {
        kitchenDeductions.push({
          ingredientId: ing.id,
          ingredientName: ing.name,
          unit: ing.unit,
          quantity: rounded,
        });
      }
    }
    if (kitchenDeductions.length === 0) kitchenDeductions = undefined;
  }

  const snapshotItems: OrderItem[] = safeItems;

  const newBill: Bill = {
    id: billId,
    billNumber,
    invoiceNumber,
    orderType: orderType || 'dine_in',
    tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
    customerName: customerName ? String(customerName).slice(0, 128) : undefined,
    customerPhone: customerPhone ? String(customerPhone).slice(0, 32) : undefined,
    cashierId: user.id,
    cashierName: user.name,
    items: snapshotItems,
    subtotal: totals.subtotal,
    discount: totals.discount,
    discountPercentage: totals.discountPercentage,
    tax: totals.tax,
    taxRate: totals.taxRate,
    serviceCharge: totals.serviceCharge,
    serviceChargeRate: totals.serviceChargeRate,
    grandTotal: numGrandTotal,
    amountReceived: numReceived,
    changeAmount: Number(Math.max(0, numReceived - numGrandTotal).toFixed(2)),
    paymentMethod: safePaymentMethod,
    paymentDetails: paymentDetails || undefined,
    status: 'paid',
    notes: notes ? String(notes).slice(0, 1000) : undefined,
    kitchenDeductions,
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString()
  };

  db.raw.bills.unshift(newBill);

  if (heldBillId) {
    const heldIndex = db.raw.heldBills.findIndex(h => h.id === heldBillId);
    if (heldIndex !== -1) {
      db.raw.heldBills.splice(heldIndex, 1);
    }
  }

  db.save();

  db.logAudit(
    user.id,
    user.name,
    user.role,
    'COMPLETE_SALE',
    'BILL',
    newBill.id,
    `Completed sale ${newBill.billNumber} (${newBill.invoiceNumber}) - Total: Rs. ${newBill.grandTotal} via ${newBill.paymentMethod.toUpperCase()}`
  );

  res.status(201).json(newBill);
});

app.post('/api/bills/:id/void', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { reason } = req.body;
  const bill = db.raw.bills.find(b => b.id === req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  if (bill.status === 'voided' || bill.status === 'cancelled') {
    return res.status(400).json({ error: 'Bill is already voided or cancelled.' });
  }

  bill.status = 'voided';

  // Restore shot ml back to the 750ml bottle pool; restore normal items to their own stock
  const shotMlToRestore = new Map<string, number>();

  for (const item of bill.items) {
    const found = findVariantById(item.variantId);
    if (!found) continue;

    if (isShotVariant(found.product, found.variant)) {
      const ml = getShotVolumeMl(found.variant) * item.quantity;
      shotMlToRestore.set(found.product.id, (shotMlToRestore.get(found.product.id) || 0) + ml);
      continue;
    }

    const beforeQty = found.variant.stock;
    found.variant.stock += item.quantity;

    db.recordStockMovement(
      found.product.id,
      found.product.name,
      found.variant.id,
      found.variant.size,
      item.quantity,
      beforeQty,
      found.variant.stock,
      'return',
      user.id,
      user.name,
      `Bill void reversal: ${bill.billNumber} (${reason ? String(reason).slice(0, 500) : 'Admin void'})`,
      bill.id
    );
  }

  for (const [productId, totalMl] of shotMlToRestore) {
    const product = db.raw.products.find(p => p.id === productId);
    if (product) {
      restoreShotMl(product, totalMl, user, `Bill void reversal: ${bill.billNumber}`, bill.id);
    }
  }

  // Food & Kitchen module: return recipe ingredients that were auto-deducted
  // for this bill's recipe-linked items (with movement ledger records).
  restoreKitchenIngredientsForVoid(bill, user);

  db.save();
  db.logAudit(user.id, user.name, user.role, 'VOID_BILL', 'BILL', bill.id, `Voided bill ${bill.billNumber}. Reason: ${reason ? String(reason).slice(0, 500) : 'Not specified'}`);

  res.json({ message: 'Bill has been voided and stock was successfully restored.', bill });
});

// ==========================================
// REPORTS & ANALYTICS
// ==========================================

/** Resolves a `period` shortcut (today / week / month / year) into a date range. */
function resolvePeriodRange(period?: string): { start?: number; end?: number } {
  if (!period || period === 'all' || period === 'custom') return {};
  const now = new Date();
  const end = now.getTime();
  switch (period) {
    case 'today':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), end };
    case 'week': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - 6);
      return { start: d.getTime(), end };
    }
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end };
    case 'year':
      return { start: new Date(now.getFullYear(), 0, 1).getTime(), end };
    default:
      return {};
  }
}

const reportsSummaryHandler = (req: Request, res: Response) => {
  const { startDate, endDate, cashierId, period } = req.query;

  let filteredBills = db.raw.bills.filter(b => b.status === 'paid');

  // `period=today|week|month|year` used by the Reports screen.
  const range = resolvePeriodRange(typeof period === 'string' ? period : undefined);
  if (range.start !== undefined) {
    filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() >= range.start!);
  }
  if (range.end !== undefined) {
    filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() <= range.end!);
  }

  if (startDate) {
    const start = new Date(startDate as string).getTime();
    if (!isNaN(start)) filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() >= start);
  }
  if (endDate) {
    // A plain YYYY-MM-DD end date must include the whole day
    const raw = String(endDate);
    const parsed = new Date(raw);
    const end = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parsed.getTime() + 86399999 : parsed.getTime();
    if (!isNaN(end)) filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() <= end);
  }
  if (cashierId && cashierId !== 'all') {
    filteredBills = filteredBills.filter(b => b.cashierId === cashierId);
  }

  const totalSales = filteredBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalBills = filteredBills.length;
  const totalDiscount = filteredBills.reduce((sum, b) => sum + (b.discount || 0), 0);
  const totalTax = filteredBills.reduce((sum, b) => sum + (b.tax || 0), 0);
  const totalServiceCharge = filteredBills.reduce((sum, b) => sum + (b.serviceCharge || 0), 0);
  const averageBill = totalBills > 0 ? totalSales / totalBills : 0;

  const paymentBreakdown: Record<string, { count: number; total: number }> = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    bank_transfer: { count: 0, total: 0 },
    other: { count: 0, total: 0 },
    split: { count: 0, total: 0 }
  };

  filteredBills.forEach(b => {
    const method = b.paymentMethod || 'cash';
    if (!paymentBreakdown[method]) {
      paymentBreakdown[method] = { count: 0, total: 0 };
    }
    paymentBreakdown[method].count++;
    paymentBreakdown[method].total += b.grandTotal;
  });

  const productSalesMap: Record<string, { productId: string; name: string; size: string; quantity: number; revenue: number }> = {};
  filteredBills.forEach(b => {
    b.items.forEach(item => {
      const key = `${item.productId}_${item.variantId}`;
      if (!productSalesMap[key]) {
        productSalesMap[key] = {
          productId: item.productId,
          name: item.productName,
          size: item.size,
          quantity: 0,
          revenue: 0
        };
      }
      productSalesMap[key].quantity += item.quantity;
      productSalesMap[key].revenue += item.total;
    });
  });

  const topSellingProducts = Object.values(productSalesMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const cashierSalesMap: Record<string, { cashierId: string; cashierName: string; billsCount: number; totalSales: number }> = {};
  filteredBills.forEach(b => {
    if (!cashierSalesMap[b.cashierId]) {
      cashierSalesMap[b.cashierId] = {
        cashierId: b.cashierId,
        cashierName: b.cashierName,
        billsCount: 0,
        totalSales: 0
      };
    }
    cashierSalesMap[b.cashierId].billsCount++;
    cashierSalesMap[b.cashierId].totalSales += b.grandTotal;
  });

  res.json({
    summary: {
      totalSales,
      totalBills,
      totalDiscount,
      totalTax,
      totalServiceCharge,
      averageBill
    },
    paymentBreakdown,
    topSellingProducts,
    cashierBreakdown: Object.values(cashierSalesMap),
    bills: filteredBills
  });
};

// Both paths are supported: the Reports screen calls /summary, older clients call /analytics
app.get('/api/reports/analytics', authMiddleware, requireRole('super_admin'), reportsSummaryHandler);
app.get('/api/reports/summary', authMiddleware, requireRole('super_admin'), reportsSummaryHandler);

// Daily Stock Sheet - IMPROVED LOGIC
app.get('/api/reports/daily-stock-sheet', authMiddleware, (req: Request, res: Response) => {
  const targetDate = req.query.date ? String(req.query.date) : new Date().toISOString().split('T')[0];
  const categoryFilter = req.query.categoryId ? String(req.query.categoryId) : 'all';
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const typeFilter = req.query.type ? String(req.query.type) : 'all';

  const formattedDate = targetDate.replace(/-/g, '.');

  const paidBillsOnDate = db.raw.bills.filter(b => {
    if (b.status !== 'paid') return false;
    const billDate = (b.paidAt || b.createdAt).split('T')[0];
    return billDate === targetDate;
  });

  const soldMap: Record<string, number> = {};
  paidBillsOnDate.forEach(b => {
    b.items.forEach(item => {
      soldMap[item.variantId] = (soldMap[item.variantId] || 0) + (Number(item.quantity) || 0);
    });
  });

  // Calculate received, adjustments and the exact net stock change of the day
  const receivedMap: Record<string, number> = {};
  const adjustmentMap: Record<string, number> = {};
  const netChangeMap: Record<string, number> = {};

  db.raw.stockMovements.forEach(m => {
    const movDate = m.createdAt.split('T')[0];
    if (movDate !== targetDate) return;

    const change = Number(m.quantityChange) || 0;
    // 'opening_stock' is the baseline inventory seed itself, not day activity
    if (m.movementType !== 'opening_stock') {
      netChangeMap[m.variantId] = (netChangeMap[m.variantId] || 0) + change;
    }

    if (m.movementType === 'stock_in' || m.movementType === 'purchase') {
      receivedMap[m.variantId] = (receivedMap[m.variantId] || 0) + change;
    } else if (m.movementType === 'adjustment' && m.quantityChange > 0) {
      receivedMap[m.variantId] = (receivedMap[m.variantId] || 0) + change;
    } else if (m.movementType === 'adjustment') {
      adjustmentMap[m.variantId] = (adjustmentMap[m.variantId] || 0) + change;
    }
  });

  const categoriesMap = new Map(db.raw.categories.map(c => [c.id, c]));
  const companiesMap = new Map(db.raw.companies.map(c => [c.id, c.name]));
  const items: any[] = [];
  let rowNo = 1;

  let totalInHand = 0;
  let totalReceived = 0;
  let totalStock = 0;
  let totalBalance = 0;
  let totalSold = 0;
  let totalValue = 0;

  let allDepartmentTotal = 0;
  let allDepartmentBar = 0;
  let allDepartmentRestaurant = 0;

  db.raw.products.forEach(p => {
    if (p.isArchived || !p.isActive) return;
    
    const cat = categoriesMap.get(p.categoryId);
    const compName = p.companyId ? companiesMap.get(p.companyId) || 'In-House / Other' : 'In-House / Other';
    const isKitchen = Boolean(p.isKitchenItem || cat?.type === 'restaurant');

    p.variants.forEach(v => {
      if (!v.isActive) return;

      allDepartmentTotal++;
      if (isKitchen) {
        allDepartmentRestaurant++;
      } else {
        allDepartmentBar++;
      }

      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return;
      if (typeFilter === 'bar' && isKitchen) return;
      if (typeFilter === 'restaurant' && !isKitchen) return;

      const cleanProdName = p.name.replace(/Arrack|Brandy|Whisky|Vodka|Beer|DCSL|DCSCL/gi, '').trim();
      const cleanSize = v.size.replace(/Bottle|Flask|Quarter|Half|Large|Portion|Double|Single|Peg/gi, '').trim();
      const displayName = `${cleanProdName || p.name} ${cleanSize}`.trim();

      if (search && !p.name.toLowerCase().includes(search) && !displayName.toLowerCase().includes(search) && !v.sku.toLowerCase().includes(search)) {
        return;
      }

      const sold = soldMap[v.id] || 0;
      const received = receivedMap[v.id] || 0;
      const adjustments = adjustmentMap[v.id] || 0;
      // Shot sizes: balance = shots still pourable from the 750ml bottle stock
      const isShot = isShotVariant(p, v);
      const shotVol = isShot ? getShotVolumeMl(v) : 0;
      const balance = isShot && shotVol > 0
        ? Math.floor(Math.max(0, getAvailableShotMl(p)) / shotVol)
        : v.stock;
      // Exact opening stock from the movement ledger: closing − Σ(quantityChange of the day).
      // Every stock change (sales, damage/breakage, expiry, manual stock-out, adjustments,
      // bottles emptied by shot sales, void returns) writes a movement, so this balances
      // for ALL movement types. Shot rows keep the derived approximation (their units come
      // from the shared 750ml pool, not their own movements).
      const netChange = netChangeMap[v.id] || 0;
      const inHand = isShot
        ? Math.max(0, balance + sold - received - adjustments)
        : Math.max(0, Number((balance - netChange).toFixed(2)));
      const stock = inHand + received;
      const price = v.sellingPrice;
      const value = sold * price;

      // Countable physical stock: exclude auto-derived shot variants from physical unit totals to avoid double counting bottles
      if (!isShot) {
        totalInHand += inHand;
        totalReceived += received;
        totalStock += stock;
        totalBalance += balance;
      }
      totalSold += sold;
      totalValue += value;

      items.push({
        no: rowNo++,
        productId: p.id,
        variantId: v.id,
        productName: p.name,
        companyName: compName,
        categoryName: cat?.name || 'Bar',
        size: v.size,
        displayName: displayName || `${p.name} (${v.size})`,
        inHand,
        received,
        stock,
        balance,
        sold,
        price,
        value,
        costPrice: v.costPrice,
        isKitchenItem: p.isKitchenItem,
        isShot: isShot || undefined
      });
    });
  });

  res.json({
    date: targetDate,
    formattedDate,
    totalInHand,
    totalReceived,
    totalStock,
    totalBalance,
    totalSold,
    totalValue,
    departmentCounts: {
      total: allDepartmentTotal,
      bar: allDepartmentBar,
      restaurant: allDepartmentRestaurant
    },
    items
  });
});

app.post('/api/reports/daily-stock-sheet/reconcile', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const { adjustments, reason } = req.body;
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    return res.status(400).json({ error: 'No adjustments provided' });
  }

  const currentUser = (req as any).user;
  let updatedCount = 0;

  for (const adj of adjustments as { variantId: string; newBalance: number }[]) {
    const newBal = Number(adj.newBalance);
    if (isNaN(newBal) || newBal < 0 || newBal > 1000000) continue;

    const found = findVariantById(adj.variantId);
    if (found) {
      // Shot sizes have no independent stock — reconcile the 750ml bottle row instead
      if (isShotVariant(found.product, found.variant)) continue;
      const qtyBefore = found.variant.stock;
      const diff = newBal - qtyBefore;
      if (diff !== 0) {
        found.variant.stock = newBal;
        db.raw.stockMovements.unshift({
          id: `mov-audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          productId: found.product.id,
          productName: found.product.name,
          variantId: found.variant.id,
          variantSize: found.variant.size,
          quantityChange: diff,
          quantityBefore: qtyBefore,
          quantityAfter: newBal,
          movementType: 'adjustment',
          reason: (reason && typeof reason === 'string') ? reason.slice(0, 500) : 'Daily Stock Sheet Physical Audit Reconciliation',
          userId: currentUser.id,
          userName: currentUser.name,
          createdAt: new Date().toISOString()
        });
        updatedCount++;
      }
    }
  }

  db.save();
  db.logAudit(
    currentUser.id,
    currentUser.name,
    currentUser.role,
    'DAILY_SHEET_RECONCILE',
    'INVENTORY',
    undefined,
    `Reconciled ${updatedCount} items via Daily Stock Sheet audit`
  );

  res.json({
    success: true,
    updatedCount,
    message: `Successfully updated ${updatedCount} stock item(s) from physical sheet.`
  });
});

// ==========================================
// ROOMS & ROOM BOOKINGS API
// ==========================================

app.get('/api/rooms', authMiddleware, (req: Request, res: Response) => {
  try {
    const { status, floor, type } = req.query;
    let rooms = db.raw.rooms || [];

    if (status && status !== 'all') {
      rooms = rooms.filter(r => r.status === status);
    }
    if (floor && floor !== 'all') {
      rooms = rooms.filter(r => r.floor === floor);
    }
    if (type && type !== 'all') {
      rooms = rooms.filter(r => r.roomType === type);
    }

    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch rooms.' });
  }
});

app.post('/api/rooms', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { roomNumber, roomType, floor, capacity, ratePerDay, rateHalfDay, amenities, status, notes } = req.body;

    if (!roomNumber || typeof roomNumber !== 'string' || !roomNumber.trim() || !roomType || !ratePerDay) {
      return res.status(400).json({ error: 'Room number, type, and daily rate are required.' });
    }

    const rate = Number(ratePerDay);
    if (isNaN(rate) || rate <= 0 || rate > 1000000) {
      return res.status(400).json({ error: 'Invalid daily rate (must be 1-1,000,000)' });
    }

    const existing = db.raw.rooms.find(r => r.roomNumber.trim().toLowerCase() === roomNumber.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: `Room number ${roomNumber} already exists.` });
    }

    const newRoom: Room = {
      id: `room-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      roomNumber: roomNumber.trim().slice(0, 32),
      roomType: roomType.trim().slice(0, 128),
      floor: floor?.trim().slice(0, 64) || 'Ground Floor',
      capacity: Math.max(1, Math.min(20, Number(capacity) || 2)),
      ratePerDay: rate,
      rateHalfDay: rateHalfDay ? Math.max(0, Number(rateHalfDay)) : undefined,
      amenities: Array.isArray(amenities) ? amenities.map((a: any) => String(a).slice(0, 64)).slice(0, 20) : ['AC', 'Attached Bathroom', 'Free Wi-Fi'],
      status: status && ['available', 'occupied', 'reserved', 'cleaning', 'maintenance'].includes(status) ? status : 'available',
      notes: notes?.trim().slice(0, 1000) || '',
      isActive: true,
      createdAt: new Date().toISOString()
    };

    db.raw.rooms.push(newRoom);
    db.save();

    db.logAudit(user.id, user.name, user.role, 'CREATE_ROOM', 'ROOM', newRoom.id, `Created Room ${newRoom.roomNumber} (${newRoom.roomType}) at Rs. ${newRoom.ratePerDay}/day`);

    res.status(201).json(newRoom);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create room.' });
  }
});

app.put('/api/rooms/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const room = db.raw.rooms.find(r => r.id === id);

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const { roomNumber, roomType, floor, capacity, ratePerDay, rateHalfDay, amenities, status, notes, isActive } = req.body;

    // Cashiers may only flip housekeeping status (available / cleaning / maintenance ...).
    // Rates, room numbers and other master data stay Super Admin only.
    if (user.role !== 'super_admin') {
      const adminOnlyFields = [roomNumber, roomType, floor, capacity, ratePerDay, rateHalfDay, amenities, isActive];
      if (adminOnlyFields.some(f => f !== undefined)) {
        return res.status(403).json({ error: 'Access Denied: Only a Super Admin can edit room details or rates.' });
      }
    }

    if (roomNumber && typeof roomNumber === 'string' && roomNumber.trim().toLowerCase() !== room.roomNumber.toLowerCase()) {
      const existing = db.raw.rooms.find(r => r.id !== id && r.roomNumber.trim().toLowerCase() === roomNumber.trim().toLowerCase());
      if (existing) {
        return res.status(400).json({ error: `Room number ${roomNumber} is already used by another room.` });
      }
      room.roomNumber = roomNumber.trim().slice(0, 32);
    }

    if (roomType !== undefined && typeof roomType === 'string') room.roomType = roomType.trim().slice(0, 128);
    if (floor !== undefined && typeof floor === 'string') room.floor = floor.trim().slice(0, 64);
    if (capacity !== undefined) room.capacity = Math.max(1, Math.min(20, Number(capacity) || 2));
    if (ratePerDay !== undefined) {
      const rate = Number(ratePerDay);
      if (!isNaN(rate) && rate > 0 && rate <= 1000000) room.ratePerDay = rate;
    }
    if (rateHalfDay !== undefined) room.rateHalfDay = rateHalfDay ? Math.max(0, Number(rateHalfDay)) : undefined;
    if (amenities !== undefined && Array.isArray(amenities)) room.amenities = amenities.map((a: any) => String(a).slice(0, 64)).slice(0, 20);
    if (status !== undefined && ['available', 'occupied', 'reserved', 'cleaning', 'maintenance'].includes(status)) room.status = status;
    if (notes !== undefined && typeof notes === 'string') room.notes = notes.slice(0, 1000);
    if (isActive !== undefined) room.isActive = Boolean(isActive);

    db.save();

    db.logAudit(user.id, user.name, user.role, 'UPDATE_ROOM', 'ROOM', room.id, `Updated details/status for Room ${room.roomNumber} (Status: ${room.status})`);

    res.json(room);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update room.' });
  }
});

app.delete('/api/rooms/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const index = db.raw.rooms.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const room = db.raw.rooms[index];
    if (room.status === 'occupied') {
      return res.status(400).json({ error: 'Cannot delete an occupied room. Check-out the guest first.' });
    }

    db.raw.rooms.splice(index, 1);
    db.save();

    db.logAudit(user.id, user.name, user.role, 'DELETE_ROOM', 'ROOM', id, `Deleted Room ${room.roomNumber} (${room.roomType})`);

    res.json({ success: true, message: `Room ${room.roomNumber} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete room.' });
  }
});

app.get('/api/room-bookings', authMiddleware, (req: Request, res: Response) => {
  try {
    const { status, roomId, search } = req.query;
    let bookings = db.raw.roomBookings || [];

    if (status && status !== 'all') {
      bookings = bookings.filter(b => b.status === status);
    }
    if (roomId && roomId !== 'all') {
      bookings = bookings.filter(b => b.roomId === roomId);
    }
    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      bookings = bookings.filter(
        b =>
          b.bookingNumber.toLowerCase().includes(q) ||
          b.guestName.toLowerCase().includes(q) ||
          b.guestPhone.toLowerCase().includes(q) ||
          b.guestIdOrPassport.toLowerCase().includes(q) ||
          b.roomNumber.toLowerCase().includes(q)
      );
    }

    bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(bookings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch room bookings.' });
  }
});

app.post('/api/room-bookings', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const {
      roomId, guestName, guestPhone, guestIdOrPassport, guestAddress,
      numberOfGuests, checkInDate, checkOutDate, durationDays,
      ratePerDay, extraCharges, discount, tax, advancePaid,
      paymentMethod, paymentDetails, status, notes
    } = req.body;

    if (!roomId || !guestName || typeof guestName !== 'string' || !guestName.trim() || !guestPhone) {
      return res.status(400).json({ error: 'Room, Guest Name, and Phone Number are required.' });
    }

    const room = db.raw.rooms.find(r => r.id === roomId);
    if (!room) {
      return res.status(404).json({ error: 'Selected room not found.' });
    }

    if (room.status === 'occupied') {
      return res.status(400).json({ error: `Room ${room.roomNumber} is currently occupied.` });
    }

    if (room.status === 'maintenance') {
      return res.status(400).json({ error: `Room ${room.roomNumber} is under maintenance and cannot be booked.` });
    }

    // Guard against double-booking a room that already has an active (confirmed / checked-in)
    // booking - previously the second booking silently orphaned the first one.
    const activeBooking = (db.raw.roomBookings || []).find(
      b => b.roomId === room.id && (b.status === 'confirmed' || b.status === 'checked_in')
    );
    if (activeBooking) {
      return res.status(400).json({
        error: `Room ${room.roomNumber} already has an active booking (${activeBooking.bookingNumber}). Check out or cancel it first.`
      });
    }

    // Validate dates
    const checkIn = checkInDate ? new Date(checkInDate) : new Date();
    const checkOut = checkOutDate ? new Date(checkOutDate) : new Date(Date.now() + 86400000);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return res.status(400).json({ error: 'Invalid check-in or check-out date' });
    }
    if (checkOut <= checkIn) {
      return res.status(400).json({ error: 'Check-out date must be after check-in date' });
    }
    const calculatedDays = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000));
    const days = Math.max(1, Number(durationDays) || calculatedDays);

    const dailyRate = Math.max(0, Number(ratePerDay) || room.ratePerDay);
    const totalRoomCharge = days * dailyRate;
    const extra = Math.max(0, Number(extraCharges) || 0);
    const disc = Math.max(0, Number(discount) || 0);
    const taxAmt = Math.max(0, Number(tax) || 0);
    const grandTotal = Math.max(0, totalRoomCharge + extra + taxAmt - disc);
    const advance = Math.max(0, Number(advancePaid) || 0);
    if (advance > grandTotal) {
      return res.status(400).json({ error: 'Advance cannot exceed grand total' });
    }
    const balanceDue = Math.max(0, grandTotal - advance);

    const bookingStatus = status && ['confirmed', 'checked_in', 'checked_out', 'cancelled'].includes(status) ? status : 'checked_in';
    const bookingNumber = db.getNextBookingNumber();

    const booking: RoomBooking = {
      id: `rbk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      bookingNumber,
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      guestName: guestName.trim().slice(0, 128),
      guestPhone: String(guestPhone).trim().slice(0, 32),
      guestIdOrPassport: (guestIdOrPassport || '').trim().slice(0, 64),
      guestAddress: (guestAddress || '').trim().slice(0, 500),
      numberOfGuests: Math.max(1, Math.min(20, Number(numberOfGuests) || 2)),
      checkInDate: checkIn.toISOString(),
      checkOutDate: checkOut.toISOString(),
      durationDays: days,
      ratePerDay: dailyRate,
      totalRoomCharge,
      extraCharges: extra,
      discount: disc,
      tax: taxAmt,
      grandTotal,
      advancePaid: advance,
      balanceDue,
      paymentMethod: paymentMethod || 'cash',
      paymentDetails,
      status: bookingStatus,
      cashierId: user.id,
      cashierName: user.name,
      notes: notes ? String(notes).slice(0, 1000) : '',
      createdAt: new Date().toISOString(),
      checkedInAt: bookingStatus === 'checked_in' ? new Date().toISOString() : undefined
    };

    if (!Array.isArray(db.raw.roomBookings)) {
      db.raw.roomBookings = [];
    }
    db.raw.roomBookings.unshift(booking);

    room.status = bookingStatus === 'checked_in' ? 'occupied' : 'reserved';
    room.currentBookingId = booking.id;
    room.currentGuestName = booking.guestName;
    room.currentGuestPhone = booking.guestPhone;

    db.save();

    db.logAudit(user.id, user.name, user.role, 'ROOM_BOOKING_CREATED', 'ROOM_BOOKING', booking.id, `Created Booking ${booking.bookingNumber} for Room ${room.roomNumber} - Guest: ${booking.guestName} (Total: Rs. ${booking.grandTotal}, Advance: Rs. ${booking.advancePaid})`);

    res.status(201).json({ success: true, booking, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create room booking.' });
  }
});

app.put('/api/room-bookings/:id/checkout', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const { paymentMethod, additionalCharges, finalPaymentAmount, notes } = req.body;

    const booking = db.raw.roomBookings.find(b => b.id === id);
    if (!booking) {
      return res.status(404).json({ error: 'Room booking not found.' });
    }

    if (booking.status === 'checked_out') {
      return res.status(400).json({ error: 'This booking is already checked out.' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'This booking was cancelled and cannot be checked out.' });
    }

    // Validate everything BEFORE mutating the booking.
    // Previously extra charges were applied and then the request could still be rejected,
    // leaving the booking totals corrupted in memory.
    const rawAdd = Number(additionalCharges);
    const add = Number.isFinite(rawAdd) && rawAdd > 0 ? Math.min(rawAdd, 10000000) : 0;

    const newGrandTotal = Number((booking.grandTotal + add).toFixed(2));
    const newBalanceDue = Number(Math.max(0, newGrandTotal - booking.advancePaid).toFixed(2));

    const rawFinal = Number(finalPaymentAmount);
    const finalPay = Number.isFinite(rawFinal) && rawFinal > 0 ? Number(rawFinal.toFixed(2)) : newBalanceDue;
    if (finalPay > newBalanceDue + 0.01) {
      return res.status(400).json({ error: `Final payment cannot exceed balance due (Rs. ${newBalanceDue.toFixed(2)}).` });
    }

    booking.extraCharges = Number((booking.extraCharges + add).toFixed(2));
    booking.grandTotal = newGrandTotal;
    booking.advancePaid = Number((booking.advancePaid + finalPay).toFixed(2));
    booking.balanceDue = Number(Math.max(0, booking.grandTotal - booking.advancePaid).toFixed(2));
    booking.status = 'checked_out';
    booking.checkedOutAt = new Date().toISOString();
    if (paymentMethod) booking.paymentMethod = paymentMethod;
    if (notes && typeof notes === 'string') booking.notes = (booking.notes ? booking.notes + ' | ' : '') + notes.slice(0, 500);

    const room = db.raw.rooms.find(r => r.id === booking.roomId);
    if (room) {
      room.status = 'cleaning';
      room.currentBookingId = undefined;
      room.currentGuestName = undefined;
      room.currentGuestPhone = undefined;
    }

    db.save();

    db.logAudit(user.id, user.name, user.role, 'ROOM_CHECKOUT', 'ROOM_BOOKING', booking.id, `Guest ${booking.guestName} checked out from Room ${booking.roomNumber}. Final Settlement: Rs. ${finalPay}. Room marked for cleaning.`);

    res.json({ success: true, booking, room, message: `Room ${booking.roomNumber} checkout completed successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to checkout room.' });
  }
});

app.put('/api/room-bookings/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const { reason } = req.body;

    const booking = db.raw.roomBookings.find(b => b.id === id);
    if (!booking) {
      return res.status(404).json({ error: 'Room booking not found.' });
    }

    if (booking.status === 'checked_out') {
      return res.status(400).json({ error: 'Cannot cancel already checked out booking' });
    }

    booking.status = 'cancelled';
    if (reason && typeof reason === 'string') {
      booking.notes = (booking.notes ? booking.notes + ' | Cancel Reason: ' : 'Cancel Reason: ') + reason.slice(0, 500);
    }

    const room = db.raw.rooms.find(r => r.id === booking.roomId);
    if (room && (room.currentBookingId === booking.id || room.status === 'occupied' || room.status === 'reserved')) {
      room.status = 'available';
      room.currentBookingId = undefined;
      room.currentGuestName = undefined;
      room.currentGuestPhone = undefined;
    }

    db.save();

    db.logAudit(user.id, user.name, user.role, 'ROOM_BOOKING_CANCELLED', 'ROOM_BOOKING', booking.id, `Cancelled booking ${booking.bookingNumber} for Room ${booking.roomNumber}. Reason: ${reason ? String(reason).slice(0, 500) : 'N/A'}`);

    res.json({ success: true, booking, room, message: `Booking ${booking.bookingNumber} cancelled.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel booking.' });
  }
});

app.post('/api/room-bookings/:id/payment', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const { amount, paymentMethod, notes } = req.body;

    const booking = db.raw.roomBookings.find(b => b.id === id);
    if (!booking) {
      return res.status(404).json({ error: 'Room booking not found.' });
    }

    if (booking.status === 'checked_out' || booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot add payment to checked out or cancelled booking' });
    }

    const payAmt = Number(amount) || 0;
    if (!Number.isFinite(payAmt) || payAmt <= 0 || payAmt > 1000000) {
      return res.status(400).json({ error: 'Payment amount must be between 1 and 1,000,000.' });
    }
    if (payAmt > booking.balanceDue) {
      return res.status(400).json({ error: `Payment exceeds balance due (Rs. ${booking.balanceDue})` });
    }

    booking.advancePaid += payAmt;
    booking.balanceDue = Math.max(0, booking.grandTotal - booking.advancePaid);
    if (notes && typeof notes === 'string') {
      booking.notes = (booking.notes ? booking.notes + ' | Payment: ' : 'Payment: ') + `${payAmt} (${paymentMethod || 'Cash'}) - ${notes.slice(0, 500)}`;
    }

    db.save();

    db.logAudit(user.id, user.name, user.role, 'ROOM_BOOKING_PAYMENT', 'ROOM_BOOKING', booking.id, `Received payment of Rs. ${payAmt} for Room ${booking.roomNumber} (${booking.bookingNumber})`);

    res.json({ success: true, booking, message: `Payment of Rs. ${payAmt} recorded.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to record payment.' });
  }
});

app.get('/api/dashboard/stats', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const allPaidBills = db.raw.bills.filter(b => b.status === 'paid');
  const todayBills = allPaidBills.filter(b => new Date(b.paidAt || b.createdAt).getTime() >= todayStart);

  const todayRevenue = todayBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalRevenue = allPaidBills.reduce((sum, b) => sum + b.grandTotal, 0);

  const todayPaymentBreakdown: Record<string, { count: number; total: number }> = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    bank_transfer: { count: 0, total: 0 },
    other: { count: 0, total: 0 }
  };
  todayBills.forEach(b => {
    const method = b.paymentMethod || 'cash';
    if (!todayPaymentBreakdown[method]) {
      todayPaymentBreakdown[method] = { count: 0, total: 0 };
    }
    todayPaymentBreakdown[method].count++;
    todayPaymentBreakdown[method].total += b.grandTotal;
  });

  let lowStockCount = 0;
  let outOfStockCount = 0;
  const lowStockItems: any[] = [];

  db.raw.products.forEach(p => {
    if (p.isArchived || !p.isActive) return;
    p.variants.forEach(v => {
      if (!v.isActive) return;
      // Shot sizes have no independent stock (they pour from the 750ml bottle) — skip alerts
      if (isShotVariant(p, v)) return;
      if (v.stock <= 0) {
        outOfStockCount++;
        lowStockItems.push({
          productId: p.id,
          productName: p.name,
          size: v.size,
          stock: v.stock,
          minStock: v.minStockLevel,
          status: 'OUT_OF_STOCK'
        });
      } else if (v.stock <= v.minStockLevel) {
        lowStockCount++;
        lowStockItems.push({
          productId: p.id,
          productName: p.name,
          size: v.size,
          stock: v.stock,
          minStock: v.minStockLevel,
          status: 'LOW_STOCK'
        });
      }
    });
  });

  res.json({
    todayRevenue,
    todayBillsCount: todayBills.length,
    totalRevenue,
    totalBillsCount: allPaidBills.length,
    activeHeldBillsCount: db.raw.heldBills.length,
    pendingKOTCount: db.raw.kots.filter(k => k.status === 'pending' || k.status === 'preparing').length,
    lowStockCount,
    outOfStockCount,
    lowStockItems: lowStockItems.slice(0, 8),
    recentBills: allPaidBills.slice(0, 10),
    todayPaymentBreakdown,
    activeCashiers: db.raw.users.filter(u => u.role === 'cashier' && u.isActive).map(({ passwordHash, ...u }) => u)
  });
});

// ==========================================
// FOOD & KITCHEN MODULE API (v1.2.0 — Kitchen Manager role)
// ==========================================
// Every endpoint: authenticateUser → requireKitchenPermission → controller → db.
// Kitchen data is isolated: cashiers get 403 on ALL of these; kitchen managers
// get 403 on every Super Admin endpoint (users, settings, reports, inventory,
// backups, …). High-risk approvals are Super Admin only (requireKitchenAdmin).

/** Per-line variance cost above this requires Super Admin approval (Rs.). */
const KITCHEN_ADJUSTMENT_APPROVAL_THRESHOLD = 5000;

function sanitizeKitchenIngredientInput(body: any): { ok: true; value: { name: string; unit: string; currentStock: number; minStockLevel: number; costPerUnit: number; openingReason?: string } } | { ok: false; error: string } {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const unit = typeof body?.unit === 'string' ? body.unit.trim() : '';
  const currentStock = Number(body?.currentStock);
  const minStockLevel = Number(body?.minStockLevel ?? 0);
  const costPerUnit = Number(body?.costPerUnit);

  if (name.length < 2 || name.length > 128) return { ok: false, error: 'Ingredient name must be 2-128 characters.' };
  if (!unit || unit.length > 16) return { ok: false, error: 'Unit is required (e.g. g, kg, ml, l, pcs) — max 16 characters.' };
  if (!Number.isFinite(currentStock) || currentStock < 0 || currentStock > 10000000) return { ok: false, error: 'Current stock must be a number between 0 and 10,000,000.' };
  if (!Number.isFinite(minStockLevel) || minStockLevel < 0 || minStockLevel > 1000000) return { ok: false, error: 'Minimum stock level must be a number between 0 and 1,000,000.' };
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0 || costPerUnit > 1000000) return { ok: false, error: 'Cost per unit must be a number between 0 and 1,000,000.' };

  return {
    ok: true,
    value: {
      name,
      unit,
      currentStock: Number(currentStock.toFixed(3)),
      minStockLevel: Number(minStockLevel.toFixed(3)),
      costPerUnit: Number(costPerUnit.toFixed(2)),
      openingReason: typeof body?.openingReason === 'string' ? body.openingReason.slice(0, 500) : undefined,
    }
  };
}

/** ---- Kitchen Dashboard (Kitchen-scoped ONLY — no system-wide financials) ---- */
app.get('/api/kitchen/dashboard', authMiddleware, requireKitchenPermission('KITCHEN_DASHBOARD_VIEW'), (req: Request, res: Response) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Food sales TODAY (kitchen items on paid bills only — not system-wide revenue)
  let todayFoodSales = 0;
  let todayFoodItemsSold = 0;
  let todayFoodBills = new Set<string>();
  let todayFoodCost = 0;

  for (const bill of db.raw.bills) {
    if (bill.status !== 'paid') continue;
    const t = new Date(bill.paidAt || bill.createdAt).getTime();
    if (t < todayStart) continue;
    let billHasFood = false;
    for (const item of bill.items) {
      if (!item.isKitchenItem) continue;
      billHasFood = true;
      todayFoodSales += item.total;
      todayFoodItemsSold += item.quantity;
      const recipe = findRecipeForVariant(item.variantId);
      if (recipe) {
        todayFoodCost += computeRecipeCostPerServing(recipe) * item.quantity;
      } else {
        todayFoodCost += (item.costPrice || 0) * item.quantity;
      }
    }
    if (billHasFood) todayFoodBills.add(bill.id);
  }
  todayFoodSales = Number(todayFoodSales.toFixed(2));
  todayFoodCost = Number(todayFoodCost.toFixed(2));

  const grossFoodProfit = Number((todayFoodSales - todayFoodCost).toFixed(2));
  const foodCostPct = todayFoodSales > 0 ? Number(((todayFoodCost / todayFoodSales) * 100).toFixed(2)) : 0;

  // Kitchen store alerts
  const lowStockItems: any[] = [];
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalIngredientValue = 0;
  for (const ing of db.raw.kitchenIngredients) {
    if (!ing.isActive) continue;
    totalIngredientValue += ing.currentStock * ing.costPerUnit;
    if (ing.currentStock <= 0) {
      outOfStockCount++;
      lowStockItems.push({ id: ing.id, name: ing.name, stock: ing.currentStock, min: ing.minStockLevel, unit: ing.unit, status: 'OUT_OF_STOCK' });
    } else if (ing.currentStock <= ing.minStockLevel) {
      lowStockCount++;
      lowStockItems.push({ id: ing.id, name: ing.name, stock: ing.currentStock, min: ing.minStockLevel, unit: ing.unit, status: 'LOW_STOCK' });
    }
  }

  // Today's wastage
  const todayWastage = db.raw.kitchenWastage.filter(w => new Date(w.createdAt).getTime() >= todayStart);
  const todayWastageCost = Number(todayWastage.reduce((s, w) => s + w.cost, 0).toFixed(2));

  const pendingApprovals = db.raw.kitchenAdjustmentRequests.filter(r => r.status === 'pending').length;

  const recentMovements = db.raw.kitchenMovements.slice(0, 10);
  const recentActivity = db.raw.auditLogs
    .filter(l => String(l.action || '').startsWith('KITCHEN_'))
    .slice(0, 10);

  // Food & Kitchen menu variants WITHOUT a recipe: selling them does NOT deduct
  // any materials from the kitchen store. Surface them so the Kitchen Manager
  // can add recipes (otherwise daily food cost stays understated).
  const menuItemsWithoutRecipe: { productId: string; productName: string; variantId: string; variantSize: string; sellingPrice: number }[] = [];
  for (const p of db.raw.products) {
    if (p.isArchived || !p.isActive) continue;
    const cat = db.raw.categories.find(c => c.id === p.categoryId);
    const isFood = p.isKitchenItem || (cat && cat.type === 'restaurant');
    if (!isFood) continue;
    for (const v of p.variants) {
      if (!v.isActive || v.isShot) continue;
      if (!findRecipeForVariant(v.id)) {
        menuItemsWithoutRecipe.push({
          productId: p.id,
          productName: p.name,
          variantId: v.id,
          variantSize: v.size,
          sellingPrice: v.sellingPrice,
        });
      }
    }
  }

  res.json({
    todayFoodSales,
    todayFoodCost,
    foodCostPct,
    grossFoodProfit,
    todayFoodItemsSold,
    todayFoodBillsCount: todayFoodBills.size,
    lowStockCount,
    outOfStockCount,
    lowStockItems: lowStockItems.slice(0, 8),
    todayWastageCost,
    todayWastageCount: todayWastage.length,
    pendingApprovals,
    totalIngredientValue: Number(totalIngredientValue.toFixed(2)),
    activeRecipeCount: db.raw.kitchenRecipes.filter(r => r.isActive).length,
    recentMovements,
    recentActivity,
    menuItemsWithoutRecipe,
  });
});

/** ---- Kitchen Ingredients ---- */
app.get('/api/kitchen/ingredients', authMiddleware, requireKitchenPermission('KITCHEN_INGREDIENT_VIEW'), (req: Request, res: Response) => {
  const list = db.raw.kitchenIngredients.map(ing => ({
    ...ing,
    isLowStock: ing.isActive && ing.currentStock > 0 && ing.currentStock <= ing.minStockLevel,
    isOutOfStock: ing.isActive && ing.currentStock <= 0,
    stockValue: Number((ing.currentStock * ing.costPerUnit).toFixed(2)),
  }));
  res.json(list);
});

app.post('/api/kitchen/ingredients', authMiddleware, requireKitchenPermission('KITCHEN_INGREDIENT_CREATE'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const parsed = sanitizeKitchenIngredientInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;

  const duplicate = db.raw.kitchenIngredients.find(i => i.name.trim().toLowerCase() === v.name.toLowerCase());
  if (duplicate) return res.status(400).json({ error: `Ingredient "${duplicate.name}" already exists in the kitchen store.` });

  const ing: KitchenIngredient = {
    id: `king-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name: v.name,
    unit: v.unit,
    currentStock: v.currentStock,
    minStockLevel: v.minStockLevel,
    costPerUnit: v.costPerUnit,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.raw.kitchenIngredients.push(ing);

  // Opening stock goes through the movement ledger (never a silent quantity set)
  if (ing.currentStock > 0) {
    db.recordKitchenMovement(ing, ing.currentStock, 0, ing.currentStock, 'opening_stock', user.id, user.name, v.openingReason || 'Opening stock when ingredient was created');
  } else {
    db.save();
  }

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_INGREDIENT_CREATED', 'KITCHEN', ing.id, `Created kitchen ingredient ${ing.name} (opening stock: ${ing.currentStock}${ing.unit}, min: ${ing.minStockLevel}${ing.unit}, cost: Rs. ${ing.costPerUnit}/${ing.unit})`);
  res.status(201).json(ing);
});

app.put('/api/kitchen/ingredients/:id', authMiddleware, requireKitchenPermission('KITCHEN_INGREDIENT_EDIT'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const ing = db.raw.kitchenIngredients.find(i => i.id === req.params.id);
  if (!ing) return res.status(404).json({ error: 'Kitchen ingredient not found.' });

  const parsed = sanitizeKitchenIngredientInput({ ...req.body, currentStock: req.body?.currentStock !== undefined ? req.body.currentStock : ing.currentStock });
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;

  const duplicate = db.raw.kitchenIngredients.find(i => i.id !== ing.id && i.name.trim().toLowerCase() === v.name.toLowerCase());
  if (duplicate) return res.status(400).json({ error: `Ingredient "${duplicate.name}" already exists in the kitchen store.` });

  // Cost / min-level / unit / name are editable. QUANTITY changes must go
  // through Stock In / Stock Out / Physical Count so the ledger stays honest.
  const before = { name: ing.name, unit: ing.unit, minStockLevel: ing.minStockLevel, costPerUnit: ing.costPerUnit };
  ing.name = v.name;
  ing.unit = v.unit;
  ing.minStockLevel = v.minStockLevel;
  ing.costPerUnit = v.costPerUnit;
  ing.updatedAt = new Date().toISOString();
  db.save();

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_INGREDIENT_UPDATED', 'KITCHEN', ing.id, `Updated ingredient ${ing.name}. Before: ${JSON.stringify(before)} → After: ${JSON.stringify({ name: ing.name, unit: ing.unit, minStockLevel: ing.minStockLevel, costPerUnit: ing.costPerUnit })}`);
  res.json(ing);
});

app.delete('/api/kitchen/ingredients/:id', authMiddleware, requireKitchenPermission('KITCHEN_INGREDIENT_EDIT'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const ing = db.raw.kitchenIngredients.find(i => i.id === req.params.id);
  if (!ing) return res.status(404).json({ error: 'Kitchen ingredient not found.' });

  // Archive instead of hard-delete: the movement ledger, recipes and any
  // bills that referenced this ingredient keep working (restore-on-void still
  // finds it by id). Archived ingredients disappear from counts/reports.
  if (ing.isActive === false) {
    return res.status(400).json({ error: 'Ingredient is already archived.' });
  }
  ing.isActive = false;
  ing.updatedAt = new Date().toISOString();
  db.save();
  db.logAudit(user.id, user.name, user.role, 'KITCHEN_INGREDIENT_ARCHIVED', 'KITCHEN', ing.id, `Archived kitchen ingredient ${ing.name} (${ing.unit}). Ledger history preserved.`);
  res.json({ success: true, message: `Ingredient ${ing.name} archived. Movement history preserved.`, ingredient: ing });
});

/** ---- Kitchen Stock & Movements ---- */
app.get('/api/kitchen/movements', authMiddleware, requireKitchenPermission('KITCHEN_STOCK_VIEW'), (req: Request, res: Response) => {
  const { type, ingredientId, reference, page, limit, from, to } = req.query;

  let list = db.raw.kitchenMovements.slice();
  if (type && type !== 'all') list = list.filter(m => m.movementType === String(type));
  if (ingredientId && ingredientId !== 'all') list = list.filter(m => m.ingredientId === String(ingredientId));
  if (reference) list = list.filter(m => (m.referenceId || '').toLowerCase().includes(String(reference).toLowerCase()));
  if (from) {
    const t = new Date(String(from)).getTime();
    if (!isNaN(t)) list = list.filter(m => new Date(m.createdAt).getTime() >= t);
  }
  if (to) {
    const raw = String(to);
    const parsedT = new Date(raw).getTime();
    const t = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parsedT + 86399999 : parsedT;
    if (!isNaN(t)) list = list.filter(m => new Date(m.createdAt).getTime() <= t);
  }

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(String(limit), 10) || 50));
  const total = list.length;
  const items = list.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({ items, total, page: pageNum, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

app.post('/api/kitchen/stock-in', authMiddleware, requireKitchenPermission('KITCHEN_STOCK_IN'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { ingredientId, quantity, costPerUnit, reason, reference, date } = req.body;

  const numQty = Number(quantity);
  if (!ingredientId || !Number.isFinite(numQty) || numQty <= 0 || numQty > 10000000) {
    return res.status(400).json({ error: 'Valid ingredient and positive quantity (max 10,000,000) are required.' });
  }

  const ing = db.raw.kitchenIngredients.find(i => i.id === ingredientId && i.isActive);
  if (!ing) return res.status(404).json({ error: 'Kitchen ingredient not found.' });

  const before = ing.currentStock;
  ing.currentStock = Number((ing.currentStock + numQty).toFixed(3));
  if (costPerUnit !== undefined && Number(costPerUnit) > 0) {
    ing.costPerUnit = Number(Number(costPerUnit).toFixed(2)); // latest cost wins (moving price)
  }
  ing.updatedAt = new Date().toISOString();

  const recordTime = date ? (String(date).includes('T') ? new Date(date).toISOString() : new Date(`${date}T12:00:00.000Z`).toISOString()) : new Date().toISOString();

  db.recordKitchenMovement(
    ing,
    numQty,
    before,
    ing.currentStock,
    'stock_in',
    user.id,
    user.name,
    (typeof reason === 'string' && reason.trim()) ? reason.trim().slice(0, 500) : 'Kitchen stock received',
    (typeof reference === 'string' && reference.trim()) ? reference.trim().slice(0, 128) : undefined,
    recordTime
  );

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_STOCK_IN', 'KITCHEN', ing.id, `Stock in +${numQty}${ing.unit} for ${ing.name}. New stock: ${ing.currentStock}${ing.unit}${Number(costPerUnit) > 0 ? ` (cost updated to Rs. ${ing.costPerUnit}/${ing.unit})` : ''}`);
  res.json({ message: 'Kitchen stock added successfully.', ingredient: ing });
});

app.post('/api/kitchen/stock-out', authMiddleware, requireKitchenPermission('KITCHEN_STOCK_OUT'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { ingredientId, quantity, reason, reference } = req.body;

  const numQty = Number(quantity);
  if (!ingredientId || !Number.isFinite(numQty) || numQty <= 0 || numQty > 10000000) {
    return res.status(400).json({ error: 'Valid ingredient and positive quantity (max 10,000,000) are required.' });
  }
  const note = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (note.length < 3) {
    return res.status(400).json({ error: 'A reason is required for stock out (e.g. transfer to bar kitchen).' });
  }

  const ing = db.raw.kitchenIngredients.find(i => i.id === ingredientId && i.isActive);
  if (!ing) return res.status(404).json({ error: 'Kitchen ingredient not found.' });

  if (ing.currentStock - numQty < 0) {
    return res.status(400).json({ error: `Cannot reduce below zero. Current stock: ${ing.currentStock}${ing.unit}, requested: ${numQty}${ing.unit}.` });
  }

  const before = ing.currentStock;
  ing.currentStock = Number((ing.currentStock - numQty).toFixed(3));
  ing.updatedAt = new Date().toISOString();

  db.recordKitchenMovement(
    ing,
    -numQty,
    before,
    ing.currentStock,
    'stock_out',
    user.id,
    user.name,
    note,
    (typeof reference === 'string' && reference.trim()) ? reference.trim().slice(0, 128) : undefined
  );

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_STOCK_OUT', 'KITCHEN', ing.id, `Stock out -${numQty}${ing.unit} for ${ing.name}. Reason: ${note}. New stock: ${ing.currentStock}${ing.unit}`);
  res.json({ message: 'Kitchen stock removed successfully.', ingredient: ing });
});

/** ---- Kitchen Menu Items (POS food items a recipe can attach to) ---- */
app.get('/api/kitchen/menu-items', authMiddleware, requireKitchenPermission('KITCHEN_RECIPE_VIEW'), (req: Request, res: Response) => {
  const items: any[] = [];
  for (const p of db.raw.products) {
    if (p.isArchived || !p.isActive) continue;
    const cat = db.raw.categories.find(c => c.id === p.categoryId);
    const isFood = p.isKitchenItem || (cat && cat.type === 'restaurant');
    if (!isFood) continue;
    for (const v of p.variants) {
      if (!v.isActive || v.isShot) continue;
      const recipe = findRecipeForVariant(v.id);
      items.push({
        productId: p.id,
        productName: p.name,
        variantId: v.id,
        variantSize: v.size,
        sellingPrice: v.sellingPrice,
        recipeId: recipe ? recipe.id : null,
        recipeCost: recipe ? computeRecipeCostPerServing(recipe) : null,
      });
    }
  }
  res.json(items);
});

/** ---- Recipes (versioned — history never destroyed) ---- */
function sanitizeRecipeItems(rawItems: any): { ok: true; items: KitchenRecipeItem[] } | { ok: false; error: string } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'A recipe needs at least one ingredient line.' };
  }
  const items: KitchenRecipeItem[] = [];
  for (const line of rawItems) {
    const ing = db.raw.kitchenIngredients.find(i => i.id === line?.ingredientId && i.isActive);
    if (!ing) return { ok: false, error: 'Recipe references an unknown or inactive ingredient.' };
    const qty = Number(line?.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000) {
      return { ok: false, error: `Quantity for ${ing.name} must be a positive number.` };
    }
    if (items.some(i => i.ingredientId === ing.id)) {
      return { ok: false, error: `${ing.name} is listed twice in the recipe.` };
    }
    items.push({ ingredientId: ing.id, ingredientName: ing.name, unit: ing.unit, quantity: Number(qty.toFixed(3)) });
  }
  return { ok: true, items };
}

app.get('/api/kitchen/recipes', authMiddleware, requireKitchenPermission('KITCHEN_RECIPE_VIEW'), (req: Request, res: Response) => {
  const includeInactive = req.query.archived === 'true';
  const list = db.raw.kitchenRecipes
    .filter(r => includeInactive || r.isActive)
    .map(r => ({
      ...r,
      recipeCostPerServing: computeRecipeCostPerServing(r),
      stockImpact: computeRecipeStockImpact(r),
    }));
  res.json(list);
});

/**
 * Live stock impact of a recipe: per-ingredient deduction for ONE portion
 * (line.quantity ÷ servings) and whether the kitchen store currently has
 * enough material to sell one portion or the whole batch.
 */
function computeRecipeStockImpact(recipe: KitchenRecipe): {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  perPortion: number;
  batchQuantity: number;
  availableStock: number;
  remainingAfterOne: number;
  sufficientForOne: boolean;
  sufficientForBatch: boolean;
}[] {
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  return recipe.items.map(line => {
    const ing = db.raw.kitchenIngredients.find(i => i.id === line.ingredientId);
    const perPortion = Number((line.quantity / servings).toFixed(3));
    const availableStock = ing ? Number(ing.currentStock) : 0;
    return {
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      unit: line.unit,
      perPortion,
      batchQuantity: Number(line.quantity.toFixed(3)),
      availableStock,
      remainingAfterOne: Number((availableStock - perPortion).toFixed(3)),
      sufficientForOne: availableStock + 0.001 >= perPortion,
      sufficientForBatch: availableStock + 0.001 >= line.quantity,
    };
  });
}

/**
 * VERIFY endpoint — "1000% check": given a recipe and a number of portions,
 * returns exactly what would be deducted from each material and whether the
 * kitchen store has enough stock. Used by the recipe editor's Stock Check.
 */
app.get('/api/kitchen/recipes/:id/impact', authMiddleware, requireKitchenPermission('KITCHEN_RECIPE_VIEW'), (req: Request, res: Response) => {
  const recipe = db.raw.kitchenRecipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found.' });

  const rawPortions = Number(req.query.portions);
  const portions = Number.isFinite(rawPortions) && rawPortions >= 1 && rawPortions <= 100000 ? Math.floor(rawPortions) : 1;

  const servings = recipe.servings > 0 ? recipe.servings : 1;
  const items = recipe.items.map(line => {
    const ing = db.raw.kitchenIngredients.find(i => i.id === line.ingredientId);
    const perPortion = Number((line.quantity / servings).toFixed(3));
    const needed = Number((perPortion * portions).toFixed(3));
    const availableStock = ing ? Number(ing.currentStock) : 0;
    const shortBy = Number(Math.max(0, needed - availableStock).toFixed(3));
    return {
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      unit: line.unit,
      perPortion,
      neededForPortions: needed,
      availableStock,
      remainingAfter: Number((availableStock - needed).toFixed(3)),
      sufficient: availableStock + 0.001 >= needed,
      shortBy,
      costValue: Number((needed * (ing ? ing.costPerUnit : 0)).toFixed(2)),
    };
  });

  const shortages = items.filter(i => !i.sufficient);
  const totalCost = Number(items.reduce((s, i) => s + i.costValue, 0).toFixed(2));

  res.json({
    recipeId: recipe.id,
    productName: recipe.productName,
    variantSize: recipe.variantSize,
    servings,
    portions,
    items,
    allSufficient: shortages.length === 0,
    shortages: shortages.map(s => ({ ingredientName: s.ingredientName, unit: s.unit, shortBy: s.shortBy })),
    totalCostForPortions: totalCost,
  });
});

app.post('/api/kitchen/recipes', authMiddleware, requireKitchenPermission('KITCHEN_RECIPE_CREATE'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, servings, items, notes } = req.body;

  const found = findVariantById(String(variantId || ''));
  if (!found) return res.status(404).json({ error: 'Menu item variant not found.' });
  const { product, variant } = found;

  const existing = findRecipeForVariant(variant.id);
  if (existing) return res.status(400).json({ error: `An active recipe already exists for ${product.name} (${variant.size}). Edit it instead.` });

  const parsedItems = sanitizeRecipeItems(items);
  if (!parsedItems.ok) return res.status(400).json({ error: parsedItems.error });

  const numServings = Number(servings);
  const safeServings = Number.isFinite(numServings) && numServings > 0 && numServings <= 1000 ? numServings : 1;

  const recipe: KitchenRecipe = {
    id: `krec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    variantSize: variant.size,
    servings: safeServings,
    items: parsedItems.items,
    isActive: true,
    version: 1,
    history: [],
    createdById: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.raw.kitchenRecipes.push(recipe);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_RECIPE_CREATED', 'KITCHEN_RECIPE', recipe.id, `Created recipe v1 for ${product.name} (${variant.size}) — ${recipe.items.length} ingredients, cost/portion Rs. ${computeRecipeCostPerServing(recipe)}${notes ? `. Note: ${String(notes).slice(0, 300)}` : ''}`);
  res.status(201).json({ ...recipe, recipeCostPerServing: computeRecipeCostPerServing(recipe) });
});

app.put('/api/kitchen/recipes/:id', authMiddleware, requireKitchenPermission('KITCHEN_RECIPE_EDIT'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const recipe = db.raw.kitchenRecipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found.' });

  const { servings, items, notes } = req.body;
  const parsedItems = sanitizeRecipeItems(items);
  if (!parsedItems.ok) return res.status(400).json({ error: parsedItems.error });

  const numServings = Number(servings);
  const safeServings = Number.isFinite(numServings) && numServings > 0 && numServings <= 1000 ? numServings : recipe.servings;

  // Preserve history — the previous version is snapshotted, never destroyed.
  recipe.history.push({
    version: recipe.version,
    items: recipe.items,
    savedAt: new Date().toISOString(),
    savedById: user.id,
    savedByName: user.name,
  });
  recipe.items = parsedItems.items;
  recipe.servings = safeServings;
  recipe.version += 1;
  recipe.updatedAt = new Date().toISOString();
  db.save();

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_RECIPE_UPDATED', 'KITCHEN_RECIPE', recipe.id, `Updated recipe for ${recipe.productName} (${recipe.variantSize}) to v${recipe.version} — ${recipe.items.length} ingredients, cost/portion Rs. ${computeRecipeCostPerServing(recipe)}. Previous version archived in recipe history.${notes ? ` Note: ${String(notes).slice(0, 300)}` : ''}`);
  res.json({ ...recipe, recipeCostPerServing: computeRecipeCostPerServing(recipe) });
});

app.patch('/api/kitchen/recipes/:id/archive', authMiddleware, requireKitchenPermission('KITCHEN_RECIPE_ARCHIVE'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const recipe = db.raw.kitchenRecipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found.' });

  recipe.isActive = !recipe.isActive;
  recipe.updatedAt = new Date().toISOString();
  db.save();

  const action = recipe.isActive ? 'KITCHEN_RECIPE_REACTIVATED' : 'KITCHEN_RECIPE_ARCHIVED';
  db.logAudit(user.id, user.name, user.role, action, 'KITCHEN_RECIPE', recipe.id, `${recipe.isActive ? 'Re-activated' : 'Archived'} recipe for ${recipe.productName} (${recipe.variantSize}) v${recipe.version}. History preserved.`);
  res.json(recipe);
});

/** ---- Wastage ---- */
app.get('/api/kitchen/wastage', authMiddleware, requireKitchenPermission('KITCHEN_WASTAGE_VIEW'), (req: Request, res: Response) => {
  const { from, to, category } = req.query;
  let list = db.raw.kitchenWastage.slice();
  if (category && category !== 'all') list = list.filter(w => w.category === String(category));
  if (from) {
    const t = new Date(String(from)).getTime();
    if (!isNaN(t)) list = list.filter(w => new Date(w.createdAt).getTime() >= t);
  }
  if (to) {
    const raw = String(to);
    const parsedT = new Date(raw).getTime();
    const t = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parsedT + 86399999 : parsedT;
    if (!isNaN(t)) list = list.filter(w => new Date(w.createdAt).getTime() <= t);
  }
  const totalCost = Number(list.reduce((s, w) => s + w.cost, 0).toFixed(2));
  res.json({ items: list, totalCost });
});

app.post('/api/kitchen/wastage', authMiddleware, requireKitchenPermission('KITCHEN_WASTAGE_CREATE'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { ingredientId, quantity, category, reason, notes } = req.body;

  const ing = db.raw.kitchenIngredients.find(i => i.id === ingredientId && i.isActive);
  if (!ing) return res.status(404).json({ error: 'Kitchen ingredient not found.' });

  const numQty = Number(quantity);
  if (!Number.isFinite(numQty) || numQty <= 0 || numQty > 10000000) {
    return res.status(400).json({ error: 'Wasted quantity must be a positive number.' });
  }
  if (!KITCHEN_WASTAGE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid wastage category.' });
  }
  const note = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (note.length < 3) {
    return res.status(400).json({ error: 'Please describe the reason for the wastage.' });
  }
  if (ing.currentStock - numQty < 0) {
    return res.status(400).json({ error: `Cannot waste more than stock on hand. Current: ${ing.currentStock}${ing.unit}, requested: ${numQty}${ing.unit}.` });
  }

  const before = ing.currentStock;
  ing.currentStock = Number((ing.currentStock - numQty).toFixed(3));
  ing.updatedAt = new Date().toISOString();

  const cost = Number((numQty * ing.costPerUnit).toFixed(2));
  const movement = db.recordKitchenMovement(
    ing,
    -numQty,
    before,
    ing.currentStock,
    'wastage',
    user.id,
    user.name,
    `Wastage (${category}): ${note}`,
    undefined
  );

  const record: KitchenWastageRecord = {
    id: `kwst-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    ingredientId: ing.id,
    ingredientName: ing.name,
    quantity: numQty,
    unit: ing.unit,
    cost,
    category,
    reason: note,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 500) : undefined,
    movementId: movement.id,
    userId: user.id,
    userName: user.name,
    createdAt: new Date().toISOString(),
  };
  db.raw.kitchenWastage.unshift(record);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_WASTAGE_CREATED', 'KITCHEN', ing.id, `Wastage recorded: ${numQty}${ing.unit} of ${ing.name} (${category}) — Cost Rs. ${cost}. Reason: ${note}. New stock: ${ing.currentStock}${ing.unit}`);
  res.status(201).json(record);
});

/** ---- Physical Stock Count (variance + approval workflow) ---- */
app.get('/api/kitchen/counts', authMiddleware, requireKitchenPermission('KITCHEN_PHYSICAL_COUNT_VIEW'), (req: Request, res: Response) => {
  const list = db.raw.kitchenCounts.slice(0, 200);
  const expected: any[] = db.raw.kitchenIngredients
    .filter(i => i.isActive)
    .map(i => ({ ingredientId: i.id, name: i.name, unit: i.unit, expected: i.currentStock, costPerUnit: i.costPerUnit }));
  res.json({ counts: list, expected });
});

app.post('/api/kitchen/counts', authMiddleware, requireKitchenPermission('KITCHEN_PHYSICAL_COUNT_CREATE'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { lines, notes } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'A physical count needs at least one counted ingredient.' });
  }

  const countNumber = db.getNextKitchenCountNumber();
  const countLines: KitchenPhysicalCount['lines'] = [];
  const createdRequests: KitchenAdjustmentRequest[] = [];
  let autoApplied = 0;
  let pendingLines = 0;

  for (const line of lines) {
    const ing = db.raw.kitchenIngredients.find(i => i.id === line?.ingredientId && i.isActive);
    if (!ing) return res.status(404).json({ error: 'Count references an unknown or inactive ingredient.' });
    const physical = Number(line?.physical);
    if (!Number.isFinite(physical) || physical < 0 || physical > 10000000) {
      return res.status(400).json({ error: `Physical count for ${ing.name} must be a number between 0 and 10,000,000.` });
    }

    const expected = ing.currentStock;
    const variance = Number((physical - expected).toFixed(3));
    const varianceCost = Number((Math.abs(variance) * ing.costPerUnit).toFixed(2));

    if (Math.abs(variance) < 0.001) {
      countLines.push({ ingredientId: ing.id, ingredientName: ing.name, unit: ing.unit, expected, physical, variance, varianceCost, status: 'no_variance' });
      continue;
    }

    // Small variances are applied immediately (audited count_correction movement).
    // Large variances require Super Admin approval before stock changes.
    if (varianceCost <= KITCHEN_ADJUSTMENT_APPROVAL_THRESHOLD) {
      const before = ing.currentStock;
      ing.currentStock = Number(physical.toFixed(3));
      ing.updatedAt = new Date().toISOString();
      db.recordKitchenMovement(
        ing,
        variance,
        before,
        ing.currentStock,
        'count_correction',
        user.id,
        user.name,
        `Physical count ${countNumber} variance correction (${variance > 0 ? 'surplus' : 'shortage'} Rs. ${varianceCost})`,
        countNumber
      );
      countLines.push({ ingredientId: ing.id, ingredientName: ing.name, unit: ing.unit, expected, physical, variance, varianceCost, status: 'applied' });
      autoApplied++;
    } else {
      const request: KitchenAdjustmentRequest = {
        id: `kadj-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        requestNumber: db.getNextKitchenRequestNumber(),
        type: 'stock_adjustment',
        ingredientId: ing.id,
        ingredientName: ing.name,
        unit: ing.unit,
        currentQty: expected,
        requestedQty: physical,
        diffQty: variance,
        varianceCost,
        reason: typeof line?.reason === 'string' && line.reason.trim() ? line.reason.trim().slice(0, 500) : 'Large physical count variance — needs approval',
        countNumber,
        status: 'pending',
        requestedById: user.id,
        requestedByName: user.name,
        createdAt: new Date().toISOString(),
      };
      db.raw.kitchenAdjustmentRequests.unshift(request);
      createdRequests.push(request);
      countLines.push({ ingredientId: ing.id, ingredientName: ing.name, unit: ing.unit, expected, physical, variance, varianceCost, status: 'pending_approval' });
      pendingLines++;
    }
  }

  const totalVarianceCost = Number(countLines.reduce((s, l) => s + l.varianceCost, 0).toFixed(2));
  const count: KitchenPhysicalCount = {
    id: `kcnt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    countNumber,
    lines: countLines,
    totalVarianceCost,
    status: pendingLines === 0 ? 'applied' : autoApplied > 0 ? 'partial' : 'pending_approval',
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 500) : undefined,
    userId: user.id,
    userName: user.name,
    createdAt: new Date().toISOString(),
  };
  db.raw.kitchenCounts.unshift(count);
  db.save();

  db.logAudit(
    user.id,
    user.name,
    user.role,
    'KITCHEN_PHYSICAL_COUNT',
    'KITCHEN',
    count.id,
    `Physical count ${countNumber}: ${countLines.length} ingredients, variance cost Rs. ${totalVarianceCost}, ${autoApplied} line(s) auto-corrected, ${pendingLines} line(s) sent for Super Admin approval.`
  );

  res.status(201).json({ count, createdRequests });
});

/** ---- Adjustment Requests (high-risk workflow) ---- */
app.get('/api/kitchen/requests', authMiddleware, requireKitchenPermission('KITCHEN_VARIANCE_VIEW'), (req: Request, res: Response) => {
  const { status } = req.query;
  let list = db.raw.kitchenAdjustmentRequests.slice(0, 200);
  if (status && status !== 'all') list = list.filter(r => r.status === String(status));
  res.json(list);
});

app.post('/api/kitchen/requests/:id/approve', authMiddleware, requireKitchenAdmin, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const request = db.raw.kitchenAdjustmentRequests.find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Adjustment request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}.` });

  const ing = db.raw.kitchenIngredients.find(i => i.id === request.ingredientId);
  if (!ing) return res.status(404).json({ error: 'Ingredient no longer exists.' });

  const before = ing.currentStock;
  ing.currentStock = Number(request.requestedQty.toFixed(3));
  ing.updatedAt = new Date().toISOString();
  db.recordKitchenMovement(
    ing,
    request.diffQty,
    before,
    ing.currentStock,
    'adjustment',
    user.id,
    user.name,
    `Approved adjustment ${request.requestNumber} (from count ${request.countNumber || 'n/a'}): ${request.reason}`,
    request.requestNumber
  );

  request.status = 'approved';
  request.reviewedById = user.id;
  request.reviewedByName = user.name;
  request.reviewedAt = new Date().toISOString();
  request.reviewNote = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : undefined;
  db.save();

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_REQUEST_APPROVED', 'KITCHEN', request.id, `Approved adjustment ${request.requestNumber}: ${ing.name} ${before}${ing.unit} → ${ing.currentStock}${ing.unit} (diff ${request.diffQty}${ing.unit}, Rs. ${request.varianceCost}). Requested by ${request.requestedByName}.`);
  res.json({ message: 'Adjustment approved and stock updated.', request });
});

app.post('/api/kitchen/requests/:id/reject', authMiddleware, requireKitchenAdmin, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const request = db.raw.kitchenAdjustmentRequests.find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Adjustment request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}.` });

  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  if (note.length < 3) {
    return res.status(400).json({ error: 'A rejection note is required.' });
  }

  request.status = 'rejected';
  request.reviewedById = user.id;
  request.reviewedByName = user.name;
  request.reviewedAt = new Date().toISOString();
  request.reviewNote = note;
  db.save();

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_REQUEST_REJECTED', 'KITCHEN', request.id, `Rejected adjustment ${request.requestNumber}: ${request.ingredientName} ${request.currentQty}→${request.requestedQty}${request.unit} (Rs. ${request.varianceCost}). Requested by ${request.requestedByName}. Note: ${note}`);
  res.json({ message: 'Adjustment request rejected. Stock unchanged.', request });
});

/** ---- Food Cost (view only — prices come from the POS catalogue) ---- */
app.get('/api/kitchen/food-cost', authMiddleware, requireKitchenPermission('KITCHEN_FOOD_COST_VIEW'), (req: Request, res: Response) => {
  const rows: any[] = [];
  for (const p of db.raw.products) {
    if (p.isArchived || !p.isActive) continue;
    const cat = db.raw.categories.find(c => c.id === p.categoryId);
    if (!p.isKitchenItem && !(cat && cat.type === 'restaurant')) continue;
    for (const v of p.variants) {
      if (!v.isActive || v.isShot) continue;
      const recipe = findRecipeForVariant(v.id);
      const recipeCost = recipe ? computeRecipeCostPerServing(recipe) : null;
      const sellingPrice = v.sellingPrice;
      const grossProfit = recipeCost !== null ? Number((sellingPrice - recipeCost).toFixed(2)) : null;
      const foodCostPct = recipeCost !== null && sellingPrice > 0 ? Number(((recipeCost / sellingPrice) * 100).toFixed(2)) : null;
      const grossMarginPct = foodCostPct !== null ? Number((100 - foodCostPct).toFixed(2)) : null;
      rows.push({
        productId: p.id,
        productName: p.name,
        variantId: v.id,
        variantSize: v.size,
        sellingPrice,
        recipeId: recipe ? recipe.id : null,
        recipeCost,
        grossProfit,
        foodCostPct,
        grossMarginPct,
        hasRecipe: Boolean(recipe),
      });
    }
  }
  res.json(rows);
});

/** ---- Kitchen Reports (kitchen-scoped ONLY) ---- */
app.get('/api/kitchen/reports', authMiddleware, requireKitchenPermission('KITCHEN_REPORT_VIEW'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { type, from, to } = req.query;

  let start: number | undefined;
  let end: number | undefined;
  if (from) {
    const t = new Date(String(from)).getTime();
    if (!isNaN(t)) start = t;
  }
  if (to) {
    const raw = String(to);
    const parsedT = new Date(raw).getTime();
    end = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parsedT + 86399999 : parsedT;
  }
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    if (start !== undefined && t < start) return false;
    if (end !== undefined && t > end) return false;
    return true;
  };

  let payload: any = null;

  switch (String(type)) {
    case 'consumption': {
      // Ingredient consumption per movement type (sale production, wastage, stock out)
      const map = new Map<string, { ingredientId: string; ingredientName: string; unit: string; consumedBySales: number; wastage: number; stockOut: number; totalConsumed: number; costValue: number }>();
      for (const m of db.raw.kitchenMovements) {
        if (m.quantityChange >= 0) continue;
        if (!inRange(m.createdAt)) continue;
        if (!map.has(m.ingredientId)) {
          map.set(m.ingredientId, { ingredientId: m.ingredientId, ingredientName: m.ingredientName, unit: m.unit, consumedBySales: 0, wastage: 0, stockOut: 0, totalConsumed: 0, costValue: 0 });
        }
        const row = map.get(m.ingredientId)!;
        const qty = Math.abs(m.quantityChange);
        if (m.movementType === 'sale') row.consumedBySales += qty;
        else if (m.movementType === 'wastage') row.wastage += qty;
        else if (m.movementType === 'stock_out') row.stockOut += qty;
        row.totalConsumed += qty;
        row.costValue += qty * (m.costPerUnit || 0);
      }
      const rows = Array.from(map.values()).map(r => ({
        ...r,
        consumedBySales: Number(r.consumedBySales.toFixed(3)),
        wastage: Number(r.wastage.toFixed(3)),
        stockOut: Number(r.stockOut.toFixed(3)),
        totalConsumed: Number(r.totalConsumed.toFixed(3)),
        costValue: Number(r.costValue.toFixed(2)),
      })).sort((a, b) => b.costValue - a.costValue);
      payload = { rows, totalCostValue: Number(rows.reduce((s, r) => s + r.costValue, 0).toFixed(2)) };
      break;
    }
    case 'wastage': {
      const list = db.raw.kitchenWastage.filter(w => inRange(w.createdAt));
      const byCategory = new Map<string, { category: string; count: number; cost: number }>();
      for (const w of list) {
        if (!byCategory.has(w.category)) byCategory.set(w.category, { category: w.category, count: 0, cost: 0 });
        const row = byCategory.get(w.category)!;
        row.count++;
        row.cost += w.cost;
      }
      payload = {
        rows: list.slice(0, 500),
        totalCost: Number(list.reduce((s, w) => s + w.cost, 0).toFixed(2)),
        byCategory: Array.from(byCategory.values()).map(r => ({ ...r, cost: Number(r.cost.toFixed(2)) })).sort((a, b) => b.cost - a.cost),
      };
      break;
    }
    case 'variance': {
      const list = db.raw.kitchenCounts.filter(c => inRange(c.createdAt));
      const rows = list.flatMap(c => c.lines.filter(l => l.status !== 'no_variance').map(l => ({ countNumber: c.countNumber, createdAt: c.createdAt, ...l })));
      payload = {
        rows: rows.slice(0, 500),
        totalVarianceCost: Number(rows.reduce((s, r) => s + r.varianceCost, 0).toFixed(2)),
      };
      break;
    }
    case 'purchases': {
      const list = db.raw.kitchenMovements.filter(m => m.movementType === 'stock_in' && inRange(m.createdAt));
      const rows = list.map(m => ({
        createdAt: m.createdAt,
        ingredientName: m.ingredientName,
        unit: m.unit,
        quantity: m.quantityChange,
        costPerUnit: m.costPerUnit || 0,
        costValue: Number((m.quantityChange * (m.costPerUnit || 0)).toFixed(2)),
        reference: m.referenceId || '',
        receivedBy: m.userName,
      }));
      payload = { rows: rows.slice(0, 500), totalCostValue: Number(rows.reduce((s, r) => s + r.costValue, 0).toFixed(2)) };
      break;
    }
    case 'movements': {
      const list = db.raw.kitchenMovements.filter(m => inRange(m.createdAt)).slice(0, 500);
      payload = { rows: list, totalRows: list.length };
      break;
    }
    case 'food-cost':
    default: {
      // Food cost & profitability per recipe-linked menu item over the period
      const map = new Map<string, { productName: string; variantSize: string; quantitySold: number; foodSales: number; foodCost: number }>();
      for (const bill of db.raw.bills) {
        if (bill.status !== 'paid' || !inRange(bill.paidAt || bill.createdAt)) continue;
        for (const item of bill.items) {
          if (!item.isKitchenItem) continue;
          const recipe = findRecipeForVariant(item.variantId);
          const cost = recipe ? computeRecipeCostPerServing(recipe) : (item.costPrice || 0);
          const key = `${item.productId}_${item.variantId}`;
          if (!map.has(key)) map.set(key, { productName: item.productName, variantSize: item.size, quantitySold: 0, foodSales: 0, foodCost: 0 });
          const row = map.get(key)!;
          row.quantitySold += item.quantity;
          row.foodSales += item.total;
          row.foodCost += cost * item.quantity;
        }
      }
      const rows = Array.from(map.values()).map(r => {
        const grossProfit = r.foodSales - r.foodCost;
        return {
          ...r,
          foodSales: Number(r.foodSales.toFixed(2)),
          foodCost: Number(r.foodCost.toFixed(2)),
          grossProfit: Number(grossProfit.toFixed(2)),
          foodCostPct: r.foodSales > 0 ? Number(((r.foodCost / r.foodSales) * 100).toFixed(2)) : 0,
        };
      }).sort((a, b) => b.foodSales - a.foodSales);
      payload = {
        rows,
        totalFoodSales: Number(rows.reduce((s, r) => s + r.foodSales, 0).toFixed(2)),
        totalFoodCost: Number(rows.reduce((s, r) => s + r.foodCost, 0).toFixed(2)),
        totalGrossProfit: Number(rows.reduce((s, r) => s + r.grossProfit, 0).toFixed(2)),
      };
      break;
    }
  }

  db.logAudit(user.id, user.name, user.role, 'KITCHEN_REPORT_VIEWED', 'KITCHEN', undefined, `Viewed kitchen report '${type || 'food-cost'}'${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`);
  res.json(payload);
});

// ==========================================
// BACKUP & DATABASE PERSISTENCE API
// ==========================================

app.get('/api/database/backups', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const list = db.listBackups();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list backups.' });
  }
});

app.post('/api/database/backup', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const backup = db.backupDatabase();
    db.logAudit(user.id, user.name, user.role, 'BACKUP_DATABASE', 'SYSTEM', 'DATABASE', `Created database snapshot backup ${backup.filename}`);
    res.json({ success: true, backup });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate backup.' });
  }
});

app.get('/api/database/download', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const dataStr = JSON.stringify(db.raw, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="royal_hotel_pos_db_${dateStr}.json"`);
    res.send(dataStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export database.' });
  }
});

app.post('/api/database/restore', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { databaseData } = req.body;

    if (!databaseData) {
      return res.status(400).json({ error: 'No database data provided for restoration.' });
    }

    db.restoreFromData(databaseData);
    db.logAudit(user.id, user.name, user.role, 'RESTORE_DATABASE', 'SYSTEM', 'DATABASE', `Restored complete database state from uploaded JSON file.`);

    res.json({
      success: true,
      message: 'Database successfully restored! All items, stock counts, bills, and history are preserved.'
    });
  } catch (err: any) {
    // A rejected/invalid upload is the caller's fault (400), not a server
    // fault (500) — the UI shows the reason so the admin can pick a good file.
    console.error('[RESTORE] Upload restore failed:', err);
    res.status(400).json({ error: err.message || 'Failed to restore database.' });
  }
});

app.post('/api/database/restore-file', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { filename } = req.body;

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename is required.' });
    }

    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    db.restoreBackupFile(filename);
    db.logAudit(user.id, user.name, user.role, 'RESTORE_BACKUP_FILE', 'SYSTEM', 'DATABASE', `Restored database from server snapshot ${filename}`);

    res.json({
      success: true,
      message: `Database successfully restored from snapshot ${filename}!`
    });
  } catch (err: any) {
    console.error('[RESTORE] Snapshot restore failed:', err);
    res.status(400).json({ error: err.message || 'Failed to restore snapshot.' });
  }
});

// ==========================================
// AUDIT LOGS & SYSTEM SETTINGS
// ==========================================

app.get('/api/audit-logs', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  // Pagination to prevent huge responses
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const start = (page - 1) * limit;
  
  const logs = db.raw.auditLogs.slice(start, start + limit);
  res.json({
    logs,
    total: db.raw.auditLogs.length,
    page,
    limit,
    totalPages: Math.ceil(db.raw.auditLogs.length / limit)
  });
});

app.get('/api/settings', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.settings);
});

app.put('/api/settings', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const updates = req.body;

  // Validate settings
  if (updates.businessName && typeof updates.businessName === 'string') {
    updates.businessName = updates.businessName.trim().slice(0, 191);
  }
  if (updates.taxRate !== undefined) {
    const rate = Number(updates.taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'Tax rate must be between 0 and 100' });
    }
  }
  if (updates.serviceChargeRate !== undefined) {
    const rate = Number(updates.serviceChargeRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'Service charge rate must be between 0 and 100' });
    }
  }
  if (updates.maxDiscountPercentage !== undefined) {
    const pct = Number(updates.maxDiscountPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'Max discount percentage must be between 0 and 100' });
    }
  }

  db.raw.settings = {
    ...db.raw.settings,
    ...updates
  };

  db.save();
  db.logAudit(user.id, user.name, user.role, 'UPDATE_SETTINGS', 'SYSTEM', 'SETTINGS', 'Updated system settings and business details.');

  res.json(db.raw.settings);
});

// 404 handler for API (must come before the SPA/vite fallback)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ==========================================
// VITE INTEGRATION & SERVER STARTUP
// ==========================================

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Accept proxied preview hosts (Arena / Codespaces / ngrok style tunnels),
        // otherwise vite answers every request with "Blocked request. This host is not allowed."
        allowedHosts: true,
        hmr: {
          overlay: true,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Resolved from the module location, NOT process.cwd(): PM2/systemd/cPanel
    // often start the app from a different working directory, which used to
    // make every page return 500 (ENOENT on dist/index.html).
    const distPath = DIST_DIR;
    const indexHtml = path.join(distPath, 'index.html');

    if (!fs.existsSync(indexHtml)) {
      throw new Error(
        `Frontend build not found at ${indexHtml}. Run "npm run build" before "npm start".`
      );
    }

    // Hashed asset filenames → cache hard. index.html → never cache, so a
    // redeploy is picked up immediately instead of serving a stale shell that
    // references deleted JS bundles.
    app.use(express.static(distPath, {
      index: false,
      etag: true,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));

    app.get('*', (req, res, next) => {
      // Don't interfere with API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(indexHtml, err => {
        if (err) next(err);
      });
    });
  }

  // Global error handler - MUST be registered last, after every route/middleware,
  // otherwise Express never routes errors to it.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Correlate the log line with what the user sees, so a cashier can read an
    // ID off the screen and support can find the exact stack trace.
    const errorId = crypto.randomBytes(6).toString('hex');
    console.error(`[ERROR][${errorId}] ${req.method} ${req.originalUrl}`, err);

    if (res.headersSent) return next(err);

    // Malformed JSON bodies are a client mistake (400), not a server fault.
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON in request body.', errorId });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload too large.', errorId });
    }

    res.status(500).json({
      error: 'Internal server error. Please try again.',
      errorId,
      // Never leak internals in production; invaluable while developing.
      ...(IS_PRODUCTION ? {} : { message: err?.message, stack: err?.stack }),
    });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Royal Hotel POS] Running on http://0.0.0.0:${PORT}`);
    console.log(`[ENV] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
    console.log(`[SECURITY] Helmet enabled, Rate limiting active`);
    if (!process.env.SESSION_SECRET) {
      console.warn(`[SECURITY] SESSION_SECRET was auto-generated and persisted to the data directory. Set SESSION_SECRET in .env for explicit control.`);
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[FATAL] Port ${PORT} is already in use. Stop the other process or set PORT.`);
    } else {
      console.error('[FATAL] HTTP server error:', err);
    }
    process.exit(1);
  });

  // Keep-alive slightly above typical proxy timeouts to avoid 502s from races
  // where the proxy reuses a socket the server is simultaneously closing.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // ==========================================
  // GRACEFUL SHUTDOWN
  // ------------------------------------------
  // A POS gets restarted constantly (redeploys, PM2 reloads, nightly reboots).
  // Without this, an in-flight checkout was cut off mid-request and any state
  // not yet flushed to disk was lost. Now: stop accepting connections, let
  // in-flight requests finish, force one final synchronous DB flush.
  // ==========================================
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SHUTDOWN] ${signal} received — closing server gracefully...`);

    const forceExit = setTimeout(() => {
      console.error('[SHUTDOWN] Timed out after 15s — forcing exit.');
      try { db.flush(); } catch {}
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    // Idle keep-alive sockets keep `server.close()` pending forever (browsers
    // and the POS frontend hold connections open). Close the idle ones now, and
    // drop the rest after a short grace period so in-flight requests — like a
    // checkout being written to disk — still get to finish.
    server.closeIdleConnections?.();
    const dropLingering = setTimeout(() => {
      console.warn('[SHUTDOWN] Forcing remaining open connections closed.');
      server.closeAllConnections?.();
    }, 5_000);
    dropLingering.unref();

    server.close(err => {
      clearTimeout(dropLingering);
      if (err) console.error('[SHUTDOWN] Error while closing server:', err);
      try {
        db.flush();
        console.log('[SHUTDOWN] Database flushed to disk. Bye.');
      } catch (flushErr) {
        console.error('[SHUTDOWN][CRITICAL] Final database flush FAILED:', flushErr);
        clearTimeout(forceExit);
        process.exit(1);
      }
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Never let an unexpected error leave the process alive but broken: persist
  // what we have, log loudly, and exit so the process manager restarts clean.
  process.on('uncaughtException', err => {
    console.error('[FATAL] Uncaught exception:', err);
    try { db.flush(); } catch {}
    process.exit(1);
  });
  process.on('unhandledRejection', reason => {
    console.error('[FATAL] Unhandled promise rejection:', reason);
    try { db.flush(); } catch {}
    process.exit(1);
  });
}

start().catch(err => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
