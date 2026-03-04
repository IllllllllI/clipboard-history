import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'docs');

async function walkMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractDocRefs(content) {
  const refs = new Set();
  const regex = /docs\/[A-Za-z0-9_./-]+\.md/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const ref = match[0];
    if (ref.includes('...')) continue;
    refs.add(ref);
  }

  return Array.from(refs);
}

async function main() {
  const mdFiles = await walkMarkdownFiles(docsDir);
  mdFiles.push(path.join(root, 'README.md'));

  const issues = [];

  for (const file of mdFiles) {
    const content = await fs.readFile(file, 'utf8');
    const refs = extractDocRefs(content);

    for (const ref of refs) {
      const target = path.join(root, ref);
      try {
        await fs.access(target);
      } catch {
        issues.push({
          source: path.relative(root, file).replaceAll('\\\\', '/'),
          ref,
        });
      }
    }
  }

  if (issues.length === 0) {
    console.log('✅ Docs 链接审计通过');
    return;
  }

  console.error(`❌ Docs 链接审计失败，共 ${issues.length} 项`);
  for (const item of issues) {
    console.error(`- [${item.source}] 引用了不存在的文档: ${item.ref}`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
