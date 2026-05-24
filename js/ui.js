// ============================================================
// UI — All DOM rendering & event binding
// ============================================================
import {
  state,
  signalFilter,
  setSignalFilter,
  fullscreenMode,
  toggleFullscreen,
  drawMode,
  toggleDrawMode,
  showStructures,
  toggleStructures,
  noteTab,
  setNoteTab,
  candleLimit,
  placeSignal,
  removeSignal,
  updateNote,
  getSignal,
  getAllSignalsForSymbol,
  getNoteData,
  saveSignals,
  pushHist,
  isBookmarked,
  toggleBookmark,
  clearDrawingsForSymbol,
  pinnedTime,
  setPinnedTime,
} from "./state.js";
import {
  SYMBOLS,
  TIMEFRAMES,
  SIGNAL_CFG,
  NOTE_CATEGORIES,
  CAT_ORDER,
  NF_CATEGORIES,
  ARTICLE_CATEGORIES,
  DRAW_COLORS,
  MARKET_CONFIG,
  A_SYMBOLS,
} from "./config.js";
import {
  chart,
  updateMarkers,
  setVisibleRange,
  scrollToPosition,
  releaseKLine,
  toggleDepthChart,
  renderDrawings,
} from "./chart.js";
import { startRealtime, stopRealtime } from "./api-market.js";
import {
  fetchNewsflash,
  fetchArticles,
  searchContent,
  newsflashCache,
  articleCache,
  searchResults,
  searchSource,
  setSearchSource,
  setSearchResults,
  setNfCategory,
  setArticleCategory,
  nfCategory,
  articleCategory,
  generateArticleImage,
} from "./api-odaily.js";
import {
  settings,
  saveSettings,
  resetSettings,
  getDefault,
} from "./settings.js";

// ============================================================
// Toast
// ============================================================

let toastTimer = null;

export function showToast(msg, type) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show" + (type ? " toast-" + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.className = "toast";
  }, 2000);
}

export function showConfirm(msg) {
  var el = document.getElementById("confirm");
  var backdrop = document.getElementById("confirm-backdrop");
  if (!el) return Promise.resolve(false);
  var msgEl = el.querySelector(".confirm-msg");
  var cancelBtn = el.querySelector(".cancel");
  var okBtn = el.querySelector(".ok");
  msgEl.textContent = msg;
  el.classList.add("show");
  if (backdrop) backdrop.classList.add("show");
  return new Promise(function (resolve) {
    function done(val) {
      el.classList.remove("show");
      if (backdrop) backdrop.classList.remove("show");
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
      if (backdrop) backdrop.removeEventListener("click", onCancel);
    }
    function onCancel() {
      done();
      resolve(false);
    }
    function onOk() {
      done();
      resolve(true);
    }
    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
    if (backdrop) backdrop.addEventListener("click", onCancel);
  });
}

function showChangeConfirm(oldLabel, newLabel) {
  return new Promise(function (resolve) {
    var backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.classList.add("show");
    var overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:20px;min-width:320px;";
    overlay.innerHTML =
      '<div style="margin-bottom:16px;font-size:13px;color:var(--text);text-align:center;">将 <strong>' +
      oldLabel +
      "</strong> 变更为 <strong>" +
      newLabel +
      "</strong></div>" +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      '<button class="confirm-btn" id="change-keep" style="padding:8px 16px;">变更且保留笔记</button>' +
      '<button class="confirm-btn" id="change-clear" style="padding:8px 16px;">变更不保留笔记</button>' +
      '<button class="confirm-btn cancel" id="change-cancel" style="padding:8px 16px;">取消变更</button>' +
      "</div>";
    document.body.appendChild(backdrop);
    document.body.appendChild(overlay);

    function done(result) {
      backdrop.remove();
      overlay.remove();
      resolve(result);
    }
    overlay
      .querySelector("#change-keep")
      .addEventListener("click", function () {
        done("keep_note");
      });
    overlay
      .querySelector("#change-clear")
      .addEventListener("click", function () {
        done("clear_note");
      });
    overlay
      .querySelector("#change-cancel")
      .addEventListener("click", function () {
        done(null);
      });
    backdrop.addEventListener("click", function () {
      done(null);
    });
  });
}

// ============================================================
// Signal Buttons
// ============================================================

export function renderSignalButtons() {
  var container = document.getElementById("signal-buttons");
  if (!container) return;
  container.innerHTML = "";
  for (var type in SIGNAL_CFG) {
    var cfg = SIGNAL_CFG[type];
    var btn = document.createElement("button");
    btn.className = "signal-btn " + type + "-btn";
    btn.dataset.type = type;
    btn.textContent = cfg.label;
    btn.addEventListener(
      "click",
      (function (t) {
        return function () {
          handleSignalClick(t);
        };
      })(type),
    );
    container.appendChild(btn);
  }
}

export async function handleSignalClick(type) {
  let time = pinnedTime || state.selectedTime;
  if (!time) {
    var last = state.data[state.data.length - 1];
    if (!last) {
      showToast("没有可用的K线数据", "error");
      return;
    }
    time = last.time;
    state.selectedTime = time;
    scrollToPosition(0, false);
  }
  setPinnedTime(time);

  var existing =
    state.signals[state.symbol] && state.signals[state.symbol][time];
  if (existing) {
    if (existing.type === type) {
      var confirmed = await showConfirm(
        "确定要移除 " + SIGNAL_CFG[type].label + " 信号吗？",
      );
      if (!confirmed) {
        updateNoteArea();
        renderAll();
        return;
      }
      placeSignal(time, type);
      showToast("已移除 " + SIGNAL_CFG[type].label + " 信号", "info");
      renderAll();
      updateMarkers();
      return;
    } else {
      var action = await showChangeConfirm(
        SIGNAL_CFG[existing.type].label,
        SIGNAL_CFG[type].label,
      );
      if (!action) {
        renderAll();
        updateMarkers();
        return;
      }
      var candle = state.data.find(function (d) {
        return d.time === time;
      });
      if (action === "keep_note") {
        state.signals[state.symbol][time].type = type;
        state.signals[state.symbol][time].price = candle ? candle.close : 0;
      } else {
        state.signals[state.symbol][time] = {
          type: type,
          price: candle ? candle.close : 0,
          note: { text: "", category: "technical", updated: null },
          created: state.signals[state.symbol][time].created,
        };
      }
      saveSignals();
      pushHist();
      showToast("已变更为: " + SIGNAL_CFG[type].label, "success");
      renderAll();
      updateMarkers();
      return;
    }
  }

  var result = placeSignal(time, type);
  if (result === "placed") {
    focusNoteForTime(time);
    showToast(
      "已标记: " +
        SIGNAL_CFG[type].label +
        " @ " +
        formatPrice(
          state.data.find(function (d) {
            return d.time === time;
          })
            ? state.data.find(function (d) {
                return d.time === time;
              }).close
            : 0,
        ),
      "success",
    );
  }
  renderAll();
  updateMarkers();
}

// ============================================================
// Note Area
// ============================================================

const dom = {};
function cacheDom() {
  dom.ohlcBar = document.getElementById("ohlc-bar");
  dom.noteInput = document.getElementById("note-input");
  dom.noteArea = document.getElementById("note-area");
  dom.noteSignalInfo = document.getElementById("note-signal-info");
  dom.noteCategory = document.getElementById("note-category");
}

