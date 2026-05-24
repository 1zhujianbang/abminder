// ============================================================
// Settings — State, persistence, defaults
// ============================================================

var SETTINGS_KEY = 'trading_settings';

// Default settings (comprehensive catalog)
var defaults = {
    // Trading
    defaultSymbol: '',
    defaultTimeframe: 60,
    candleLimit: 300,

    // Display
    showStructures: false,
    chartTheme: {
        bg: '#0d1117', text: '#8b949e', grid: '#21262d',
        border: '#30363d', up: '#22c55e', down: '#ef4444',
    },
    chartFontSize: 11,
    volumeVisible: false,
    priceFormat: 'auto', // 'auto' | 'fixed' | 'precision'

    // Signals
    signalColors: {
        buy: '#22c55e', hold: '#f59e0b', sell: '#ef4444',
    },
    noteCategories: [
        { key: 'technical', label: '技术分析', color: '#1f6feb' },
        { key: 'news', label: '消息面', color: '#a855f7' },
        { key: 'capital', label: '资金流向', color: '#ec4899' },
        { key: 'key_level', label: '关键位置', color: '#f59e0b' },
        { key: 'other', label: '其他', color: '#8b949e' },
    ],
    drawingColors: ['#22c55e', '#ef4444', '#1f6feb', '#f59e0b', '#a855f7', '#ec4899'],

    // Notifications
    email: { host: '', port: 465, user: '', pass: '', to: '' },
    emailEnabled: false,
    notifyOn: 'high_confidence', // 'all' | 'high_confidence'

    // Data Sources
    exchangeOrder: ['okx', 'binance', 'hyperliquid', 'yahoo', 'akshare', 'eastmoney'],
    marketConfig: {
        '加密市场': { dataSource: 'auto', newsSource: 'odaily' },
        '美股市场': { dataSource: 'yahoo', newsSource: 'finnhub-news' },
        'A股市场': { dataSource: 'akshare', newsSource: 'eastmoney-news' },
    },

    // Real-time
    realtimeEnabled: true,
    wsReconnectDelay: 3000,
    restPollInterval: 500,
    okxWsTimeout: 5000,
    okxWsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
    binanceWsUrl: 'wss://fstream.binance.com/ws/',

    // Remote
    remotePollInterval: 1500,

    // History
    undoDepth: 50,

    // Odaily
    newsflashPageSize: 30,
    articlePageSize: 30,
    searchPageSize: 20,

    // Exchange limits
    exchangeLimits: {
        okx: 2000, binance: 1500, hyperliquid: 2000,
        yahoo: 500, akshare: 2000, eastmoney: 500,
    },

    // Last used (filled at runtime, no defaults)
    lastSymbol: '',
    lastTimeframe: 60,
    lastMarket: '',
};

// Current settings (merged with defaults on load)
export var settings = {};

var storageAPI = null;

export function setStorageAPI(url) { storageAPI = url; }

function deepMerge(target, source) {
    for (var key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            if (target[key] === undefined) target[key] = source[key];
        }
    }
}

export function loadSettings() {
    // Start with defaults
    settings = JSON.parse(JSON.stringify(defaults));

    // Merge from localStorage
    try {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            var saved = JSON.parse(raw);
            deepMerge(settings, saved);
        }
    } catch (_) {}

    // Merge from server
    if (storageAPI) {
        fetch(storageAPI + '/settings')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && Object.keys(data).length > 0) {
                    deepMerge(settings, data);
                }
            })
            .catch(function () {});
    }
}

export function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
    if (storageAPI) {
        fetch(storageAPI + '/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        }).catch(function () {});
    }
}

export function resetSettings() {
    settings = JSON.parse(JSON.stringify(defaults));
    saveSettings();
    return settings;
}

export function getDefault(key) {
    return defaults[key];
}

// Load immediately
loadSettings();
