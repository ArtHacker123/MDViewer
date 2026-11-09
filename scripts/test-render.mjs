import puppeteer from 'puppeteer-core';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test', 'output');
const samplePath = path.join(root, 'test', 'sample.md');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

const failures = [];

function check(name, condition, detail) {
  if (condition) {
    console.log('  PASS  ' + name);
  } else {
    failures.push(name + (detail ? ' -> ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : ''));
  }
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.md': 'text/plain; charset=utf-8',
  };
  return types[ext] || 'application/octet-stream';
}

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function startServer(markdown) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/sample.md' || pathname === '/docs/sample.md' ||
        pathname === '/docs/README.md' || pathname === '/UPPER.MD') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(markdown);
        return;
      }

      if (pathname === '/fake.md') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('<!DOCTYPE html><html><body><h1 id="fake">Real HTML page</h1><p>not markdown</p></body></html>');
        return;
      }

      if (pathname === '/docs/guide.md' || pathname === '/guide.md') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('# Guide');
        return;
      }

      if (pathname === '/docs/images/logo.png' || pathname === '/images/logo.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(onePixelPng);
        return;
      }

      const allowed = ['/src/', '/vendor/', '/icons/', '/test/'];
      if (!allowed.some((prefix) => pathname.startsWith(prefix))) {
        res.writeHead(404);
        res.end('not found');
        return;
      }

      const filePath = path.join(root, pathname);
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }

      res.writeHead(200, { 'Content-Type': mimeType(filePath), 'Cache-Control': 'no-store' });
      createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchBrowser(useExtension) {
  const args = [
    '--allow-file-access-from-files',
    '--no-sandbox',
    '--disable-gpu',
    '--font-render-hinting=none',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (useExtension) {
    args.push('--disable-extensions-except=' + root);
    args.push('--load-extension=' + root);
  }

  return puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args,
  });
}

function collectErrors(page, label) {
  page.on('pageerror', (err) => console.log('  [' + label + ' pageerror] ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [' + label + ' console.error] ' + msg.text());
  });
  if (process.env.MDV_DEBUG) {
    page.on('response', (res) => {
      if (res.status() >= 400) console.log('  [' + label + ' ' + res.status() + '] ' + res.url());
    });
  }
}

async function testManifest() {
  console.log('\nManifest');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

  check('manifest_version is 3', manifest.manifest_version === 3);
  check('has name and version', !!manifest.name && !!manifest.version);

  const refs = new Set();
  Object.values(manifest.icons || {}).forEach((value) => refs.add(value));
  Object.values((manifest.action && manifest.action.default_icon) || {}).forEach((value) => refs.add(value));
  if (manifest.action && manifest.action.default_popup) refs.add(manifest.action.default_popup);
  for (const script of manifest.content_scripts || []) {
    (script.js || []).forEach((value) => refs.add(value));
    (script.css || []).forEach((value) => refs.add(value));
  }

  for (const rel of refs) {
    check('exists ' + rel, existsSync(path.join(root, rel)));
  }
}