export function updateNoteArea() {
  var t = state.selectedTime;
  if (t === null || t === undefined) {
    if (dom.noteArea) dom.noteArea.classList.add("hidden");
    return;
  }
  var sig = getSignal(t);
  if (!dom.noteArea) return;
  dom.noteArea.classList.remove("hidden");
  if (sig) {
    var noteData = getNoteData(sig);
    dom.noteSignalInfo.textContent =
      SIGNAL_CFG[sig.type].label +
      " @ " +
      formatPrice(sig.price) +
      " — " +
      formatTime(t);
    dom.noteInput.value = noteData.text || "";
    dom.noteCategory.value = noteData.category || "other";
    dom.noteInput.dataset.time = t;
    dom.noteInput.placeholder = "输入你的思考笔记...";
  } else {
    var candle = state.data.find(function (d) {
      return d.time === t;
    });
    dom.noteSignalInfo.textContent =
      "无信号 — " +
      (candle ? formatPrice(candle.close) : "") +
      " @ " +
      formatTime(t);
    dom.noteInput.value = "";
    dom.noteInput.dataset.time = "";
    dom.noteInput.placeholder = "点击固定该K线并添加信号";
  }
  dom.noteInput.disabled = !sig;
  dom.noteCategory.disabled = !sig;
}

export function focusNoteForTime(time) {
  var sig = getSignal(time);
  if (!sig) return;
  state.selectedTime = time;
  updateNoteArea();
  dom.noteInput.focus();
}

export function bindNoteInput() {
  function saveNote() {
    var t = Number(dom.noteInput.dataset.time);
    if (t) updateNote(t, dom.noteInput.value.trim(), dom.noteCategory.value);
  }
  dom.noteInput.addEventListener("blur", saveNote);
  dom.noteCategory.addEventListener("change", saveNote);
  dom.noteInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 80) + "px";
  });
  dom.noteInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      this.blur();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.blur();
    }
  });
}

// ============================================================
// Signal Log
// ============================================================

export function renderSignalLog() {
  var signals = getAllSignalsForSymbol();
  var allCount = Object.keys(signals).length;
  var entries = Object.entries(signals)
    .map(function (_a) {
      var time = Number(_a[0]),
        sig = _a[1];
      return { time: time, type: sig.type, price: sig.price, note: sig.note };
    })
    .sort(function (a, b) {
      return b.time - a.time;
    });
  if (signalFilter !== "all")
    entries = entries.filter(function (e) {
      return e.type === signalFilter;
    });

  var header = document.querySelector(".signal-history-header");
  var signalList = document.getElementById("signal-list");
  if (!header || !signalList) return;

  var tabsHtml =
    '<span class="sig-tabs">' +
    '<button class="sig-tab' +
    (noteTab === "signal" ? " active" : "") +
    '" data-tab="signal">信号</button>' +
    '<button class="sig-tab' +
    (noteTab === "note" ? " active" : "") +
    '" data-tab="note">笔记</button>' +
    '<button class="sig-tab' +
    (noteTab === "newsflash" ? " active" : "") +
    '" data-tab="newsflash">快讯</button>' +
    '<button class="sig-tab' +
    (noteTab === "article" ? " active" : "") +
    '" data-tab="article">文章</button>' +
    (searchResults !== null
      ? '<button class="sig-tab active" data-tab="search">搜索</button>'
      : "") +
    "</span>";

  if (noteTab === "signal") {
    var stats = { buy: 0, hold: 0, sell: 0 };
    for (var _k in signals) {
      var _t = signals[_k].type;
      if (stats[_t] !== undefined) stats[_t]++;
    }
    header.innerHTML =
      tabsHtml +
      '<span class="sig-header-left">信号记录 <span class="sig-count">' +
      allCount +
      "</span>" +
      '<span class="sig-stats"><span class="sig-stat-up">▲' +
      stats.buy +
      '</span> <span class="sig-stat-mid">◆' +
      stats.hold +
      '</span> <span class="sig-stat-down">▼' +
      stats.sell +
      "</span></span></span>" +
      '<span class="sig-filters">' +
      ["all", "buy", "hold", "sell"]
        .map(function (f) {
          return (
            '<button class="sig-filter' +
            (f === signalFilter ? " active" : "") +
            '" data-filter="' +
            f +
            '">' +
            { all: "全部", buy: "买入", hold: "观望", sell: "卖出" }[f] +
            "</button>"
          );
        })
        .join("") +
      "</span>";
  } else if (noteTab === "note") {
    var noteCount = 0;
    for (var _s in signals) {
      if (getNoteData(signals[_s]).text) noteCount++;
    }
    header.innerHTML =
      tabsHtml +
      '<span class="sig-header-left">笔记列表 <span class="sig-count">' +
      noteCount +
      "</span></span>" +
      '<span class="sig-filters">' +
      [{ key: "all", label: "全部" }]
        .concat(
          NOTE_CATEGORIES.map(function (c) {
            return { key: c.key, label: c.label };
          }),
        )
        .map(function (f) {
          return (
            '<button class="sig-filter' +
            (f.key === state.noteFilter ? " active" : "") +
            '" data-filter="' +
            f.key +
            '" data-note="1">' +
            f.label +
            "</button>"
          );
        })
        .join("") +
      "</span>";
  } else if (noteTab === "newsflash") {
    header.innerHTML =
      tabsHtml +
      '<span class="sig-header-left">快讯 <span class="sig-count">' +
      (newsflashCache ? newsflashCache.length : 0) +
      "</span></span>" +
      '<button class="sig-filter" id="btn-nf-refresh" title="刷新快讯">⟳</button>';
  } else if (noteTab === "article") {
    header.innerHTML =
      tabsHtml +
      '<span class="sig-header-left">文章 <span class="sig-count">' +
      (articleCache ? articleCache.length : 0) +
      "</span></span>" +
      '<button class="sig-filter" id="btn-nf-refresh" title="刷新文章">⟳</button>';
  } else if (noteTab === "search") {
    header.innerHTML =
      tabsHtml +
      '<span class="sig-header-left">搜索结果</span>' +
      '<button class="sig-filter" id="btn-search-clear" title="清除搜索">✕</button>';
  }

  // Toggle visibility
  var nfListEl = document.getElementById("newsflash-list");
  var noteListEl = document.getElementById("note-list");
  signalList.classList.add("hidden");
  if (nfListEl) nfListEl.classList.add("hidden");
  if (noteListEl) noteListEl.classList.add("hidden");

  if (noteTab === "note") {
    if (noteListEl) {
      noteListEl.classList.remove("hidden");
      renderNoteList();
    }
    updateSignalControls();
    return;
  }
  if (noteTab === "newsflash" || noteTab === "search") {
    if (nfListEl) {
      nfListEl.classList.remove("hidden");
      renderNewsflash();
    }
    updateSignalControls();
    return;
  }
  if (noteTab === "article") {
    if (nfListEl) {
      nfListEl.classList.remove("hidden");
      renderArticles();
    }
    updateSignalControls();
    return;
  }

  signalList.classList.remove("hidden");
  if (entries.length === 0) {
    signalList.innerHTML = '<div class="signal-empty">暂无信号记录</div>';
    return;
  }
  signalList.innerHTML = entries
    .map(function (entry) {
      var cfg = SIGNAL_CFG[entry.type];
      if (!cfg) return "";
      var nd = getNoteData(entry);
      var cat =
        NOTE_CATEGORIES.find(function (c) {
          return c.key === nd.category;
        }) || NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];
      var catBadge = nd.text
        ? '<span class="sig-cat" style="background:' +
          cat.color +
          "22;color:" +
          cat.color +
          '">' +
          cat.label +
          "</span>"
        : "";
      var noteHtml = nd.text
        ? '<div class="sig-note">' +
          catBadge +
          renderNoteText(nd.text) +
          "</div>"
        : "";
      return (
        '<div class="sig-entry" data-time="' +
        entry.time +
        '">' +
        '<span class="sig-dot" style="background:' +
        cfg.color +
        '"></span>' +
        '<span class="sig-info"><span class="sig-type">' +
        cfg.label +
        "</span>" +
        '<span class="sig-meta">' +
        formatTime(entry.time) +
        " @ " +
        formatPrice(entry.price) +
        "</span></span>" +
        noteHtml +
        '<button class="sig-del" data-time="' +
        entry.time +
        '" title="删除信号">×</button></div>'
      );
    })
    .join("");
  updateSignalControls();
}

