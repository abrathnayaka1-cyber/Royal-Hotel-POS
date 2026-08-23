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

  if (currentPassword) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
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
      .map(p => ({
        ...p,
        variants: p.variants.filter(v => v.isActive)
      }));
    return res.json(activeProducts);
  }

  const includeArchived = req.query.archived === 'true';
  const products = includeArchived
    ? db.raw.products
    : db.raw.products.filter(p => !p.isArchived);

  res.json(products);
});

app.get('/api/products/:id', authMiddleware, (req: Request, res: Response) => {
  const product = db.raw.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(product);
});

app.post('/api/products', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, categoryId, companyId, description, image, isKitchenItem, taxRate, variants } = req.body;

  if (!name || typeof name !== 'string' || !name.trim() || !categoryId || !Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: 'Product name, category, and at least one size/variant are required.' });
  }

  // Validate category exists
  if (!db.raw.categories.some(c => c.id === categoryId)) {
    return res.status(400).json({ error: 'Invalid category ID' });
  }

  const productId = `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const formattedVariants: ProductVariant[] = variants.map((v: any, index: number) => {
    const variantId = `var-${productId.replace('prod-', '')}-${index + 1}-${crypto.randomBytes(2).toString('hex')}`;
    const initialStock = Math.max(0, Number(v.stock || 0));
    const costPrice = Math.max(0, Number(v.costPrice || 0));
    const sellingPrice = Math.max(0, Number(v.sellingPrice || 0));

    if (sellingPrice < costPrice) {
      console.warn(`[PRODUCT] Selling price less than cost price for variant ${v.size}`);
    }

    return {
      id: variantId,
      productId,
      size: String(v.size || 'Standard').trim().slice(0, 64),
      sku: (v.sku || `${name.substring(0, 3).toUpperCase()}-${v.size}-${index + 1}`).trim().slice(0, 128),
      barcode: v.barcode ? String(v.barcode).trim().slice(0, 128) : undefined,
      costPrice,
      sellingPrice,
      stock: initialStock,
      minStockLevel: Math.max(0, Number(v.minStockLevel || db.raw.settings.lowStockDefaultThreshold || 5)),
      isActive: v.isActive !== false
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
    variants: formattedVariants
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
  db.logAudit(user.id, user.name, user.role, 'CREATE_PRODUCT', 'PRODUCT', newProduct.id, `Created product "${newProduct.name}" with ${formattedVariants.length} variants.`);

  res.status(201).json(newProduct);
});

app.put('/api/products/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const product = db.raw.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const { name, categoryId, companyId, description, image, isKitchenItem, taxRate, isActive, variants } = req.body;

  if (name && typeof name === 'string' && name.trim()) product.name = name.trim().slice(0, 191);
  if (categoryId && db.raw.categories.some(c => c.id === categoryId)) product.categoryId = categoryId;
  if (companyId !== undefined) product.companyId = companyId || undefined;
  if (description !== undefined) product.description = typeof description === 'string' ? description.trim().slice(0, 1000) : undefined;
  if (image !== undefined) product.image = image;
  if (isKitchenItem !== undefined) product.isKitchenItem = Boolean(isKitchenItem);
  if (taxRate !== undefined) product.taxRate = Math.max(0, Math.min(100, Number(taxRate)));
  if (isActive !== undefined) product.isActive = Boolean(isActive);

  if (Array.isArray(variants) && variants.length > 0) {
    const updatedVariants: ProductVariant[] = variants.map((v: any, index: number) => {
      const existingVar = product.variants.find(oldV => oldV.id === v.id);
      const varId = v.id || `var-${product.id.replace('prod-', '')}-${Date.now()}-${index}-${crypto.randomBytes(2).toString('hex')}`;

      const newStock = Math.max(0, Number(v.stock !== undefined ? v.stock : (existingVar?.stock ?? 0)));
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
          'Manual stock correction via product edit'
        );
      }

      return {
        id: varId,
        productId: product.id,
        size: String(v.size || 'Standard').trim().slice(0, 64),
        sku: (v.sku || `${product.name.substring(0, 3).toUpperCase()}-${v.size}`).trim().slice(0, 128),
        barcode: v.barcode ? String(v.barcode).trim().slice(0, 128) : undefined,
        costPrice: Math.max(0, Number(v.costPrice || 0)),
        sellingPrice: Math.max(0, Number(v.sellingPrice || 0)),
        stock: newStock,
        minStockLevel: Math.max(0, Number(v.minStockLevel || 5)),
        isActive: v.isActive !== false
      };
    });

    product.variants = updatedVariants;
  }

  try {
    db.save();
    db.logAudit(user.id, user.name, user.role, 'UPDATE_PRODUCT', 'PRODUCT', product.id, `Updated product "${product.name}" details and variants.`);
    res.json(product);
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
      const isLowStock = variant.stock <= variant.minStockLevel && variant.stock > 0;
      const isOutOfStock = variant.stock <= 0;
      const stockValue = variant.stock * (variant.costPrice || 0);
      const retailValue = variant.stock * (variant.sellingPrice || 0);

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
        stock: variant.stock,
        minStockLevel: variant.minStockLevel,
        status: isOutOfStock ? 'OUT_OF_STOCK' : isLowStock ? 'LOW_STOCK' : 'IN_STOCK',
        isLowStock,
        isOutOfStock,
        stockValue,
        retailValue,
        isActive: variant.isActive && product.isActive
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
  const { items, orderType, tableNumber, customerName, customerPhone, subtotal, discount, discountPercentage, tax, grandTotal, notes, existingHeldId } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cannot hold an empty cart.' });
  }

  if (existingHeldId) {
    const existingIndex = db.raw.heldBills.findIndex(h => h.id === existingHeldId);
    if (existingIndex !== -1) {
      const updated: HeldBill = {
        ...db.raw.heldBills[existingIndex],
        items,
        orderType: orderType || 'dine_in',
        tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
        customerName: customerName ? String(customerName).slice(0, 128) : undefined,
        customerPhone: customerPhone ? String(customerPhone).slice(0, 32) : undefined,
        subtotal: Math.max(0, Number(subtotal || 0)),
        discount: Math.max(0, Number(discount || 0)),
        discountPercentage: Math.max(0, Math.min(100, Number(discountPercentage || 0))),
        tax: Math.max(0, Number(tax || 0)),
        grandTotal: Math.max(0, Number(grandTotal || 0)),
        notes: notes ? String(notes).slice(0, 1000) : undefined,
        updatedAt: new Date().toISOString()
      };
      db.raw.heldBills[existingIndex] = updated;
      db.save();
      db.logAudit(user.id, user.name, user.role, 'UPDATE_HELD_BILL', 'BILL', updated.id, `Updated held order ${updated.billNumber}`);
      return res.json(updated);
    }
  }

  // FIXED: Use HOLD- prefix, not BILL- to preserve invoice sequence
  const heldCount = db.raw.counters.billSeq; // Use current seq without incrementing for held? Actually use separate counter
  const heldBill: HeldBill = {
    id: `held-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    billNumber: `HOLD-${heldCount}`,
    tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
    customerName: customerName ? String(customerName).slice(0, 128) : undefined,
    customerPhone: customerPhone ? String(customerPhone).slice(0, 32) : undefined,
    cashierId: user.id,
    cashierName: user.name,
    orderType: orderType || 'dine_in',
    items,
    subtotal: Math.max(0, Number(subtotal || 0)),
    discount: Math.max(0, Number(discount || 0)),
    discountPercentage: Math.max(0, Math.min(100, Number(discountPercentage || 0))),
    tax: Math.max(0, Number(tax || 0)),
    grandTotal: Math.max(0, Number(grandTotal || 0)),
    notes: notes ? String(notes).slice(0, 1000) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.raw.heldBills.push(heldBill);
  db.save();

  db.logAudit(user.id, user.name, user.role, 'HOLD_BILL', 'BILL', heldBill.id, `Held bill ${heldBill.billNumber} with ${items.length} items (Total: Rs. ${heldBill.grandTotal})`);

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

  const newKot: KOT = {
    id: `kot-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    kotNumber: db.getNextKOTNumber(),
    billNumber: billNumber ? String(billNumber).slice(0, 64) : undefined,
    tableNumber: tableNumber ? String(tableNumber).slice(0, 64) : undefined,
    orderType: orderType || 'dine_in',
    cashierId: user.id,
    cashierName: user.name,
    items,
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
    subtotal,
    discount,
    discountPercentage,
    tax,
    taxRate,
    serviceCharge,
    grandTotal,
    amountReceived,
    changeAmount,
    paymentMethod,
    paymentDetails,
    notes,
    heldBillId
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cannot checkout with an empty cart.' });
  }

  const numReceived = Number(amountReceived || grandTotal);
  const numGrandTotal = Number(grandTotal || 0);

  if (isNaN(numReceived) || numReceived < 0) {
    return res.status(400).json({ error: 'Invalid amount received' });
  }

  if (paymentMethod === 'cash' && numReceived < numGrandTotal) {
    return res.status(400).json({ error: 'Received amount cannot be less than Grand Total.' });
  }

  // For non-cash, ensure amountReceived >= grandTotal or at least grandTotal if split not fully implemented
  if (paymentMethod !== 'cash' && paymentMethod !== 'split' && numReceived < numGrandTotal) {
    return res.status(400).json({ error: 'Payment amount cannot be less than Grand Total for this payment method.' });
  }

  // Stock check
  if (!db.raw.settings.allowNegativeStock) {
    for (const item of items) {
      const found = findVariantById(item.variantId);
      if (found && found.variant.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${item.productName} (${item.size}). Available: ${found.variant.stock}, Requested: ${item.quantity}.`
        });
      }
    }
  }

  const billId = `bill-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const billNumber = db.getNextBillNumber();
  const invoiceNumber = db.getNextInvoiceNumber();

  for (const item of items) {
    const found = findVariantById(item.variantId);
    if (found) {
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

  const snapshotItems: OrderItem[] = items.map((item: any) => ({
    id: item.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    productId: item.productId,
    productName: String(item.productName).slice(0, 191),
    variantId: item.variantId,
    size: String(item.size).slice(0, 64),
    unitPrice: Number(item.unitPrice),
    costPrice: Number(item.costPrice || 0),
    quantity: Math.max(1, Number(item.quantity)),
    discount: Math.max(0, Number(item.discount || 0)),
    tax: Math.max(0, Number(item.tax || 0)),
    total: Number(item.total),
    notes: item.notes ? String(item.notes).slice(0, 500) : undefined,
    isKitchenItem: Boolean(item.isKitchenItem)
  }));

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
    subtotal: Math.max(0, Number(subtotal || 0)),
    discount: Math.max(0, Number(discount || 0)),
    discountPercentage: Math.max(0, Math.min(100, Number(discountPercentage || 0))),
    tax: Math.max(0, Number(tax || 0)),
    taxRate: Math.max(0, Math.min(100, Number(taxRate || 0))),
    serviceCharge: Math.max(0, Number(serviceCharge || 0)),
    grandTotal: numGrandTotal,
    amountReceived: numReceived,
    changeAmount: Number((changeAmount || Math.max(0, numReceived - numGrandTotal)).toFixed(2)),
    paymentMethod: paymentMethod || 'cash',
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

  for (const item of bill.items) {
    const found = findVariantById(item.variantId);
    if (found) {
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
  }

  db.save();
  db.logAudit(user.id, user.name, user.role, 'VOID_BILL', 'BILL', bill.id, `Voided bill ${bill.billNumber}. Reason: ${reason ? String(reason).slice(0, 500) : 'Not specified'}`);

  res.json({ message: 'Bill has been voided and stock was successfully restored.', bill });
});

// ==========================================
// REPORTS & ANALYTICS
// ==========================================

app.get('/api/reports/analytics', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const { startDate, endDate, cashierId } = req.query;

  let filteredBills = db.raw.bills.filter(b => b.status === 'paid');

  if (startDate) {
    const start = new Date(startDate as string).getTime();
    if (!isNaN(start)) filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() >= start);
  }
  if (endDate) {
    const end = new Date(endDate as string).getTime();
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
});

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
      const balance = v.stock;
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

    if (additionalCharges && Number(additionalCharges) > 0) {
      const add = Math.max(0, Number(additionalCharges));
      booking.extraCharges += add;
      booking.grandTotal += add;
      booking.balanceDue += add;
    }

    const finalPay = Math.max(0, Number(finalPaymentAmount) || booking.balanceDue);
    if (finalPay > booking.balanceDue) {
      return res.status(400).json({ error: 'Final payment cannot exceed balance due' });
    }
    booking.advancePaid += finalPay;
    booking.balanceDue = Math.max(0, booking.grandTotal - booking.advancePaid);
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
    if (payAmt <= 0 || payAmt > 1000000) {
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

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error. Please try again.' });
});

// 404 handler for API
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
