// ============================================================
// Remote Control — Browser polling + window.remote API
// ============================================================
import { state, pinnedTime, setPinnedTime, setStorageAPI, loadSignals, saveSignals, loadBookmarks, saveBookmarks, loadDrawings, saveDrawings, addDrawLine, updateNote, pushHist } from './state.js';
import { updateOHLCBar, updateMarkers } from './chart.js';
import { showToast, updateNoteArea, renderAll, handleSignalClick, dom } from './ui.js';
import { SIGNAL_CFG } from './config.js';

var pollInterval = null;
var deferredAction = null;

// ============================================================
// Polling
// ============================================================

function processDeferred() {
    if (!deferredAction) return false;
    if (state.symbol !== deferredAction.symbol) return false;
    if (!state.data || state.data.length === 0) return false;
    var a = deferredAction;
    deferredAction = null;
    executeRemoteAction(a);
    return true;
}

export function startRemotePoll() {
    var base = window.location.origin === 'null' || window.location.protocol === 'file:'
        ? 'http://localhost:3456' : '';
    var pollUrl = base + '/api/poll';
    var connected = false;
    pollInterval = setInterval(function () {
        // Try to process deferred action first
        processDeferred();

        var statusUrl = base + '/api/status';
        fetch(pollUrl).then(function (r) { return r.json(); }).then(function (actions) {
            if (!connected) {
                connected = true;
                setStorageAPI(base + '/api/data');
                showToast('远程控制已连接', 'success');
                loadSignals();
                loadBookmarks();
                loadDrawings();
                setTimeout(function () {
                    saveSignals();
                    saveBookmarks();
                    saveDrawings();
                }, 300);
            }
            fetch(statusUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: state.symbol, timeframe: state.timeframe, dataLength: state.data ? state.data.length : 0 }),
            }).catch(function () {});
            if (!actions || actions.length === 0) return;
            actions.forEach(function (a) { executeRemoteAction(a); });
            // After processing new actions, try deferred again
            processDeferred();
        }).catch(function () {
            connected = false;
            setStorageAPI(null);
        });
    }, 1500);
}

function executeRemoteAction(a) {
    if (!a || !a.type) return;
    switch (a.type) {
        case 'signal':
            // Symbol mismatch: defer and switch to correct symbol
            if (a.symbol && a.symbol !== state.symbol) {
                deferredAction = a;
                document.dispatchEvent(new CustomEvent('symbolchange', { detail: { symbol: a.symbol } }));
                showToast('远程: 切换到 ' + a.symbol, 'info');
                break;
            }
            if (a.target === 'latest') {
                if (!state.data || state.data.length === 0) break;
                var c = state.data[state.data.length - 1];
                setPinnedTime(c.time);
                state.selectedTime = c.time;
                state.selectedIndex = state.data.length - 1;
                updateOHLCBar(c);
                updateNoteArea();
                updateMarkers();
            }
            if (a.signalType) {
                handleSignalClick(a.signalType);
            }
            if (a.note) {
                setTimeout(function () {
                    dom.noteInput.value = a.note;
                    dom.noteCategory.value = a.category || 'technical';
                    dom.noteInput.dataset.time = state.selectedTime || pinnedTime;
                    dom.noteInput.disabled = false;
                    updateNote(Number(dom.noteInput.dataset.time), a.note, dom.noteCategory.value);
                    renderAll();
                }, 150);
            }
            showToast('远程: ' + (a.signalType || '') + (a.note ? ' +笔记' : ''), 'info');
            break;
        case 'toast':
            showToast(a.msg || '', 'info');
            break;
        case 'reload':
            document.dispatchEvent(new CustomEvent('refresh'));
            break;
        case 'symbol':
            document.dispatchEvent(new CustomEvent('symbolchange', { detail: { symbol: a.symbol } }));
            break;
        case 'exec':
            try {
                var fn = new Function(a.code);
                var r = fn();
                if (r && r.then) r.catch(function (e) { showToast('远程执行错误: ' + e.message, 'error'); });
            } catch (e) {
                showToast('远程执行错误: ' + e.message, 'error');
            }
            break;
    }
}

// ============================================================
// window.remote API (callable from DevTools & remote exec)
// ============================================================

window.remote = {
    state: state,
    addSignal: function (type, noteText, noteCategory) {
        var t = state.selectedTime || pinnedTime;
        if (!t) { showToast('请先选择或固定一个K线', 'error'); return false; }
        if (!SIGNAL_CFG[type]) { showToast('无效信号类型: ' + type, 'error'); return false; }
        handleSignalClick(type);
        if (noteText) {
            setTimeout(function () {
                dom.noteInput.value = noteText;
                dom.noteCategory.value = noteCategory || 'technical';
                dom.noteInput.dataset.time = state.selectedTime || pinnedTime;
                dom.noteInput.disabled = false;
                updateNote(Number(dom.noteInput.dataset.time), noteText, dom.noteCategory.value);
                renderAll();
                showToast('已添加信号+笔记', 'success');
            }, 100);
        }
        return true;
    },
    pinByIndex: function (idx) {
        if (!state.data || idx < 0 || idx >= state.data.length) return false;
        var candle = state.data[idx];
        setPinnedTime(candle.time);
        state.selectedTime = candle.time;
        state.selectedIndex = idx;
        updateOHLCBar(candle);
        updateNoteArea();
        updateMarkers();
        showToast('已固定第 ' + (idx + 1) + ' 根K线', 'info');
        return true;
    },
    pinLatest: function () {
        if (!state.data || state.data.length === 0) return false;
        return this.pinByIndex(state.data.length - 1);
    },
    drawLine: function (price) {
        addDrawLine(price);
        showToast('已绘制水平线 @ ' + price, 'success');
        return true;
    },
    helper: function () {
        console.log('使用方法:');
        console.log('  remote.pinLatest()              — 固定最新K线');
        console.log('  remote.pinByIndex(5)            — 固定第5根K线');
        console.log('  remote.addSignal("buy")         — 标记买入信号');
        console.log('  remote.addSignal("sell", "突破阻力位") — 标记卖出信号+笔记');
        console.log('  remote.addSignal("hold", "观望", "technical") — 观望+技术分析笔记');
        console.log('  remote.state.symbol             — 当前标的');
        console.log('  remote.state.data               — K线数据');
    },
};

// ============================================================
// Remote import (callable from remote exec)
// ============================================================

window.importRemoteData = function (data) {
    if (data.signals) {
        for (var sym in data.signals) {
            if (!state.signals[sym]) state.signals[sym] = {};
            Object.assign(state.signals[sym], data.signals[sym]);
        }
        saveSignals();
        renderAll();
        showToast('已远程导入 ' + Object.keys(data.signals).length + ' 个交易对的信号', 'success');
    }
};