function renderNoteList() {
  var el = document.getElementById("note-list");
  if (!el) return;
  var signals = getAllSignalsForSymbol();
  var entries = Object.entries(signals)
    .map(function (_a) {
      var time = Number(_a[0]),
        sig = _a[1];
      var nd = getNoteData(sig);
      return { time: time, type: sig.type, price: sig.price, note: nd };
    })
    .filter(function (e) {
      return e.note.text;
    })
    .filter(function (e) {
      return state.noteFilter === "all" || e.note.category === state.noteFilter;
    })
    .sort(function (a, b) {
      return b.time - a.time;
    });
  if (entries.length === 0) {
    el.innerHTML = '<div class="signal-empty">暂无笔记</div>';
    return;
  }
  el.innerHTML = entries
    .map(function (e) {
      var cat =
        NOTE_CATEGORIES.find(function (c) {
          return c.key === e.note.category;
        }) || NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];
      return (
        '<div class="note-entry" data-time="' +
        e.time +
        '">' +
        '<span class="note-dot" style="background:' +
        cat.color +
        '"></span>' +
        '<div class="note-body"><span class="note-meta">' +
        cat.label +
        "</span>" +
        '<div class="note-text">' +
        renderNoteText(e.note.text) +
        "</div>" +
        '<div class="note-time">' +
        formatTime(e.time) +
        "</div></div></div>"
      );
    })
    .join("");
}

// ============================================================
// Source labeling
// ============================================================

var SOURCE_COLORS = {
    Odaily:    { bg: '#1f6feb33', color: '#58a6ff' },
    '东方财富': { bg: '#ff704333', color: '#ff7043' },
    default:   { bg: '#8b949e33', color: '#8b949e' },
};

function renderSourceBadge(source) {
    if (!source) return '';
    var c = SOURCE_COLORS[source] || SOURCE_COLORS.default;
    return '<span class="src-badge" style="margin-left:6px;padding:0 6px;border-radius:3px;font-size:10px;font-weight:600;background:' + c.bg + ';color:' + c.color + ';">' + escapeHtml(source) + '</span>';
}

// ============================================================
// Newsflash & Article Rendering
// ============================================================

function renderNewsflash() {
  var el = document.getElementById("newsflash-list");
  if (!el) return;
  var data =
    searchResults !== null && noteTab === "search"
      ? searchResults
      : newsflashCache;
  if (!data || data.length === 0) {
    el.innerHTML =
      '<div class="signal-empty">暂无' +
      (noteTab === "search" ? "搜索结果" : "快讯") +
      "</div>";
    return;
  }
  el.innerHTML = data
    .map(function (item) {
      var date = new Date(item.publishTimestamp);
      var timeStr =
        padNum(date.getMonth() + 1) +
        "/" +
        padNum(date.getDate()) +
        " " +
        padNum(date.getHours()) +
        ":" +
        padNum(date.getMinutes());
      var contentPlain = (item.content || "").replace(/<[^>]*>/g, "").trim();
      var title = item.title || "";
      var linkUrl = item.link || item.sourceUrl || "";
      var isBm = isBookmarked(item, "newsflash");
      return (
        '<div class="news-entry' +
        (item.isImportant ? " news-imp" : "") +
        '" data-url="' +
        escapeHtml(linkUrl) +
        '">' +
        '<div class="news-top"><span class="news-dot"></span><span class="news-time">' +
        timeStr +
        "</span>" +
        renderSourceBadge(item._source) +
        (item.isImportant ? '<span class="news-badge">重要</span>' : "") +
        '<span class="news-bm" data-bm="newsflash" data-bmid="' +
        escapeHtml(linkUrl || String(item.publishTimestamp || "")) +
        '" style="margin-left:auto;cursor:pointer;font-size:13px;">' +
        (isBm ? "★" : "☆") +
        "</span></div>" +
        (title
          ? '<div class="news-title">' + escapeHtml(title) + "</div>"
          : "") +
        '<div class="news-content">' +
        escapeHtml(contentPlain.slice(0, 300)) +
        "</div>" +
        (item.sourceUrl
          ? '<div class="news-source">↗ ' +
            escapeHtml(item.sourceUrl) +
            "</div>"
          : "") +
        "</div>"
      );
    })
    .join("");
}

function renderArticles() {
  var el = document.getElementById("newsflash-list");
  if (!el) return;
  var data =
    searchResults !== null && noteTab === "search"
      ? searchResults
      : articleCache;
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="signal-empty">暂无文章</div>';
    return;
  }
  el.innerHTML = data
    .map(function (item) {
      var date = new Date(item.publishTimestamp);
      var timeStr =
        padNum(date.getMonth() + 1) +
        "/" +
        padNum(date.getDate()) +
        " " +
        padNum(date.getHours()) +
        ":" +
        padNum(date.getMinutes());
      var contentPlain = (item.summary || item.content || "")
        .replace(/<[^>]*>/g, "")
        .trim();
      var title = item.title || "";
      var linkUrl = item.link || item.sourceUrl || "";
      var imgSrc = generateArticleImage(title);
      var isBm = isBookmarked(item, "article");
      return (
        '<div class="news-entry" data-url="' +
        escapeHtml(linkUrl) +
        '">' +
        '<div class="news-top"><span class="news-dot"></span><span class="news-time">' +
        timeStr +
        "</span>" +
        renderSourceBadge(item._source) +
        '<span class="news-bm" data-bm="article" data-bmid="' +
        escapeHtml(linkUrl || String(item.publishTimestamp || "")) +
        '" style="margin-left:auto;cursor:pointer;font-size:13px;">' +
        (isBm ? "★" : "☆") +
        "</span></div>" +
        '<div style="display:flex;gap:8px;align-items:flex-start;">' +
        '<img src="' +
        imgSrc +
        '" style="width:60px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0;">' +
        '<div style="flex:1;min-width:0;">' +
        (title
          ? '<div class="news-title">' + escapeHtml(title) + "</div>"
          : "") +
        '<div class="news-content">' +
        escapeHtml(contentPlain.slice(0, 200)) +
        "</div></div></div>" +
        (item.sourceUrl
          ? '<div class="news-source">↗ ' +
            escapeHtml(item.sourceUrl) +
            "</div>"
          : "") +
        "</div>"
      );
    })
    .join("");
}

