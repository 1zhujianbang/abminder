# Reminder — 交易信号标注工具

浏览器端 K 线图表分析 + 信号标记 + 笔记系统。
通过 `server.js`(localhost:3456) 提供静态服务和 HTTP API，与 Claude 协同实现自动化分析。

## 快速启动

```bash
node server.js                    # 启动服务 → http://localhost:3456
node remote.js symbol ZEC-PERP   # 切换标的
node remote.js signal-latest hold "分析" technical  # 最新K线+信号
node remote.js reload            # 刷新数据
node remote.js exec "代码"        # 任意浏览器操作
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
├── remote-control.js 远程轮询 + window.remote API
└── main.js           入口、回调绑定、快捷键

server.js (CommonJS)  — HTTP 服务、API 代理、Finnhub key
remote.js (CLI)       — 发送命令到浏览器
```

## 网络约束（重要）

运行在中国网络环境，多数海外 API 被墙：
- **OKX** → DNS 劫持到 127.0.0.1（需开全局代理）
- **Binance** → 连接超时
- **Hyperliquid** → ✅ 唯一在中国可直接访问的加密数据源
- **NASDAQ** → ✅ 通过 server.js 代理可用（日线）
- **Finnhub** → ✅ 通过 server.js 代理可用（仅 news/search/quote）

遇到数据加载失败时：EXCHANGES 数组应将 Hyperliquid 排到 OKX/Binance 前面。

## 远程命令详解

| 命令 | 说明 |
|------|------|
| `node remote.js symbol ZEC-PERP` | 切换标的 |
| `node remote.js reload` | 刷新数据 |
| `node remote.js signal-latest hold "笔记" technical` | 最新K线+信号+笔记 |
| `node remote.js exec "code"` | 执行任意JS |

**exec 注意事项：**
- `console.log()` 输出无法获取，需用 `fetch('/api/data/debug',{method:'POST',body:JSON.stringify(data)})` 写入文件
- `remote.setTimeframe()` 不存在，需用 `document.dispatchEvent(new CustomEvent('timeframechange',{detail:{timeframe:1440}}))`
- 浏览器轮询间隔 1500ms

## 关键数据文件

- `signals.local.json` — 所有信号（由浏览器自动写入）
- `debug.local.json`, `n*.local.json` — 临时暂存
- `.claude/scheduled_tasks.json` — 定时分析任务

## 信号输出规范

每条信号笔记格式：
```
【AI分析】日期 时间UTC 标的@~价格
[技术面描述 1-2 句]
[基本面/消息面参考]
策略：[信号](理由)
(AI)
```

## 当前活跃监控

正在进行的定时分析（每5分钟）：
- **ZEC-PERP**：日线630-643区间震荡，hold/观望，关注640-645做空机会
- **HYPE-PERP**：日线V型反弹逼近ATH 62.67，偏多持有
- 分析方法：1m K线 + 5分钟间隔，每次取最近15根分析

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
