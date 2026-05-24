// ============================================================
// Main Entry Point — Wires all modules together
// ============================================================
import { state, signalFilter, setSignalFilter, pinnedTime, setPinnedTime, drawMode, toggleDrawMode, showStructures, toggleStructures, fullscreenMode, toggleFullscreen, symbolChangeLock, setSymbolChangeLock, setCandleLimit, loadSignals, loadBookmarks, loadDrawings, pushHist, resetHistory, undoHist, redoHist, getSignal, removeSignal, noteTab, addDrawLine } from './state.js';
import { chart, candleSeries, setChartData, updateCandleOnChart, updateMarkers, updateOHLCBar, renderDrawings, updateDataSource, setOnCandleClick, setOnCrosshairMove, initChart, releaseKLine, movePin, initDepthChart } from './chart.js';
import { showToast, renderToolbar, renderSignalButtons, renderSignalLog, updateNoteArea, focusNoteForTime, bindNoteInput, bindSignalLogClick, bindNoteListClick, bindNewsflashClick, bindToolActions, renderExtraTools, initSignalControls, initPickerButtons, addFullscreenButton, renderAll, handleSignalClick, dom, updateLiveIndicator, rebuildSymbolSelector } from './ui.js';
import { MARKET_CONFIG, SYMBOLS, A_SYMBOLS } from './config.js';
import { fetchOHLCV, setOnRealtimeUpdate, setOnTitleUpdate, startRealtime, restartRealtime } from './api-market.js';
import { fetchNewsflash, fetchArticles, setOnNewsflashLoaded, setOnArticlesLoaded, setOnSearchDone } from './api-odaily.js';
import { startRemotePoll } from './remote-control.js';

// ============================================================
// Favicon
// ============================================================

function setFavicon() {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    var size = 6, gap = 1, cellW = Math.floor(64 / size);
    for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
            var r = Math.floor(Math.random() * 256);
            var g = Math.floor(Math.random() * 256);
            var b = Math.floor(Math.random() * 256);
            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
            ctx.fillRect(x * cellW + gap, y * cellW + gap, cellW - gap * 2, cellW - gap * 2);
        }
    }
    var link = document.querySelector('link[rel="icon"]') || document.createElement('link');
    link.rel = 'icon';
    link.href = c.toDataURL();
    document.head.appendChild(link);
}

// ============================================================
// Loading indicator
// ============================================================

function showLoading(on) {
    document.getElementById('chart-container').classList.toggle('loading', on);
}

// ============================================================
// Fullscreen toggle
// ============================================================

function toggleFullscreenChart() {
    toggleFullscreen();
    document.getElementById('app').classList.toggle('fullscreen', fullscreenMode);
    setTimeout(function () {
        chart.applyOptions({ width: document.getElementById('chart').clientWidth, height: document.getElementById('chart').clientHeight });
        chart.timeScale().fitContent();
    }, 150);
}

// ============================================================
// Placeholder
// ============================================================

function refreshMarketData() {}

// ============================================================
// Fetch generation counter (stale request guard)
// ============================================================

var fetchGen = 0;

// ============================================================
// Load chart data
// ============================================================

