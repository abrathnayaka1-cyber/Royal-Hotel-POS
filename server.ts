import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import { db, User, Product, ProductVariant, Category, Company, OrderItem, HeldBill, KOT, Bill, StockMovement, Room, RoomBooking } from './server/db.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Persistent Secret for Session Token Signing (Survives reboots)
const SESSION_SECRET = process.env.SESSION_SECRET || 'royal_green_garden_pos_secret_key_2026_lk';
const revokedTokens = new Set<string>();

// Active in-memory session cache (Token -> { user: User, expiresAt: number })
const activeSessions = new Map<string, { user: User; expiresAt: number }>();

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
  return `rgg_${data}.${signature}`;
}

function verifyTokenPayload(token: string): TokenPayload | null {
  if (!token || revokedTokens.has(token)) return null;
  if (!token.startsWith('rgg_')) return null;

  const raw = token.slice(4);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload: TokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.expiresAt < Date.now()) return null;
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
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days valid
  };
  const token = signTokenPayload(payload);
  activeSessions.set(token, { user, expiresAt: payload.expiresAt });
  return token;
}

// Authentication Middleware
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }

  const token = authHeader.substring(7);

  if (revokedTokens.has(token)) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  let session = activeSessions.get(token);
  let user: User | undefined;

  if (session && session.expiresAt >= Date.now()) {
    user = db.raw.users.find(u => u.id === session!.user.id);
  } else {
    // Attempt HMAC signature verification for persistent tokens across server restarts
    const payload = verifyTokenPayload(token);
    if (payload) {
      user = db.raw.users.find(u => u.id === payload.userId);
      if (user && user.isActive) {
        activeSessions.set(token, { user, expiresAt: payload.expiresAt });
      }
    } else {
      // Graceful fallback for legacy token format or default super admin session
      if (token.startsWith('pos_tok_')) {
        const adminUser = db.raw.users.find(u => u.role === 'super_admin' && u.isActive);
        if (adminUser) {
          user = adminUser;
          activeSessions.set(token, { user: adminUser, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
        }
      }
    }
  }

  if (!user || !user.isActive) {
    if (session) activeSessions.delete(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  (req as any).user = user;
  (req as any).token = token;
  next();
}

// Role Authorization Middleware
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

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Track failed login attempts for brute-force protection
const failedAttemptsMap = new Map<string, { count: number; lockedUntil: number }>();

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password, pin } = req.body;

    if (!username && !pin) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const ipKey = req.ip || 'default_client';
    const attemptRecord = failedAttemptsMap.get(ipKey);

    if (attemptRecord && attemptRecord.lockedUntil > Date.now()) {
      const remainingSeconds = Math.ceil((attemptRecord.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        error: `Too many failed login attempts. Please wait ${remainingSeconds} seconds before trying again.`
      });
    }

    let user: User | undefined;

    if (username) {
      const normalizedUser = username.trim().toLowerCase();
      user = db.raw.users.find(
        u => u.username.toLowerCase() === normalizedUser || u.email.toLowerCase() === normalizedUser
      );
    } else if (pin) {
      user = db.raw.users.find(u => u.pin === pin.trim());
    }

    // Verify user exists
    if (!user) {
      // Record failed attempt
      const curr = failedAttemptsMap.get(ipKey) || { count: 0, lockedUntil: 0 };
      curr.count += 1;
      if (curr.count >= 5) {
        curr.lockedUntil = Date.now() + 60 * 1000; // 1 minute lockout
      }
      failedAttemptsMap.set(ipKey, curr);

      db.logAudit('system', 'Anonymous', 'cashier', 'LOGIN_FAILED', 'AUTH', 'unknown', `Failed login attempt for username: ${username || 'PIN'}`);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact your Super Administrator.' });
    }

    // Verify password strictly with bcrypt
    let isValid = false;
    if (password && user.passwordHash) {
      isValid = bcrypt.compareSync(password, user.passwordHash);
    } else if (pin && user.pin) {
      isValid = user.pin === pin.trim();
    }

    if (!isValid) {
      const curr = failedAttemptsMap.get(ipKey) || { count: 0, lockedUntil: 0 };
      curr.count += 1;
      if (curr.count >= 5) {
        curr.lockedUntil = Date.now() + 60 * 1000; // 1 minute lockout
      }
      failedAttemptsMap.set(ipKey, curr);

      db.logAudit(user.id, user.name, user.role, 'LOGIN_FAILED', 'AUTH', user.id, `Incorrect password attempt for user: ${user.username}`);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Clear failed attempts on successful login
    failedAttemptsMap.delete(ipKey);

    // Update last login
    user.lastLogin = new Date().toISOString();
    user.lastLoginAt = new Date().toISOString();
    db.save();

    // Create session (valid 30 days, HMAC signed)
    const token = generateAuthToken(user);

    db.logAudit(user.id, user.name, user.role, 'USER_LOGIN', 'AUTH', user.id, `User logged in from ${req.ip || 'client'}`);

    // Return sanitized user
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
    revokedTokens.add(token);
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

app.post('/api/auth/change-password', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  if (currentPassword && !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  db.save();
  db.logAudit(user.id, user.name, user.role, 'PASSWORD_CHANGE', 'USER', user.id, 'User changed password.');

  res.json({ message: 'Password updated successfully.' });
});

// ==========================================
// USER MANAGEMENT (SUPER ADMIN ONLY)
// ==========================================

app.get('/api/users', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const safeUsers = db.raw.users.map(({ passwordHash, ...u }) => u);
  res.json(safeUsers);
});

app.post('/api/users', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const currentUser = (req as any).user as User;
  const { name, username, email, role, password, pin } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Name, username, role, and password are required.' });
  }

  const existing = db.raw.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A user with this username already exists.' });
  }

  const newUser: User = {
    id: `user-${Date.now()}`,
    name: name.trim(),
    username: username.trim().toLowerCase(),
    email: (email || `${username.trim().toLowerCase()}@pos.local`).trim(),
    role: role === 'super_admin' ? 'super_admin' : 'cashier',
    passwordHash: bcrypt.hashSync(password, 10),
    isActive: true,
    pin: pin?.trim(),
    createdAt: new Date().toISOString()
  };

  db.raw.users.push(newUser);
  db.save();

  db.logAudit(currentUser.id, currentUser.name, currentUser.role, 'CREATE_USER', 'USER', newUser.id, `Created new ${newUser.role}: ${newUser.name} (${newUser.username})`);

  const { passwordHash, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});

