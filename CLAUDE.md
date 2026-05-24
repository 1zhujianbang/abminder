# abminder — 交易信号标注工具

浏览器端 K 线图表分析 + 信号标记 + 笔记系统。
通过 `server.js`(localhost:3456) 提供静态服务和 HTTP API，与 AI 协同实现自动化分析。

---

## 用户路径

### 首次使用

```
1. 启动服务
      node server.js
      打开 http://localhost:3456
      ────────────────
      看到空白图表（无默认标的）

2. 选市场 + 标的面板配置
      ────────────────
      提供：不预设任何默认值
      操作：点击工具栏 ⚙ → 设置默认交易对、周期
      或：直接在工具栏下拉菜单选择标的

3. 配置数据源
      ────────────────
      系统自动检测可用交易所
      加密市场：Hyperliquid > OKX > Binance
      美股：NASDAQ 代理
      A股：东方财富代理
      用户在设置面板可调整交易所优先级

4. 按需配置通知
      ────────────────
      设置面板 → SMTP 服务器、账号密码
      默认关闭，不配置则不启用

5. 可选：设置定时分析
      ────────────────
      告诉 AI："每天9点到15点每30分钟分析一次 BTC-PERP"
      AI 创建 cron，分析中不预设任何市场方向
      分析结论从数据中推导，如"价格处于XX区间，成交量XX"
```

### 日常使用

```
手动模式（纯工具，无 AI 介入）:
  ┌─────────────────────────────────────────────┐
  │ 打开浏览器 → 选标的 → 看K线 → 手动标注信号   │
  │ → 写笔记 → 导出数据                          │
  │ 所有操作在浏览器内完成，无需 CLI              │
  └─────────────────────────────────────────────┘

半自动模式（AI 辅助分析）:
  ┌─────────────────────────────────────────────┐
  │ 在对话中告诉 AI "帮我分析当前 ZEC"           │
  │ AI 执行：                                    │
  │   node fetch-data.js ZEC-PERP               │
  │   读取数据 → 技术面+消息面分析               │
  │   REMOTE_SYMBOL=ZEC-PERP node remote.js     │
  │     signal-latest hold "分析" technical      │
  │ 信号出现在浏览器，用户自行验证                │
  └─────────────────────────────────────────────┘

全自动模式（定时 AI 监控）:
  ┌─────────────────────────────────────────────┐
  │ cron 每N分钟触发 → AI 自动分析               │
  │   node fetch-data.js <配置的标的>            │
  │   分析趋势、关键位、成交量异常                │
  │   常规：remote.js signal-latest 发到浏览器   │
  │   极端：notify.js 发邮件                      │
  │ 用户打开浏览器即可看到所有分析记录            │
  └─────────────────────────────────────────────┘
```

### 角色边界

```
┌─────────────┬──────────────────────┬──────────────────────┐
│     角色     │        做什么        │        不做什么       │
├─────────────┼──────────────────────┼──────────────────────┤
│  AI (系统)   │ 提供工具、抓数据、     │ 不预设用户的风险偏好、  │
│              │ 按需分析、执行指令     │ 不替用户做交易决策     │
├─────────────┼──────────────────────┼──────────────────────┤
│  用户        │ 配置偏好、验证分析、   │ 不需要理解底层架构、   │
│              │ 最终决策              │ 不需要写代码          │
├─────────────┼──────────────────────┼──────────────────────┤
│  策略偏好    │ 存在于用户记忆/设置    │ 不存在于代码默认值     │
│              │ 由用户自己维护         │ 不被硬编码            │
└─────────────┴──────────────────────┴──────────────────────┘
```

---

## 快速启动

```bash
node server.js                    # 启动服务 → http://localhost:3456
node remote.js symbol BTC-PERP    # 切换标的
node remote.js signal-latest hold "分析" technical  # 最新K线+信号
node remote.js reload             # 刷新数据
node remote.js exec "代码"        # 任意浏览器操作
node fetch-data.js BTC-PERP,HYPE-PERP  # 抓取数据供分析
node notify.js "标题" "正文"      # 邮件推送
```

## 架构

```
ES Modules:
├── config.js         常量（交易对、周期、信号配置、分类）
├── state.js          应用状态 + localStorage/服务端持久化
├── api-market.js     行情数据 + WebSocket 实时
├── api-odaily.js     快讯/文章/搜索 API
├── chart.js          图表渲染
├── ui.js             DOM 渲染
├── settings.js       全局配置默认值 + 持久化
├── remote-control.js 远程轮询 + window.remote API
└── main.js           入口、回调绑定、快捷键

server.js (CommonJS)  — HTTP 服务、API 代理、邮件发送
remote.js (CLI)       — 发送命令到浏览器
fetch-data.js (CLI)   — 数据抓取工具（供分析工作流使用）
notify.js (CLI)       — 邮件推送封装
```