// ============================================================
// Pickers (flash/article/note)
// ============================================================

function showFlashPicker() {
  doPicker(
    "flash-picker",
    "flash-picker-list",
    newsflashCache,
    function (item) {
      return {
        url: item.link || "",
        title: (item.title || "").slice(0, 60) || "无标题",
        ts: item.publishTimestamp,
      };
    },
    "选择快讯",
  );
}

function showArticlePicker() {
  doPicker(
    "article-picker",
    "article-picker-list",
    articleCache,
    function (item) {
      return {
        url: item.link || "",
        title: (item.title || "").slice(0, 60) || "无标题",
        ts: item.publishTimestamp,
      };
    },
    "选择文章",
  );
}

function showNotePicker() {
  var allNotes = [];
  var symSignals = state.signals;
  for (var sym in symSignals) {
    for (var time in symSignals[sym]) {
      var sig = symSignals[sym][time];
      var nd = getNoteData(sig);
      if (nd.text)
        allNotes.push({
          symbol: sym,
          time: Number(time),
          price: sig.price,
          type: sig.type,
          noteText: nd.text.slice(0, 80),
        });
    }
  }
  allNotes.sort(function (a, b) {
    return b.time - a.time;
  });
  doPicker(
    "note-picker",
    "note-picker-list",
    allNotes,
    function (item) {
      return {
        url: "",
        title:
          "[" +
          item.symbol +
          "] " +
          formatTime(item.time) +
          " " +
          item.noteText,
        ts: item.time,
        extra: { symbol: item.symbol, time: item.time },
      };
    },
    "选择笔记",
  );
}

function doPicker(pickerId, listId, data, mapFn) {
  var picker = document.getElementById(pickerId);
  var list = document.getElementById(listId);
  if (!picker || !list) return;
  if (!data || data.length === 0) {
    list.innerHTML =
      '<div class="flash-picker-item" style="color:var(--text);opacity:0.5;">暂无数据</div>';
    picker.classList.remove("hidden");
    return;
  }
  list.innerHTML = data
    .slice(0, 30)
    .map(function (item) {
      var info = mapFn(item);
      var date = new Date(info.ts);
      var ts =
        padNum(date.getMonth() + 1) +
        "/" +
        padNum(date.getDate()) +
        " " +
        padNum(date.getHours()) +
        ":" +
        padNum(date.getMinutes());
      return (
        '<div class="flash-picker-item" ' +
        (info.url ? 'data-url="' + escapeHtml(info.url) + '"' : "") +
        ' data-title="' +
        escapeHtml(info.title) +
        '"' +
        (info.extra ? " data-extra='" + JSON.stringify(info.extra) + "'" : "") +
        ">" +
        '<span class="fpi-time">' +
        ts +
        "</span>" +
        escapeHtml(info.title) +
        "</div>"
      );
    })
    .join("");
  picker.classList.remove("hidden");
  list.onclick = function (e) {
    var el = e.target.closest(".flash-picker-item");
    if (!el) return;
    var title = el.dataset.title || "";
    var url = el.dataset.url || "";
    var extra = el.dataset.extra ? JSON.parse(el.dataset.extra) : null;
    var prefix =
      pickerId === "article-picker"
        ? "文章"
        : pickerId === "note-picker"
          ? "笔记"
          : "快讯";
    var ref;
    if (prefix === "笔记" && extra)
      ref = "【笔记:" + extra.symbol + "|" + extra.time + "】";
    else if (url) ref = "【" + prefix + ":" + title + "|" + url + "】";
    else ref = "【" + prefix + ":" + title + "】";
    insertAtCursor(dom.noteInput, ref);
    dom.noteInput.dispatchEvent(new Event("input"));
    var t = Number(dom.noteInput.dataset.time);
    if (t) updateNote(t, dom.noteInput.value.trim(), dom.noteCategory.value);
    picker.classList.add("hidden");
  };
}

function closeAllPickers() {
  document.querySelectorAll(".picker-overlay").forEach(function (el) {
    el.classList.add("hidden");
  });
}

// ============================================================
// Toolbar
// ============================================================