async function testSandbox(markdown) {
  console.log('\nSandbox render');
  const browser = await launchBrowser(false);

  try {
    const page = await browser.newPage();
    collectErrors(page, 'sandbox');
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    const sandboxUrl = pathToFileURL(path.join(root, 'test', 'sandbox.html')).href;
    await page.goto(sandboxUrl, { waitUntil: 'load' });

    const result = await page.evaluate(async (md) => {
      const rootEl = document.getElementById('root');
      const rendered = await window.MDViewer.render(md, rootEl, {
        baseUrl: 'https://example.com/docs/README.md',
      });
      await document.fonts.ready;

      const guide = document.querySelector('#root a[href^="https://example.com/docs/guide.md"]');
      const img = document.querySelector('#root img');
      const text = rootEl.textContent || '';
      const styledDiv = Array.from(rootEl.querySelectorAll('div')).find(
        (el) => el.textContent === '带内联样式的 div'
      );

      return {
        headings: rendered.headings,
        tables: rootEl.querySelectorAll('table').length,
        taskChecked: rootEl.querySelectorAll('input[type=checkbox][checked]').length,
        taskUnchecked: rootEl.querySelectorAll('input[type=checkbox]:not([checked])').length,
        strike: rootEl.querySelectorAll('del, s').length,
        hljsTokens: rootEl.querySelectorAll('pre code .hljs-keyword, pre code .hljs-string, pre code .hljs-title').length,
        mermaidSvgs: rootEl.querySelectorAll('.mermaid svg').length,
        mermaidErrors: rootEl.querySelectorAll('.mdv-mermaid-error').length,
        mermaidErrorCode: (() => {
          const el = rootEl.querySelector('.mdv-mermaid-error-code');
          return !!el && el.textContent.indexOf('not a valid diagram') !== -1;
        })(),
        mermaidCodeBlocks: rootEl.querySelectorAll('pre code.language-mermaid').length,
        katex: rootEl.querySelectorAll('.katex').length,
        katexDisplay: rootEl.querySelectorAll('.katex-display').length,
        inlineCodeMath: Array.from(rootEl.querySelectorAll('code')).some(
          (el) => el.textContent.indexOf('$not math$') !== -1
        ),
        currencyText: text.indexOf('价格是 $5 和 $10') !== -1,
        codeBlockMath: Array.from(rootEl.querySelectorAll('pre code')).some(
          (el) => el.textContent.indexOf('$math$') !== -1
        ),
        codeMathNodes: rootEl.querySelectorAll('pre code .katex').length,
        tableBorder: (() => {
          const td = rootEl.querySelector('table td');
          return td ? getComputedStyle(td).borderTopWidth : '';
        })(),
        codeBackground: (() => {
          const pre = rootEl.querySelector('pre.hljs');
          return pre ? getComputedStyle(pre).backgroundColor : '';
        })(),
        mermaidWidth: (() => {
          const svg = rootEl.querySelector('.mermaid svg');
          return svg ? svg.getBoundingClientRect().width : 0;
        })(),
        katexFont: document.fonts.check('16px KaTeX_Main'),
        headingIds: Array.from(rootEl.querySelectorAll('h1, h2')).map((h) => h.id),
        anchors: rootEl.querySelectorAll('.mdv-anchor').length,
        guide: guide ? { href: guide.getAttribute('href'), target: guide.target, rel: guide.rel } : null,
        imgSrc: img ? img.getAttribute('src') : null,
        pwned: !!window.__pwned,
        scripts: rootEl.querySelectorAll('script').length,
        iframes: rootEl.querySelectorAll('iframe').length,
        userStyleLeaked: !!(styledDiv && styledDiv.hasAttribute('style')),
        rawStrong: rootEl.querySelectorAll('strong').length,
        frontMatterLeak: text.includes('author: test'),
      };
    }, markdown);

    check('renders headings', result.headings.length >= 8, 'count=' + result.headings.length);
    check('renders table', result.tables === 1);
    check('renders checked task item', result.taskChecked === 1);
    check('renders unchecked task item', result.taskUnchecked === 1);
    check('renders strikethrough', result.strike >= 1);
    check('highlights code', result.hljsTokens > 0, 'tokens=' + result.hljsTokens);
    check('renders mermaid diagrams', result.mermaidSvgs === 2, 'svgs=' + result.mermaidSvgs);
    check('handles invalid mermaid diagrams', result.mermaidErrors === 1 && result.mermaidErrorCode, JSON.stringify({ errors: result.mermaidErrors, code: result.mermaidErrorCode }));
    check('converts mermaid fences', result.mermaidCodeBlocks === 0, 'count=' + result.mermaidCodeBlocks);
    check('renders inline math', result.katex === 5, 'katex=' + result.katex);
    check('renders display math', result.katexDisplay === 3, 'display=' + result.katexDisplay);
    check('keeps math inside inline code', result.inlineCodeMath === true);
    check('keeps math inside code blocks', result.codeBlockMath === true && result.codeMathNodes === 0, JSON.stringify({ text: result.codeBlockMath, nodes: result.codeMathNodes }));
    check('keeps currency text intact', result.currencyText === true);
    check('applies table styles', result.tableBorder !== '' && result.tableBorder !== '0px', result.tableBorder);
    check('applies code block styles', result.codeBackground !== '' && result.codeBackground !== 'rgba(0, 0, 0, 0)', result.codeBackground);
    check('sizes mermaid svg', result.mermaidWidth > 0, String(result.mermaidWidth));
    check('loads KaTeX fonts', result.katexFont === true);
    check('adds heading ids', result.headingIds.every(Boolean), JSON.stringify(result.headingIds));
    check('adds heading anchors', result.anchors === result.headings.length);
    check('resolves relative links', result.guide && result.guide.href === 'https://example.com/docs/guide.md', JSON.stringify(result.guide));
    check('opens external links in new tab', result.guide && result.guide.target === '_blank' && result.guide.rel.includes('noopener'), JSON.stringify(result.guide));
    check('resolves relative images', result.imgSrc === 'https://example.com/docs/images/logo.png', String(result.imgSrc));
    check('strips front matter', !result.frontMatterLeak);
    check('removes script tags', result.scripts === 0 && !result.pwned);
    check('removes iframes', result.iframes === 0);
    check('removes user inline styles', result.userStyleLeaked === false);
    check('keeps safe raw html', result.rawStrong >= 2, 'strong=' + result.rawStrong);

    const screenshot = path.join(outDir, 'screenshot.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('  screenshot: ' + screenshot);

    await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    const darkScreenshot = path.join(outDir, 'screenshot-dark.png');
    await page.screenshot({ path: darkScreenshot, fullPage: true });
    console.log('  screenshot: ' + darkScreenshot);
  } finally {
    await browser.close();
  }
}

async function testViewer(baseUrl) {
  console.log('\nViewer page');
  const browser = await launchBrowser(false);

  try {
    const page = await browser.newPage();
    collectErrors(page, 'viewer');
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });

    await page.goto(baseUrl + '/src/viewer/viewer.html', { waitUntil: 'load' });

    const [chooser] = await Promise.all([
      page.waitForFileChooser(),
      page.click('#pickBtn'),
    ]);
    await chooser.accept([samplePath]);

    await page.waitForSelector('#content:not([hidden]) .mdv-markdown table', { timeout: 30000 });
    await page.waitForSelector('.mdv-markdown .mermaid svg', { timeout: 30000 });

    const state = await page.evaluate(() => ({
      emptyHidden: document.getElementById('empty').hidden,
      contentHidden: document.getElementById('content').hidden,
      title: document.title,
      tables: document.querySelectorAll('#article table').length,
      mermaid: document.querySelectorAll('#article .mermaid svg').length,
      mermaidErrors: document.querySelectorAll('#article .mdv-mermaid-error').length,
      katex: document.querySelectorAll('#article .katex').length,
      rawHidden: document.getElementById('raw').hidden,
      tocHidden: document.getElementById('toc').hidden,
    }));

    check('opens file via picker', state.emptyHidden && !state.contentHidden);
    check('sets document title', state.title.indexOf('sample.md') !== -1, state.title);
    check('renders table in viewer', state.tables === 1);
    check('renders mermaid in viewer', state.mermaid === 2, 'count=' + state.mermaid);
    check('handles invalid mermaid in viewer', state.mermaidErrors === 1, 'count=' + state.mermaidErrors);
    check('renders math in viewer', state.katex === 5, 'count=' + state.katex);
    check('raw view hidden initially', state.rawHidden === true);
    check('toc hidden initially', state.tocHidden === true);

    await page.click('#rawBtn');
    const rawState = await page.evaluate(() => ({
      rawVisible: !document.getElementById('raw').hidden,
      articleHidden: document.getElementById('article').hidden,
      hasSource: document.getElementById('raw').textContent.indexOf('flowchart LR') !== -1,
      label: document.getElementById('rawBtn').textContent,
    }));
    check('toggles raw view', rawState.rawVisible && rawState.articleHidden && rawState.hasSource);
    check('raw button label updates', rawState.label === '预览', rawState.label);

    await page.click('#tocBtn');
    const tocState = await page.evaluate(() => ({
      tocVisible: !document.getElementById('toc').hidden,
      links: document.querySelectorAll('#toc a').length,
    }));
    check('toggles table of contents', tocState.tocVisible && tocState.links >= 8, JSON.stringify(tocState));

    await page.goto(baseUrl + '/src/viewer/viewer.html?url=' + encodeURIComponent('/docs/sample.md'), { waitUntil: 'load' });
    await page.waitForSelector('#content:not([hidden]) .mdv-markdown table', { timeout: 30000 });
    await page.waitForSelector('.mdv-markdown .mermaid svg', { timeout: 30000 });

    const urlState = await page.evaluate(() => {
      const img = document.querySelector('#article img');
      const guide = document.querySelector('#article a[href$="/docs/guide.md"]');
      return {
        input: document.getElementById('urlInput').value,
        search: location.search,
        imgSrc: img ? img.getAttribute('src') : null,
        guideHref: guide ? guide.getAttribute('href') : null,
        tables: document.querySelectorAll('#article table').length,
      };
    });

    check('loads markdown from url', urlState.tables === 1 && urlState.input.indexOf('/docs/sample.md') !== -1, JSON.stringify(urlState));
    check('resolves relative image against source url', urlState.imgSrc === baseUrl + '/docs/images/logo.png', String(urlState.imgSrc));
    check('resolves relative link against source url', urlState.guideHref === baseUrl + '/docs/guide.md', String(urlState.guideHref));
    check('stores url in location', urlState.search.indexOf('url=') !== -1, urlState.search);

    await page.goto(
      baseUrl + '/src/viewer/viewer.html?url=' + encodeURIComponent(baseUrl + '/fake.md'),
      { waitUntil: 'load' }
    );
    await page.waitForSelector('.mdv-error', { timeout: 30000 });
    const errorText = await page.evaluate(() => document.querySelector('.mdv-error').textContent);
    check('rejects html responses in viewer', errorText.indexOf('HTML') !== -1, errorText);

    await page.goto(baseUrl + '/src/viewer/viewer.html?action=open', { waitUntil: 'load' });
    const actionState = await page.waitForSelector('#pickBtn.is-attention', { timeout: 5000 })
      .then(() => page.evaluate(() => document.activeElement && document.activeElement.id))
      .catch(() => null);
    check('highlights picker from action param', actionState === 'pickBtn', String(actionState));
  } finally {
    await browser.close();
  }
}