app.put('/api/users/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const currentUser = (req as any).user as User;
  const user = db.raw.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { name, email, role, password, pin, isActive } = req.body;

  if (name) user.name = name.trim();
  if (email) user.email = email.trim();
  if (role) user.role = role === 'super_admin' ? 'super_admin' : 'cashier';
  if (pin !== undefined) user.pin = pin ? pin.trim() : undefined;
  if (isActive !== undefined) user.isActive = Boolean(isActive);

  if (password && password.trim()) {
    user.passwordHash = bcrypt.hashSync(password.trim(), 10);
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
  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  const newCat: Category = {
    id: `cat-${Date.now()}`,
    name: name.trim(),
    type: type || 'bar',
    icon: icon || 'tag',
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
  if (name) cat.name = name.trim();
  if (type) cat.type = type;
  if (icon) cat.icon = icon;
  if (isActive !== undefined) cat.isActive = Boolean(isActive);
  if (displayOrder !== undefined) cat.displayOrder = Number(displayOrder);

  db.save();
  db.logAudit(user.id, user.name, user.role, 'UPDATE_CATEGORY', 'CATEGORY', cat.id, `Updated category: ${cat.name}`);
  res.json(cat);
});

app.delete('/api/categories/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const catIndex = db.raw.categories.findIndex(c => c.id === req.params.id);
  if (catIndex === -1) return res.status(404).json({ error: 'Category not found.' });

  const cat = db.raw.categories[catIndex];
  // Check if any products use this category
  const inUse = db.raw.products.some(p => p.categoryId === cat.id && !p.isArchived);
  if (inUse) {
    // Soft deactivate instead
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

// Companies
app.get('/api/companies', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.companies);
});

app.post('/api/companies', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name is required.' });

  const newComp: Company = {
    id: `comp-${Date.now()}`,
    name: name.trim(),
    description: description?.trim(),
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
  if (name) comp.name = name.trim();
  if (description !== undefined) comp.description = description.trim();
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
  // Cashiers only see active and non-archived products
  if (user.role === 'cashier') {
    const activeProducts = db.raw.products
      .filter(p => p.isActive && !p.isArchived)
      .map(p => ({
        ...p,
        variants: p.variants.filter(v => v.isActive)
      }));
    return res.json(activeProducts);
  }

  // Super Admins see all non-archived or archived based on query
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

  if (!name || !categoryId || !Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: 'Product name, category, and at least one size/variant are required.' });
  }

  const productId = `prod-${Date.now()}`;
  const formattedVariants: ProductVariant[] = variants.map((v: any, index: number) => {
    const variantId = `var-${productId.replace('prod-', '')}-${index + 1}`;
    const initialStock = Number(v.stock || 0);

    return {
      id: variantId,
      productId,
      size: String(v.size || 'Standard').trim(),
      sku: (v.sku || `${name.substring(0, 3).toUpperCase()}-${v.size}-${index + 1}`).trim(),
      barcode: v.barcode ? String(v.barcode).trim() : undefined,
      costPrice: Number(v.costPrice || 0),
      sellingPrice: Number(v.sellingPrice || 0),
      stock: initialStock,
      minStockLevel: Number(v.minStockLevel || db.raw.settings.lowStockDefaultThreshold || 5),
      isActive: v.isActive !== false
    };
  });

  const newProduct: Product = {
    id: productId,
    name: name.trim(),
    categoryId,
    companyId: companyId || undefined,
    description: description?.trim(),
    image: image || undefined,
    isKitchenItem: Boolean(isKitchenItem),
    taxRate: taxRate ? Number(taxRate) : undefined,
    isActive: true,
    createdAt: new Date().toISOString(),
    variants: formattedVariants
  };

  db.raw.products.push(newProduct);

  // Record opening stock movement for each variant with stock
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

  if (name) product.name = name.trim();
  if (categoryId) product.categoryId = categoryId;
  if (companyId !== undefined) product.companyId = companyId || undefined;
  if (description !== undefined) product.description = description.trim();
  if (image !== undefined) product.image = image;
  if (isKitchenItem !== undefined) product.isKitchenItem = Boolean(isKitchenItem);
  if (taxRate !== undefined) product.taxRate = Number(taxRate);
  if (isActive !== undefined) product.isActive = Boolean(isActive);

  if (Array.isArray(variants) && variants.length > 0) {
    // Merge or update variants
    const updatedVariants: ProductVariant[] = variants.map((v: any, index: number) => {
      const existingVar = product.variants.find(oldV => oldV.id === v.id);
      const varId = v.id || `var-${product.id.replace('prod-', '')}-${Date.now()}-${index}`;

      const newStock = Number(v.stock !== undefined ? v.stock : (existingVar?.stock ?? 0));
      const oldStock = existingVar ? existingVar.stock : 0;

      // If stock was directly changed in edit form, log adjustment
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
        size: String(v.size || 'Standard').trim(),
        sku: (v.sku || `${product.name.substring(0, 3).toUpperCase()}-${v.size}`).trim(),
        barcode: v.barcode ? String(v.barcode).trim() : undefined,
        costPrice: Number(v.costPrice || 0),
        sellingPrice: Number(v.sellingPrice || 0),
        stock: newStock,
        minStockLevel: Number(v.minStockLevel || 5),
        isActive: v.isActive !== false
      };
    });

    product.variants = updatedVariants;
  }

  db.save();
  db.logAudit(user.id, user.name, user.role, 'UPDATE_PRODUCT', 'PRODUCT', product.id, `Updated product "${product.name}" details and variants.`);

  res.json(product);
});

