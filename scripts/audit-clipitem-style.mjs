import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const clipItemDir = path.join(root, 'src', 'components', 'ClipItem');
const exts = new Set(['.tsx', '.css']);

const allowedExact = new Set(['truncate', 'custom-scrollbar', 'dark']);
const allowedPrefix = ['clip-item-', 'clip-item-color-picker-', 'react-colorful'];

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

function extractClasses(filePath, content) {
  const out = [];
  const ext = path.extname(filePath);

  if (ext === '.tsx') {
    const jsxClassRegex = /className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;
    let m;
    while ((m = jsxClassRegex.exec(content)) !== null) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      const sanitized = raw.replace(/\$\{[^}]*\}/g, ' ');
      out.push(...sanitized.split(/\s+/).filter(Boolean));
    }
  }

  if (ext === '.css') {
    const cssClassRegex = /\.([a-zA-Z0-9_-]+)/g;
    let m;
    while ((m = cssClassRegex.exec(content)) !== null) {
      out.push(m[1]);
    }
  }

  return out;
}

function checkToken(token) {
  if (!token) return null;
  if (token.startsWith('--')) return null;
  if (allowedExact.has(token)) return null;
  if (allowedPrefix.some((prefix) => token.startsWith(prefix))) return null;

  if (token.startsWith('is-')) {
    return `禁止使用 is-* 状态类: ${token}`;
  }

  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(token)) {
    return `非 ClipItem 前缀类名: ${token}`;
  }

  return null;
}

async function main() {
  const files = await walk(clipItemDir);
  const issues = [];
  const seenIssues = new Set();

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const tokens = extractClasses(file, content);

    for (const token of tokens) {
      const issue = checkToken(token);
      if (issue) {
        const normalizedFile = path.relative(root, file).replaceAll('\\\\', '/');
        const key = `${normalizedFile}::${issue}`;
        if (seenIssues.has(key)) continue;
        seenIssues.add(key);
        issues.push({ file: normalizedFile, issue });
      }
    }
  }

  if (issues.length === 0) {
    console.log('✅ ClipItem 样式审计通过');
    return;
  }

  console.error(`❌ ClipItem 样式审计失败，共 ${issues.length} 项`);
  for (const item of issues) {
    console.error(`- [${item.file}] ${item.issue}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
