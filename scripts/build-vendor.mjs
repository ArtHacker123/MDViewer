import { copyFile, mkdir, readFile, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const vendor = path.join(root, 'vendor');

function from(...parts) {
  return path.join(root, ...parts);
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function copy(src, dest) {
  await ensureDir(path.dirname(dest));
  await copyFile(src, dest);
}

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

async function main() {
  await rm(vendor, { recursive: true, force: true });
  await ensureDir(vendor);

  const files = [
    [path.join(nm, 'marked/lib/marked.umd.js'), path.join(vendor, 'marked.umd.js')],
    [path.join(nm, 'dompurify/dist/purify.min.js'), path.join(vendor, 'purify.min.js')],
    [path.join(nm, 'katex/dist/katex.min.js'), path.join(vendor, 'katex.min.js')],
    [path.join(nm, 'mermaid/dist/mermaid.min.js'), path.join(vendor, 'mermaid.min.js')],
  ];

  for (const [src, dest] of files) {
    await copy(src, dest);
  }

  const katexFontDir = path.join(nm, 'katex/dist/fonts');
  const fontData = new Map();
  for (const name of await readdir(katexFontDir)) {
    if (!name.endsWith('.woff2')) continue;
    const data = await readFile(path.join(katexFontDir, name));
    fontData.set(name, data.toString('base64'));
  }

  const katexCss = await readFile(path.join(nm, 'katex/dist/katex.min.css'), 'utf8');
  const embeddedKatexCss = katexCss.replace(
    /src:url\(fonts\/([^)]+\.woff2)\) format\("woff2"\),url\([^;]*;/g,
    (match, name) => {
      const data = fontData.get(name);
      if (!data) throw new Error('Missing KaTeX font: ' + name);
      return 'src:url(data:font/woff2;base64,' + data + ') format("woff2");';
    }
  );
  if (embeddedKatexCss.includes('url(fonts/')) {
    throw new Error('KaTeX CSS still references external font files');
  }
  await writeFile(path.join(vendor, 'katex.min.css'), embeddedKatexCss, 'utf8');

  const ghCss = await readFile(path.join(nm, 'github-markdown-css/github-markdown.css'), 'utf8');
  const scopedGhCss = ghCss
    .replace(/\.markdown-body/g, '.mdv-markdown')
    .replace(/,\s*\[data-theme="dark"\]/g, '')
    .replace(/,\s*\[data-theme="light"\]/g, '');
  await writeFile(path.join(vendor, 'github-markdown.css'), scopedGhCss, 'utf8');

  const lightCss = await readFile(path.join(nm, 'highlight.js/styles/github.css'), 'utf8');
  const darkCss = await readFile(path.join(nm, 'highlight.js/styles/github-dark.css'), 'utf8');
  const hljsCss = [
    '@scope (.mdv-markdown) {',
    lightCss,
    '@media (prefers-color-scheme: dark) {',
    darkCss,
    '}',
    '}',
    '',
  ].join('\n');
  await writeFile(path.join(vendor, 'hljs.css'), hljsCss, 'utf8');

  await build({
    entryPoints: [from('scripts/hljs-entry.js')],
    outfile: path.join(vendor, 'highlight.min.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome118'],
    legalComments: 'none',
  });

  const expected = [
    'marked.umd.js',
    'highlight.min.js',
    'purify.min.js',
    'katex.min.js',
    'katex.min.css',
    'mermaid.min.js',
    'github-markdown.css',
    'hljs.css',
  ];

  let missing = 0;
  for (const rel of expected) {
    const full = path.join(vendor, rel);
    if (!existsSync(full)) {
      console.error('MISSING: ' + rel);
      missing++;
    }
  }
  if (missing) process.exitCode = 1;

  console.log('Vendor files ready:');
  for (const rel of expected) {
    const full = path.join(vendor, rel);
    if (existsSync(full)) {
      const info = await stat(full);
      console.log('  ' + rel.padEnd(34) + formatSize(info.size));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
