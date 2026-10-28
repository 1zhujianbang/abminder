# 《卡卡牌》Web Demo

2~4 人的颜色与行动卡牌对战游戏网页版，纯静态 HTML/CSS/JS，可直接部署到 Cloudflare Pages。

## 本地运行

直接用浏览器打开 `index.html`，或在根目录启动任意静态文件服务器。

## Cloudflare Pages

- 根目录即站点目录：`index.html` 必须位于仓库根目录。
- 无需构建；如果项目设置了构建命令，可设为 `npm run build`（空操作）。
- 输出目录：仓库根目录（`/`）。
- 不需要 Functions / 服务端；`wrangler.toml` 已配置 `pages_build_output_dir = "."`，项目名沿用 `abminder`。
- 自定义域名由 Cloudflare Pages 控制台绑定，仓库中的 `CNAME` 文件保留供 GitHub Pages 使用。

## 文件

- `index.html`：页面入口
- `css/style.css`：样式
- `js/defs.js`、`js/engine.js`、`js/ai.js`、`js/ui.js`：规则、AI、界面