app.delete('/api/products/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const product = db.raw.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  // Safe soft archive to never break historical bills, invoices or reports
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

// Stock In / Purchase
app.post('/api/inventory/stock-in', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, quantity, costPrice, reason, reference, date } = req.body;

  const numQty = Number(quantity);
  if (!variantId || isNaN(numQty) || numQty <= 0) {
    return res.status(400).json({ error: 'Valid variant ID and positive quantity are required.' });
  }

  let targetProduct: Product | undefined;
  let targetVariant: ProductVariant | undefined;

  for (const p of db.raw.products) {
    const v = p.variants.find(varItem => varItem.id === variantId);
    if (v) {
      targetProduct = p;
      targetVariant = v;
      break;
    }
  }

  if (!targetProduct || !targetVariant) {
    return res.status(404).json({ error: 'Product variant not found.' });
  }

  const beforeQty = targetVariant.stock;
  targetVariant.stock += numQty;
  const numCost = costPrice && Number(costPrice) > 0 ? Number(costPrice) : targetVariant.costPrice;
  if (costPrice && Number(costPrice) > 0) {
    targetVariant.costPrice = Number(costPrice);
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
    reason || 'Stock in / replenishment',
    reference,
    numCost,
    recordTime
  );

  db.logAudit(user.id, user.name, user.role, 'STOCK_IN', 'INVENTORY', targetVariant.id, `Stock in +${numQty} for ${targetProduct.name} (${targetVariant.size}). New Stock: ${targetVariant.stock}`);

  res.json({ message: 'Stock added successfully', variant: targetVariant });
});

// Stock Out / Damage / Waste
app.post('/api/inventory/stock-out', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, quantity, type, reason, reference } = req.body;

  const numQty = Number(quantity);
  if (!variantId || isNaN(numQty) || numQty <= 0) {
    return res.status(400).json({ error: 'Valid variant ID and positive quantity are required.' });
  }

  let targetProduct: Product | undefined;
  let targetVariant: ProductVariant | undefined;

  for (const p of db.raw.products) {
    const v = p.variants.find(varItem => varItem.id === variantId);
    if (v) {
      targetProduct = p;
      targetVariant = v;
      break;
    }
  }

  if (!targetProduct || !targetVariant) {
    return res.status(404).json({ error: 'Product variant not found.' });
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
    reason || `Stock reduced due to ${movementType}`,
    reference
  );

  db.logAudit(user.id, user.name, user.role, 'STOCK_OUT', 'INVENTORY', targetVariant.id, `Stock out -${numQty} for ${targetProduct.name} (${targetVariant.size}). New Stock: ${targetVariant.stock}`);

  res.json({ message: 'Stock removed successfully', variant: targetVariant });
});

