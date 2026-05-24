// ============================================================
// Chart (Lightweight Charts)
// ============================================================
import { state, pinnedTime, setPinnedTime, showStructures, drawLines, getAllSignalsForSymbol, getNoteData, setLastDirection, setLastPrice } from './state.js';
import { SIGNAL_CFG, NOTE_CATEGORIES } from './config.js';
import { findSwingPoints, getRealtimeSource } from './api-market.js';

// --- Chart instances ---
export let chart = null;
export let candleSeries = null;
export let volumeSeries = null;
export let marketPriceLine = null;
export let drawLineInstances = [];

// --- Depth chart state ---
var depthDiv = null;
var depthChartIns = null;
var depthAskSeries = null;
var depthBidSeries = null;

// --- Callbacks (set by main.js) ---
export let onCandleClick = null;
export let onCrosshairMove = null;
export function setOnCandleClick(fn) { onCandleClick = fn; }
export function setOnCrosshairMove(fn) { onCrosshairMove = fn; }

// ============================================================
// Chart Initialization
// ============================================================

function getDom(id) { return document.getElementById(id); }

export function initChart(containerEl) {
    var theme = { bg: '#0d1117', text: '#8b949e', grid: '#21262d', border: '#30363d', up: '#22c55e', down: '#ef4444' };

    chart = LightweightCharts.createChart(containerEl, {
        layout: { background: { color: theme.bg }, textColor: theme.text, fontSize: 11 },
        grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: theme.text, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#1f6feb' },
            horzLine: { color: theme.text, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#1f6feb' },
        },
        rightPriceScale: { borderColor: theme.border, scaleMargins: { top: 0.05, bottom: 0.25 } },
        timeScale: { borderColor: theme.border, timeVisible: true, secondsVisible: false },
        handleScroll: { vertTouchDrag: false },
    });

    function formatPriceLabel(price) {
        if (price === undefined || price === null) return '--';
        var abs = Math.abs(price);
        if (abs >= 10000) return price.toFixed(1);
        if (abs >= 10) return price.toFixed(2);
        if (abs >= 0.1) return price.toFixed(4);
        if (abs >= 0.001) return price.toFixed(6);
        return price.toFixed(8);
    }

    candleSeries = chart.addCandlestickSeries({
        upColor: theme.up, downColor: theme.down,
        borderUpColor: theme.up, borderDownColor: theme.down,
        wickUpColor: theme.up, wickDownColor: theme.down,
        priceFormat: { type: 'custom', minMove: 0.000001, formatter: formatPriceLabel },
    });

    volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

    marketPriceLine = candleSeries.createPriceLine({
        price: 0, color: '#8b949e', lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true, title: '',
    });

    // Click handler
    if (chart.subscribeClick) {
        chart.subscribeClick(function (param) {
            if (onCandleClick) onCandleClick(param);
        });
    }

    // Crosshair handler
    chart.subscribeCrosshairMove(function (param) {
        if (onCrosshairMove) onCrosshairMove(param);
    });

    // Resize
    var ro = new ResizeObserver(function () {
        if (chart) chart.applyOptions({ width: containerEl.clientWidth, height: containerEl.clientHeight });
    });
    ro.observe(containerEl);
    window.addEventListener('resize', function () {
        if (chart) chart.applyOptions({ width: containerEl.clientWidth, height: containerEl.clientHeight });
    });
}

