import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const TAURI_SERVICE_FILE = path.join(ROOT, 'src', 'services', 'tauri.ts');
const DB_SERVICE_FILE = path.join(ROOT, 'src', 'services', 'db.ts');
const OUTPUT_FILE = path.join(ROOT, 'docs', 'service-api-usage-matrix.md');

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function getMethodsFromTauriService(content) {
  const methods = [];
  const regex = /^\s*async\s+([A-Za-z0-9_]+)\s*\(/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    methods.push(match[1]);
  }
  return methods;
}

function getMethodsFromDbService(content) {
  const methods = [];
  const regex = /^\s*([A-Za-z0-9_]+)\s*:\s*\(/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    methods.push(match[1]);
  }
  return methods;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function toRelative(p) {
  return toPosix(path.relative(ROOT, p));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectUsage(files, prefix, methods) {
  const usageMap = new Map();

  for (const method of methods) {
    usageMap.set(method, {
      count: 0,
      files: new Set(),
    });
  }

  for (const file of files) {
    const rel = toRelative(file);
    for (const method of methods) {
      const pattern = new RegExp(`${escapeRegExp(prefix)}\\.${escapeRegExp(method)}\\(`, 'g');
      const text = globalFileContentCache.get(file);
      if (!text) continue;
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const stat = usageMap.get(method);
        stat.count += matches.length;
        stat.files.add(rel);
      }
    }
  }

  return usageMap;
}

function renderTable(title, usageMap, methodOrder) {
  const lines = [];
  lines.push(`## ${title}`);
  lines.push('');
  lines.push('| 方法 | 调用次数 | 调用文件 |');
  lines.push('|---|---:|---|');

  for (const method of methodOrder) {
    const stat = usageMap.get(method) ?? { count: 0, files: new Set() };
    const fileText = stat.files.size > 0 ? Array.from(stat.files).sort().map((f) => '`' + f + '`').join('，') : '—';
    lines.push(`| ${method} | ${stat.count} | ${fileText} |`);
  }

  lines.push('');
  return lines.join('\n');
}

function renderZeroRefSection(title, usageMap, methodOrder) {
  const zeroMethods = methodOrder.filter((method) => {
    const stat = usageMap.get(method);
    return !stat || stat.count === 0;
  });

  const lines = [];
  lines.push(`## ${title}`);
  lines.push('');

  if (zeroMethods.length === 0) {
    lines.push('- 无（全部方法在 `src/**` 中存在直接调用）');
    lines.push('');
    return lines.join('\n');
  }

  for (const method of zeroMethods) {
    lines.push(`- ${method}`);
  }
  lines.push('');
  return lines.join('\n');
}

const globalFileContentCache = new Map();

async function main() {
  const [tauriContent, dbContent] = await Promise.all([
    readText(TAURI_SERVICE_FILE),
    readText(DB_SERVICE_FILE),
  ]);

  const tauriMethods = getMethodsFromTauriService(tauriContent);
  const dbMethods = getMethodsFromDbService(dbContent);

  const allSrcFiles = await walkFiles(SRC_DIR);
  const sourceFiles = allSrcFiles.filter((file) => {
    const rel = toRelative(file);
    return rel !== 'src/services/tauri.ts' && rel !== 'src/services/db.ts';
  });

  await Promise.all(sourceFiles.map(async (file) => {
    globalFileContentCache.set(file, await readText(file));
  }));

  const tauriUsage = collectUsage(sourceFiles, 'TauriService', tauriMethods);
  const dbUsage = collectUsage(sourceFiles, 'ClipboardDB', dbMethods);

  const now = new Date();
  const updatedAt = now.toLocaleString('zh-CN', { hour12: false });

  const parts = [];
  parts.push('# 服务层 API 使用矩阵');
  parts.push('');
  parts.push(`更新时间：${updatedAt}`);
  parts.push('');
  parts.push('## 统计范围');
  parts.push('');
  parts.push('- 服务文件：`src/services/tauri.ts`、`src/services/db.ts`');
  parts.push('- 调用扫描范围：`src/**/*.ts`、`src/**/*.tsx`（不含服务文件自身）');
  parts.push('- 统计口径：仅统计直接调用（`TauriService.method(` / `ClipboardDB.method(`）');
  parts.push('');

  parts.push(renderTable('TauriService', tauriUsage, tauriMethods));
  parts.push(renderTable('ClipboardDB', dbUsage, dbMethods));
  parts.push(renderZeroRefSection('零引用候选（TauriService）', tauriUsage, tauriMethods));
  parts.push(renderZeroRefSection('零引用候选（ClipboardDB）', dbUsage, dbMethods));

  parts.push('## 说明');
  parts.push('');
  parts.push('- 该文档由脚本自动生成，请勿手工长期维护。');
  parts.push('- 若采用动态属性访问或变量转发调用，本扫描不会命中。');
  parts.push('');

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, parts.join('\n'), 'utf8');

  console.log(`已生成：${toRelative(OUTPUT_FILE)}`);
}

main().catch((error) => {
  console.error('生成服务使用矩阵失败：', error);
  process.exit(1);
});
