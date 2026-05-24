// ============================================================
// Application State & Persistence
// ============================================================
import { STORAGE_KEY, BOOKMARK_KEY, DRAW_COLORS } from './config.js';

// --- Server sync ---
export let storageAPI = null;
export function setStorageAPI(url) { storageAPI = url; }

// --- Main state ---
export const state = {
    symbol: 'ZEC-PERP',
    timeframe: 60,
    data: [],
    selectedTime: null,
    selectedIndex: null,
    signals: {},
    noteDraft: '',
    activeExchange: '',
    realtime: false,
    noteFilter: 'all',
    currentMarket: '加密市场',
};

// Additional state vars
export let signalFilter = 'all';
export function setSignalFilter(v) { signalFilter = v; }

export let fullscreenMode = false;
export function setFullscreenMode(v) { fullscreenMode = v; }
export function toggleFullscreen() { fullscreenMode = !fullscreenMode; return fullscreenMode; }

export let drawMode = false;
export function setDrawMode(v) { drawMode = v; }
export function toggleDrawMode() { drawMode = !drawMode; return drawMode; }

export let pinnedTime = null;
export function setPinnedTime(t) { pinnedTime = t; }

export let showStructures = false;
export function toggleStructures() { showStructures = !showStructures; return showStructures; }

export let noteTab = 'signal';
export function setNoteTab(t) { noteTab = t; }

export let candleLimit = 300;
export function setCandleLimit(v) { candleLimit = v; }

export let lastDirection = '';
export function setLastDirection(d) { lastDirection = d; }

export let lastPrice = '';
export function setLastPrice(p) { lastPrice = p; }

export let symbolChangeLock = false;
export function setSymbolChangeLock(v) { symbolChangeLock = v; }

// --- Drawing state ---
export let drawLines = {};
export let colorIdx = 0;
export function nextColor() { return DRAW_COLORS[colorIdx++ % DRAW_COLORS.length]; }

// --- Bookmark state ---
export let nfBookmarks = [];
export let artBookmarks = [];

// --- History ---
let histStack = [];
let histIndex = -1;
const MAX_HIST = 50;

export function pushHist() {
    var snap = JSON.stringify(state.signals[state.symbol] || {});
    histStack = histStack.slice(0, histIndex + 1);
    histStack.push(snap);
    if (histStack.length > MAX_HIST) histStack.shift();
    histIndex = histStack.length - 1;
}

export function resetHistory() {
    histStack = [];
    histIndex = -1;
}

export function undoHist() {
    if (histIndex <= 0) return false;
    histIndex--;
    state.signals[state.symbol] = JSON.parse(histStack[histIndex]);
    saveSignals();
    return true;
}

export function redoHist() {
    if (histIndex >= histStack.length - 1) return false;
    histIndex++;
    state.signals[state.symbol] = JSON.parse(histStack[histIndex]);
    saveSignals();
    return true;
}

// ============================================================
// Signal Persistence
// ============================================================

export function loadSignals() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        state.signals = raw ? JSON.parse(raw) : {};
    } catch (_e) { state.signals = {}; }
    if (!state.signals[state.symbol]) state.signals[state.symbol] = {};
    if (storageAPI) {
        fetch(storageAPI + '/signals').then(r => r.json()).then(data => {
            if (data && Object.keys(data).length > 0) {
                for (var sym in data) {
                    if (!state.signals[sym]) state.signals[sym] = {};
                    for (var t in data[sym]) {
                        if (!state.signals[sym][t]) state.signals[sym][t] = data[sym][t];
                    }
                }
            }
        }).catch(() => {});
    }
}

export function saveSignals() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.signals)); } catch (_e) {}
    if (storageAPI) {
        fetch(storageAPI + '/signals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.signals),
        }).then(r => { if (!r.ok) console.log('[存储] 写入失败:', r.status); })
          .catch(e => console.log('[存储] 写入错误:', e));
    }
}

export function getSignal(time) {
    const sym = state.signals[state.symbol];
    return sym ? sym[time] : null;
}

export function getAllSignalsForSymbol() {
    return state.signals[state.symbol] || {};
}

export function placeSignal(time, type) {
    if (!state.signals[state.symbol]) state.signals[state.symbol] = {};
    const existing = state.signals[state.symbol][time];
    if (existing && existing.type === type) {
        delete state.signals[state.symbol][time];
        saveSignals();
        pushHist();
        return 'removed';
    }
    const candle = state.data.find(d => d.time === time);
    state.signals[state.symbol][time] = {
        type, price: candle ? candle.close : 0,
        note: { text: '', category: 'technical', updated: null },
        created: Date.now(),
    };
    saveSignals();
    pushHist();
    return 'placed';
}