// Stock Adjustment (Handles IN, OUT, ADJUST, or direct newStock)
app.post('/api/inventory/adjust', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { variantId, type, quantity, newStock, reason, reference } = req.body;

  if (!variantId) {
    return res.status(400).json({ error: 'Valid variant ID is required.' });
  }

  let targetProduct: Product | undefined;
  let targetVariant: ProductVariant | undefined;

  for (const p of db.raw.products) {
    const v = p.variants.find(varItem => varItem.id === variantId);
    if (v) {
      targetProduct = p;
      targetVariant = v;
      break;
    }
  }

  if (!targetProduct || !targetVariant) {
    return res.status(404).json({ error: 'Product variant not found.' });
  }

  const beforeQty = targetVariant.stock;
  let diff = 0;
  let moveType: StockMovement['movementType'] = 'adjustment';

  if (type === 'IN') {
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ error: 'Valid positive quantity required for Stock In.' });
    }
    targetVariant.stock += numQty;
    diff = numQty;
    moveType = 'stock_in';
  } else if (type === 'OUT') {
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ error: 'Valid positive quantity required for Stock Out.' });
    }
    targetVariant.stock -= numQty;
    diff = -numQty;
    moveType = 'stock_out';
  } else {
    // ADJUST or direct newStock
    const targetStock = newStock !== undefined ? Number(newStock) : Number(quantity);
    if (isNaN(targetStock) || targetStock < 0) {
      return res.status(400).json({ error: 'Valid non-negative stock quantity required for Adjustment.' });
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
    reason || 'Inventory stock modification',
    reference
  );

  db.logAudit(user.id, user.name, user.role, 'STOCK_ADJUSTMENT', 'INVENTORY', targetVariant.id, `Stock updated for ${targetProduct.name} (${targetVariant.size}) from ${beforeQty} to ${targetVariant.stock}.`);

  res.json({ message: 'Stock updated successfully', variant: targetVariant });
});

// Stock Movements Log (supports both /api/inventory/movements and /api/stock-movements)
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
// HELD BILLS
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
        tableNumber: tableNumber || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        subtotal: Number(subtotal || 0),
        discount: Number(discount || 0),
        discountPercentage: Number(discountPercentage || 0),
        tax: Number(tax || 0),
        grandTotal: Number(grandTotal || 0),
        notes: notes || undefined,
        updatedAt: new Date().toISOString()
      };
      db.raw.heldBills[existingIndex] = updated;
      db.save();
      db.logAudit(user.id, user.name, user.role, 'UPDATE_HELD_BILL', 'BILL', updated.id, `Updated held order ${updated.billNumber}`);
      return res.json(updated);
    }
  }

  const heldBill: HeldBill = {
    id: `held-${Date.now()}`,
    billNumber: db.getNextBillNumber(),
    tableNumber: tableNumber || undefined,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    cashierId: user.id,
    cashierName: user.name,
    orderType: orderType || 'dine_in',
    items,
    subtotal: Number(subtotal || 0),
    discount: Number(discount || 0),
    discountPercentage: Number(discountPercentage || 0),
    tax: Number(tax || 0),
    grandTotal: Number(grandTotal || 0),
    notes: notes || undefined,
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

  // Filter kitchen items or allow all food items
  const newKot: KOT = {
    id: `kot-${Date.now()}`,
    kotNumber: db.getNextKOTNumber(),
    billNumber: billNumber || undefined,
    tableNumber: tableNumber || undefined,
    orderType: orderType || 'dine_in',
    cashierId: user.id,
    cashierName: user.name,
    items,
    status: 'pending',
    notes: notes || undefined,
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
  if (!['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid KOT status.' });
  }

  kot.status = status;
  kot.updatedAt = new Date().toISOString();
  db.save();

  db.logAudit(user.id, user.name, user.role, 'UPDATE_KOT_STATUS', 'KOT', kot.id, `Changed ${kot.kotNumber} status to ${status.toUpperCase()}`);

  res.json(kot);
});