export function rebuildSymbolSelector() {
  var marketCfg = MARKET_CONFIG[state.currentMarket] || MARKET_CONFIG['加密市场'];
  var leftGroup = document.querySelector(".toolbar-left");
  if (!leftGroup) return;
  var oldSel = leftGroup.querySelector(".sym-select");
  if (oldSel) oldSel.remove();

  var symbols = state.currentMarket === 'A股市场' ? A_SYMBOLS : SYMBOLS;
  var filtered = marketCfg.catFilter
    ? symbols.filter(function (s) { return marketCfg.catFilter.indexOf(s.cat) !== -1; })
    : symbols;

  var sel = document.createElement("select");
  sel.className = "sym-select";
  sel.title = "选择标的";
  var groups = {};
  filtered.forEach(function (s) {
    var c = s.cat || "其他";
    if (!groups[c]) groups[c] = [];
    groups[c].push(s);
  });
  var catOrder = state.currentMarket === 'A股市场'
    ? ['A股']
    : CAT_ORDER.filter(function (c) { return groups[c]; });
  catOrder.forEach(function (cat) {
    if (!groups[cat]) return;
    var og = document.createElement("optgroup");
    og.label = cat;
    groups[cat].forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.name;
      opt.textContent = s.name + "  " + s.label;
      if (s.name === state.symbol) opt.selected = true;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  sel.addEventListener("change", function () {
    document.dispatchEvent(new CustomEvent("symbolchange", { detail: { symbol: this.value } }));
  });
  leftGroup.insertBefore(sel, leftGroup.firstChild);
}

export function renderToolbar() {
  var leftGroup = document.querySelector(".toolbar-left");
  if (!leftGroup) return;
  rebuildSymbolSelector();

  var tfGroup = document.getElementById("timeframe-group");
  if (tfGroup) {
    tfGroup.innerHTML = TIMEFRAMES.map(function (tf) {
      return (
        '<button class="tf-btn' +
        (tf.value === state.timeframe ? " active" : "") +
        '" data-tf="' +
        tf.value +
        '">' +
        tf.label +
        "</button>"
      );
    }).join("");
    tfGroup.addEventListener("click", function (e) {
      var btn = e.target.closest(".tf-btn");
      if (!btn) return;
      var evt = new CustomEvent("timeframechange", {
        detail: { timeframe: Number(btn.dataset.tf) },
      });
      document.dispatchEvent(evt);
    });
  }
}

// ============================================================
// Extra Tools
// ============================================================

export function renderExtraTools() {
  var right = document.querySelector(".toolbar-right");
  if (!right) return;

  var limitSel = document.createElement("select");
  limitSel.className = "tool-select";
  limitSel.title = "K线数量";
  [300, 750, 2000].forEach(function (v) {
    var opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (v === candleLimit) opt.selected = true;
    limitSel.appendChild(opt);
  });
  limitSel.addEventListener("change", function () {
    var evt = new CustomEvent("candlelimitchange", {
      detail: { limit: Number(this.value) },
    });
    document.dispatchEvent(evt);
  });
  right.appendChild(limitSel);

  var drawBtn = document.createElement("button");
  drawBtn.className = "tool-btn";
  drawBtn.dataset.toolbar = "draw";
  drawBtn.title = "绘制水平线 (点击图表放置)";
  drawBtn.textContent = "绘制";
  drawBtn.addEventListener("click", function () {
    toggleDrawMode();
    var e = document.querySelector('[data-toolbar="draw"]');
    if (e) e.classList.toggle("active", drawMode);
  });
  right.appendChild(drawBtn);

  var clearDrawBtn = document.createElement("button");
  clearDrawBtn.className = "tool-btn";
  clearDrawBtn.title = "清除所有水平线";
  clearDrawBtn.textContent = "清除绘制";
  clearDrawBtn.addEventListener("click", function () {
    if (clearDrawingsForSymbol()) showToast("已清除所有水平线", "success");
    else showToast("暂无绘制可清除", "info");
    renderDrawings(state.symbol);
  });
  right.appendChild(clearDrawBtn);

  var structBtn = document.createElement("button");
  structBtn.className = "tool-btn";
  structBtn.id = "btn-struct";
  structBtn.title = "波段高低点 (S)";
  structBtn.textContent = "结构";
  structBtn.addEventListener("click", function () {
    toggleStructures();
    structBtn.classList.toggle("active", showStructures);
    updateMarkers();
  });
  right.appendChild(structBtn);

  var sep = document.createElement("span");
  sep.style.cssText =
    "width:1px;height:18px;background:var(--border);margin:0 4px;";
  right.appendChild(sep);

  var depthBtn = document.createElement("button");
  depthBtn.className = "tool-btn";
  depthBtn.id = "btn-depth";
  depthBtn.title = "订单簿深度图";
  depthBtn.textContent = "深度";
  depthBtn.addEventListener("click", function () {
    toggleDepthChart();
  });
  right.appendChild(depthBtn);

  var marketSel = document.createElement("select");
  marketSel.className = "tool-select";
  marketSel.style.width = "75px";
  marketSel.title = "市场分类";
  ["加密市场", "美股市场", "A股市场"].forEach(function (v) {
    var opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (v === (state.currentMarket || "加密市场")) opt.selected = true;
    marketSel.appendChild(opt);
  });
  marketSel.addEventListener("change", function () {
    document.dispatchEvent(new CustomEvent("marketchange", { detail: { market: this.value } }));
  });
  right.appendChild(marketSel);

  var settingsBtn = document.createElement("button");
  settingsBtn.className = "tool-btn";
  settingsBtn.id = "btn-settings";
  settingsBtn.title = "设置";
  settingsBtn.textContent = "⚙";
  settingsBtn.addEventListener("click", function () {
    document.dispatchEvent(new CustomEvent("opensettings"));
  });
  right.appendChild(settingsBtn);
}

// ============================================================
// Signal Controls (category/search UI below tabs)
// ============================================================

function updateSignalControls() {
  var ctrl = document.getElementById("signal-controls");
  if (!ctrl) return;
  if (noteTab === "newsflash") {
    ctrl.innerHTML =
      '<span style="color:var(--text);opacity:0.6;">分类</span> ' +
      '<select id="nf-cat" class="sig-ctrl-select">' +
      NF_CATEGORIES.map(function (c) {
        return (
          '<option value="' +
          c.endpoint +
          '"' +
          (c.endpoint === nfCategory ? " selected" : "") +
          ">" +
          c.label +
          "</option>"
        );
      }).join("") +
      "</select> " +
      '<span class="sig-ctrl-count">' +
      (newsflashCache ? newsflashCache.length : 0) +
      "</span> " +
      '<button class="sig-ctrl-btn" data-action="nf-refresh" title="刷新">⟳</button>' +
      '<span style="margin-left:auto;"></span>' +
      '<input id="ctrl-search-input" class="sig-ctrl-input" type="text" placeholder="搜索快讯..." style="width:80px;">' +
      '<button class="sig-ctrl-btn" data-action="ctrl-search" title="搜索">🔍</button>';
    ctrl.classList.remove("hidden");
  } else if (noteTab === "article") {
    ctrl.innerHTML =
      '<span style="color:var(--text);opacity:0.6;">分类</span> ' +
      '<select id="art-cat" class="sig-ctrl-select">' +
      ARTICLE_CATEGORIES.map(function (c) {
        return (
          '<option value="' +
          c.endpoint +
          '"' +
          (c.endpoint === articleCategory ? " selected" : "") +
          ">" +
          c.label +
          "</option>"
        );
      }).join("") +
      "</select> " +
      '<span class="sig-ctrl-count">' +
      (articleCache ? articleCache.length : 0) +
      "</span> " +
      '<button class="sig-ctrl-btn" data-action="art-refresh" title="刷新">⟳</button>' +
      '<span style="margin-left:auto;"></span>' +
      '<input id="ctrl-search-input" class="sig-ctrl-input" type="text" placeholder="搜索文章..." style="width:80px;">' +
      '<button class="sig-ctrl-btn" data-action="ctrl-search" title="搜索">🔍</button>';
    ctrl.classList.remove("hidden");
  } else if (noteTab === "search") {
    ctrl.innerHTML =
      '<input id="search-input" class="sig-ctrl-input" type="text" placeholder="关键词..."> ' +
      '<select id="search-source" class="sig-ctrl-select" style="width:auto;">' +
      '<option value="newsflash"' +
      (searchSource === "newsflash" ? " selected" : "") +
      ">快讯</option>" +
      '<option value="article"' +
      (searchSource === "article" ? " selected" : "") +
      ">文章</option></select> " +
      '<button class="sig-ctrl-btn" data-action="search-go" title="搜索">🔍</button> ' +
      '<button class="sig-ctrl-btn" data-action="search-clear" title="清除搜索">✕</button>';
    ctrl.classList.remove("hidden");
  } else {
    ctrl.classList.add("hidden");
  }
}

// ============================================================
// Event Binding
// ============================================================

export function bindSignalLogClick() {
  var historyEl = document.querySelector(".signal-history-header");
  if (!historyEl) return;
  historyEl.parentElement.addEventListener("click", function (e) {
    var tabBtn = e.target.closest(".sig-tab");
    if (tabBtn) {
      setNoteTab(tabBtn.dataset.tab);
      renderSignalLog();
      return;
    }
    var filterBtn = e.target.closest(".sig-filter");
    if (filterBtn) {
      if (filterBtn.dataset.note) state.noteFilter = filterBtn.dataset.filter;
      else setSignalFilter(filterBtn.dataset.filter);
      renderSignalLog();
      return;
    }
    var delBtn = e.target.closest(".sig-del");
    if (delBtn) {
      var t = Number(delBtn.dataset.time);
      if (t) removeSignal(t);
      showToast("已删除信号", "info");
      renderSignalLog();
      return;
    }
    if (e.target.id === "btn-nf-refresh") {
      if (noteTab === "article") fetchArticles();
      else fetchNewsflash();
      return;
    }
    if (e.target.id === "btn-search-clear") {
      setSearchResults(null);
      setNoteTab("newsflash");
      renderSignalLog();
      return;
    }
    var entry = e.target.closest(".sig-entry");
    if (!entry) return;
    var time = Number(entry.dataset.time);
    if (time) {
      state.selectedTime = time;
      setPinnedTime(time);
      var visible = chart.timeScale().getVisibleRange();
      if (visible) {
        var range = visible.to - visible.from;
        setVisibleRange(time - range * 0.3, time + range * 0.7);
      }
      updateNoteArea();
      updateMarkers();
      showToast("已定位+固定 " + formatTime(time), "info");
    }
  });
}

export function bindNoteListClick() {
  var el = document.getElementById("note-list");
  if (!el) return;
  el.addEventListener("click", function (e) {
    var entry = e.target.closest(".note-entry");
    if (!entry) return;
    var time = Number(entry.dataset.time);
    if (time) {
      state.selectedTime = time;
      setPinnedTime(time);
      var visible = chart.timeScale().getVisibleRange();
      if (visible) {
        var range = visible.to - visible.from;
        setVisibleRange(time - range * 0.3, time + range * 0.7);
      }
      setNoteTab("signal");
      renderSignalLog();
      updateNoteArea();
      updateMarkers();
    }
  });
}

export function bindNewsflashClick() {
  var el = document.getElementById("newsflash-list");
  if (!el) return;
  el.addEventListener("click", async function (e) {
    var bm = e.target.closest(".news-bm");
    if (bm) {
      var type = bm.dataset.bm || "newsflash";
      var cache = type === "article" ? articleCache : newsflashCache;
      var id = bm.dataset.bmid;
      var item = cache
        ? cache.find(function (c) {
            return (c.link || String(c.publishTimestamp || "")) === id;
          })
        : null;
      if (!item && searchResults)
        item = searchResults.find(function (c) {
          return (c.link || String(c.publishTimestamp || "")) === id;
        });
      if (item) {
        var alreadyBm = isBookmarked(item, type);
        if (alreadyBm) {
          var ok = await showConfirm("确认取消收藏？");
          if (!ok) return;
        }
        toggleBookmark(item, type);
        bm.textContent = isBookmarked(item, type) ? "★" : "☆";
        showToast(isBookmarked(item, type) ? "已收藏" : "已取消收藏", "info");
        if (
          (type === "article" && articleCategory === "__bookmarked__") ||
          (type !== "article" && nfCategory === "__bookmarked__")
        ) {
          if (type === "article") fetchArticles();
          else fetchNewsflash();
          renderSignalLog();
        }
      }
      return;
    }
    var entry = e.target.closest(".news-entry");
    if (!entry) return;
    var url = entry.dataset.url;
    if (url) window.open(url, "_blank");
  });
}

// ============================================================
// Tool Actions (refresh, clear, export, import)
// ============================================================

export function bindToolActions() {
  document.getElementById("btn-refresh").addEventListener("click", function () {
    document.dispatchEvent(new CustomEvent("refresh"));
    showToast("已刷新", "info");
  });
  document
    .getElementById("btn-clear-all")
    .addEventListener("click", function () {
      var sym = state.symbol;
      var count = Object.keys(state.signals[sym] || {}).length;
      if (count === 0) {
        showToast("暂无信号可清除", "info");
        return;
      }
      showConfirm("确认清除 " + sym + " 的所有信号？").then(function (ok) {
        if (!ok) return;
        pushHist();
        state.signals[sym] = {};
        saveSignals();
        renderAll();
        showToast("已清除所有信号", "info");
      });
    });
  document.getElementById("btn-export").addEventListener("click", exportData);
  document.getElementById("btn-import").addEventListener("click", importData);
  document.getElementById("btn-live").addEventListener("click", function () {
    if (state.realtime) stopRealtime();
    else startRealtime();
    updateLiveIndicator();
  });
}

export function updateLiveIndicator() {
  var el = document.getElementById("btn-live");
  if (el) el.classList.toggle("active", state.realtime);
}

function exportData() {
  var data = {
    version: 1,
    exported: Date.now(),
    signals: state.signals,
    symbol: state.symbol,
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download =
    "trading-signals-" +
    state.symbol +
    "-" +
    new Date().toISOString().slice(0, 10) +
    ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("数据已导出", "success");
}

function importData() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", function () {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.signals) {
          for (var sym in data.signals) {
            if (!state.signals[sym]) state.signals[sym] = {};
            Object.assign(state.signals[sym], data.signals[sym]);
          }
          saveSignals();
          renderAll();
          showToast(
            "已导入 " + Object.keys(data.signals).length + " 个交易对的信号",
            "success",
          );
        }
      } catch (_err) {
        showToast("导入失败: 文件格式无效", "error");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ============================================================
// Signal controls event delegation
// ============================================================

export function initSignalControls() {
  var header = document.querySelector(".signal-history-header");
  if (!header) return;
  var ctrlDiv = document.createElement("div");
  ctrlDiv.id = "signal-controls";
  ctrlDiv.className = "hidden";
  header.parentElement.insertBefore(ctrlDiv, header.nextSibling);

  ctrlDiv.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === "nf-refresh") fetchNewsflash();
    else if (action === "art-refresh") fetchArticles();
    else if (action === "search-go") doSearch();
    else if (action === "ctrl-search") doCtrlSearch();
    else if (action === "search-clear") {
      setSearchResults(null);
      setNoteTab("newsflash");
      renderSignalLog();
    }
  });
  ctrlDiv.addEventListener("change", function (e) {
    var sel = e.target.closest("select");
    if (!sel) return;
    if (sel.id === "nf-cat") {
      setNfCategory(sel.value);
      fetchNewsflash();
    } else if (sel.id === "art-cat") {
      setArticleCategory(sel.value);
      fetchArticles();
    } else if (sel.id === "search-source") setSearchSource(sel.value);
  });
  ctrlDiv.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var input = e.target.closest(".sig-ctrl-input");
      if (input) {
        if (input.id === "search-input") doSearch();
        else if (input.id === "ctrl-search-input") doCtrlSearch();
      }
    }
  });

  function doSearch() {
    var input = document.getElementById("search-input");
    if (!input) return;
    var kw = input.value.trim();
    if (!kw) return;
    var src = document.getElementById("search-source");
    if (src) setSearchSource(src.value);
    searchContent(kw).then(function () {
      setNoteTab("search");
      renderSignalLog();
    });
  }

  function doCtrlSearch() {
    var input = document.getElementById("ctrl-search-input");
    if (!input) return;
    var kw = input.value.trim();
    if (!kw) return;
    setSearchSource(noteTab === "article" ? "article" : "newsflash");
    searchContent(kw).then(function () {
      setNoteTab("search");
      renderSignalLog();
    });
  }
}

