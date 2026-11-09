(function () {
  'use strict';

  if (window.__mdvStarted) return;

  var LOGO =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" ' +
    'd="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.7C0 12.48.52 13 1.15 13h13.7c.63 0 ' +
    '1.15-.52 1.15-1.15v-7.7C16 3.52 15.48 3 14.85 3zM9 11H7V7.5L5.5 9.5 4 7.5V11H2V5h2l1.5 ' +
    '2L7 5h2v6zm4.5-3h-1.5v3h-2V8H8.5V6h1.5V3h2v3h1.5v2z"/></svg>';

  function getPathname() {
    try {
      return decodeURIComponent(location.pathname);
    } catch (err) {
      return location.pathname;
    }
  }

  function isMarkdownUrl() {
    return /\.(md|markdown|mdown|mkd)$/i.test(getPathname());
  }

  function isPlainTextView() {
    if (!document.body) return false;

    var contentType = (document.contentType || '').toLowerCase();
    if (contentType.indexOf('text/html') !== -1) return false;

    var pre = document.querySelector('body > pre');
    if (pre) {
      var significant = Array.prototype.filter.call(document.body.children, function (el) {
        return !/^(SCRIPT|STYLE|LINK|META|TITLE)$/.test(el.tagName);
      });
      if (significant.length === 1 && significant[0] === pre) return true;
    }

    if (contentType === 'text/plain' || contentType === 'text/markdown' ||
      contentType === 'text/x-markdown') {
      return document.body.children.length <= 2;
    }

    return false;
  }

  function extractMarkdown() {
    var pre = document.querySelector('body > pre') || document.querySelector('pre');
    if (pre) return pre.textContent;
    return document.body.innerText;
  }

  function getFilename() {
    var raw = location.pathname.split('/').pop() || '';
    try {
      raw = decodeURIComponent(raw);
    } catch (err) {
      return raw || 'Markdown';
    }
    return raw || 'Markdown';
  }

  function showError(article, err) {
    article.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'mdv-error';

    var title = document.createElement('h2');
    title.textContent = 'Markdown 渲染失败';

    var detail = document.createElement('div');
    detail.textContent = err && err.message ? err.message : String(err);

    box.appendChild(title);
    box.appendChild(detail);
    article.appendChild(box);
  }

  function scrollToHash() {
    if (!location.hash) return;
    var id = location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch (err) {
      id = location.hash.slice(1);
    }
    var target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ block: 'start' });
    }
  }

  function start() {
    if (!window.MDViewer) return;

    var markdown = extractMarkdown();
    var filename = getFilename();

    window.__mdvStarted = true;

    document.title = filename;
    document.documentElement.classList.add('mdv-active');
    document.body.className = 'mdv-active';
    document.body.removeAttribute('style');

    var page = document.createElement('div');
    page.className = 'mdv-page';
    page.innerHTML =
      '<header class="mdv-toolbar">' +
        '<div class="mdv-title">' + LOGO + '<span class="mdv-filename"></span></div>' +
        '<div class="mdv-actions">' +
          '<button type="button" class="mdv-btn" data-act="toc" aria-pressed="false">目录</button>' +
          '<button type="button" class="mdv-btn" data-act="raw" aria-pressed="false">源码</button>' +
          '<button type="button" class="mdv-btn" data-act="print">打印</button>' +
        '</div>' +
      '</header>' +
      '<main class="mdv-main">' +
        '<article class="mdv-markdown"><div class="mdv-loading">正在渲染…</div></article>' +
        '<pre class="mdv-raw" hidden></pre>' +
      '</main>' +
      '<aside class="mdv-toc" hidden></aside>';

    page.querySelector('.mdv-filename').textContent = filename;
    document.body.replaceChildren(page);

    var article = page.querySelector('.mdv-markdown');
    var rawEl = page.querySelector('.mdv-raw');
    var tocEl = page.querySelector('.mdv-toc');
    var tocBtn = page.querySelector('[data-act="toc"]');
    var rawBtn = page.querySelector('[data-act="raw"]');
    var printBtn = page.querySelector('[data-act="print"]');

    rawEl.textContent = markdown;

    var tocOpen = false;
    var rawMode = false;
    var headings = [];

    function setTocOpen(open) {
      tocOpen = open;
      tocEl.hidden = !open;
      tocBtn.setAttribute('aria-pressed', String(open));
    }

    function setRawMode(open) {
      rawMode = open;
      article.hidden = open;
      rawEl.hidden = !open;
      rawBtn.setAttribute('aria-pressed', String(open));
      rawBtn.textContent = open ? '预览' : '源码';
    }

    function buildToc(list) {
      tocEl.innerHTML = '';
      if (!list.length) {
        var empty = document.createElement('div');
        empty.className = 'mdv-toc-empty';
        empty.textContent = '没有可用的标题';
        tocEl.appendChild(empty);
        return;
      }

      var ul = document.createElement('ul');
      list.forEach(function (heading) {
        var li = document.createElement('li');
        var link = document.createElement('a');
        link.className = 'lv' + heading.level;
        link.href = '#' + heading.id;
        link.textContent = heading.text;
        link.addEventListener('click', function (event) {
          event.preventDefault();
          var target = document.getElementById(heading.id);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            try {
              history.replaceState(null, '', location.pathname + location.search + '#' + heading.id);
            } catch (err) {
              return;
            }
          }
        });
        li.appendChild(link);
        ul.appendChild(li);
      });
      tocEl.appendChild(ul);
    }

    tocBtn.addEventListener('click', function () {
      setTocOpen(!tocOpen);
    });

    rawBtn.addEventListener('click', function () {
      setRawMode(!rawMode);
    });

    printBtn.addEventListener('click', function () {
      window.print();
    });

    window.MDViewer.render(markdown, article, {}).then(function (result) {
      headings = result.headings;
      buildToc(headings);
      scrollToHash();
    }).catch(function (err) {
      showError(article, err);
    });
  }

  if (!isMarkdownUrl() || !isPlainTextView()) return;

  start();
})();