async function testContentScript(baseUrl) {
  console.log('\nContent script');
  const browser = await launchBrowser(true);

  try {
    const page = await browser.newPage();
    collectErrors(page, 'content');
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });

    await page.goto(baseUrl + '/sample.md', { waitUntil: 'load' });
    await page.waitForSelector('.mdv-page .mdv-markdown table', { timeout: 30000 });
    await page.waitForSelector('.mdv-page .mermaid svg', { timeout: 30000 });

    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      const relative = document.querySelector('.mdv-markdown a[href$="guide.md"]');
      const external = document.querySelector('.mdv-markdown a[href="https://example.com/docs/other.md"]');
      const td = document.querySelector('.mdv-markdown table td');
      const pre = document.querySelector('.mdv-markdown pre.hljs');
      const svg = document.querySelector('.mdv-markdown .mermaid svg');
      return {
        title: document.title,
        active: document.documentElement.classList.contains('mdv-active'),
        tables: document.querySelectorAll('.mdv-markdown table').length,
        mermaid: document.querySelectorAll('.mdv-markdown .mermaid svg').length,
        mermaidErrors: document.querySelectorAll('.mdv-markdown .mdv-mermaid-error').length,
        katexDisplay: document.querySelectorAll('.mdv-markdown .katex-display').length,
        toolbar: document.querySelectorAll('.mdv-toolbar .mdv-btn').length,
        rawHidden: document.querySelector('.mdv-raw').hidden,
        relativeTarget: relative ? relative.target : null,
        externalTarget: external ? external.target : null,
        externalRel: external ? external.rel : null,
        tableBorder: td ? getComputedStyle(td).borderTopWidth : '',
        codeBackground: pre ? getComputedStyle(pre).backgroundColor : '',
        mermaidWidth: svg ? svg.getBoundingClientRect().width : 0,
        katexFont: document.fonts.check('16px KaTeX_Main'),
      };
    });

    check('renders markdown page', state.tables === 1 && state.mermaid === 2 && state.mermaidErrors === 1 && state.katexDisplay === 3, JSON.stringify(state));
    check('sets page title', state.title === 'sample.md', state.title);
    check('marks document active', state.active === true);
    check('shows toolbar', state.toolbar === 3, 'buttons=' + state.toolbar);
    check('applies styles in content page', state.tableBorder !== '' && state.tableBorder !== '0px' && state.codeBackground !== '' && state.codeBackground !== 'rgba(0, 0, 0, 0)', JSON.stringify({ table: state.tableBorder, code: state.codeBackground }));
    check('sizes mermaid in content page', state.mermaidWidth > 0, String(state.mermaidWidth));
    check('loads KaTeX fonts in content page', state.katexFont === true);
    check('raw view hidden initially', state.rawHidden === true);
    check('relative links stay in tab', state.relativeTarget === '', String(state.relativeTarget));
    check('external links open new tab', state.externalTarget === '_blank' && state.externalRel.indexOf('noopener') !== -1, JSON.stringify({ target: state.externalTarget, rel: state.externalRel }));

    await page.click('[data-act="raw"]');
    const rawState = await page.evaluate(() => ({
      rawVisible: !document.querySelector('.mdv-raw').hidden,
      articleHidden: document.querySelector('.mdv-markdown').hidden,
      hasSource: document.querySelector('.mdv-raw').textContent.indexOf('flowchart LR') !== -1,
      label: document.querySelector('[data-act="raw"]').textContent,
    }));
    check('toggles raw view', rawState.rawVisible && rawState.articleHidden && rawState.hasSource);
    check('raw button label updates', rawState.label === '预览', rawState.label);

    await page.click('[data-act="toc"]');
    const tocState = await page.evaluate(() => ({
      visible: !document.querySelector('.mdv-toc').hidden,
      links: document.querySelectorAll('.mdv-toc a').length,
    }));
    check('toggles table of contents', tocState.visible && tocState.links >= 8, JSON.stringify(tocState));

    await page.goto(baseUrl + '/sample.md?raw=1', { waitUntil: 'load' });
    await page.waitForSelector('.mdv-page .mdv-markdown table', { timeout: 30000 });
    check('renders markdown urls with query strings', true);

    await page.goto(baseUrl + '/UPPER.MD', { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const upperState = await page.evaluate(() => ({
      rendered: !!document.querySelector('.mdv-page .mdv-markdown table'),
    }));
    check('renders uppercase .MD urls', upperState.rendered === true, JSON.stringify(upperState));

    await page.goto(baseUrl + '/fake.md', { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const fakeState = await page.evaluate(() => ({
      rendered: !!document.querySelector('.mdv-page'),
      html: !!document.getElementById('fake'),
    }));
    check('skips html pages with md paths', !fakeState.rendered && fakeState.html, JSON.stringify(fakeState));

    const extPage = await browser.newPage();
    collectErrors(extPage, 'extension');
    await extPage.goto('chrome://extensions/', { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const extensionId = await extPage.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      const list = manager && manager.shadowRoot &&
        manager.shadowRoot.querySelector('extensions-item-list');
      const item = list && list.shadowRoot && list.shadowRoot.querySelector('extensions-item');
      return item ? item.id : null;
    });
    check('finds loaded extension', !!extensionId, String(extensionId));

    if (extensionId) {
      await extPage.goto(
        'chrome-extension://' + extensionId + '/src/viewer/viewer.html?url=' +
        encodeURIComponent(baseUrl + '/sample.md'),
        { waitUntil: 'load' }
      );
      await extPage.waitForSelector('#content:not([hidden]) .mdv-markdown table', { timeout: 30000 });
      await extPage.waitForSelector('.mdv-markdown .mermaid svg', { timeout: 30000 });

      const extState = await extPage.evaluate(async () => {
        await document.fonts.ready;
        return {
          tables: document.querySelectorAll('.mdv-markdown table').length,
          mermaid: document.querySelectorAll('.mdv-markdown .mermaid svg').length,
          mermaidErrors: document.querySelectorAll('.mdv-markdown .mdv-mermaid-error').length,
          katex: document.querySelectorAll('.mdv-markdown .katex').length,
          katexFont: document.fonts.check('16px KaTeX_Main'),
        };
      });

      check('loads viewer page from extension origin',
        extState.tables === 1 && extState.mermaid === 2 &&
        extState.mermaidErrors === 1 && extState.katex === 5,
        JSON.stringify(extState));
      check('loads KaTeX fonts on extension page', extState.katexFont === true);
    }

    await extPage.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!chromePath) {
    console.error('Chrome executable not found. Set CHROME_PATH.');
    process.exitCode = 1;
    return;
  }
  console.log('Chrome: ' + chromePath);

  await mkdir(outDir, { recursive: true });
  const markdown = await readFile(samplePath, 'utf8');

  const server = await startServer(markdown);
  const baseUrl = 'http://127.0.0.1:' + server.address().port;

  try {
    await testManifest();
    await testSandbox(markdown);
    await testViewer(baseUrl);
    await testContentScript(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('');
  if (failures.length) {
    console.error(failures.length + ' test(s) failed:');
    for (const failure of failures) console.error('  - ' + failure);
    process.exitCode = 1;
  } else {
    console.log('All tests passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