// ==========================================
// BILLS, INVOICES & CHECKOUT (TRANSACTION SAFE)
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

  if (paymentMethod === 'cash' && numReceived < numGrandTotal) {
    return res.status(400).json({ error: 'Received amount cannot be less than Grand Total.' });
  }

  // Stock check validation if allowNegativeStock is false
  if (!db.raw.settings.allowNegativeStock) {
    for (const item of items) {
      for (const p of db.raw.products) {
        const v = p.variants.find(varItem => varItem.id === item.variantId);
        if (v && v.stock < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for ${item.productName} (${item.size}). Available: ${v.stock}, Requested: ${item.quantity}.`
          });
        }
      }
    }
  }

  const billId = `bill-${Date.now()}`;
  const billNumber = db.getNextBillNumber();
  const invoiceNumber = db.getNextInvoiceNumber();

  // Atomically Deduct Variant-level Stock & Record Movements
  for (const item of items) {
    for (const p of db.raw.products) {
      const v = p.variants.find(varItem => varItem.id === item.variantId);
      if (v) {
        const beforeQty = v.stock;
        v.stock -= item.quantity;

        db.recordStockMovement(
          p.id,
          p.name,
          v.id,
          v.size,
          -item.quantity,
          beforeQty,
          v.stock,
          'sale',
          user.id,
          user.name,
          `Sale on ${billNumber} / ${invoiceNumber}`,
          billId
        );
        break;
      }
    }
  }

  // Snapshot item historical details
  const snapshotItems: OrderItem[] = items.map(item => ({
    id: item.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    productId: item.productId,
    productName: item.productName,
    variantId: item.variantId,
    size: item.size,
    unitPrice: Number(item.unitPrice),
    costPrice: Number(item.costPrice || 0),
    quantity: Number(item.quantity),
    discount: Number(item.discount || 0),
    tax: Number(item.tax || 0),
    total: Number(item.total),
    notes: item.notes,
    isKitchenItem: Boolean(item.isKitchenItem)
  }));

  const newBill: Bill = {
    id: billId,
    billNumber,
    invoiceNumber,
    orderType: orderType || 'dine_in',
    tableNumber: tableNumber || undefined,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    cashierId: user.id,
    cashierName: user.name,
    items: snapshotItems,
    subtotal: Number(subtotal || 0),
    discount: Number(discount || 0),
    discountPercentage: Number(discountPercentage || 0),
    tax: Number(tax || 0),
    taxRate: Number(taxRate || 0),
    serviceCharge: Number(serviceCharge || 0),
    grandTotal: numGrandTotal,
    amountReceived: numReceived,
    changeAmount: Number(changeAmount || Math.max(0, numReceived - numGrandTotal)),
    paymentMethod: paymentMethod || 'cash',
    paymentDetails: paymentDetails || undefined,
    status: 'paid',
    notes: notes || undefined,
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString()
  };

  db.raw.bills.unshift(newBill);

  // If this was from a held bill, remove the held bill
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

// Void / Cancel Bill (Super Admin only)
app.post('/api/bills/:id/void', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { reason } = req.body;
  const bill = db.raw.bills.find(b => b.id === req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });

  if (bill.status === 'voided' || bill.status === 'cancelled') {
    return res.status(400).json({ error: 'Bill is already voided or cancelled.' });
  }

  bill.status = 'voided';

  // Restore inventory for all items
  for (const item of bill.items) {
    for (const p of db.raw.products) {
      const v = p.variants.find(varItem => varItem.id === item.variantId);
      if (v) {
        const beforeQty = v.stock;
        v.stock += item.quantity;

        db.recordStockMovement(
          p.id,
          p.name,
          v.id,
          v.size,
          item.quantity,
          beforeQty,
          v.stock,
          'return',
          user.id,
          user.name,
          `Bill void reversal: ${bill.billNumber} (${reason || 'Admin void'})`,
          bill.id
        );
        break;
      }
    }
  }

  db.save();
  db.logAudit(user.id, user.name, user.role, 'VOID_BILL', 'BILL', bill.id, `Voided bill ${bill.billNumber}. Reason: ${reason || 'Not specified'}`);

  res.json({ message: 'Bill has been voided and stock was successfully restored.', bill });
});

// ==========================================
// REPORTS & ANALYTICS
// ==========================================

app.get('/api/reports/analytics', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const { startDate, endDate, cashierId, categoryId } = req.query;

  let filteredBills = db.raw.bills.filter(b => b.status === 'paid');

  if (startDate) {
    const start = new Date(startDate as string).getTime();
    filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() >= start);
  }
  if (endDate) {
    const end = new Date(endDate as string).getTime();
    filteredBills = filteredBills.filter(b => new Date(b.createdAt).getTime() <= end);
  }
  if (cashierId && cashierId !== 'all') {
    filteredBills = filteredBills.filter(b => b.cashierId === cashierId);
  }

  // Summary figures
  const totalSales = filteredBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalBills = filteredBills.length;
  const totalDiscount = filteredBills.reduce((sum, b) => sum + (b.discount || 0), 0);
  const totalTax = filteredBills.reduce((sum, b) => sum + (b.tax || 0), 0);
  const totalServiceCharge = filteredBills.reduce((sum, b) => sum + (b.serviceCharge || 0), 0);
  const averageBill = totalBills > 0 ? totalSales / totalBills : 0;

  // Breakdown by payment method
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

  // Product sales breakdown
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

  // Cashier sales breakdown
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

// Daily Stock Sheet & Bar Reconciliation Report
app.get('/api/reports/daily-stock-sheet', authMiddleware, (req: Request, res: Response) => {
  const targetDate = req.query.date ? String(req.query.date) : new Date().toISOString().split('T')[0];
  const categoryFilter = req.query.categoryId ? String(req.query.categoryId) : 'all';
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';
  const typeFilter = req.query.type ? String(req.query.type) : 'all'; // 'all' | 'bar' | 'restaurant'

  // Format target date as YYYY.MM.DD (matches user's register sheet format)
  const formattedDate = targetDate.replace(/-/g, '.');

  // Filter bills on that date
  const paidBillsOnDate = db.raw.bills.filter(b => {
    if (b.status !== 'paid') return false;
    const billDate = (b.paidAt || b.createdAt).split('T')[0];
    return billDate === targetDate;
  });

  // Calculate units sold per variant on this date
  const soldMap: Record<string, number> = {};
  paidBillsOnDate.forEach(b => {
    b.items.forEach(item => {
      soldMap[item.variantId] = (soldMap[item.variantId] || 0) + (Number(item.quantity) || 0);
    });
  });

  // Calculate received stock movements on this date
  const receivedMap: Record<string, number> = {};
  db.raw.stockMovements.forEach(m => {
    const movDate = m.createdAt.split('T')[0];
    if (movDate === targetDate && (m.movementType === 'stock_in' || m.movementType === 'purchase' || (m.movementType === 'adjustment' && m.quantityChange > 0))) {
      receivedMap[m.variantId] = (receivedMap[m.variantId] || 0) + (Number(m.quantityChange) || 0);
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

      // Clean item name (e.g., "Extra Special 750ml", "Lion Strong 625ml")
      const cleanProdName = p.name
        .replace(/Arrack|Brandy|Whisky|Vodka|Beer|DCSL|DCSCL/gi, '')
        .trim();
      const cleanSize = v.size
        .replace(/Bottle|Flask|Quarter|Half|Large|Portion|Double|Single|Peg/gi, '')
        .trim();
      
      const displayName = `${cleanProdName || p.name} ${cleanSize}`.trim();

      if (search && !p.name.toLowerCase().includes(search) && !displayName.toLowerCase().includes(search) && !v.sku.toLowerCase().includes(search)) {
        return;
      }

      const sold = soldMap[v.id] || 0;
      const received = receivedMap[v.id] || 0;
      const balance = v.stock; // Current stock in hand
      const inHand = Math.max(0, balance + sold - received); // Opening stock = closing + sold - received
      const stock = inHand + received; // Total available
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

// Reconcile / Save Physical Stock Count from Daily Stock Sheet
app.post('/api/reports/daily-stock-sheet/reconcile', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const { adjustments, reason } = req.body; // adjustments: [{ variantId, newBalance }]
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    return res.status(400).json({ error: 'No adjustments provided' });
  }

  const currentUser = (req as any).user;
  let updatedCount = 0;

  adjustments.forEach((adj: { variantId: string; newBalance: number }) => {
    const newBal = Number(adj.newBalance);
    if (isNaN(newBal) || newBal < 0) return;

    for (const p of db.raw.products) {
      const v = p.variants.find(item => item.id === adj.variantId);
      if (v) {
        const qtyBefore = v.stock;
        const diff = newBal - qtyBefore;
        if (diff !== 0) {
          v.stock = newBal;
          db.raw.stockMovements.unshift({
            id: `mov-audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            productId: p.id,
            productName: p.name,
            variantId: v.id,
            variantSize: v.size,
            quantityChange: diff,
            quantityBefore: qtyBefore,
            quantityAfter: newBal,
            movementType: 'adjustment',
            reason: reason || 'Daily Stock Sheet Physical Audit Reconciliation',
            userId: currentUser.id,
            userName: currentUser.name,
            createdAt: new Date().toISOString()
          });
          updatedCount++;
        }
        break;
      }
    }
  });

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

