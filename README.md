# Markdown 查看器（Chrome 扩展）

一个用于在 Chrome 中阅读 Markdown 文件的扩展。打开 `.md` 链接或本地 Markdown 文件时，会使用接近 GitHub 的排版进行渲染。

## 功能

- 自动渲染地址以 `.md` / `.markdown` / `.mdown` / `.mkd` 结尾的页面
- 完整的 CommonMark + GFM 支持：表格、任务列表、删除线、自动链接等
- 代码块语法高亮（highlight.js，约 35 种常用语言，自动适配深色模式）
- Mermaid 图表：流程图、时序图、类图、状态图、ER 图、甘特图、饼图、Git 图、思维导图、时间线等
- KaTeX 数学公式：`$...$`、`$$...$$`、`\(...\)`、`\[...\]`
- 目录（TOC）、Markdown 源码切换、打印
- 独立的查看器页面：拖放/选择本地文件，或通过 URL 打开远程 Markdown
- 深色/浅色模式跟随系统
- 原始 HTML 经过 DOMPurify 清洗，脚本、iframe、内联样式等会被移除

## 安装

1. 打开 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录（包含 `manifest.json` 的目录）
4. 如需自动渲染本地 `.md` 文件，在扩展详情页开启「允许访问文件网址」

## 使用

- 在浏览器中直接打开 `https://example.com/README.md` 等链接，会自动进入阅读视图。
- 点击工具栏中的扩展图标：
  - 「打开查看器」：打开空白查看器，可拖放文件或输入 URL。
  - 「打开本地 .md 文件」：打开查看器并高亮「选择文件」按钮（浏览器要求由用户点击后才能打开文件选择框）。
- 查看器也支持地址参数：`viewer.html?url=https://example.com/README.md`

> 代码托管站点（如 GitHub、GitLab 的网页版文件页）本身已经渲染 Markdown，扩展会自动跳过这些页面，避免重复渲染。

## 开发

依赖 Node.js 18+。

```powershell
npm install
npm run build      # 从 node_modules 复制/打包第三方库到 vendor/
npm run icons      # 生成扩展图标
npm test           # 使用本机 Chrome 无头渲染测试
npm run pack       # 生成可分发/上传的 mdviewer-extension.zip
```

`vendor/` 中的文件是构建产物，扩展运行时直接使用它们；安装扩展前需要先执行一次 `npm run build`。

### 目录结构

```
manifest.json
icons/                 扩展图标（生成）
vendor/                第三方库（生成）
src/
  content/             自动渲染 .md 页面的内容脚本
  popup/               扩展弹窗
  shared/              共享渲染引擎与样式
  viewer/              独立查看器页面
scripts/               构建、图标、测试脚本
```

## 已知限制

- 自动渲染依赖 URL 以 Markdown 扩展名结尾；无扩展名的 Markdown 页面可通过查看器的 URL 输入打开。
- 通过「打开本地文件」加载的文档，其相对路径图片无法自动解析（浏览器不允许扩展读取同目录其他文件）；通过 URL 打开时相对路径会正确解析。
- 超大文件（> 50 MB）会被拒绝，避免浏览器卡死。

## 第三方组件

- [marked](https://github.com/markedjs/marked) — Markdown 解析（MIT）
- [highlight.js](https://highlightjs.org/) — 代码高亮（BSD-3-Clause）
- [Mermaid](https://mermaid.js.org/) — 图表渲染（MIT）
- [KaTeX](https://katex.org/) — 数学公式（MIT）
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML 清洗（Apache-2.0 / MPL-2.0）
- [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) — 排版样式（MIT）