// ============================================================
// Note ref buttons (event delegation)
// ============================================================

export function initPickerButtons() {
  document.addEventListener("click", function (e) {
    if (e.target.id === "btn-ins-flash") showFlashPicker();
    if (e.target.id === "btn-ins-article") showArticlePicker();
    if (e.target.id === "btn-ins-note") showNotePicker();
    if (e.target.id === "btn-release") {
      releaseKLine();
      updateNoteArea();
      showToast("K线已释放", "info");
    }
  });
  document.querySelectorAll(".picker-close").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.closest(".picker-overlay").classList.add("hidden");
    });
  });
  document.addEventListener("click", function (e) {
    document
      .querySelectorAll(".picker-overlay:not(.hidden)")
      .forEach(function (picker) {
        if (
          !picker.contains(e.target) &&
          e.target.id !== "btn-ins-flash" &&
          e.target.id !== "btn-ins-article" &&
          e.target.id !== "btn-ins-note" &&
          e.target.id !== "btn-settings"
        )
          picker.classList.add("hidden");
      });
  });
}

// ============================================================
// Fullscreen button
// ============================================================

export function addFullscreenButton() {
  var right = document.querySelector(".toolbar-right");
  if (!right) return;
  var fsBtn = document.createElement("button");
  fsBtn.className = "tool-btn";
  fsBtn.id = "btn-fullscreen";
  fsBtn.title = "全屏图表 (F)";
  fsBtn.textContent = "⛶";
  right.appendChild(fsBtn);
  fsBtn.addEventListener("click", function () {
    toggleFullscreen();
    document
      .getElementById("app")
      .classList.toggle("fullscreen", fullscreenMode);
    setTimeout(function () {
      chart.applyOptions({
        width: document.getElementById("chart").clientWidth,
        height: document.getElementById("chart").clientHeight,
      });
      chart.timeScale().fitContent();
    }, 150);
  });
  var fsExit = document.createElement("button");
  fsExit.id = "btn-fs-exit";
  fsExit.textContent = "✕ 退出全屏 (F)";
  fsExit.addEventListener("click", function () {
    toggleFullscreen();
    document
      .getElementById("app")
      .classList.toggle("fullscreen", fullscreenMode);
    setTimeout(function () {
      chart.applyOptions({
        width: document.getElementById("chart").clientWidth,
        height: document.getElementById("chart").clientHeight,
      });
      chart.timeScale().fitContent();
    }, 150);
  });
  document.getElementById("chart-container").appendChild(fsExit);
}