export function removeSignal(time) {
    if (state.signals[state.symbol] && state.signals[state.symbol][time]) {
        delete state.signals[state.symbol][time];
        saveSignals();
        pushHist();
    }
}

export function updateNote(time, text, category) {
    if (state.signals[state.symbol] && state.signals[state.symbol][time]) {
        state.signals[state.symbol][time].note = {
            text: text || '', category: category || 'other', updated: Date.now(),
        };
        saveSignals();
    }
}

export function getNoteData(sig) {
    if (!sig || !sig.note) return { text: '', category: 'other', updated: null };
    if (typeof sig.note === 'string') return { text: sig.note, category: 'other', updated: null };
    return sig.note;
}

// ============================================================
// Bookmark Persistence
// ============================================================

export function loadBookmarks() {
    try {
        var raw = localStorage.getItem(BOOKMARK_KEY);
        if (raw) { var d = JSON.parse(raw); nfBookmarks = d.newsflash || []; artBookmarks = d.article || []; }
    } catch (_) { nfBookmarks = []; artBookmarks = []; }
    if (storageAPI) {
        fetch(storageAPI + '/bookmarks').then(r => r.json()).then(d => {
            if (d && d.newsflash && d.newsflash.length > 0) {
                var ids = nfBookmarks.map(b => b.link || b.publishTimestamp || '');
                d.newsflash.forEach(item => { var id = item.link || item.publishTimestamp || ''; if (id && ids.indexOf(id) === -1) nfBookmarks.push(item); });
            }
            if (d && d.article && d.article.length > 0) {
                var ids2 = artBookmarks.map(b => b.link || b.publishTimestamp || '');
                d.article.forEach(item => { var id = item.link || item.publishTimestamp || ''; if (id && ids2.indexOf(id) === -1) artBookmarks.push(item); });
            }
        }).catch(() => {});
    }
}

export function saveBookmarks() {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify({ newsflash: nfBookmarks, article: artBookmarks })); } catch (_) {}
    if (storageAPI) {
        fetch(storageAPI + '/bookmarks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newsflash: nfBookmarks, article: artBookmarks }),
        }).then(r => { if (!r.ok) console.log('[存储] 书签写入失败:', r.status); })
          .catch(e => console.log('[存储] 书签写入错误:', e));
    }
}

export function isBookmarked(item, type) {
    var list = type === 'article' ? artBookmarks : nfBookmarks;
    var id = item.link || item.publishTimestamp || '';
    return list.some(b => (b.link || b.publishTimestamp || '') === id);
}

export function toggleBookmark(item, type) {
    var list = type === 'article' ? artBookmarks : nfBookmarks;
    var id = item.link || item.publishTimestamp || '';
    var idx = list.findIndex(b => (b.link || b.publishTimestamp || '') === id);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(item);
    saveBookmarks();
}

// ============================================================
// Drawing Persistence
// ============================================================

export function loadDrawings() {
    try { drawLines = JSON.parse(localStorage.getItem('trading_drawings')) || {}; } catch (_) { drawLines = {}; }
    if (storageAPI) {
        fetch(storageAPI + '/drawings').then(r => r.json()).then(d => {
            if (d && Object.keys(d).length > 0) {
                for (var sym in d) {
                    if (!drawLines[sym]) drawLines[sym] = [];
                    d[sym].forEach(line => {
                        if (!drawLines[sym].some(l => l.price === line.price && l.color === line.color)) drawLines[sym].push(line);
                    });
                }
            }
        }).catch(() => {});
    }
}

export function saveDrawings() {
    localStorage.setItem('trading_drawings', JSON.stringify(drawLines));
    if (storageAPI) {
        fetch(storageAPI + '/drawings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(drawLines),
        }).then(r => { if (!r.ok) console.log('[存储] 绘制线写入失败:', r.status); })
          .catch(e => console.log('[存储] 绘制线写入错误:', e));
    }
}

export function addDrawLine(price) {
    if (!drawLines[state.symbol]) drawLines[state.symbol] = [];
    var color = DRAW_COLORS[colorIdx++ % DRAW_COLORS.length];
    drawLines[state.symbol].push({ price: +price.toFixed(2), color: color });
    saveDrawings();
    return drawLines[state.symbol][drawLines[state.symbol].length - 1];
}

export function clearDrawingsForSymbol() {
    if (!drawLines[state.symbol] || drawLines[state.symbol].length === 0) return false;
    drawLines[state.symbol] = [];
    saveDrawings();
    return true;
}
