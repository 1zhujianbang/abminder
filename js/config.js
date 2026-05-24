// ============================================================
// Constants & Configuration
// ============================================================

export const SYMBOLS = [
    { name: 'BTC-PERP', label: 'BTC 永续', cat: '加密货币' },
    { name: 'ETH-PERP', label: 'ETH 永续', cat: '加密货币' },
    { name: 'SOL-PERP', label: 'SOL 永续', cat: '加密货币' },
    { name: 'BNB-PERP', label: 'BNB 永续', cat: '加密货币' },
    { name: 'HYPE-PERP', label: 'HYPE 永续', cat: '加密货币' },
    { name: 'OKB-PERP', label: 'OKB 永续', cat: '加密货币' },
    { name: 'ZEC-PERP', label: 'ZEC 永续', cat: '加密货币' },
    { name: 'ASTER-PERP', label: 'ASTER 永续', cat: '加密货币' },
    { name: 'PUMP-PERP', label: 'PUMP 永续', cat: '加密货币' },
    { name: 'XAU-PERP', label: 'XAU 黄金', cat: '大宗商品' },
    { name: 'XAG-PERP', label: 'XAG 白银', cat: '大宗商品' },
    { name: 'XPT-PERP', label: 'XPT 铂金', cat: '大宗商品' },
    { name: 'XPD-PERP', label: 'XPD 钯金', cat: '大宗商品' },
    { name: 'XCU-PERP', label: 'XCU 铜', cat: '大宗商品' },
    { name: 'CL-PERP', label: 'CL 原油', cat: '大宗商品' },
    { name: 'BZ-PERP', label: 'BZ 布伦特', cat: '大宗商品' },
    { name: 'NG-PERP', label: 'NG 天然气', cat: '大宗商品' },
    { name: 'AAPL-PERP', label: 'AAPL 苹果', cat: '美股' },
    { name: 'AMD-PERP', label: 'AMD 超微', cat: '美股' },
    { name: 'AMZN-PERP', label: 'AMZN 亚马逊', cat: '美股' },
    { name: 'ANTHROPIC-PERP', label: 'ANTHROPIC', cat: '美股' },
    { name: 'ARM-PERP', label: 'ARM', cat: '美股' },
    { name: 'AVGO-PERP', label: 'AVGO 博通', cat: '美股' },
    { name: 'BMNR-PERP', label: 'BMNR', cat: '美股' },
    { name: 'CBRS-PERP', label: 'CBRS', cat: '美股' },
    { name: 'COHR-PERP', label: 'COHR', cat: '美股' },
    { name: 'COIN-PERP', label: 'COIN 币安', cat: '美股' },
    { name: 'COST-PERP', label: 'COST 好市多', cat: '美股' },
    { name: 'CRCL-PERP', label: 'CRCL', cat: '美股' },
    { name: 'CRWV-PERP', label: 'CRWV', cat: '美股' },
    { name: 'CSCO-PERP', label: 'CSCO 思科', cat: '美股' },
    { name: 'DRAM-PERP', label: 'DRAM', cat: '美股' },
    { name: 'GEV-PERP', label: 'GEV', cat: '美股' },
    { name: 'GLW-PERP', label: 'GLW 康宁', cat: '美股' },
    { name: 'GME-PERP', label: 'GME 游戏驿站', cat: '美股' },
    { name: 'GOOGL-PERP', label: 'GOOGL 谷歌', cat: '美股' },
    { name: 'HIMS-PERP', label: 'HIMS', cat: '美股' },
    { name: 'HOOD-PERP', label: 'HOOD', cat: '美股' },
    { name: 'INTC-PERP', label: 'INTC 英特尔', cat: '美股' },
    { name: 'LITE-PERP', label: 'LITE', cat: '美股' },
    { name: 'LLY-PERP', label: 'LLY 礼来', cat: '美股' },
    { name: 'META-PERP', label: 'META', cat: '美股' },
    { name: 'MRVL-PERP', label: 'MRVL 迈威尔', cat: '美股' },
    { name: 'MSFT-PERP', label: 'MSFT 微软', cat: '美股' },
    { name: 'MSTR-PERP', label: 'MSTR 微策略', cat: '美股' },
    { name: 'MU-PERP', label: 'MU 美光', cat: '美股' },
    { name: 'NBIS-PERP', label: 'NBIS', cat: '美股' },
    { name: 'NFLX-PERP', label: 'NFLX 奈飞', cat: '美股' },
    { name: 'NVDA-PERP', label: 'NVDA 英伟达', cat: '美股' },
    { name: 'OPENAI-PERP', label: 'OPENAI', cat: '美股' },
    { name: 'ORCL-PERP', label: 'ORCL 甲骨文', cat: '美股' },
    { name: 'PLTR-PERP', label: 'PLTR 帕兰提尔', cat: '美股' },
    { name: 'QCOM-PERP', label: 'QCOM 高通', cat: '美股' },
    { name: 'RKLB-PERP', label: 'RKLB', cat: '美股' },
    { name: 'SHLD-PERP', label: 'SHLD', cat: '美股' },
    { name: 'SNDK-PERP', label: 'SNDK', cat: '美股' },
    { name: 'SPACEX-PERP', label: 'SPACEX', cat: '美股' },
    { name: 'TSLA-PERP', label: 'TSLA 特斯拉', cat: '美股' },
    { name: 'TSM-PERP', label: 'TSM 台积电', cat: '美股' },
    { name: 'USAR-PERP', label: 'USAR', cat: '美股' },
    { name: 'EWJ-PERP', label: 'EWJ 日本ETF', cat: 'ETF' },
    { name: 'EWY-PERP', label: 'EWY 韩国ETF', cat: 'ETF' },
    { name: 'IWM-PERP', label: 'IWM 罗素2000ETF', cat: 'ETF' },
    { name: 'QQQ-PERP', label: 'QQQ 纳斯达克ETF', cat: 'ETF' },
    { name: 'SOXL-PERP', label: 'SOXL 半导体ETF', cat: 'ETF' },
    { name: 'SPY-PERP', label: 'SPY 标普500ETF', cat: 'ETF' },
    { name: 'URNM-PERP', label: 'URNM 铀矿ETF', cat: 'ETF' },
];