async function loadChartData() {
    try {
        showLoading(true);
        state.activeExchange = '';
        updateDataSource();
        fetchGen++;
        var gen = fetchGen;
        var newData = await fetchOHLCV(state.symbol, state.timeframe);
        if (gen !== fetchGen) return; // stale

        state.data = newData;
        setChartData(newData);
        renderDrawings(state.symbol);
        updateMarkers();
        renderSignalLog();
        updateNoteArea();
        updateDataSource();
        showToast('数据来源: ' + state.activeExchange, 'success');
        refreshMarketData();
    } catch (err) {
        showToast('数据加载失败: ' + err.message, 'error');
        state.data = [];
        document.title = 'abminder | ' + state.symbol;
        try { candleSeries.setData([]); } catch (_) {}
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Change symbol
// ============================================================

async function changeSymbol(sym) {
    if (symbolChangeLock) return;
    setSymbolChangeLock(true);
    try {
        state.symbol = sym;
        document.title = 'abminder | ' + sym;
        releaseKLine();
        setSignalFilter('all');
        loadSignals();
        resetHistory();
        pushHist();
        loadDrawings();
        await loadChartData();
        restartRealtime();
        refreshMarketData();
    } finally {
        setSymbolChangeLock(false);
    }
}

// ============================================================
// Keyboard shortcuts
// ============================================================

function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Ctrl+Z / Ctrl+Shift+Z undo-redo
        if (e.ctrlKey && e.key === 'z') {
            if (e.shiftKey) {
                if (redoHist()) showToast('重做', 'info');
                else showToast('没有可重做的操作', 'info');
            } else {
                if (undoHist()) showToast('撤销', 'info');
                else showToast('没有可撤销的操作', 'info');
            }
            e.preventDefault();
            return;
        }

        switch (e.key) {
            case '1':
                handleSignalClick('buy');
                e.preventDefault();
                break;
            case '2':
                handleSignalClick('hold');
                e.preventDefault();
                break;
            case '3':
                handleSignalClick('sell');
                e.preventDefault();
                break;
            case 'ArrowLeft':
                if (pinnedTime) movePin(-1);
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (pinnedTime) movePin(1);
                e.preventDefault();
                break;
            case 'n':
            case 'N':
                if (pinnedTime && dom.noteInput && dom.noteInput.disabled === false) {
                    dom.noteInput.focus();
                }
                e.preventDefault();
                break;
            case 'd':
            case 'D':
                toggleDrawMode();
                e.preventDefault();
                break;
            case 's':
            case 'S':
                toggleStructures();
                var sb = document.getElementById('btn-struct');
                if (sb) sb.classList.toggle('active', showStructures);
                updateMarkers();
                showToast(showStructures ? '波段高低点 开' : '波段高低点 关', 'info');
                e.preventDefault();
                break;
            case 'Escape':
                if (pinnedTime) {
                    releaseKLine();
                } else if (drawMode) {
                    toggleDrawMode();
                } else if (fullscreenMode) {
                    toggleFullscreenChart();
                }
                e.preventDefault();
                break;
            case 'f':
            case 'F':
                toggleFullscreenChart();
                e.preventDefault();
                break;
            case 'Delete':
            case 'Backspace':
                var t = pinnedTime || state.selectedTime;
                if (t) {
                    var sig = getSignal(t);
                    if (sig) {
                        removeSignal(t);
                        showToast('已移除信号', 'info');
                        renderAll();
                    }
                }
                e.preventDefault();
                break;
            case '?':
                showToast('快捷键: 1=买入 2=观望 3=卖出 | ←→=切换固定K线 | N=笔记 | D=绘制 | S=结构 | F=全屏 | Esc=释放 | Del=删除信号', 'info');
                e.preventDefault();
                break;
        }
    });
}

// ============================================================
// Callback wiring
// ============================================================

function wireCallbacks() {

    // Chart click: draw line or pin candle
    setOnCandleClick(function (param) {
        if (drawMode) {
            if (!param.point) return;
            var price = candleSeries.coordinateToPrice(param.point.y);
            if (price !== null && isFinite(price)) {
                addDrawLine(price);
                renderDrawings(state.symbol);
                showToast('水平线 @ ' + price, 'success');
            }
            return;
        }
        if (param.time && param.seriesData && param.seriesData.has(candleSeries)) {
            if (pinnedTime === param.time) {
                releaseKLine();
                return;
            }
            setPinnedTime(param.time);
            state.selectedTime = param.time;
            state.selectedIndex = state.data.findIndex(function (d) { return d.time === param.time; });
            var candle = param.seriesData.get(candleSeries);
            updateOHLCBar(candle);
            updateNoteArea();
            updateMarkers();
            showToast('已固定该K线，可直接操作', 'info');
        } else if (pinnedTime) {
            releaseKLine();
        }
    });

    // Crosshair move: update OHLC + note area
    setOnCrosshairMove(function (param) {
        if (param.time && param.seriesData && param.seriesData.has(candleSeries)) {
            var candle = param.seriesData.get(candleSeries);
            updateOHLCBar(candle);
            if (!pinnedTime) {
                state.selectedTime = param.time;
                state.selectedIndex = state.data.findIndex(function (d) { return d.time === param.time; });
                updateNoteArea();
            }
        } else if (!pinnedTime) {
            state.selectedTime = null;
            state.selectedIndex = null;
            var ohlcEl = document.getElementById('ohlc-bar');
            if (ohlcEl) ohlcEl.textContent = '';
            var noteEl = document.getElementById('note-area');
            if (noteEl) noteEl.classList.add('hidden');
        }
    });

    // Real-time update: update candle on chart + markers
    setOnRealtimeUpdate(function (data, last, candle) {
        updateCandleOnChart(candle);
        updateMarkers();
    });

    // Title update (from real-time)
    setOnTitleUpdate(function () {
        var last = state.data[state.data.length - 1];
        if (last) {
            document.title = 'abminder | ' + state.symbol + ' ' + last.close + ' ' + (last.close > last.open ? '↑' : last.close < last.open ? '↓' : '→');
        }
    });

    // Newsflash loaded
    setOnNewsflashLoaded(function () {
        if (noteTab === 'newsflash' || noteTab === 'search') renderSignalLog();
    });

    // Articles loaded
    setOnArticlesLoaded(function () {
        if (noteTab === 'article' || noteTab === 'search') renderSignalLog();
    });

    // Search done
    setOnSearchDone(function () {
        renderSignalLog();
    });
}