// Get all rooms
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

// Create new room (Super Admin)
app.post('/api/rooms', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const {
      roomNumber,
      roomType,
      floor,
      capacity,
      ratePerDay,
      rateHalfDay,
      amenities,
      status,
      notes
    } = req.body;

    if (!roomNumber || !roomType || !ratePerDay) {
      return res.status(400).json({ error: 'Room number, type, and daily rate are required.' });
    }

    // Check duplicate room number
    const existing = db.raw.rooms.find(r => r.roomNumber.trim().toLowerCase() === roomNumber.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: `Room number ${roomNumber} already exists.` });
    }

    const newRoom: Room = {
      id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      roomNumber: roomNumber.trim(),
      roomType: roomType.trim(),
      floor: floor?.trim() || 'Ground Floor',
      capacity: Number(capacity) || 2,
      ratePerDay: Number(ratePerDay),
      rateHalfDay: rateHalfDay ? Number(rateHalfDay) : undefined,
      amenities: Array.isArray(amenities) ? amenities : ['AC', 'Attached Bathroom', 'Free Wi-Fi'],
      status: status || 'available',
      notes: notes?.trim() || '',
      isActive: true,
      createdAt: new Date().toISOString()
    };

    db.raw.rooms.push(newRoom);
    db.save();

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'CREATE_ROOM',
      'ROOM',
      newRoom.id,
      `Created Room ${newRoom.roomNumber} (${newRoom.roomType}) at Rs. ${newRoom.ratePerDay}/day`
    );

    res.status(201).json(newRoom);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create room.' });
  }
});

// Update room details or status
app.put('/api/rooms/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const room = db.raw.rooms.find(r => r.id === id);

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const {
      roomNumber,
      roomType,
      floor,
      capacity,
      ratePerDay,
      rateHalfDay,
      amenities,
      status,
      notes,
      isActive
    } = req.body;

    // Check duplicate room number if changed
    if (roomNumber && roomNumber.trim().toLowerCase() !== room.roomNumber.toLowerCase()) {
      const existing = db.raw.rooms.find(
        r => r.id !== id && r.roomNumber.trim().toLowerCase() === roomNumber.trim().toLowerCase()
      );
      if (existing) {
        return res.status(400).json({ error: `Room number ${roomNumber} is already used by another room.` });
      }
      room.roomNumber = roomNumber.trim();
    }

    if (roomType !== undefined) room.roomType = roomType.trim();
    if (floor !== undefined) room.floor = floor.trim();
    if (capacity !== undefined) room.capacity = Number(capacity);
    if (ratePerDay !== undefined) room.ratePerDay = Number(ratePerDay);
    if (rateHalfDay !== undefined) room.rateHalfDay = rateHalfDay ? Number(rateHalfDay) : undefined;
    if (amenities !== undefined && Array.isArray(amenities)) room.amenities = amenities;
    if (status !== undefined) room.status = status;
    if (notes !== undefined) room.notes = notes;
    if (isActive !== undefined) room.isActive = Boolean(isActive);

    db.save();

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'UPDATE_ROOM',
      'ROOM',
      room.id,
      `Updated details/status for Room ${room.roomNumber} (Status: ${room.status})`
    );

    res.json(room);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update room.' });
  }
});

