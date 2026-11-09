(function () {
  'use strict';

  var empty = document.getElementById('empty');
  var content = document.getElementById('content');
  var article = document.getElementById('article');
  var rawEl = document.getElementById('raw');
  var tocEl = document.getElementById('toc');
  var fileInput = document.getElementById('fileInput');
  var urlForm = document.getElementById('urlForm');
  var urlInput = document.getElementById('urlInput');
  var tocBtn = document.getElementById('tocBtn');
  var rawBtn = document.getElementById('rawBtn');
  var printBtn = document.getElementById('printBtn');
  var openFileBtn = document.getElementById('openFileBtn');
  var pickBtn = document.getElementById('pickBtn');
  var dropzone = document.getElementById('dropzone');

  var state = {
    markdown: '',
    name: '',
    headings: [],
    rawMode: false,
    tocOpen: false,
    loadId: 0,
    renderId: 0
  };

  function decodeBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    if (bytes.length >= 2) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes);
      }
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes);
      }
    }
    var utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (utf8.indexOf('\uFFFD') === -1) return utf8;
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch (err) {
      return utf8;
    }
  }

  function filenameFromUrl(href) {
    try {
      var url = new URL(href);
      var last = url.pathname.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(last) || url.hostname;
    } catch (err) {
      return 'Markdown';
    }
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

  function setRawMode(open) {
    state.rawMode = open;
    article.hidden = open;
    rawEl.hidden = !open;
    rawBtn.textContent = open ? '预览' : '源码';
    rawBtn.setAttribute('aria-pressed', String(open));
  }

  function setTocOpen(open) {
    state.tocOpen = open;
    tocEl.hidden = !open;
    tocBtn.setAttribute('aria-pressed', String(open));
  }

  function reset() {
    state.loadId += 1;
    state.renderId += 1;
    state.markdown = '';
    state.name = '';
    state.headings = [];
    state.rawMode = false;
    state.tocOpen = false;

    empty.hidden = false;
    content.hidden = true;
    tocEl.hidden = true;
    tocEl.innerHTML = '';
    article.innerHTML = '';
    article.hidden = false;
    rawEl.hidden = true;
    rawEl.textContent = '';
    urlInput.value = '';
    rawBtn.textContent = '源码';
    rawBtn.setAttribute('aria-pressed', 'false');
    tocBtn.setAttribute('aria-pressed', 'false');
    document.title = 'Markdown 查看器';

    if (location.search) {
      try {
        history.replaceState(null, '', location.pathname);
      } catch (err) {
      }
    }
  }

  function showLoading(label) {
    state.renderId += 1;
    state.markdown = '';
    state.tocOpen = false;
    state.rawMode = false;

    empty.hidden = true;
    content.hidden = false;
    article.hidden = false;
    rawEl.hidden = true;
    tocEl.hidden = true;
    tocEl.innerHTML = '';
    tocBtn.setAttribute('aria-pressed', 'false');
    rawBtn.setAttribute('aria-pressed', 'false');
    rawBtn.textContent = '源码';

    article.innerHTML = '';
    var loading = document.createElement('div');
    loading.className = 'mdv-loading';
    loading.textContent = label || '正在加载…';
    article.appendChild(loading);
  }

  function showError(err, retryLabel) {
    empty.hidden = true;
    content.hidden = false;
    article.hidden = false;
    rawEl.hidden = true;
    tocEl.hidden = true;

    article.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'mdv-error';

    var title = document.createElement('h2');
    title.textContent = '加载失败';

    var detail = document.createElement('div');
    detail.textContent = err && err.message ? err.message : String(err);

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'mdv-btn';
    retry.textContent = retryLabel || '返回';
    retry.addEventListener('click', reset);

    box.appendChild(title);
    box.appendChild(detail);
    box.appendChild(retry);
    article.appendChild(box);
  }

  function buildToc(headings) {
    tocEl.innerHTML = '';

    if (!headings.length) {
      var emptyTip = document.createElement('div');
      emptyTip.className = 'mdv-toc-empty';
      emptyTip.textContent = '没有可用的标题';
      tocEl.appendChild(emptyTip);
      return;
    }

    var ul = document.createElement('ul');
    headings.forEach(function (heading) {
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
          }
        }
      });
      li.appendChild(link);
      ul.appendChild(li);
    });
    tocEl.appendChild(ul);
  }

  async function showMarkdown(markdown, options) {
    var opts = options || {};
    var renderId = ++state.renderId;

    state.markdown = markdown;
    state.name = opts.name || 'Markdown';
    state.headings = [];

    empty.hidden = true;
    content.hidden = false;
    tocEl.hidden = true;
    tocEl.innerHTML = '';
    article.hidden = false;
    rawEl.hidden = true;
    rawEl.textContent = markdown;
    state.tocOpen = false;
    state.rawMode = false;
    tocBtn.setAttribute('aria-pressed', 'false');
    rawBtn.setAttribute('aria-pressed', 'false');
    rawBtn.textContent = '源码';

    document.title = state.name + ' - Markdown 查看器';

    if (!window.MDViewer) {
      showError(new Error('渲染引擎加载失败，请重新加载扩展。'), '返回');
      return;
    }

    try {
      var result = await window.MDViewer.render(markdown, article, { baseUrl: opts.baseUrl });
      if (renderId !== state.renderId) return;
      state.headings = result.headings;
      buildToc(result.headings);
      scrollToHash();
    } catch (err) {
      if (renderId !== state.renderId) return;
      showError(err, '重新选择文件');
    }
  }

  async function openFile(file) {
    if (!file) return;

    var loadId = ++state.loadId;

    if (file.size > 50 * 1024 * 1024) {
      state.renderId += 1;
      showError(new Error('文件过大，最大支持 50 MB。'), '返回');
      return;
    }

    showLoading('正在读取 ' + file.name + '…');

    try {
      var buffer = await file.arrayBuffer();
      if (loadId !== state.loadId) return;
      var text = decodeBuffer(buffer).replace(/^\uFEFF/, '');
      await showMarkdown(text, { name: file.name });
    } catch (err) {
      if (loadId !== state.loadId) return;
      showError(err, '重新选择文件');
    }
  }

  async function loadFromUrl(input) {
    var raw = String(input || '').trim();
    if (!raw) return;

    var loadId = ++state.loadId;

    var url;
    try {
      url = new URL(raw, location.href);
    } catch (err) {
      state.renderId += 1;
      showError(new Error('无效的 URL：' + raw), '返回');
      return;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      state.renderId += 1;
      showError(new Error('只支持 http(s) 链接。'), '返回');
      return;
    }

    showLoading('正在加载 ' + url.href + '…');

    try {
      var response = await fetch(url.href, { credentials: 'omit', redirect: 'follow' });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' ' + response.statusText);
      }

      var contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.indexOf('text/html') !== -1) {
        throw new Error('该链接返回的是 HTML 页面，请使用原始 Markdown 链接。');
      }

      var length = Number(response.headers.get('content-length'));
      if (length && length > 50 * 1024 * 1024) {
        throw new Error('文件过大，最大支持 50 MB。');
      }

      var buffer = await response.arrayBuffer();
      if (loadId !== state.loadId) return;
      if (buffer.byteLength > 50 * 1024 * 1024) {
        throw new Error('文件过大，最大支持 50 MB。');
      }

      var text = decodeBuffer(buffer).replace(/^\uFEFF/, '');
      var finalUrl = response.url || url.href;

      try {
        history.replaceState(null, '', location.pathname + '?url=' + encodeURIComponent(finalUrl));
      } catch (err) {
      }

      urlInput.value = finalUrl;
      await showMarkdown(text, { name: filenameFromUrl(finalUrl), baseUrl: finalUrl });
    } catch (err) {
      if (loadId !== state.loadId) return;
      var message = err && err.message ? err.message : String(err);
      showError(new Error('无法加载 ' + url.href + '\n' + message), '返回');
    }
  }

  openFileBtn.addEventListener('click', function () {
    fileInput.click();
  });

  pickBtn.addEventListener('click', function (event) {
    event.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', function (event) {
    if (event.target.closest('button')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) openFile(file);
  });

  urlForm.addEventListener('submit', function (event) {
    event.preventDefault();
    loadFromUrl(urlInput.value);
  });

  tocBtn.addEventListener('click', function () {
    setTocOpen(!state.tocOpen);
  });

  rawBtn.addEventListener('click', function () {
    if (!state.markdown) return;
    setRawMode(!state.rawMode);
  });

  printBtn.addEventListener('click', function () {
    window.print();
  });

  function hasFiles(event) {
    var dt = event.dataTransfer;
    if (!dt || !dt.types) return false;
    return Array.prototype.indexOf.call(dt.types, 'Files') !== -1;
  }

  var dragDepth = 0;

  window.addEventListener('dragenter', function (event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    dropzone.classList.add('is-dragover');
  });

  window.addEventListener('dragover', function (event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', function (event) {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.classList.remove('is-dragover');
  });

  window.addEventListener('drop', function (event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('is-dragover');
    var file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) openFile(file);
  });

  var params = new URLSearchParams(location.search);
  var initialUrl = params.get('url');
  if (initialUrl) {
    urlInput.value = initialUrl;
    loadFromUrl(initialUrl);
  }
  if (params.get('action') === 'open') {
    setTimeout(function () {
      pickBtn.classList.add('is-attention');
      pickBtn.focus();
    }, 150);
  }
})();
