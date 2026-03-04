import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targets = [
  path.join(root, 'src', 'components', 'FileListDisplay.tsx'),
  path.join(root, 'src', 'components', 'styles', 'file-list-display.css'),
];
const exts = new Set(['.tsx', '.css']);

const allowedExact = new Set();
const allowedPrefix = ['file-list-'];
const forbiddenStateTokens = [
  'active',
  'idle',
  'dark',
  'light',
  'on',
  'off',
  'error',
  'recording',
  'disabled',
  'synced',
  'syncing',
  'ready',
  'registering',
  'pulsing',
];

async function walk(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return exts.has(path.extname(entryPath)) ? [entryPath] : [];
  }

  const entries = await fs.readdir(entryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (exts.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractTsxClassTokens(content) {
  const out = [];
  const classRegex = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    const sanitized = raw.replace(/\$\{[^}]*\}/g, ' ');
    out.push(...sanitized.split(/\s+/).filter(Boolean));
  }

  return out;
}

function extractCssClassTokens(content) {
  const out = [];
  const classRegex = /\.([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    out.push(match[1]);
  }

  return out;
}

function isForbiddenRuntimeToken(token) {
  for (const state of forbiddenStateTokens) {
    if (token === `--${state}`) return true;
    if (token.endsWith(`--${state}`)) return true;
  }
  return false;
}

function checkToken(token) {
  if (!token) return null;
  if (token.startsWith('--')) return '检测到已弃用运行时状态类';
  if (token.startsWith('is-')) return `禁止使用 is-* 状态类: ${token}`;
  if (isForbiddenRuntimeToken(token)) return `检测到已弃用运行时状态类: ${token}`;
  if (allowedExact.has(token)) return null;
  if (allowedPrefix.some((prefix) => token.startsWith(prefix))) return null;

  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) {
    return `非 FileList 前缀类名: ${token}`;
  }

  return null;
}

async function main() {
  const files = [];
  for (const target of targets) {
    files.push(...(await walk(target)));
  }

  const issues = [];
  const seen = new Set();

  for (const file of files) {
    const ext = path.extname(file);
    const content = await fs.readFile(file, 'utf8');
    const tokens = ext === '.tsx' ? extractTsxClassTokens(content) : extractCssClassTokens(content);

    for (const token of tokens) {
      const issue = checkToken(token);
      if (!issue) continue;

      const rel = path.relative(root, file).replaceAll('\\\\', '/');
      const key = `${rel}::${issue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ file: rel, issue });
    }
  }

  if (issues.length === 0) {
    console.log('✅ FileList 样式审计通过');
    return;
  }

  console.error(`❌ FileList 样式审计失败，共 ${issues.length} 项`);
  for (const item of issues) {
    console.error(`- [${item.file}] ${item.issue}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