// ============================================================
// Settings Panel
// ============================================================

function getNested(obj, path) {
  return path.split(".").reduce(function (o, k) {
    return o && o[k] !== undefined ? o[k] : "";
  }, obj);
}

function setNested(obj, path, val) {
  var parts = path.split(".");
  var last = parts.pop();
  var target = parts.reduce(function (o, k) {
    return o[k];
  }, obj);
  target[last] = val;
}

function buildField(name, label, type, value, extra) {
  var id = "set-" + name.replace(/\./g, "-");
  var html = '<div class="settings-row">';
  html += '<label for="' + id + '">' + label + "</label>";
  if (type === "checkbox") {
    html +=
      '<input type="checkbox" id="' +
      id +
      '" data-path="' +
      name +
      '"' +
      (value ? " checked" : "") +
      ">";
  } else if (type === "color") {
    html +=
      '<input type="color" id="' +
      id +
      '" data-path="' +
      name +
      '" value="' +
      value +
      '">';
  } else if (type === "select") {
    html +=
      '<select id="' + id + '" data-path="' + name + '">';
    extra.forEach(function (o) {
      html +=
        '<option value="' +
        o.value +
        '"' +
        (o.value === value ? " selected" : "") +
        ">" +
        o.label +
        "</option>";
    });
    html += "</select>";
  } else if (type === "password") {
    html +=
      '<input type="password" id="' +
      id +
      '" data-path="' +
      name +
      '" value="' +
      (value || "") +
      '" placeholder="' +
      (extra || "") +
      '">';
  } else {
    html +=
      '<input type="' +
      type +
      '" id="' +
      id +
      '" data-path="' +
      name +
      '" value="' +
      value +
      '">';
  }
  html += "</div>";
  return html;
}

