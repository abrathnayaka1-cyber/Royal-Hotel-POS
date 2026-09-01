/**
 * PHP backend checker (no PHP runtime required).
 *
 *   node tools/check-php.mjs
 *
 * 1. Parses every .php file with php-parser            -> syntax errors
 * 2. Resolves every require/include target             -> missing files
 * 3. Resolves every function call against the functions
 *    defined by the project + PHP builtins             -> undefined functions
 * 4. Validates every embedded SQL statement against the
 *    schema declared in database.sql                   -> unknown tables/columns
 *
 * Exits non-zero when anything is wrong, so it can be used in CI.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Engine } = require('php-parser');

const BUILTINS = new Set(`
  addcslashes array array_combine array_filter array_key_exists array_keys array_map array_slice array_values
  apache_request_headers base64_encode basename bin2hex count date die echo empty error_log exit explode
  file file_exists file_get_contents file_put_contents filter_var floatval function_exists getenv getmypid
  hash hash_equals header http_response_code implode in_array intval is_array is_file is_numeric is_string
  json_decode json_encode max microtime min number_format parse_url password_hash password_verify preg_match
  preg_replace print random_bytes rename round rtrim setcookie sort sprintf str_replace strlen strpos
  strtolower strtoupper strtotime substr sys_get_temp_dir time trim ucfirst ucwords uniqid
`.split(/\s+/).filter(Boolean));

const phpFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.php')) phpFiles.push(p);
  }
})(ROOT);

if (!phpFiles.length) {
  console.log('No PHP files found - nothing to check.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1-3. AST based checks
// ---------------------------------------------------------------------------
const engine = new Engine({ parser: { extractDoc: true }, ast: { withLocations: true } });
const defined = new Set();
const calls = [];
const includes = [];
const syntaxErrors = [];

function visit(node, file) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(n => visit(n, file));

  if (node.kind === 'function' && node.name) defined.add(String(node.name.name ?? node.name).toLowerCase());
  if (node.kind === 'call' && node.what?.kind === 'name') {
    calls.push({ file, name: String(node.what.name) });
  }
  if (node.kind === 'include') includes.push({ file, target: node.target });

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'documentation') continue;
    const v = node[key];
    if (v && typeof v === 'object') visit(v, file);
  }
}

function resolveInclude(target, file) {
  if (target?.kind !== 'bin' || target.type !== '.') return null;
  const parts = [];
  let n = target;
  while (n && n.kind === 'bin' && n.type === '.') { parts.unshift(n.right); n = n.left; }
  parts.unshift(n);
  let s = '';
  for (const p of parts) {
    if (p?.kind === 'magic' && String(p.value ?? p.name).toLowerCase() === '__dir__') s += path.dirname(file);
    else if (p?.kind === 'string') s += p.value;
    else return null;
  }
  return path.resolve(s);
}

for (const f of phpFiles) {
  const code = fs.readFileSync(f, 'utf8');
  try {
    visit(engine.parseCode(code, path.relative(ROOT, f)), f);
  } catch (err) {
    syntaxErrors.push(`${path.relative(ROOT, f)}:${err.lineNumber ?? err.line ?? '?'} ${err.message}`);
  }
}

const rel = f => path.relative(ROOT, f);
const problems = [];

console.log(`PHP files scanned: ${phpFiles.length}`);

if (syntaxErrors.length) {
  problems.push(...syntaxErrors.map(s => `SYNTAX  ${s}`));
} else {
  console.log('  ✔ syntax OK');
}

const missingIncludes = includes
  .map(i => ({ ...i, resolved: resolveInclude(i.target, i.file) }))
  .filter(i => i.resolved && !fs.existsSync(i.resolved))
  .map(i => `INCLUDE ${rel(i.file)} requires missing file ${rel(i.resolved)}`);
if (missingIncludes.length) problems.push(...missingIncludes);
else console.log('  ✔ every require/include target exists');

const seen = new Set();
for (const c of calls) {
  const key = c.name.toLowerCase();
  if (defined.has(key) || BUILTINS.has(key) || seen.has(`${c.file}:${key}`)) continue;
  seen.add(`${c.file}:${key}`);
  problems.push(`FUNCTION ${rel(c.file)} calls undefined function ${c.name}()`);
}
if (!problems.some(p => p.startsWith('FUNCTION'))) console.log('  ✔ every function call resolves');

// ---------------------------------------------------------------------------
// 4. SQL vs database.sql
// ---------------------------------------------------------------------------
const schema = new Map();
const ddl = fs.readFileSync(path.join(ROOT, 'database.sql'), 'utf8');
const tableRe = /CREATE TABLE `(\w+)` \(([\s\S]*?)\n\) ENGINE/g;
let m;
while ((m = tableRe.exec(ddl))) {
  const cols = new Set();
  for (const line of m[2].split('\n')) {
    const cm = /^\s*`(\w+)`\s+[A-Z]/.exec(line);
    if (cm) cols.add(cm[1]);
  }
  schema.set(m[1], cols);
}

const SQL_KEYWORDS = new Set(`
  select from where and or not null as on inner left right join outer group by order desc asc limit
  offset insert into values update set delete distinct sum count max min coalesce date now case when
  then else end in like between is union all length substr cast char
`.split(/\s+/).filter(Boolean));

let statements = 0;
function checkSql(stmt, file, line) {
  statements++;
  const tables = new Map();
  const refs = [];
  const fromRe = /\b(?:FROM|JOIN|INTO|UPDATE)\s+`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?/gi;
  let t;
  while ((t = fromRe.exec(stmt))) {
    // `x` is the placeholder used for interpolated `{$table}` identifiers in
    // dynamically-built queries (e.g. nextSequenceNumber()); those cannot be
    // validated statically.
    if (t[1] === 'x') return;
    if (!schema.has(t[1])) { problems.push(`SQL     ${file}:${line} unknown table \`${t[1]}\``); continue; }
    const alias = t[2] && !SQL_KEYWORDS.has(t[2].toLowerCase()) ? t[2] : t[1];
    tables.set(alias, t[1]);
    refs.push(t[1]);
  }
  if (!refs.length) return;

  const allCols = new Set();
  for (const tbl of refs) for (const c of schema.get(tbl)) allCols.add(c);

  const colRe = /\b(\w+)\.(\w+)\b/g;
  let c;
  while ((c = colRe.exec(stmt))) {
    const [, alias, col] = c;
    if (/^\d/.test(alias) || SQL_KEYWORDS.has(alias.toLowerCase())) continue;
    if (!tables.has(alias)) { problems.push(`SQL     ${file}:${line} unknown alias \`${alias}\``); continue; }
    if (!schema.get(tables.get(alias)).has(col)) {
      problems.push(`SQL     ${file}:${line} \`${col}\` is not a column of \`${tables.get(alias)}\``);
    }
  }

  const cleaned = stmt.replace(/'[^']*'/g, "''").replace(/:\w+/g, '?');
  const bareRe = /(?:WHERE|AND|OR|SET|SELECT|BY|,)\s+`?(\w+)`?(?=\s*(?:=|<|>|<=|>=|<>|LIKE|IN|IS|,|\)|$))/gi;
  let b;
  while ((b = bareRe.exec(cleaned))) {
    const col = b[1];
    if (/^\d+$/.test(col) || SQL_KEYWORDS.has(col.toLowerCase()) || tables.has(col)) continue;
    if (!allCols.has(col)) problems.push(`SQL     ${file}:${line} unresolved column \`${col}\` (tables: ${refs.join(', ')})`);
  }
}

for (const f of phpFiles) {
  const code = fs.readFileSync(f, 'utf8');
  const strRe = /(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let s;
  while ((s = strRe.exec(code))) {
    const body = s[2];
    if (!/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/i.test(body)) continue;
    const line = code.slice(0, s.index).split('\n').length;
    checkSql(body.replace(/\{\$\w+\}/g, 'x').replace(/\$\w+/g, 'x'), rel(f), line);
  }
}
if (!problems.some(p => p.startsWith('SQL'))) {
  console.log(`  ✔ ${statements} embedded SQL statements match database.sql (${schema.size} tables)`);
}

if (problems.length) {
  console.log('\n❌ Problems found:');
  for (const p of [...new Set(problems)]) console.log('  ' + p);
  process.exit(1);
}
console.log('\n✅ PHP backend checks passed');
