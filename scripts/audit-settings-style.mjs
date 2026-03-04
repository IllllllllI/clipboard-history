import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const settingsDir = path.join(root, 'src', 'components', 'SettingsModal');
const exts = new Set(['.tsx', '.css']);

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

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (exts.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function isForbiddenRuntimeToken(token) {
  if (!token) return false;

  for (const state of forbiddenStateTokens) {
    if (token === `--${state}`) return true;
    if (token.endsWith(`--${state}`)) return true;
  }

  return false;
}

function extractTsxClassTokens(content) {
  const out = [];
  const classRegex = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

  let m;
  while ((m = classRegex.exec(content)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const sanitized = raw.replace(/\$\{[^}]*\}/g, ' ');
    out.push(...sanitized.split(/\s+/).filter(Boolean));
  }

  return out;
}

function extractCssClassTokens(content) {
  const out = [];
  const classRegex = /\.([a-zA-Z0-9_-]+)/g;

  let m;
  while ((m = classRegex.exec(content)) !== null) {
    out.push(m[1]);
  }

  return out;
}

async function main() {
  const files = await walk(settingsDir);
  const issues = [];
  const seen = new Set();

  for (const file of files) {
    const ext = path.extname(file);
    const content = await fs.readFile(file, 'utf8');
    const tokens = ext === '.tsx' ? extractTsxClassTokens(content) : extractCssClassTokens(content);

    for (const token of tokens) {
      if (!isForbiddenRuntimeToken(token)) continue;

      const rel = path.relative(root, file).replaceAll('\\\\', '/');
      const issue = `检测到已弃用运行时状态类: ${token}`;
      const key = `${rel}::${issue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ file: rel, issue });
    }
  }

  if (issues.length === 0) {
    console.log('✅ SettingsModal 样式审计通过');
    return;
  }

  console.error(`❌ SettingsModal 样式审计失败，共 ${issues.length} 项`);
  for (const item of issues) {
    console.error(`- [${item.file}] ${item.issue}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