export function renderSettings() {
  var body = document.getElementById("settings-body");
  if (!body) return;

  var html = "";

  // === 交易设置 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">交易设置</div>';

  // defaultSymbol dropdown from SYMBOLS + A_SYMBOLS
  html += '<div class="settings-row"><label for="set-defaultSymbol">默认交易对</label>';
  html += '<select id="set-defaultSymbol" data-path="defaultSymbol">';
  var allSymbols = SYMBOLS.concat(A_SYMBOLS);
  allSymbols.forEach(function (s) {
    html += '<option value="' + s.name + '"' + (s.name === settings.defaultSymbol ? " selected" : "") + ">" + s.label + "</option>";
  });
  html += "</select></div>";

  // defaultTimeframe dropdown from TIMEFRAMES
  html += '<div class="settings-row"><label for="set-defaultTimeframe">默认周期</label>';
  html += '<select id="set-defaultTimeframe" data-path="defaultTimeframe">';
  TIMEFRAMES.forEach(function (tf) {
    html += '<option value="' + tf.value + '"' + (tf.value === settings.defaultTimeframe ? " selected" : "") + ">" + tf.label + "</option>";
  });
  html += "</select></div>";

  // candleLimit dropdown
  html += '<div class="settings-row"><label for="set-candleLimit">K线加载数量</label>';
  html += '<select id="set-candleLimit" data-path="candleLimit">';
  [100, 300, 500, 750, 1000, 2000].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.candleLimit === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += "</div>";

  // === 显示设置 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">显示设置</div>';
  html += buildField("volumeVisible", "显示成交量", "checkbox", settings.volumeVisible);
  html += buildField("priceFormat", "价格格式", "select", settings.priceFormat, [
    { value: "auto", label: "自动" },
    { value: "fixed", label: "固定小数" },
    { value: "precision", label: "有效数字" },
  ]);
  // chartFontSize dropdown
  html += '<div class="settings-row"><label for="set-chartFontSize">字体大小</label>';
  html += '<select id="set-chartFontSize" data-path="chartFontSize">';
  [9, 10, 11, 12, 13, 14, 16].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.chartFontSize === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label>主题颜色</label>';
  html += '<div class="settings-color-group">';
  var themeFields = [
    ["chartTheme.bg", "背景"],
    ["chartTheme.text", "文字"],
    ["chartTheme.grid", "网格"],
    ["chartTheme.border", "边框"],
    ["chartTheme.up", "涨"],
    ["chartTheme.down", "跌"],
  ];
  themeFields.forEach(function (f) {
    html +=
      '<span class="settings-color-item">' +
      f[1] +
      " <input type=\"color\" data-path=\"" +
      f[0] +
      '" value="' +
      getNested(settings, f[0]) +
      '"></span>';
  });
  html += "</div></div>";
  html += "</div>";

  // === 信号设置 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">信号设置</div>';
  html += buildField("signalColors.buy", "买入颜色", "color", settings.signalColors.buy);
  html += buildField("signalColors.hold", "持有颜色", "color", settings.signalColors.hold);
  html += buildField("signalColors.sell", "卖出颜色", "color", settings.signalColors.sell);
  html += buildField("showStructures", "显示波段结构", "checkbox", settings.showStructures);
  html += "</div>";

  // === 通知设置 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">通知设置</div>';
  html += buildField("emailEnabled", "启用邮件通知", "checkbox", settings.emailEnabled);
  html += buildField("notifyOn", "通知触发", "select", settings.notifyOn, [
    { value: "high_confidence", label: "仅高置信度" },
    { value: "all", label: "全部信号" },
  ]);
  html += buildField("email.host", "SMTP 服务器", "text", settings.email.host);
  // email.port dropdown
  html += '<div class="settings-row"><label for="set-email-port">SMTP 端口</label>';
  html += '<select id="set-email-port" data-path="email.port">';
  [25, 465, 587, 2525].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.email.port === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += buildField("email.user", "邮箱账号", "text", settings.email.user);
  html += buildField("email.pass", "邮箱密码", "password", settings.email.pass);
  html += buildField("email.to", "接收邮箱", "text", settings.email.to);
  html += "</div>";

  // === 数据源 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">数据源</div>';
  html += buildField("exchangeOrder", "交易所优先级", "text",
    Array.isArray(settings.exchangeOrder) ? settings.exchangeOrder.join(",") : settings.exchangeOrder);
  html += '<div class="settings-row"><span class="settings-hint">用逗号分隔: okx,binance,hyperliquid,yahoo,akshare,eastmoney</span></div>';
  html += "</div>";

  // === 实时行情 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">实时行情</div>';
  html += buildField("realtimeEnabled", "启用实时", "checkbox", settings.realtimeEnabled);
  // Interval/timeout dropdowns
  html += '<div class="settings-row"><label for="set-wsReconnectDelay">WS重连(ms)</label>';
  html += '<select id="set-wsReconnectDelay" data-path="wsReconnectDelay">';
  [1000, 2000, 3000, 5000, 10000].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.wsReconnectDelay === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label for="set-restPollInterval">REST轮询(ms)</label>';
  html += '<select id="set-restPollInterval" data-path="restPollInterval">';
  [200, 500, 1000, 2000, 5000].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.restPollInterval === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label for="set-okxWsTimeout">OKX超时(ms)</label>';
  html += '<select id="set-okxWsTimeout" data-path="okxWsTimeout">';
  [2000, 5000, 10000, 30000].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.okxWsTimeout === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label for="set-remotePollInterval">远程轮询(ms)</label>';
  html += '<select id="set-remotePollInterval" data-path="remotePollInterval">';
  [500, 1000, 1500, 2000, 5000].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.remotePollInterval === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += "</div>";

  // === 其他 ===
  html += '<div class="settings-section">';
  html += '<div class="settings-section-title">其他</div>';
  html += '<div class="settings-row"><label for="set-undoDepth">撤销深度</label>';
  html += '<select id="set-undoDepth" data-path="undoDepth">';
  [10, 20, 50, 100, 200].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.undoDepth === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label for="set-newsflashPageSize">快讯每页数量</label>';
  html += '<select id="set-newsflashPageSize" data-path="newsflashPageSize">';
  [10, 20, 30, 50, 100].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.newsflashPageSize === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label for="set-articlePageSize">文章每页数量</label>';
  html += '<select id="set-articlePageSize" data-path="articlePageSize">';
  [10, 20, 30, 50, 100].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.articlePageSize === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += '<div class="settings-row"><label for="set-searchPageSize">搜索每页数量</label>';
  html += '<select id="set-searchPageSize" data-path="searchPageSize">';
  [10, 20, 50, 100].forEach(function (v) {
    html += '<option value="' + v + '"' + (settings.searchPageSize === v ? " selected" : "") + ">" + v + "</option>";
  });
  html += "</select></div>";
  html += "</div>";

  body.innerHTML = html;

  // Bind change events
  body.querySelectorAll("input, select").forEach(function (el) {
    el.addEventListener("change", function () {
      var path = this.dataset.path;
      if (!path) return;
      var val;
      if (this.type === "checkbox") {
        val = this.checked;
      } else if (this.type === "number") {
        val = parseFloat(this.value);
        if (isNaN(val)) val = this.value;
      } else {
        val = this.value;
        // exchangeOrder: comma-separated string → array
        if (path === "exchangeOrder" && typeof val === "string") {
          val = val
            .split(",")
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
        } else if (
          this.tagName === "SELECT" &&
          val !== "" &&
          !isNaN(val)
        ) {
          // Convert numeric select values to numbers
          val = parseFloat(val);
        }
      }
      setNested(settings, path, val);
      saveSettings();
      document.getElementById("settings-status").textContent = "✓ 已保存";
    });
  });

  // Reset button
  var resetBtn = document.getElementById("btn-settings-reset");
  if (resetBtn) {
    resetBtn.onclick = function () {
      resetSettings();
      renderSettings();
      document.getElementById("settings-status").textContent = "✓ 已恢复默认";
    };
  }
}

// ============================================================
// Render All (update everything)
// ============================================================

export function renderAll() {
  updateMarkers();
  renderSignalLog();
  updateNoteArea();
}

// ============================================================
// Format helpers
// ============================================================

function formatPrice(val) {
  if (val === undefined || val === null) return "--";
  return val >= 100 ? val.toFixed(1) : val.toPrecision(4);
}

function formatTime(ts) {
  var d = new Date(ts * 1000);
  return d.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function padNum(n) {
  return n < 10 ? "0" + n : "" + n;
}

function renderNoteText(text) {
  if (!text) return "";
  var parts = text.split(/(【[^】]+】)/g);
  return parts
    .map(function (part) {
      var flashMatch = part.match(/^【快讯:([^|]+)\|([^】]+)】$/);
      if (flashMatch)
        return (
          '<a class="note-ref note-ref-flash" href="' +
          escapeHtml(flashMatch[2]) +
          '" target="_blank" title="' +
          escapeHtml(flashMatch[1]) +
          '">📰 ' +
          escapeHtml(flashMatch[1]) +
          "</a>"
        );
      var articleMatch = part.match(/^【文章:([^|]+)\|([^】]+)】$/);
      if (articleMatch)
        return (
          '<a class="note-ref note-ref-article" href="' +
          escapeHtml(articleMatch[2]) +
          '" target="_blank" title="' +
          escapeHtml(articleMatch[1]) +
          '">📄 ' +
          escapeHtml(articleMatch[1]) +
          "</a>"
        );
      var noteMatch = part.match(/^【笔记:([^|]+)\|([^】]+)】$/);
      if (noteMatch) {
        var sym = noteMatch[1],
          t = Number(noteMatch[2]);
        var noteText = "";
        if (state.signals[sym] && state.signals[sym][t]) {
          var nd = getNoteData(state.signals[sym][t]);
          noteText = nd.text ? nd.text.slice(0, 60) : "(无笔记内容)";
        } else noteText = "(笔记不存在)";
        return (
          '<span class="note-ref note-ref-note" title="[' +
          escapeHtml(sym) +
          "] " +
          formatTime(t) +
          '">📝 [' +
          escapeHtml(sym) +
          "] " +
          escapeHtml(noteText) +
          "</span>"
        );
      }
      return escapeHtml(part);
    })
    .join("");
}

function insertAtCursor(textarea, text) {
  var start = textarea.selectionStart,
    end = textarea.selectionEnd;
  textarea.value =
    textarea.value.substring(0, start) + text + textarea.value.substring(end);
  var pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
  textarea.focus();
}

// Export helpers for use in remote-control.js
export { formatPrice, formatTime, escapeHtml, padNum, renderNoteText };

// Export DOM cache for use by main.js and remote-control.js
export { dom };

// Initialize DOM cache
cacheDom();