export const A_SYMBOLS = [
    { name: 'SH000001', label: '上证指数', cat: 'A股' },
    { name: 'SZ399001', label: '深证成指', cat: 'A股' },
    { name: 'SH600519', label: '贵州茅台', cat: 'A股' },
    { name: 'SZ300750', label: '宁德时代', cat: 'A股' },
    { name: 'SH601318', label: '中国平安', cat: 'A股' },
    { name: 'SH600036', label: '招商银行', cat: 'A股' },
    { name: 'SZ000858', label: '五粮液', cat: 'A股' },
    { name: 'SH600900', label: '长江电力', cat: 'A股' },
];

export const TIMEFRAMES = [
    { value: 1, label: '1m' },
    { value: 5, label: '5m' },
    { value: 15, label: '15m' },
    { value: 60, label: '1h' },
    { value: 240, label: '4h' },
    { value: 1440, label: '1d' },
];

export const SIGNAL_CFG = {
    buy: { label: '买入', color: '#22c55e', shape: 'arrowUp', pos: 'belowBar' },
    hold: { label: '观望', color: '#f59e0b', shape: 'circle', pos: 'aboveBar' },
    sell: { label: '卖出', color: '#ef4444', shape: 'arrowDown', pos: 'aboveBar' },
};

export const NOTE_CATEGORIES = [
    { key: 'technical', label: '技术分析', color: '#1f6feb' },
    { key: 'news', label: '消息面', color: '#a855f7' },
    { key: 'capital', label: '资金流向', color: '#ec4899' },
    { key: 'key_level', label: '关键位置', color: '#f59e0b' },
    { key: 'other', label: '其他', color: '#8b949e' },
];

export const STORAGE_KEY = 'trading_signals';
export const BOOKMARK_KEY = 'trading_bookmarks';

// Drawing
export const DRAW_COLORS = ['#22c55e', '#ef4444', '#1f6feb', '#f59e0b', '#a855f7', '#ec4899'];

// Odaily categories
export const NF_CATEGORIES = [
    { label: '全部', endpoint: '' },
    { label: '自选', endpoint: '__bookmarked__' },
    { label: '24小时', endpoint: '24h' },
    { label: '24h热门', endpoint: '24h-hot' },
    { label: 'AI', endpoint: 'ai' },
    { label: '预测市场', endpoint: 'prediction-market' },
    { label: '链上数据', endpoint: 'on-chain-data' },
    { label: '行情播报', endpoint: 'market-report' },
    { label: '交易所公告', endpoint: 'exchange-announcement' },
    { label: '项目动向', endpoint: 'project-trend' },
    { label: '名人观点', endpoint: 'celebrity-opinion' },
    { label: '币股动态', endpoint: 'crypto-stock' },
    { label: '融资信息', endpoint: 'funding' },
    { label: '宏观政策', endpoint: 'macro-policy' },
];

export const ARTICLE_CATEGORIES = [
    { label: '全部', endpoint: '' },
    { label: '自选', endpoint: '__bookmarked__' },
    { label: '24小时', endpoint: '24h' },
    { label: '24h热门', endpoint: '24h-hot' },
    { label: '深度', endpoint: 'depth' },
    { label: '重要', endpoint: 'important' },
];

export const CAT_ORDER = ['加密货币', '大宗商品', 'ETF', '美股'];

export const MARKET_CONFIG = {
    '加密市场': {
        dataSource: 'okx',
        newsSource: 'odaily',
        catFilter: ['加密货币', '大宗商品', 'ETF', '美股'],
    },
    '美股市场': {
        dataSource: 'finnhub',
        newsSource: 'finnhub-news',
        catFilter: ['美股'],
    },
    'A股市场': {
        dataSource: 'akshare',
        newsSource: 'eastmoney-news',
        catFilter: ['A股'],
    },
};

// Binance WS mappings
export const BINANCE_WS_SYMBOLS = {
    'BTC-PERP': 'btcusdt', 'ETH-PERP': 'ethusdt', 'SOL-PERP': 'solusdt',
    'BNB-PERP': 'bnbusdt', 'HYPE-PERP': 'hypeusdt', 'ZEC-PERP': 'zecusdt',
    'XAU-PERP': 'paxgusdt',
};

export const BINANCE_WS_TF = { 1: '1m', 5: '5m', 15: '15m', 60: '1h', 240: '4h', 1440: '1d' };