export function setChartData(newData) {
    drawLineInstances.forEach(function (pl) { try { candleSeries.removePriceLine(pl); } catch (_) {} });
    drawLineInstances = [];

    candleSeries.setData(newData.map(function (d) {
        return { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close };
    }));

    var volData = newData.map(function (d) {
        return { time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' };
    });
    volumeSeries.setData(volData);

    marketPriceLine.applyOptions({ price: newData[newData.length - 1].close });
    chart.timeScale().fitContent();
}

export function updateCandleOnChart(candle) {
    try { candleSeries.update({ time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close }); } catch (_) {}
    try {
        volumeSeries.update({
            time: candle.time, value: candle.volume,
            color: candle.close >= candle.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
        });
    } catch (_) {}
    marketPriceLine.applyOptions({ price: candle.close });
}

export function scrollToRealTime() {
    chart.timeScale().scrollToRealTime();
}

export function setVisibleRange(from, to) {
    chart.timeScale().setVisibleRange({ from: from, to: to });
}

export function getVisibleRange() {
    return chart.timeScale().getVisibleRange();
}

export function scrollToPosition(pos) {
    chart.timeScale().scrollToPosition(pos, false);
}

// ============================================================
// OHLC Bar (toolbar center)
// ============================================================

export function updateOHLCBar(candle) {
    if (!candle) return;
    var el = document.getElementById('ohlc-bar');
    if (!el) return;
    var { time, open, high, low, close } = candle;
    var d = new Date(time * 1000);
    var ts = d.toLocaleString('zh-CN', { hour12: false });
    var fullData = state.data.find(function (cd) { return cd.time === time; });
    var volume = fullData ? fullData.volume : 0;
    el.innerHTML =
        'O: <span class="ohlc-val">' + formatPrice(open) + '</span> ' +
        'H: <span class="ohlc-val">' + formatPrice(high) + '</span> ' +
        'L: <span class="ohlc-val">' + formatPrice(low) + '</span> ' +
        'C: <span class="ohlc-val ' + (close >= open ? 'up' : 'down') + '">' + formatPrice(close) + '</span> ' +
        'V: <span class="ohlc-val">' + formatVolume(volume) + '</span> ' +
        '<span class="ohlc-time">' + ts + '</span>';
    setLastDirection(close > open ? '↑' : close < open ? '↓' : '→');
    setLastPrice(formatPrice(close));
    document.title = 'Reminder | ' + state.symbol + ' ' + formatPrice(close) + ' ' + (close > open ? '↑' : close < open ? '↓' : '→');
}

function formatPrice(val) {
    if (val === undefined || val === null) return '--';
    return val >= 100 ? val.toFixed(1) : val.toPrecision(4);
}

function formatVolume(val) {
    if (!val) return '0';
    if (val > 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val > 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(2);
}

// ============================================================
// Title update helper
// ============================================================

export function updateTitle() {
    document.title = 'Reminder | ' + state.symbol;
    if (lastPrice) document.title += ' ' + lastPrice + ' ' + (lastDirection || '');
}

export function setTitleSymbolOnly() {
    document.title = 'Reminder | ' + state.symbol;
}

// ============================================================
// Data source indicator
// ============================================================

export function updateDataSource() {
    var el = document.getElementById('data-source');
    if (!el) return;
    var parts = [];
    if (state.activeExchange) parts.push('via ' + state.activeExchange);
    if (state.realtime) {
        var src = getRealtimeSource();
        var label = src === 'okx-ws' ? 'WS(OKX)' : src === 'binance-ws' ? 'WS(Binance)' : 'REST';
        parts.push('🟢 ' + label);
    }
    el.textContent = parts.join(' | ');
}

// ============================================================
// Markers (signals, note dots, structure, pinned)
// ============================================================

export function updateMarkers() {
    var signals = getAllSignalsForSymbol();
    var markers = [];
    for (var timeStr in signals) {
        var time = Number(timeStr);
        if (!state.data.some(function (d) { return d.time === time; })) continue;
        var sig = signals[timeStr];
        var cfg = SIGNAL_CFG[sig.type];
        if (!cfg) continue;
        markers.push({ time: time, position: cfg.pos, shape: cfg.shape, color: cfg.color, text: cfg.label, size: 1 });
        var noteData = getNoteData(sig);
        if (noteData.text) {
            var cat = NOTE_CATEGORIES.find(function (c) { return c.key === noteData.category; }) || NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];
            markers.push({ time: time, position: sig.type === 'buy' ? 'aboveBar' : 'belowBar', shape: 'circle', color: cat.color, text: '', size: 0.5 });
        }
    }
    if (showStructures && state.data.length > 10) {
        var swings = findSwingPoints(state.data, 2);
        swings.forEach(function (s) {
            if (markers.some(function (m) { return m.time === s.time; })) return;
            markers.push({ time: s.time, position: s.type === 'high' ? 'aboveBar' : 'belowBar', shape: s.type === 'high' ? 'arrowDown' : 'arrowUp', color: s.type === 'high' ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)', text: s.type === 'high' ? 'H' : 'L' });
        });
    }
    if (pinnedTime && state.data.some(function (d) { return d.time === pinnedTime; })) {
        markers.push({ time: pinnedTime, position: 'aboveBar', shape: 'square', color: '#f59e0b', text: '固定', size: 1.2 });
    }
    markers.sort(function (a, b) { return a.time - b.time; });
    candleSeries.setMarkers(markers);
}

// ============================================================
// Drawing lines
// ============================================================

export function renderDrawings(symbol) {
    drawLineInstances.forEach(function (pl) { candleSeries.removePriceLine(pl); });
    drawLineInstances = [];
    (drawLines[symbol] || []).forEach(function (d) {
        drawLineInstances.push(candleSeries.createPriceLine({
            price: d.price, color: d.color, lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true, title: '',
        }));
    });
}

// ============================================================
// Pin / Release K-line
// ============================================================

export function movePin(dir) {
    if (!pinnedTime || !state.data || state.data.length === 0) return;
    var idx = state.data.findIndex(function (d) { return d.time === pinnedTime; });
    if (idx < 0) idx = state.data.length - 1;
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.data.length) return;
    var candle = state.data[newIdx];
    setPinnedTime(candle.time);
    state.selectedTime = candle.time;
    state.selectedIndex = newIdx;
    updateOHLCBar(candle);
    if (window.__onPinChanged) window.__onPinChanged();
    updateMarkers();
}

export function releaseKLine() {
    setPinnedTime(null);
    state.selectedTime = null;
    state.selectedIndex = null;
    var ohlcEl = document.getElementById('ohlc-bar');
    if (ohlcEl) ohlcEl.textContent = '';
    document.title = 'Reminder | ' + state.symbol;
    if (window.__onPinChanged) window.__onPinChanged();
    updateMarkers();
}

// ============================================================
// Depth Chart
// ============================================================

export function initDepthChart() {
    if (depthChartIns) return;
    var container = document.getElementById('chart-container');
    if (!container) return;
    container.style.position = 'relative';
    depthDiv = document.createElement('div');
    depthDiv.id = 'depth-chart';
    depthDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:50;display:none;background:#0d1117;';
    container.appendChild(depthDiv);
    var header = document.createElement('div');
    header.style.cssText = 'position:absolute;top:4px;left:8px;right:8px;z-index:55;display:flex;justify-content:space-between;align-items:center;';
    var title = document.createElement('span');
    title.textContent = '订单簿深度';
    title.style.cssText = 'color:#8b949e;font-size:11px;';
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 关闭';
    closeBtn.style.cssText = 'background:var(--bg3);border:1px solid var(--border);color:var(--text);cursor:pointer;border-radius:3px;padding:2px 8px;font-size:11px;';
    closeBtn.addEventListener('click', function () { toggleDepthChart(false); });
    header.appendChild(closeBtn);
    depthDiv.appendChild(header);
    var inner = document.createElement('div');
    inner.id = 'depth-chart-inner';
    inner.style.cssText = 'width:100%;height:calc(100% - 28px);margin-top:28px;';
    depthDiv.appendChild(inner);
}

export function renderDepthChart(asks, bids) {
    var el = document.getElementById('depth-chart-inner');
    if (!el) return;
    if (!depthChartIns) {
        depthChartIns = LightweightCharts.createChart(el, {
            layout: { background: { color: '#0d1117' }, textColor: '#8b949e', fontSize: 10 },
            grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
            rightPriceScale: { borderColor: '#30363d', scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { visible: false }, handleScroll: false, handleScale: false,
        });
    }
    var now = Math.floor(Date.now() / 1000);
    var askData = asks.map(function (a, i) { return { time: now + i, value: a.total }; });
    var bidData = bids.map(function (b, i) { return { time: now + i, value: b.total }; });
    if (depthAskSeries) {
        depthAskSeries.setData(askData); depthBidSeries.setData(bidData);
        depthChartIns.timeScale().fitContent();
        return;
    }
    depthAskSeries = depthChartIns.addAreaSeries({ lineColor: '#ef4444', lineWidth: 1, topColor: 'rgba(239,68,68,0.3)', bottomColor: 'rgba(239,68,68,0.01)' });
    depthBidSeries = depthChartIns.addAreaSeries({ lineColor: '#22c55e', lineWidth: 1, topColor: 'rgba(34,197,94,0.3)', bottomColor: 'rgba(34,197,94,0.01)' });
    depthAskSeries.setData(askData); depthBidSeries.setData(bidData);
    depthChartIns.timeScale().fitContent();
    depthChartIns.applyOptions({ width: el.clientWidth, height: el.clientHeight });
}

var depthVisible = false;

export async function toggleDepthChart(force) {
    var show = force !== undefined ? force : !depthVisible;
    depthVisible = show;
    if (show) {
        if (!depthDiv) initDepthChart();
        depthDiv.style.display = 'block';
        if (depthChartIns) {
            setTimeout(function () {
                var el = document.getElementById('depth-chart-inner');
                if (el) depthChartIns.applyOptions({ width: el.clientWidth, height: el.clientHeight });
            }, 50);
        }
        var { fetchOrderBook } = await import('./api-market.js');
        try {
            var data = await fetchOrderBook(state.symbol);
            if (data) renderDepthChart(data.asks, data.bids);
        } catch (err) {
            // will be caught by the fetchOrderBook
        }
    } else {
        if (depthDiv) depthDiv.style.display = 'none';
    }
    var btn = document.getElementById('btn-depth');
    if (btn) btn.classList.toggle('active', show);
}