// ============================================================
// CustomEvent handlers (dispatched by UI)
// ============================================================

function wireCustomEvents() {
    document.addEventListener('symbolchange', function (e) {
        changeSymbol(e.detail.symbol);
    });

    document.addEventListener('timeframechange', function (e) {
        state.timeframe = e.detail.timeframe;
        var tfGroup = document.getElementById('timeframe-group');
        if (tfGroup) {
            tfGroup.querySelectorAll('.tf-btn').forEach(function (b) { b.classList.remove('active'); });
            var activeBtn = tfGroup.querySelector('.tf-btn[data-tf="' + state.timeframe + '"]');
            if (activeBtn) activeBtn.classList.add('active');
        }
        loadChartData();
        restartRealtime();
    });

    document.addEventListener('candlelimitchange', function (e) {
        setCandleLimit(e.detail.limit);
        loadChartData();
    });

    document.addEventListener('refresh', function () {
        loadChartData();
    });

    document.addEventListener('marketchange', function (e) {
        var market = e.detail.market;
        if (market === state.currentMarket) return;
        state.currentMarket = market;

        // Rebuild symbol selector for the new market
        rebuildSymbolSelector();

        // Get first symbol from the new market's list
        var cfg = MARKET_CONFIG[market];
        var list = market === 'A股市场' ? A_SYMBOLS : SYMBOLS;
        var first = list.find(function (s) { return cfg.catFilter.indexOf(s.cat) !== -1; });
        if (first && first.name !== state.symbol) {
            // Will trigger changeSymbol, which handles the rest
            var evt = new CustomEvent('symbolchange', { detail: { symbol: first.name } });
            document.dispatchEvent(evt);
        }
    });
}

// ============================================================
// Init
// ============================================================

async function init() {
    document.title = 'abminder | ' + state.symbol;
    setFavicon();

    // Load persisted data
    loadSignals();
    loadBookmarks();
    pushHist();

    // Chart
    var chartContainer = document.getElementById('chart');
    if (chartContainer) {
        initChart(chartContainer);
    } else {
        showToast('图表容器未找到', 'error');
        return;
    }

    // UI rendering
    renderToolbar();
    renderSignalButtons();
    initSignalControls();
    renderSignalLog();
    updateNoteArea();

    // Create note-list and newsflash-list as siblings of signal-list
    var signalListEl = document.getElementById('signal-list');
    if (signalListEl) {
        var parent = signalListEl.parentElement;
        var noteListEl = document.createElement('div');
        noteListEl.id = 'note-list';
        noteListEl.className = 'hidden';
        parent.appendChild(noteListEl);

        var nfListEl = document.createElement('div');
        nfListEl.id = 'newsflash-list';
        nfListEl.className = 'hidden';
        nfListEl.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
        parent.appendChild(nfListEl);
    }

    // Event binding
    bindNoteInput();
    bindToolActions();
    bindKeyboard();
    bindSignalLogClick();
    bindNoteListClick();
    bindNewsflashClick();
    initPickerButtons();

    // Loading drawings
    loadDrawings();

    // Extra tools (draw / structure / depth buttons)
    renderExtraTools();
    addFullscreenButton();

    // Wire callbacks
    wireCallbacks();
    wireCustomEvents();

    // Data source indicator
    updateDataSource();

    // Load chart data
    await loadChartData();

    // Init depth chart
    initDepthChart();

    // Default: start real-time
    startRealtime();
    updateLiveIndicator();

    // Load newsflash + articles
    fetchNewsflash();
    fetchArticles();

    // Start remote polling
    startRemotePoll();
}

// ============================================================
// Entry
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
