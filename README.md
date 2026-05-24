# abminder — 交易信号标注工具

浏览器端 K 线图表分析 + 信号标记 + 笔记系统。
通过本地 HTTP 服务与 AI 协同实现自动化分析。

## 快速启动

```bash
node server.js
# 打开 http://localhost:3456
```

## 首次使用

```
1. node server.js → 打开浏览器 → 空白图表
2. 顶部工具栏选择标的 + 周期
3. 点击 ⚙ 配置：默认标的、数据源、通知等
4. 可选：告诉 AI 设置定时分析
```

## 日常使用模式

**手动模式** — 纯工具，无 AI 介入
- 浏览器内完成所有操作：选标的、看K线、标信号、写笔记

**半自动模式** — AI 辅助分析
- 对话中让 AI 分析当前标的：AI 抓数据 → 分析 → 信号发到浏览器

**全自动模式** — 定时 AI 监控
- 设定 cron 定时任务，AI 每 N 分钟自动分析
- 常规信号出现在浏览器，极端事件发邮件通知

## 用户操作

### 基本操作

| 操作 | 方式 |
|---|---|
| **切换标的** | 顶部下拉框选择 |
| **切换周期** | 点击 1m / 5m / 15m / 1h / 4h / 1d |
| **固定K线** | 点击图表上的 K 线（再次点击释放） |
| **上下左右微调** | 固定后按 ← → 箭头键切换K线 |
| **标记信号** | 固定K线后，点击底部 买入/观望/卖出 按钮 |
| **添加笔记** | 标记信号后，在底部文本区填写，自动保存 |
| **删除信号** | 点击信号列表中的 × 按钮，或选中后按 Delete |
| **设置面板** | 工具栏 ⚙ 按钮，配置所有偏好 |
| **撤销/重做** | Ctrl+Z / Ctrl+Shift+Z |

### 快捷键

| 按键 | 功能 |
|---|---|
| `1` | 标记买入 |
| `2` | 标记观望 |
| `3` | 标记卖出 |
| `← →` | 切换固定K线 |
| `N` | 聚焦笔记输入框 |
| `D` | 绘制模式（点击图表放置水平线） |
| `S` | 显示/隐藏波段高低点结构 |
| `F` | 全屏图表 |
| `Esc` | 释放K线 / 退出绘制模式 / 退出全屏 |
| `Delete` | 删除当前信号 |
| `?` | 显示快捷键帮助 |

### 信号与笔记

- **信号类型**：买入（绿色 ↑）、观望（黄色 ◆）、卖出（红色 ↓）
- **笔记分类**：技术分析、消息面、资金流向、关键位置、其他
- **笔记引用**：可插入 `+快讯` / `+文章` / `+笔记` 引用，格式 `【快讯:标题|url】`

### 工具栏

| 按钮 | 功能 |
|---|---|
| `↻` 刷新 | 重新加载 K 线数据 |
| `清除` | 清除当前交易对所有信号 |
| `导出` | 导出信号数据为 JSON |
| `导入` | 导入信号 JSON 文件 |
| `LIVE` | 开启/关闭实时数据 |
| `绘制` | 进入绘制模式，点击图表放置水平线 |
| `结构` | 显示波段高低点标记 (H/L) |
| `深度` | 显示订单簿深度图 |
| `⚙` | 设置面板 |
| `⛶` | 图表全屏 |

## CLI 命令

```bash
node remote.js symbol BTC-PERP          # 切换标的
node remote.js reload                   # 刷新数据
node remote.js signal-latest hold "笔记" technical   # 信号+笔记
node remote.js toast "消息"             # 推送通知
node remote.js exec "代码"              # 执行任意浏览器操作

REMOTE_SYMBOL=ZEC-PERP node remote.js signal-latest hold "笔记" technical  # 指定标的（防混淆）

node fetch-data.js ZEC-PERP             # 抓取数据供分析
node fetch-data.js ZEC-PERP,HYPE-PERP   # 多标的
node notify.js "标题" "正文"            # 邮件推送
```

## CLI -> 浏览器通信

1. `remote.js` 发送指令到 `localhost:3456/api`
2. 浏览器每 1.5s 轮询 `/api/poll` 拉取指令
3. `remote-control.js` 将指令映射为 UI 操作
4. 信号自动持久化到 `localStorage` + `data/signals.local.json`

## 数据文件

| 文件 | 用途 |
|---|---|
| `data/signals.local.json` | 所有信号 + 笔记 |
| `data/email-config.local.json` | 邮件配置 |
| `.claude/scheduled_tasks.json` | 定时分析任务 |
| `data/scan_data.json` | AI 分析用的抓取数据快照 |

## 数据源

数据源自动切换，优先级可通过设置面板调整：
- **加密市场**：Hyperliquid > OKX > Binance（中国网络限制，Hyperliquid 最稳定）
- **美股市场**：NASDAQ 代理
- **A股市场**：东方财富代理

## 系统要求

- Node.js 18+
- 浏览器（Chrome/Firefox/Edge 最新版）
