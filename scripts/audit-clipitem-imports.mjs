import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const clipItemDir = path.join(srcDir, 'components', 'ClipItem');
const exts = new Set(['.ts', '.tsx']);

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

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

function hasDirectClipItemSubpathImport(specifier) {
  return /\/ClipItem\/.+/.test(specifier) || /\/ClipItem\/.+/.test(`/${specifier}`);
}

function isBarrelImport(specifier) {
  return /\/ClipItem$/.test(specifier) || specifier.endsWith('/ClipItem/index') || specifier.endsWith('/ClipItem/index.tsx');
}

function extractImportSpecifiers(content) {
  const out = [];
  const importRegex = /import\s+(?:type\s+)?(?:[^'";]+from\s+)?['"]([^'"]+)['"];?/g;
  const exportRegex = /export\s+[^'";]*from\s+['"]([^'"]+)['"];?/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    out.push(match[1]);
  }
  while ((match = exportRegex.exec(content)) !== null) {
    out.push(match[1]);
  }

  return out;
}

async function main() {
  const files = await walk(srcDir);
  const issues = [];

  for (const file of files) {
    if (normalizePath(file).startsWith(normalizePath(clipItemDir + path.sep))) {
      continue;
    }

    const content = await fs.readFile(file, 'utf8');
    const specifiers = extractImportSpecifiers(content);

    for (const specifier of specifiers) {
      if (!specifier.includes('ClipItem')) continue;
      if (isBarrelImport(specifier)) continue;

      if (hasDirectClipItemSubpathImport(specifier)) {
        issues.push({
          file: normalizePath(path.relative(root, file)),
          specifier,
        });
      }
    }
  }

  if (issues.length === 0) {
    console.log('✅ ClipItem 导入路径审计通过');
    return;
  }

  console.error(`❌ ClipItem 导入路径审计失败，共 ${issues.length} 项`);
  for (const issue of issues) {
    console.error(`- [${issue.file}] 请改为从 barrel 导入: ${issue.specifier}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
