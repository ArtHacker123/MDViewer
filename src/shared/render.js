(function (global) {
  'use strict';

  if (global.MDViewer) return;

  var ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ESCAPE_MAP[ch];
    });
  }

  var configured = false;
  var mermaidInitialized = false;
  var mermaidCounter = 0;
  var purifyHooked = false;

  function prefersDark() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (err) {
      return false;
    }
  }

  function initMermaid() {
    if (mermaidInitialized || !global.mermaid) return;
    global.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: prefersDark() ? 'dark' : 'default',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
      er: { useMaxWidth: true },
      journey: { useMaxWidth: true },
      pie: { useMaxWidth: true },
      gitGraph: { useMaxWidth: true }
    });
    mermaidInitialized = true;
  }

  function configureMarked() {
    if (configured) return;
    if (!global.marked) throw new Error('marked 未加载');
    configured = true;

    var renderer = new global.marked.Renderer();

    renderer.code = function (token) {
      var code = token && token.text != null ? String(token.text) : '';
      var info = token && token.lang ? String(token.lang).trim() : '';
      var lang = info.split(/\s+/)[0].toLowerCase();

      if (lang === 'mermaid') {
        return '<div class="mermaid">' + escapeHtml(code) + '</div>\n';
      }

      if (lang && global.hljs && global.hljs.getLanguage(lang)) {
        var highlighted;
        try {
          highlighted = global.hljs.highlight(code, {
            language: lang,
            ignoreIllegals: true
          }).value;
        } catch (err) {
          highlighted = escapeHtml(code);
        }
        return '<pre class="hljs"><code class="hljs language-' + escapeHtml(lang) + '">' +
          highlighted + '</code></pre>\n';
      }

      return '<pre class="hljs"><code class="hljs">' + escapeHtml(code) + '</code></pre>\n';
    };

    var codeSpan = {
      name: 'codeSpan',
      level: 'inline',
      start: function (src) {
        var index = src.indexOf('`');
        return index === -1 ? undefined : index;
      },
      tokenizer: function (src) {
        var match = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(src);
        if (!match) return;
        var text = match[2].replace(/\n/g, ' ');
        if (text.length > 2 && text.charAt(0) === ' ' &&
            text.charAt(text.length - 1) === ' ' && text.trim()) {
          text = text.slice(1, -1);
        }
        return {
          type: 'codeSpan',
          raw: match[0],
          text: text
        };
      },
      renderer: function (token) {
        return '<code>' + escapeHtml(token.text) + '</code>';
      }
    };

    var inlineMath = {
      name: 'inlineMath',
      level: 'inline',
      start: function (src) {
        var match = src.match(/(?<!\\)\$\$?|\\\(/);
        return match ? match.index : undefined;
      },
      tokenizer: function (src) {
        var match = /^\$\$((?:(?!\n\s*\n)[^`])+?)\$\$/.exec(src);
        if (match) {
          return {
            type: 'inlineMath',
            raw: match[0],
            text: match[1].trim(),
            display: true
          };
        }

        match = /^\$(?!\$)([^\s$`](?:[^\n$`]*?[^\s$`])?)\$(?!\$)/.exec(src);
        if (match) {
          return {
            type: 'inlineMath',
            raw: match[0],
            text: match[1],
            display: false
          };
        }

        match = /^\\\(([^\n`]*?)\\\)/.exec(src);
        if (match) {
          return {
            type: 'inlineMath',
            raw: match[0],
            text: match[1],
            display: false
          };
        }
      },
      renderer: function (token) {
        var tag = token.display ? 'div' : 'span';
        var className = token.display ? 'mdv-math-display' : 'mdv-math';
        return '<' + tag + ' class="' + className + '" data-tex="' +
          escapeHtml(token.text) + '"></' + tag + '>';
      }
    };

    var blockMath = {
      name: 'blockMath',
      level: 'block',
      start: function (src) {
        var match = src.match(/^ {0,3}(?:\$\$|\\\[)/m);
        return match ? match.index : undefined;
      },
      tokenizer: function (src) {
        var match = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
        if (match) {
          return {
            type: 'blockMath',
            raw: match[0],
            text: match[1].trim()
          };
        }

        match = /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n+|$)/.exec(src);
        if (match) {
          return {
            type: 'blockMath',
            raw: match[0],
            text: match[1].trim()
          };
        }
      },
      renderer: function (token) {
        return '<div class="mdv-math-display" data-tex="' +
          escapeHtml(token.text) + '"></div>\n';
      }
    };

    global.marked.use({
      gfm: true,
      breaks: false,
      pedantic: false,
      extensions: [blockMath, codeSpan, inlineMath],
      renderer: renderer
    });
  }

  function stripFrontMatter(markdown) {
    var match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
    if (!match) return markdown;
    if (!/(^|\n)\s*[A-Za-z_][\w.-]*\s*:/.test(match[1])) return markdown;
    return markdown.slice(match[0].length);
  }

  function sanitize(html) {
    if (!global.DOMPurify) return html;

    if (!purifyHooked) {
      purifyHooked = true;
      global.DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if (node.tagName === 'A') {
          var href = node.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (node.tagName === 'IMG') {
          node.setAttribute('loading', 'lazy');
          node.setAttribute('decoding', 'async');
        }
      });
    }

    return global.DOMPurify.sanitize(html, {
      FORBID_TAGS: ['style', 'link', 'meta', 'base', 'form', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['style']
    });
  }

  function slugify(text) {
    var slug = String(text || '')
      .replace(/<[^>]*>/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_-]+/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'section';
  }

  function addHeadingIds(root) {
    var headings = [];
    var used = Object.create(null);

    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (heading) {
      var level = parseInt(heading.tagName.charAt(1), 10);
      var text = (heading.textContent || '').trim();
      var id = heading.getAttribute('id') || slugify(text);

      if (used[id]) {
        used[id] += 1;
        id = id + '-' + used[id];
      } else {
        used[id] = 1;
      }

      heading.setAttribute('id', id);

      var anchor = document.createElement('a');
      anchor.className = 'mdv-anchor';
      anchor.setAttribute('href', '#' + id);
      anchor.setAttribute('aria-hidden', 'true');
      anchor.setAttribute('tabindex', '-1');
      anchor.textContent = '#';
      heading.insertBefore(anchor, heading.firstChild);

      headings.push({
        level: level,
        text: text,
        id: id
      });
    });

    return headings;
  }

  function resolveUrls(root, baseUrl) {
    if (!baseUrl) return;

    var base;
    try {
      base = new URL(baseUrl);
    } catch (err) {
      return;
    }

    var pairs = [
      ['a', 'href'],
      ['img', 'src'],
      ['source', 'src'],
      ['video', 'src'],
      ['audio', 'src']
    ];

    pairs.forEach(function (pair) {
      var selector = pair[0] + '[' + pair[1] + ']';
      root.querySelectorAll(selector).forEach(function (el) {
        var value = el.getAttribute(pair[1]);
        if (!value) return;
        if (value.charAt(0) === '#') return;
        if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return;
        try {
          var resolved = new URL(value, base).href;
          el.setAttribute(pair[1], resolved);
          if (pair[0] === 'a' && /^https?:\/\//i.test(resolved)) {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        } catch (err) {
          return;
        }
      });
    });
  }

  function renderMath(root) {
    var nodes = root.querySelectorAll('.mdv-math, .mdv-math-display');
    if (!nodes.length) return;

    nodes.forEach(function (el) {
      var tex = el.getAttribute('data-tex') || '';
      if (!tex) {
        el.remove();
        return;
      }

      if (!global.katex) {
        el.textContent = el.classList.contains('mdv-math-display') ? '$$' + tex + '$$' : '$' + tex + '$';
        return;
      }

      try {
        global.katex.render(tex, el, {
          displayMode: el.classList.contains('mdv-math-display'),
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          output: 'htmlAndMathml'
        });
      } catch (err) {
        el.textContent = tex;
      }
    });
  }

  function cleanupMermaidTemp(id) {
    ['', 'd'].forEach(function (prefix) {
      var el = document.getElementById(prefix + id);
      if (el && el.parentNode === document.body) {
        el.parentNode.removeChild(el);
      }
    });
  }

  async function renderMermaid(root) {
    if (!global.mermaid) return;

    var nodes = Array.prototype.slice.call(root.querySelectorAll('.mermaid'));
    if (!nodes.length) return;

    initMermaid();

    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var code = node.textContent || '';
      if (!code.trim()) continue;

      var id = 'mdv-mermaid-' + (++mermaidCounter) + '-' + Math.random().toString(36).slice(2, 8);

      try {
        var result = await global.mermaid.render(id, code);
        node.innerHTML = result.svg;
        node.classList.add('mdv-mermaid-rendered');
        if (typeof result.bindFunctions === 'function') {
          result.bindFunctions(node);
        }
      } catch (err) {
        cleanupMermaidTemp(id);
        node.classList.add('mdv-mermaid-error');
        node.textContent = '';

        var message = document.createElement('div');
        message.className = 'mdv-mermaid-error-msg';
        message.textContent = 'Mermaid 图表渲染失败：' +
          (err && err.message ? err.message : String(err));

        var codeBlock = document.createElement('pre');
        codeBlock.className = 'mdv-mermaid-error-code';
        codeBlock.textContent = code;

        node.appendChild(message);
        node.appendChild(codeBlock);
      }
    }
  }

  async function render(markdown, container, options) {
    if (!container) throw new Error('缺少渲染容器');

    configureMarked();

    var settings = options || {};
    var source = stripFrontMatter(String(markdown == null ? '' : markdown));
    var rawHtml = global.marked.parse(source);
    var safeHtml = sanitize(rawHtml);

    container.innerHTML = safeHtml;

    resolveUrls(container, settings.baseUrl);

    var headings = addHeadingIds(container);

    renderMath(container);
    await renderMermaid(container);

    return { headings: headings };
  }

  global.MDViewer = {
    render: render,
    escapeHtml: escapeHtml,
    slugify: slugify
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
