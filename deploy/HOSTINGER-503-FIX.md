# 503 Error Fix — Hostinger Deployments Panel

**Website:** `pos.royalgreengarden.com`  (hPanel → Websites → Deployments → Settings and redeploy)

---

## ඔයාගේ screenshot එකේ තියෙන ප්‍රශ්න (Problems in your screenshot)

| Setting | දැන් තියෙන විදිහ | හරි වෙන්න ඕන විදිහ |
|---|---|---|
| **Node version** | ❌ `20.x` | ✅ **`22.x`** (project එකට Node 22 අවශ්‍යයි — `package.json` → `engines: >=22.0.0`) |
| **Source files** | ❌ `Royal-Hotel-POS-main (5).zip` (GitHub zip) | ✅ Upload කරන්න **`royal-hotel-pos-deploy.zip`** (මම හදලා දීලා තියෙනවා — `dist/` + `.env` ඇතුළුව) |

> ⚠️ **GitHub zip එක 503 එන තැන තමයි:** GitHub එකේ `dist/` (build) **නෑ** — ඒක `.gitignore` එකේ තියෙන නිසා ඔයා බාගත් zip එකේ එන්නේ නෑ. Server එක build නෑ නම් start වෙන්නේම නෑ → 503.

---

## ✔️ DIRECT FIX — මේ විදිහට කරන්න (step by step)

### Step 1 — Source files
1. **"Upload new files"** radio button එක select කරන්න
2. **`royal-hotel-pos-deploy.zip`** upload කරන්න (files එකෙන් බාගන්න)

### Step 2 — Build configuration
| Field | Value |
|---|---|
| Framework preset | **Express** (එහෙමම තියන්න) |
| **Node version** | ❌ `20.x` → ✅ **`22.x`** (dropdown එකෙන් වෙනස් කරන්න!) |
| Root directory | **`.`** හෝ empty (zip එකේ folder එක root එකේම තියෙන නිසා) |

### Step 3 — Build command / Run command (Build configuration එකට පහළින් fields තියෙනවා නම්)
```
Build command:  npm run build
Run command:    npm start
```

### Step 4 — Environment variables (මේක නැතුව server එක start වෙන්නේ නෑ!)
Left menu එකේ **"Environment variables"** click කරලා මේ ඒවා add කරන්න:

```env
NODE_ENV=production
# Generate your own strong secret (NOT committed to git) and keep it stable:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=<your-random-secret-above>
# Only used on a BRAND NEW database; change after first login.
DEFAULT_ADMIN_PASSWORD=<your-admin-password>
```

> ⚠️ `SESSION_SECRET` එක **අනිවාර්යයි** — මේක නැත්නම් production එකේදී server එක **start වෙන්නේම නැහැ** (`[SECURITY][FATAL] Refusing to start in production`) → 503.

### Step 5 — Deploy / Redeploy
- ඒ අගයන් දාලා **Deploy** button එක ඔබන්න
- Build එක සම්පූර්ණ වෙනකම් (මිනිත්තු 2-5) ඉන්න
- ඉවර වුණාම browser එකෙන් `https://pos.royalgreengarden.com` open කරන්න (**Ctrl+Shift+R** = hard refresh)

---

## 🔑 First login (brand new database එකක් නම්)

- **Username:** `Admin`
- **Password:** ඔයා environment variables එකේ දාපු `DEFAULT_ADMIN_PASSWORD` අගය
- Log in වුණාම → **Admin → Users** → password එක වෙනස් කරන්න!

> කලින් ඔයා දැනටමත් site එක පාවිච්චි කරලා data තියෙනවා නම්, `DEFAULT_ADMIN_PASSWORD` එක **නව database එකකට විතරයි** apply වෙන්නේ. ඒ නිසා ඔයාගේ පරණ password එකම භාවිතා කරන්න (නැත්නම් Admin → System Settings → Database Backup එකෙන් restore කරන්න).

---

## තාම 503 එනවා නම් — මේක බලන්න

1. **Runtime logs** (left menu) එකේ error එක කියවන්න
2. පොදු errors:
   - `[SECURITY][FATAL] ... SESSION_SECRET` → Environment variables එකේ වැරදි / නෑ
   - `Frontend build not found` → build command එක run වෙලා නෑ / source zip එක වැරදියි
   - `[FATAL] Port 3000 is already in use` → PORT env වෙනස් කරන්න (Hostinger දෙන PORT එක භාවිතා කරන්න)
   - `EACCES ... pos_data` → POS_DATA_DIR path එක write කරන්න බැහැ → ඒ env එක අයින් කරන්න

---

## 💡 වැදගත් අවවාදයක් (data safety)

Hostinger Deployments (Git-based redeploys) මගින් app folder එක replace වෙන්න පුළුවන්. ඒ නිසා:
- **Admin → System Settings → Database Backup** → **Export DB (JSON)** — වැඩ අතරතුර regularව local PC එකට බාගන්න
- ඒවා off-machine backups!! කවදාවත් data පමණක් upload/download කරලා ආරක්ෂා කරගන්න