## 网络约束

运行在中国网络环境，多数海外 API 被墙：
- **OKX** → DNS 劫持到 127.0.0.1（需开全局代理）
- **Binance** → 连接超时
- **Hyperliquid** → ✅ 唯一在中国可直接访问的加密数据源
- **NASDAQ** → ✅ 通过 server.js 代理可用（日线）
- **Finnhub** → ✅ 通过 server.js 代理可用（仅 news/search/quote）

遇到数据加载失败时：EXCHANGES 数组应将 Hyperliquid 排到 OKX/Binance 前面。

## 远程命令

| 命令 | 说明 |
|------|------|
| `node remote.js symbol BTC-PERP` | 切换标的 |
| `node remote.js reload` | 刷新数据 |
| `REMOTE_SYMBOL=ZEC-PERP node remote.js signal-latest hold "笔记" technical` | 最新K线+信号+笔记（防标混淆） |
| `node remote.js exec "代码"` | 执行任意JS |

**exec 注意事项：**
- `console.log()` 输出无法获取，需用 `fetch('/api/data/debug',{method:'POST',body:JSON.stringify(data)})` 写入文件
- `remote.setTimeframe()` 不存在，需用 `document.dispatchEvent(new CustomEvent('timeframechange',{detail:{timeframe:1440}}))`
- 浏览器轮询间隔 1500ms

## 数据文件

- `data/signals.local.json` — 所有信号（浏览器自动写入）
- `data/debug.local.json`, `data/n*.local.json` — 临时暂存
- `email-config.local.json` — 邮件配置（含密码，位于项目根目录）
- `.claude/scheduled_tasks.json` — 定时分析任务

## 分析指南

分析流程由定时任务触发（每N分钟），遵循以下步骤：

每轮分析只处理**一个标的**，多标的分多轮处理。

1. **抓数据** → `node fetch-data.js <标的列表> > data/scan_data.json 2>/dev/null`
   - 标的列表逗号分隔，例如 `ZEC-PERP,HYPE-PERP`
   - 脚本自动抓取 Odaily 快讯/文章 + 各标的 OHLCV
2. **读取数据** → 解析 scan_data.json
3. **技术分析** → 读取价格数据，判断趋势/结构/支撑阻力
   - 不预设市场方向，从数据中推导
   - 多时间框架（日线定方向，小周期找入场）
4. **消息面分析** → 查看 Odaily 快讯/文章中与标的相关内容
   按重要性分级处理：

   | 级别 | 判断标准 | 处理方式 |
   |------|---------|---------|
   | 普通 | 与标的无关或影响微弱 | 忽略 |
   | 相关 | 提到标的或同板块 | 写入信号笔记的 "消息面参考" 段落 |
   | 重要 | 直接涉及标的：政策、财报、大额异动 | 写入笔记 + `node remote.js toast "📰 快讯: ..."` |
   | 紧急 | 黑天鹅/突发重大事件 | 写入笔记 + toast + `node notify.js "标题" "正文"` |

   笔记中引用新闻的格式：`【快讯:标题|url】` 或 `【文章:标题|url】`

5. **输出信号** → `REMOTE_SYMBOL=<标的> node remote.js signal-latest <类型> "笔记" <分类>`
   - REMOTE_SYMBOL 确保信号存入正确的标的下，不混入其他标的
   - 笔记中包含技术面 + 消息面参考（有则写）

6. **紧急推送** → 极端盈亏比机会时 `node notify.js "标题" "正文"`
   - 邮件内容包含：标的、方向、价位、技术面理由、相关新闻引用

### 信号笔记模板

每条信号笔记格式：
```
【AI分析】日期 时间 UTC 标的@~价格
[技术面描述 1-2 句]
[基本面/消息面参考，相关新闻引用]
策略：[信号](理由)
(AI)
```

## 数据流

1. 行情：`fetchOHLCV()` → `state.data` → `setChartData()` → 图表
2. 实时：WebSocket → 实时更新最后一根K线
3. 信号：点击/快捷键/远程 → `placeSignal()` → `saveSignals()` → 渲染
4. 远程：轮询 `/api/poll` → `executeRemoteAction()` → UI
5. 持久化：localStorage + HTTP POST `server.js` 写入 `.local.json`

## 关键约束

- `candleLimit` 是独立变量，非 `state` 属性
- `pinnedTime` 需用 `setPinnedTime()` 写入
- `drawLines` 同理
- 图表回调通过 `setOn*()` 注册
- ES Module，`type="module"` 加载