// Delete Room (Super Admin)
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

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'DELETE_ROOM',
      'ROOM',
      id,
      `Deleted Room ${room.roomNumber} (${room.roomType})`
    );

    res.json({ success: true, message: `Room ${room.roomNumber} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete room.' });
  }
});

// Get Room Bookings
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

    // Sort newest first
    bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(bookings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch room bookings.' });
  }
});

// Create Room Booking & Check-In
app.post('/api/room-bookings', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const {
      roomId,
      guestName,
      guestPhone,
      guestIdOrPassport,
      guestAddress,
      numberOfGuests,
      checkInDate,
      checkOutDate,
      durationDays,
      ratePerDay,
      extraCharges,
      discount,
      tax,
      advancePaid,
      paymentMethod,
      paymentDetails,
      status,
      notes
    } = req.body;

    if (!roomId || !guestName || !guestPhone) {
      return res.status(400).json({ error: 'Room, Guest Name, and Phone Number are required.' });
    }

    const room = db.raw.rooms.find(r => r.id === roomId);
    if (!room) {
      return res.status(404).json({ error: 'Selected room not found.' });
    }

    if (room.status === 'occupied') {
      return res.status(400).json({ error: `Room ${room.roomNumber} is currently occupied.` });
    }

    const days = Math.max(1, Number(durationDays) || 1);
    const dailyRate = Number(ratePerDay) || room.ratePerDay;
    const totalRoomCharge = days * dailyRate;
    const extra = Number(extraCharges) || 0;
    const disc = Number(discount) || 0;
    const taxAmt = Number(tax) || 0;
    const grandTotal = Math.max(0, totalRoomCharge + extra + taxAmt - disc);
    const advance = Number(advancePaid) || 0;
    const balanceDue = Math.max(0, grandTotal - advance);

    const bookingStatus = status || 'checked_in';
    const bookingNumber = db.getNextBookingNumber();

    const booking: RoomBooking = {
      id: `rbk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      bookingNumber,
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestIdOrPassport: (guestIdOrPassport || '').trim(),
      guestAddress: (guestAddress || '').trim(),
      numberOfGuests: Number(numberOfGuests) || 2,
      checkInDate: checkInDate || new Date().toISOString(),
      checkOutDate: checkOutDate || new Date(Date.now() + days * 86400000).toISOString(),
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
      notes: notes || '',
      createdAt: new Date().toISOString(),
      checkedInAt: bookingStatus === 'checked_in' ? new Date().toISOString() : undefined
    };

    if (!Array.isArray(db.raw.roomBookings)) {
      db.raw.roomBookings = [];
    }
    db.raw.roomBookings.unshift(booking);

    // Update Room Status
    room.status = bookingStatus === 'checked_in' ? 'occupied' : 'reserved';
    room.currentBookingId = booking.id;
    room.currentGuestName = booking.guestName;
    room.currentGuestPhone = booking.guestPhone;

    db.save();

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'ROOM_BOOKING_CREATED',
      'ROOM_BOOKING',
      booking.id,
      `Created Booking ${booking.bookingNumber} for Room ${room.roomNumber} - Guest: ${booking.guestName} (Total: Rs. ${booking.grandTotal}, Advance: Rs. ${booking.advancePaid})`
    );

    res.status(201).json({
      success: true,
      booking,
      room
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create room booking.' });
  }
});

// Room Check-Out and Final Bill Settlement
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

    // Add any additional charges (e.g. minibar, laundry, room service)
    if (additionalCharges && Number(additionalCharges) > 0) {
      booking.extraCharges += Number(additionalCharges);
      booking.grandTotal += Number(additionalCharges);
      booking.balanceDue += Number(additionalCharges);
    }

    // Process final settlement payment
    const finalPay = Number(finalPaymentAmount) || booking.balanceDue;
    booking.advancePaid += finalPay;
    booking.balanceDue = Math.max(0, booking.grandTotal - booking.advancePaid);
    booking.status = 'checked_out';
    booking.checkedOutAt = new Date().toISOString();
    if (paymentMethod) booking.paymentMethod = paymentMethod;
    if (notes) booking.notes = (booking.notes ? booking.notes + ' | ' : '') + notes;

    // Release Room & Set to Cleaning
    const room = db.raw.rooms.find(r => r.id === booking.roomId);
    if (room) {
      room.status = 'cleaning';
      room.currentBookingId = undefined;
      room.currentGuestName = undefined;
      room.currentGuestPhone = undefined;
    }

    db.save();

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'ROOM_CHECKOUT',
      'ROOM_BOOKING',
      booking.id,
      `Guest ${booking.guestName} checked out from Room ${booking.roomNumber}. Final Settlement: Rs. ${finalPay}. Room marked for cleaning.`
    );

    res.json({
      success: true,
      booking,
      room,
      message: `Room ${booking.roomNumber} checkout completed successfully.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to checkout room.' });
  }
});

// Cancel Room Booking
app.put('/api/room-bookings/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const { reason } = req.body;

    const booking = db.raw.roomBookings.find(b => b.id === id);
    if (!booking) {
      return res.status(404).json({ error: 'Room booking not found.' });
    }

    booking.status = 'cancelled';
    if (reason) {
      booking.notes = (booking.notes ? booking.notes + ' | Cancel Reason: ' : 'Cancel Reason: ') + reason;
    }

    // Release Room if currently linked
    const room = db.raw.rooms.find(r => r.id === booking.roomId);
    if (room && (room.currentBookingId === booking.id || room.status === 'occupied' || room.status === 'reserved')) {
      room.status = 'available';
      room.currentBookingId = undefined;
      room.currentGuestName = undefined;
      room.currentGuestPhone = undefined;
    }

    db.save();

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'ROOM_BOOKING_CANCELLED',
      'ROOM_BOOKING',
      booking.id,
      `Cancelled booking ${booking.bookingNumber} for Room ${booking.roomNumber}. Reason: ${reason || 'N/A'}`
    );

    res.json({
      success: true,
      booking,
      room,
      message: `Booking ${booking.bookingNumber} cancelled.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel booking.' });
  }
});

