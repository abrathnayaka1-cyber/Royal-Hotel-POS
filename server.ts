import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, User, Product, ProductVariant, Category, Company, OrderItem, HeldBill, KOT, Bill, StockMovement, Room, RoomBooking } from './server/db.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// === Security & Middleware ===
app.set('trust proxy', 1); // For rate limiting behind proxy

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline styles for POS UI
  crossOriginEmbedderPolicy: false,
}));

// CORS - Allow all origins for POS flexibility, but with credentials support
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

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
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  const generated = crypto.randomBytes(64).toString('hex');
  console.warn('[SECURITY] SESSION_SECRET not set in env, using generated ephemeral secret. Set SESSION_SECRET in .env for persistent sessions across restarts!');
  return generated;
})();

if (!process.env.SESSION_SECRET) {
  console.warn('[SECURITY] For production, set a strong SESSION_SECRET in your .env file (64+ characters)');
}

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
      return res.status(403).json({ error: 'Access Denied: Super Admin permissions required.' });
    }
    next();
  };
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
  role: z.enum(['super_admin', 'cashier']),
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    uptime: process.uptime(),
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
      user = db.raw.users.find(
        u => u.username.toLowerCase() === normalizedUser || u.email.toLowerCase() === normalizedUser
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
      isValid = await bcrypt.compare(password, user.passwordHash);
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
    role: role === 'super_admin' ? 'super_admin' : 'cashier',
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
  if (role && ['super_admin', 'cashier'].includes(role)) user.role = role;
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

// ==========================================
// CATEGORIES & COMPANIES
// ==========================================

app.get('/api/categories', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.categories);
});

app.post('/api/categories', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, type, icon } = req.body;
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
    displayOrder: db.raw.categories.length + 1
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

  const { name, type, icon, isActive, displayOrder } = req.body;
  if (name && typeof name === 'string' && name.trim()) cat.name = name.trim().slice(0, 128);
  if (type && ['bar', 'restaurant', 'service', 'other'].includes(type)) cat.type = type;
  if (icon && typeof icon === 'string') cat.icon = icon.trim().slice(0, 64);
  if (isActive !== undefined) cat.isActive = Boolean(isActive);
  if (displayOrder !== undefined) cat.displayOrder = Math.max(0, Number(displayOrder) || 0);

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
    const costPrice = Math.max(0, Number(v.costPrice || 0));
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
        costPrice: Math.max(0, Number(v.costPrice || 0)),
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
        shotVolumeMl: isShot ? shotVol : undefined
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
    const lineDiscount = Math.max(0, Math.min(unitPrice * quantity, Number(raw.discount) || 0));
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
    grandTotal: numGrandTotal,
    amountReceived: numReceived,
    changeAmount: Number(Math.max(0, numReceived - numGrandTotal).toFixed(2)),
    paymentMethod: safePaymentMethod,
    paymentDetails: paymentDetails || undefined,
    status: 'paid',
    notes: notes ? String(notes).slice(0, 1000) : undefined,
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

  // Calculate received and adjustments
  const receivedMap: Record<string, number> = {};
  const adjustmentMap: Record<string, number> = {};
  
  db.raw.stockMovements.forEach(m => {
    const movDate = m.createdAt.split('T')[0];
    if (movDate !== targetDate) return;
    
    if (m.movementType === 'stock_in' || m.movementType === 'purchase') {
      receivedMap[m.variantId] = (receivedMap[m.variantId] || 0) + (Number(m.quantityChange) || 0);
    } else if (m.movementType === 'adjustment' && m.quantityChange > 0) {
      receivedMap[m.variantId] = (receivedMap[m.variantId] || 0) + (Number(m.quantityChange) || 0);
    } else if (m.movementType === 'adjustment') {
      adjustmentMap[m.variantId] = (adjustmentMap[m.variantId] || 0) + (Number(m.quantityChange) || 0);
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

  db.raw.products.forEach(p => {
    if (p.isArchived || !p.isActive) return;
    
    const cat = categoriesMap.get(p.categoryId);
    const compName = p.companyId ? companiesMap.get(p.companyId) || 'In-House / Other' : 'In-House / Other';
    if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return;
    if (typeFilter === 'bar' && (p.isKitchenItem || cat?.type === 'restaurant')) return;
    if (typeFilter === 'restaurant' && (!p.isKitchenItem && cat?.type !== 'restaurant')) return;

    p.variants.forEach(v => {
      if (!v.isActive) return;

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
      // Improved opening stock calculation: closing + sold - received - adjustments
      const inHand = Math.max(0, balance + sold - received - adjustments);
      const stock = inHand + received;
      const price = v.sellingPrice;
      const value = sold * price;

      totalInHand += inHand;
      totalReceived += received;
      totalStock += stock;
      totalBalance += balance;
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
        isKitchenItem: p.isKitchenItem
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
  const todayBills = allPaidBills.filter(b => new Date(b.createdAt).getTime() >= todayStart);

  const todayRevenue = todayBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalRevenue = allPaidBills.reduce((sum, b) => sum + b.grandTotal, 0);

  let lowStockCount = 0;
  let outOfStockCount = 0;
  const lowStockItems: any[] = [];

  db.raw.products.forEach(p => {
    if (p.isArchived) return;
    p.variants.forEach(v => {
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
    activeCashiers: db.raw.users.filter(u => u.role === 'cashier' && u.isActive).map(({ passwordHash, ...u }) => u)
  });
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
    res.status(500).json({ error: err.message || 'Failed to restore database.' });
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
    res.status(500).json({ error: err.message || 'Failed to restore snapshot.' });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Don't interfere with API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler - MUST be registered last, after every route/middleware,
  // otherwise Express never routes errors to it.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[ERROR]', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Royal Hotel POS] Running on http://0.0.0.0:${PORT}`);
    console.log(`[ENV] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
    console.log(`[SECURITY] Helmet enabled, Rate limiting active`);
    if (!process.env.SESSION_SECRET) {
      console.warn(`[SECURITY] Using ephemeral SESSION_SECRET - set in .env for production!`);
    }
  });
}

start().catch(err => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