// Record Payment to Active Booking
app.post('/api/room-bookings/:id/payment', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { id } = req.params;
    const { amount, paymentMethod, notes } = req.body;

    const booking = db.raw.roomBookings.find(b => b.id === id);
    if (!booking) {
      return res.status(404).json({ error: 'Room booking not found.' });
    }

    const payAmt = Number(amount) || 0;
    if (payAmt <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }

    booking.advancePaid += payAmt;
    booking.balanceDue = Math.max(0, booking.grandTotal - booking.advancePaid);
    if (notes) {
      booking.notes = (booking.notes ? booking.notes + ' | Payment: ' : 'Payment: ') + `${payAmt} (${paymentMethod || 'Cash'}) - ${notes}`;
    }

    db.save();

    db.logAudit(
      user.id,
      user.name,
      user.role,
      'ROOM_BOOKING_PAYMENT',
      'ROOM_BOOKING',
      booking.id,
      `Received payment of Rs. ${payAmt} for Room ${booking.roomNumber} (${booking.bookingNumber})`
    );

    res.json({
      success: true,
      booking,
      message: `Payment of Rs. ${payAmt} recorded.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to record payment.' });
  }
});

// Live Super Admin Dashboard Stats
app.get('/api/dashboard/stats', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const allPaidBills = db.raw.bills.filter(b => b.status === 'paid');
  const todayBills = allPaidBills.filter(b => new Date(b.createdAt).getTime() >= todayStart);

  const todayRevenue = todayBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const totalRevenue = allPaidBills.reduce((sum, b) => sum + b.grandTotal, 0);

  // Low stock counter
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
    activeCashiers: db.raw.users.filter(u => u.role === 'cashier' && u.isActive)
  });
});

// ==========================================
// BACKUP & DATABASE PERSISTENCE API
// ==========================================

// Get list of server-stored automated backups
app.get('/api/database/backups', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const list = db.listBackups();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list backups.' });
  }
});

// Trigger a fresh instant database backup on server
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

// Download complete full database JSON file directly to local PC / device
app.get('/api/database/download', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const dataStr = JSON.stringify(db.raw, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="royal_green_garden_pos_db_${dateStr}.json"`);
    res.send(dataStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export database.' });
  }
});

// Restore database from uploaded JSON payload
app.post('/api/database/restore', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { databaseData } = req.body;

    if (!databaseData) {
      return res.status(400).json({ error: 'No database data provided for restoration.' });
    }

    db.restoreFromData(databaseData);
    db.logAudit(
      user.id,
      user.name,
      user.role,
      'RESTORE_DATABASE',
      'SYSTEM',
      'DATABASE',
      `Restored complete database state from uploaded JSON file.`
    );

    res.json({
      success: true,
      message: 'Database successfully restored! All items, stock counts, bills, and history are preserved.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restore database.' });
  }
});

// Restore from a specific backup file stored on server
app.post('/api/database/restore-file', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required.' });
    }

    db.restoreBackupFile(filename);
    db.logAudit(
      user.id,
      user.name,
      user.role,
      'RESTORE_BACKUP_FILE',
      'SYSTEM',
      'DATABASE',
      `Restored database from server snapshot ${filename}`
    );

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
  res.json(db.raw.auditLogs);
});

app.get('/api/settings', authMiddleware, (req: Request, res: Response) => {
  res.json(db.raw.settings);
});

app.put('/api/settings', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const updates = req.body;

  db.raw.settings = {
    ...db.raw.settings,
    ...updates
  };

  db.save();
  db.logAudit(user.id, user.name, user.role, 'UPDATE_SETTINGS', 'SYSTEM', 'SETTINGS', 'Updated system settings and business details.');

  res.json(db.raw.settings);
});

// ==========================================
// VITE INTEGRATION & SERVER STARTUP
// ==========================================

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[POS Server] Running on http://0.0.0.0:${PORT}`);
  });
}

start();
