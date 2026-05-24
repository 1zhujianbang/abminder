/**
 * 交易信号标注工具 - Trading Signal Annotation Tool
 * For on-chain perpetual contract analysis
 */
(function () {
  "use strict";

  // ============================================================
  // Configuration
  // ============================================================

  const SYMBOLS = [
    // 加密货币
    { name: "BTC-PERP", label: "BTC 永续", cat: "加密货币" },
    { name: "ETH-PERP", label: "ETH 永续", cat: "加密货币" },
    { name: "SOL-PERP", label: "SOL 永续", cat: "加密货币" },
    { name: "BNB-PERP", label: "BNB 永续", cat: "加密货币" },
    { name: "HYPE-PERP", label: "HYPE 永续", cat: "加密货币" },
    { name: "OKB-PERP", label: "OKB 永续", cat: "加密货币" },
    { name: "ZEC-PERP", label: "ZEC 永续", cat: "加密货币" },
    { name: "ASTER-PERP", label: "ASTER 永续", cat: "加密货币" },
    { name: "PUMP-PERP", label: "PUMP 永续", cat: "加密货币" },
    // 大宗商品
    { name: "XAU-PERP", label: "XAU 黄金", cat: "大宗商品" },
    { name: "XAG-PERP", label: "XAG 白银", cat: "大宗商品" },
    { name: "XPT-PERP", label: "XPT 铂金", cat: "大宗商品" },
    { name: "XPD-PERP", label: "XPD 钯金", cat: "大宗商品" },
    { name: "XCU-PERP", label: "XCU 铜", cat: "大宗商品" },
    { name: "CL-PERP", label: "CL 原油", cat: "大宗商品" },
    { name: "BZ-PERP", label: "BZ 布伦特", cat: "大宗商品" },
    { name: "NG-PERP", label: "NG 天然气", cat: "大宗商品" },
    // 美股
    { name: "AAPL-PERP", label: "AAPL 苹果", cat: "美股" },
    { name: "AMD-PERP", label: "AMD 超微", cat: "美股" },
    { name: "AMZN-PERP", label: "AMZN 亚马逊", cat: "美股" },
    { name: "ANTHROPIC-PERP", label: "ANTHROPIC", cat: "美股" },
    { name: "ARM-PERP", label: "ARM", cat: "美股" },
    { name: "AVGO-PERP", label: "AVGO 博通", cat: "美股" },
    { name: "BMNR-PERP", label: "BMNR", cat: "美股" },
    { name: "CBRS-PERP", label: "CBRS", cat: "美股" },
    { name: "COHR-PERP", label: "COHR", cat: "美股" },
    { name: "COIN-PERP", label: "COIN 币安", cat: "美股" },
    { name: "COST-PERP", label: "COST 好市多", cat: "美股" },
    { name: "CRCL-PERP", label: "CRCL", cat: "美股" },
    { name: "CRWV-PERP", label: "CRWV", cat: "美股" },
    { name: "CSCO-PERP", label: "CSCO 思科", cat: "美股" },
    { name: "DRAM-PERP", label: "DRAM", cat: "美股" },
    { name: "GEV-PERP", label: "GEV", cat: "美股" },
    { name: "GLW-PERP", label: "GLW 康宁", cat: "美股" },
    { name: "GME-PERP", label: "GME 游戏驿站", cat: "美股" },
    { name: "GOOGL-PERP", label: "GOOGL 谷歌", cat: "美股" },
    { name: "HIMS-PERP", label: "HIMS", cat: "美股" },
    { name: "HOOD-PERP", label: "HOOD", cat: "美股" },
    { name: "INTC-PERP", label: "INTC 英特尔", cat: "美股" },
    { name: "LITE-PERP", label: "LITE", cat: "美股" },
    { name: "LLY-PERP", label: "LLY 礼来", cat: "美股" },
    { name: "META-PERP", label: "META", cat: "美股" },
    { name: "MRVL-PERP", label: "MRVL 迈威尔", cat: "美股" },
    { name: "MSFT-PERP", label: "MSFT 微软", cat: "美股" },
    { name: "MSTR-PERP", label: "MSTR 微策略", cat: "美股" },
    { name: "MU-PERP", label: "MU 美光", cat: "美股" },
    { name: "NBIS-PERP", label: "NBIS", cat: "美股" },
    { name: "NFLX-PERP", label: "NFLX 奈飞", cat: "美股" },
    { name: "NVDA-PERP", label: "NVDA 英伟达", cat: "美股" },
    { name: "OPENAI-PERP", label: "OPENAI", cat: "美股" },
    { name: "ORCL-PERP", label: "ORCL 甲骨文", cat: "美股" },
    { name: "PLTR-PERP", label: "PLTR 帕兰提尔", cat: "美股" },
    { name: "QCOM-PERP", label: "QCOM 高通", cat: "美股" },
    { name: "RKLB-PERP", label: "RKLB", cat: "美股" },
    { name: "SHLD-PERP", label: "SHLD", cat: "美股" },
    { name: "SNDK-PERP", label: "SNDK", cat: "美股" },
    { name: "SPACEX-PERP", label: "SPACEX", cat: "美股" },
    { name: "TSLA-PERP", label: "TSLA 特斯拉", cat: "美股" },
    { name: "TSM-PERP", label: "TSM 台积电", cat: "美股" },
    { name: "USAR-PERP", label: "USAR", cat: "美股" },
    // ETF
    { name: "EWJ-PERP", label: "EWJ 日本ETF", cat: "ETF" },
    { name: "EWY-PERP", label: "EWY 韩国ETF", cat: "ETF" },
    { name: "IWM-PERP", label: "IWM 罗素2000ETF", cat: "ETF" },
    { name: "QQQ-PERP", label: "QQQ 纳斯达克ETF", cat: "ETF" },
    { name: "SOXL-PERP", label: "SOXL 半导体ETF", cat: "ETF" },
    { name: "SPY-PERP", label: "SPY 标普500ETF", cat: "ETF" },
    { name: "URNM-PERP", label: "URNM 铀矿ETF", cat: "ETF" },
  ];

  const TIMEFRAMES = [
    { value: 1, label: "1m" },
    { value: 5, label: "5m" },
    { value: 15, label: "15m" },
    { value: 60, label: "1h" },
    { value: 240, label: "4h" },
    { value: 1440, label: "1d" },
  ];

  const SIGNAL_CFG = {
    buy: { label: "买入", color: "#22c55e", shape: "arrowUp", pos: "belowBar" },
    hold: {
      label: "观望",
      color: "#f59e0b",
      shape: "diamond",
      pos: "aboveBar",
    },
    sell: {
      label: "卖出",
      color: "#ef4444",
      shape: "arrowDown",
      pos: "aboveBar",
    },
  };

  const NOTE_CATEGORIES = [
    { key: "technical", label: "技术分析", color: "#1f6feb" },
    { key: "news", label: "消息面", color: "#a855f7" },
    { key: "capital", label: "资金流向", color: "#ec4899" },
    { key: "key_level", label: "关键位置", color: "#f59e0b" },
    { key: "other", label: "其他", color: "#8b949e" },
  ];

  const STORAGE_KEY = "trading_signals";
  var storageAPI = null; // 'http://localhost:3456/api/data' when server connected

  // ============================================================
  // State
  // ============================================================

  const state = {
    symbol: "BTC-PERP",
    timeframe: 60,
    data: [],
    selectedTime: null,
    selectedIndex: null,
    signals: {},
    noteDraft: "",
    activeExchange: "",
    realtime: false,
    noteFilter: "all",
  };

  var fetchGen = 0; // guards against stale async data
  var marketPriceLine = null;
  var signalFilter = "all"; // 'all' | 'buy' | 'hold' | 'sell'
  var fullscreenMode = false;
  var histStack = [];
  var histIndex = -1;
  var MAX_HIST = 50;
  var drawMode = false;
  var pinnedTime = null; // left-click pinned candle time
  var drawLines = {}; // { symbol: [ { price, color, label } ] }
  var drawLineInstances = [];
  var showStructures = false;
  var noteTab = "signal"; // 'signal' | 'note' | 'newsflash' | 'article'
  var candleLimit = 300;
  var lastDirection = ""; // '↑' | '↓' | '→'
  var lastPrice = ""; // real-time last price for title

  var newsflashCache = null;
  var newsflashLoading = false;
  var nfCategory = ""; // newsflash endpoint category, '' = all
  var articleCache = null;
  var articleLoading = false;
  var articleCategory = ""; // article endpoint category, '' = all
  var searchResults = null;
  var searchLoading = false;
  var searchSource = "newsflash"; // 'newsflash' | 'article'

  var NF_CATEGORIES = [
    { label: "全部", endpoint: "" },
    { label: "自选", endpoint: "__bookmarked__" },
    { label: "24小时", endpoint: "24h" },
    { label: "24h热门", endpoint: "24h-hot" },
    { label: "AI", endpoint: "ai" },
    { label: "预测市场", endpoint: "prediction-market" },
    { label: "链上数据", endpoint: "on-chain-data" },
    { label: "行情播报", endpoint: "market-report" },
    { label: "交易所公告", endpoint: "exchange-announcement" },
    { label: "项目动向", endpoint: "project-trend" },
    { label: "名人观点", endpoint: "celebrity-opinion" },
    { label: "币股动态", endpoint: "crypto-stock" },
    { label: "融资信息", endpoint: "funding" },
    { label: "宏观政策", endpoint: "macro-policy" },
  ];
  var ARTICLE_CATEGORIES = [
    { label: "全部", endpoint: "" },
    { label: "自选", endpoint: "__bookmarked__" },
    { label: "24小时", endpoint: "24h" },
    { label: "24h热门", endpoint: "24h-hot" },
    { label: "深度", endpoint: "depth" },
    { label: "重要", endpoint: "important" },
  ];

  // Bookmarks for newsflash & articles
  var BOOKMARK_KEY = "trading_bookmarks";
  var nfBookmarks = []; // array of bookmarked newsflash items
  var artBookmarks = []; // array of bookmarked article items

  function loadBookmarks() {
    try {
      var raw = localStorage.getItem(BOOKMARK_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        nfBookmarks = d.newsflash || [];
        artBookmarks = d.article || [];
      }
    } catch (_) {
      nfBookmarks = [];
      artBookmarks = [];
    }
    if (storageAPI) {
      fetch(storageAPI + "/bookmarks")
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d && d.newsflash && d.newsflash.length > 0) {
            var localIds = nfBookmarks.map(function (b) {
              return b.link || b.publishTimestamp || "";
            });
            d.newsflash.forEach(function (item) {
              var id = item.link || item.publishTimestamp || "";
              if (id && localIds.indexOf(id) === -1) nfBookmarks.push(item);
            });
          }
          if (d && d.article && d.article.length > 0) {
            var localIds2 = artBookmarks.map(function (b) {
              return b.link || b.publishTimestamp || "";
            });
            d.article.forEach(function (item) {
              var id = item.link || item.publishTimestamp || "";
              if (id && localIds2.indexOf(id) === -1) artBookmarks.push(item);
            });
          }
        })
        .catch(function () {});
    }
  }

  function saveBookmarks() {
    try {
      localStorage.setItem(
        BOOKMARK_KEY,
        JSON.stringify({
          newsflash: nfBookmarks,
          article: artBookmarks,
        }),
      );
    } catch (_) {}
    if (storageAPI) {
      fetch(storageAPI + "/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsflash: nfBookmarks, article: artBookmarks }),
      })
        .then(function (r) {
          if (!r.ok) console.log("[存储] 书签写入失败:", r.status);
        })
        .catch(function (e) {
          console.log("[存储] 书签写入错误:", e);
        });
    }
  }

  function isBookmarked(item, type) {
    var list = type === "article" ? artBookmarks : nfBookmarks;
    var id = item.link || item.publishTimestamp || "";
    return list.some(function (b) {
      return (b.link || b.publishTimestamp || "") === id;
    });
  }

  function toggleBookmark(item, type) {
    var list = type === "article" ? artBookmarks : nfBookmarks;
    var id = item.link || item.publishTimestamp || "";
    var idx = list.findIndex(function (b) {
      return (b.link || b.publishTimestamp || "") === id;
    });
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(item);
    }
    saveBookmarks();
  }

  var DRAW_COLORS = [
    "#22c55e",
    "#ef4444",
    "#1f6feb",
    "#f59e0b",
    "#a855f7",
    "#ec4899",
  ];
  var colorIdx = 0;

  // ============================================================
  // Market Data Layers
  // ============================================================

  var depthDiv = null; // Depth chart overlay container
  var depthChartIns = null; // Depth chart instance
  var depthAskSeries = null; // Depth asks area
  var depthBidSeries = null; // Depth bids area

  // ============================================================
  // DOM refs
  // ============================================================

  let $, chart, candleSeries, volumeSeries;
  const dom = {};

  function cacheDom() {
    $ = (s, p = document) => p.querySelector(s);
    dom.timeframeGroup = $("#timeframe-group");
    dom.ohlcBar = $("#ohlc-bar");
    dom.chartEl = $("#chart");
    dom.signalList = $("#signal-list");
    dom.signalCount = $("#signal-count");
    dom.toast = $("#toast");
    dom.noteInput = $("#note-input");
    dom.noteArea = $("#note-area");
    dom.noteSignalInfo = $("#note-signal-info");
    dom.noteCategory = $("#note-category");
  }

  // ============================================================
  // Toast
  // ============================================================

  let toastTimer = null;

  function showToast(msg, type) {
    dom.toast.textContent = msg;
    dom.toast.className = "toast show" + (type ? " toast-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (dom.toast.className = "toast"), 2000);
  }

  function showConfirm(msg) {
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

  // ============================================================
  // Multi-Exchange Data Layer
  // Primary: OKX  |  Fallback: Binance, Hyperliquid
  // ============================================================

  var EXCHANGES = [];

  // --- OKX (Agent Trade Kit market module approach) ---
  EXCHANGES.push({
    id: "okx",
    label: "OKX",
    maxLimit: 2000, // pagination handles >300 internally
    instMap: {
      "BTC-PERP": "BTC-USDT-SWAP",
      "ETH-PERP": "ETH-USDT-SWAP",
      "SOL-PERP": "SOL-USDT-SWAP",
      "BNB-PERP": "BNB-USDT-SWAP",
      "HYPE-PERP": "HYPE-USDT-SWAP",
      "OKB-PERP": "OKB-USDT-SWAP",
      "ZEC-PERP": "ZEC-USDT-SWAP",
      "ASTER-PERP": "ASTER-USDT-SWAP",
      "PUMP-PERP": "PUMP-USDT-SWAP",
      "XAU-PERP": "XAU-USDT-SWAP",
      "XAG-PERP": "XAG-USDT-SWAP",
      "XPT-PERP": "XPT-USDT-SWAP",
      "XPD-PERP": "XPD-USDT-SWAP",
      "XCU-PERP": "XCU-USDT-SWAP",
      "CL-PERP": "CL-USDT-SWAP",
      "BZ-PERP": "BZ-USDT-SWAP",
      "NG-PERP": "NG-USDT-SWAP",
      "SPX-PERP": "SPX-USDT-SWAP",
      "NDX-PERP": "QQQ-USDT-SWAP",
      "AAPL-PERP": "AAPL-USDT-SWAP",
      "AMD-PERP": "AMD-USDT-SWAP",
      "AMZN-PERP": "AMZN-USDT-SWAP",
      "ANTHROPIC-PERP": "ANTHROPIC-USDT-SWAP",
      "ARM-PERP": "ARM-USDT-SWAP",
      "AVGO-PERP": "AVGO-USDT-SWAP",
      "BMNR-PERP": "BMNR-USDT-SWAP",
      "CBRS-PERP": "CBRS-USDT-SWAP",
      "COHR-PERP": "COHR-USDT-SWAP",
      "COIN-PERP": "COIN-USDT-SWAP",
      "COST-PERP": "COST-USDT-SWAP",
      "CRCL-PERP": "CRCL-USDT-SWAP",
      "CRWV-PERP": "CRWV-USDT-SWAP",
      "CSCO-PERP": "CSCO-USDT-SWAP",
      "DRAM-PERP": "DRAM-USDT-SWAP",
      "EWJ-PERP": "EWJ-USDT-SWAP",
      "EWY-PERP": "EWY-USDT-SWAP",
      "GEV-PERP": "GEV-USDT-SWAP",
      "GLW-PERP": "GLW-USDT-SWAP",
      "GME-PERP": "GME-USDT-SWAP",
      "GOOGL-PERP": "GOOGL-USDT-SWAP",
      "HIMS-PERP": "HIMS-USDT-SWAP",
      "HOOD-PERP": "HOOD-USDT-SWAP",
      "INTC-PERP": "INTC-USDT-SWAP",
      "IWM-PERP": "IWM-USDT-SWAP",
      "LITE-PERP": "LITE-USDT-SWAP",
      "LLY-PERP": "LLY-USDT-SWAP",
      "META-PERP": "META-USDT-SWAP",
      "MRVL-PERP": "MRVL-USDT-SWAP",
      "MSFT-PERP": "MSFT-USDT-SWAP",
      "MSTR-PERP": "MSTR-USDT-SWAP",
      "MU-PERP": "MU-USDT-SWAP",
      "NBIS-PERP": "NBIS-USDT-SWAP",
      "NFLX-PERP": "NFLX-USDT-SWAP",
      "NVDA-PERP": "NVDA-USDT-SWAP",
      "OPENAI-PERP": "OPENAI-USDT-SWAP",
      "ORCL-PERP": "ORCL-USDT-SWAP",
      "PLTR-PERP": "PLTR-USDT-SWAP",
      "QCOM-PERP": "QCOM-USDT-SWAP",
      "QQQ-PERP": "QQQ-USDT-SWAP",
      "RKLB-PERP": "RKLB-USDT-SWAP",
      "SHLD-PERP": "SHLD-USDT-SWAP",
      "SNDK-PERP": "SNDK-USDT-SWAP",
      "SOXL-PERP": "SOXL-USDT-SWAP",
      "SPACEX-PERP": "SPACEX-USDT-SWAP",
      "SPY-PERP": "SPY-USDT-SWAP",
      "TSLA-PERP": "TSLA-USDT-SWAP",
      "TSM-PERP": "TSM-USDT-SWAP",
      "URNM-PERP": "URNM-USDT-SWAP",
      "USAR-PERP": "USAR-USDT-SWAP",
    },
    tfMap: { 1: "1m", 5: "5m", 15: "15m", 60: "1H", 240: "4H", 1440: "1D" },
    fetchData: async function (instId, interval, limit) {
      var allData = [];
      var maxPerRequest = 300;
      var after = null;
      while (allData.length < limit) {
        var fetchLimit = Math.min(maxPerRequest, limit - allData.length);
        var url =
          "https://www.okx.com/api/v5/market/candles?instId=" +
          encodeURIComponent(instId) +
          "&bar=" +
          interval +
          "&limit=" +
          fetchLimit;
        if (after) url += "&after=" + after;
        var r = await fetch(url);
        if (!r.ok) throw new Error("HTTP " + r.status);
        var j = await r.json();
        if (j.code !== "0") throw new Error(j.msg || "API error");
        if (!j.data || j.data.length === 0) break;
        allData = allData.concat(j.data);
        if (j.data.length < fetchLimit) break;
        after = j.data[j.data.length - 1][0];
        await new Promise(function (x) {
          setTimeout(x, 80);
        });
      }
      return allData
        .map(function (c) {
          return {
            time: Math.floor(Number(c[0]) / 1000),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
          };
        })
        .reverse()
        .filter(function (d) {
          return (
            d.time > 0 &&
            isFinite(d.open) &&
            isFinite(d.high) &&
            isFinite(d.low) &&
            isFinite(d.close)
          );
        });
    },
  });

  // --- Binance Futures ---
  EXCHANGES.push({
    id: "binance",
    label: "Binance",
    maxLimit: 1500,
    instMap: {
      "BTC-PERP": "BTCUSDT",
      "ETH-PERP": "ETHUSDT",
      "SOL-PERP": "SOLUSDT",
      "BNB-PERP": "BNBUSDT",
      "HYPE-PERP": "HYPEUSDT",
      "ZEC-PERP": "ZECUSDT",
      "XAU-PERP": "PAXGUSDT",
    },
    tfMap: { 1: "1m", 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" },
    fetchData: async function (instId, interval, limit) {
      var url =
        "https://fapi.binance.com/fapi/v1/klines?symbol=" +
        encodeURIComponent(instId) +
        "&interval=" +
        interval +
        "&limit=" +
        limit;
      var r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var d = await r.json();
      return d
        .map(function (k) {
          return {
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          };
        })
        .filter(function (d) {
          return (
            d.time > 0 &&
            isFinite(d.open) &&
            isFinite(d.high) &&
            isFinite(d.low) &&
            isFinite(d.close)
          );
        });
    },
  });

  // --- Hyperliquid ---
  EXCHANGES.push({
    id: "hyperliquid",
    label: "Hyperliquid",
    instMap: {
      "BTC-PERP": "BTC",
      "ETH-PERP": "ETH",
      "SOL-PERP": "SOL",
      "BNB-PERP": "BNB",
      "HYPE-PERP": "HYPE",
      "ZEC-PERP": "ZEC",
    },
    tfMap: { 1: "1m", 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" },
    fetchData: async function (coin, interval, limit) {
      var now = Date.now();
      var msMap = {
        "1m": 60000,
        "5m": 300000,
        "15m": 900000,
        "1h": 3600000,
        "4h": 14400000,
        "1d": 86400000,
      };
      var startTime = now - (limit + 5) * (msMap[interval] || 3600000);
      var r = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: {
            coin: coin,
            interval: interval,
            startTime: startTime,
            endTime: now,
          },
        }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var d = await r.json();
      if (Array.isArray(d)) {
        return d
          .map(function (c) {
            return {
              time: Math.floor((c.t || c.time || 0) / 1000),
              open: parseFloat(c.o || c.open || 0),
              high: parseFloat(c.h || c.high || 0),
              low: parseFloat(c.l || c.low || 0),
              close: parseFloat(c.c || c.close || 0),
              volume: parseFloat(c.v || c.volume || 0),
            };
          })
          .reverse()
          .filter(function (d) {
            return (
              d.time > 0 &&
              isFinite(d.open) &&
              isFinite(d.high) &&
              isFinite(d.low) &&
              isFinite(d.close)
            );
          });
      }
      throw new Error("unexpected response");
    },
  });

  async function fetchOHLCV(symbol, tfMin) {
    var errors = [];
    for (var i = 0; i < EXCHANGES.length; i++) {
      var ex = EXCHANGES[i];
      var instId = ex.instMap[symbol];
      if (!instId) {
        errors.push(ex.id + ": no mapping");
        continue;
      }
      var interval = ex.tfMap[tfMin];
      if (!interval) {
        errors.push(ex.id + ": no tf");
        continue;
      }
      try {
        var limit = Math.min(candleLimit, ex.maxLimit || 500);
        var data = await ex.fetchData(instId, interval, limit);
        if (data && data.length > 10) {
          state.activeExchange = ex.label;
          return data;
        }
        errors.push(ex.id + ": short data (" + (data ? data.length : 0) + ")");
      } catch (err) {
        errors.push(ex.id + ": " + (err.message || err));
      }
    }
    throw new Error(errors.join(" | "));
  }

  // ============================================================
  // Signal Store
  // ============================================================

  function loadSignals() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state.signals = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      state.signals = {};
    }
    if (!state.signals[state.symbol]) {
      state.signals[state.symbol] = {};
    }
    // Async load from server file (merge, don't overwrite)
    if (storageAPI) {
      fetch(storageAPI + "/signals")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && Object.keys(data).length > 0) {
            for (var sym in data) {
              if (!state.signals[sym]) state.signals[sym] = {};
              for (var time in data[sym]) {
                if (!state.signals[sym][time]) {
                  state.signals[sym][time] = data[sym][time];
                }
              }
            }
            renderAll();
          }
        })
        .catch(function () {});
    }
  }

  function saveSignals() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.signals));
    } catch (_e) {
      /* quota exceeded — silently ignore */
    }
    if (storageAPI) {
      fetch(storageAPI + "/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.signals),
      })
        .then(function (r) {
          if (!r.ok) console.log("[存储] 写入失败:", r.status);
        })
        .catch(function (e) {
          console.log("[存储] 写入错误:", e);
        });
    }
  }

  function getSignal(time) {
    const sym = state.signals[state.symbol];
    return sym ? sym[time] : null;
  }

  function placeSignal(time, type) {
    if (!state.signals[state.symbol]) {
      state.signals[state.symbol] = {};
    }
    const existing = state.signals[state.symbol][time];
    // If same type, remove it (toggle off)
    if (existing && existing.type === type) {
      delete state.signals[state.symbol][time];
      saveSignals();
      pushHist();
      renderAll();
      showToast("已移除 " + SIGNAL_CFG[type].label + " 信号", "info");
      return { action: "removed" };
    }
    // Find the price at this time
    const candle = state.data.find((d) => d.time === time);
    state.signals[state.symbol][time] = {
      type: type,
      price: candle ? candle.close : 0,
      note: { text: "", category: "technical", updated: null },
      created: Date.now(),
    };
    saveSignals();
    pushHist();
    renderAll();
    const cfg = SIGNAL_CFG[type];
    showToast(
      "已标记: " + cfg.label + " @ " + formatPrice(candle ? candle.close : 0),
      "success",
    );
    return { action: "placed" };
  }

  function removeSignal(time) {
    if (state.signals[state.symbol] && state.signals[state.symbol][time]) {
      delete state.signals[state.symbol][time];
      saveSignals();
      pushHist();
      renderAll();
    }
  }

  function updateNote(time, text, category) {
    if (state.signals[state.symbol] && state.signals[state.symbol][time]) {
      state.signals[state.symbol][time].note = {
        text: text || "",
        category: category || "other",
        updated: Date.now(),
      };
      saveSignals();
      renderAll();
    }
  }

  function getAllSignalsForSymbol() {
    return state.signals[state.symbol] || {};
  }

  // ============================================================
  // Undo / Redo
  // ============================================================

  function pushHist() {
    var snap = JSON.stringify(state.signals[state.symbol] || {});
    histStack = histStack.slice(0, histIndex + 1);
    histStack.push(snap);
    if (histStack.length > MAX_HIST) histStack.shift();
    histIndex = histStack.length - 1;
  }

  function undoHist() {
    if (histIndex <= 0) return false;
    histIndex--;
    state.signals[state.symbol] = JSON.parse(histStack[histIndex]);
    saveSignals();
    renderAll();
    return true;
  }

  function redoHist() {
    if (histIndex >= histStack.length - 1) return false;
    histIndex++;
    state.signals[state.symbol] = JSON.parse(histStack[histIndex]);
    saveSignals();
    renderAll();
    return true;
  }

  // ============================================================
  // Fullscreen Chart
  // ============================================================

  function toggleFullscreenChart() {
    fullscreenMode = !fullscreenMode;
    document
      .getElementById("app")
      .classList.toggle("fullscreen", fullscreenMode);
    setTimeout(function () {
      chart.applyOptions({
        width: dom.chartEl.clientWidth,
        height: dom.chartEl.clientHeight,
      });
      chart.timeScale().fitContent();
    }, 150);
  }

  // ============================================================
  // Drawing Tools (hline, trend, ray, segment, eraser)
  // ============================================================

  function loadDrawings() {
    try {
      drawLines = JSON.parse(localStorage.getItem("trading_drawings")) || {};
    } catch (_) {
      drawLines = {};
    }
    if (storageAPI) {
      fetch(storageAPI + "/drawings")
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d && Object.keys(d).length > 0) {
            for (var sym in d) {
              if (!drawLines[sym]) drawLines[sym] = [];
              d[sym].forEach(function (line) {
                if (
                  !drawLines[sym].some(function (l) {
                    return l.price === line.price && l.color === line.color;
                  })
                ) {
                  drawLines[sym].push(line);
                }
              });
            }
          }
        })
        .catch(function () {});
    }
  }

  function saveDrawings() {
    localStorage.setItem("trading_drawings", JSON.stringify(drawLines));
    if (storageAPI) {
      fetch(storageAPI + "/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drawLines),
      })
        .then(function (r) {
          if (!r.ok) console.log("[存储] 绘制线写入失败:", r.status);
        })
        .catch(function (e) {
          console.log("[存储] 绘制线写入错误:", e);
        });
    }
  }

  function renderDrawings(symbol) {
    drawLineInstances.forEach(function (pl) {
      candleSeries.removePriceLine(pl);
    });
    drawLineInstances = [];
    (drawLines[symbol] || []).forEach(function (d) {
      drawLineInstances.push(
        candleSeries.createPriceLine({
          price: d.price,
          color: d.color,
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        }),
      );
    });
  }

  function addDrawLine(price) {
    if (!drawLines[state.symbol]) drawLines[state.symbol] = [];
    var color = DRAW_COLORS[colorIdx++ % DRAW_COLORS.length];
    drawLines[state.symbol].push({ price: +price.toFixed(2), color: color });
    saveDrawings();
    renderDrawings(state.symbol);
  }

  function toggleDrawMode() {
    drawMode = !drawMode;
    document
      .getElementById("chart-container")
      .classList.toggle("draw-mode", drawMode);
    var btn = document.querySelector('[data-toolbar="draw"]');
    if (btn) btn.classList.toggle("active", drawMode);
  }

  function clearDrawings() {
    if (!drawLines[state.symbol] || drawLines[state.symbol].length === 0) {
      showToast("暂无绘制可清除", "info");
      return;
    }
    drawLines[state.symbol] = [];
    saveDrawings();
    renderDrawings(state.symbol);
    showToast("已清除所有水平线", "success");
  }

  // ============================================================
  // Auto Structure Marks (swing high / low)
  // ============================================================

  function findSwingPoints(data, lookback) {
    lookback = lookback || 2;
    var points = [];
    for (var i = lookback; i < data.length - lookback; i++) {
      var c = data[i];
      var isHigh = true,
        isLow = true;
      for (var j = 1; j <= lookback; j++) {
        if (!data[i - j] || !data[i + j]) continue;
        if (data[i - j].high >= c.high || data[i + j].high >= c.high)
          isHigh = false;
        if (data[i - j].low <= c.low || data[i + j].low <= c.low) isLow = false;
      }
      if (isHigh && c.high !== c.low)
        points.push({ time: c.time, type: "high", price: c.high });
      if (isLow && c.high !== c.low)
        points.push({ time: c.time, type: "low", price: c.low });
    }
    return points;
  }

  // ============================================================
  // Chart
  // ============================================================

  function initChart() {
    const theme = {
      bg: "#0d1117",
      text: "#8b949e",
      grid: "#21262d",
      border: "#30363d",
      up: "#22c55e",
      down: "#ef4444",
    };

    chart = LightweightCharts.createChart(dom.chartEl, {
      layout: {
        background: { color: theme.bg },
        textColor: theme.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: theme.text,
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: "#1f6feb",
        },
        horzLine: {
          color: theme.text,
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: "#1f6feb",
        },
      },
      rightPriceScale: {
        borderColor: theme.border,
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
      priceFormat: { type: "price", minMove: 0.1 },
    });

    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    });

    marketPriceLine = candleSeries.createPriceLine({
      price: 0,
      color: "#8b949e",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: "",
    });

    // Chart click → pin candle or draw line
    if (chart.subscribeClick) {
      chart.subscribeClick(function (param) {
        if (drawMode) {
          if (!param.point) return;
          var price = candleSeries.coordinateToPrice(param.point.y);
          if (price !== null && isFinite(price)) {
            addDrawLine(price);
            showToast("水平线 @ " + formatPrice(price), "success");
          }
          return;
        }
        // Pin candle on left-click (toggle: click pinned → release)
        if (
          param.time &&
          param.seriesData &&
          param.seriesData.has(candleSeries)
        ) {
          if (pinnedTime === param.time) {
            releaseKLine();
            return;
          }
          pinnedTime = param.time;
          state.selectedTime = param.time;
          state.selectedIndex = state.data.findIndex(function (d) {
            return d.time === param.time;
          });
          var candle = param.seriesData.get(candleSeries);
          updateOHLCBar(candle);
          updateNoteArea();
          updateMarkers();
          showToast("已固定该K线，可直接操作", "info");
        } else if (pinnedTime) {
          // Click empty space → unpin
          releaseKLine();
        }
      });
    }

    // Crosshair move → update OHLC bar + selected time (respect pinnedTime)
    chart.subscribeCrosshairMove((param) => {
      if (
        param.time &&
        param.seriesData &&
        param.seriesData.has(candleSeries)
      ) {
        const candle = param.seriesData.get(candleSeries);
        // Always update OHLC bar on hover
        updateOHLCBar(candle);
        // Only update note area if not pinned
        if (!pinnedTime) {
          state.selectedTime = param.time;
          state.selectedIndex = state.data.findIndex(
            (d) => d.time === param.time,
          );
          updateNoteArea();
        }
      } else if (!pinnedTime) {
        state.selectedTime = null;
        state.selectedIndex = null;
        dom.ohlcBar.textContent = "";
        dom.noteArea.classList.add("hidden");
      }
      // When pinnedTime is set, note area stays showing the pinned candle
    });

    // Resize
    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: dom.chartEl.clientWidth,
        height: dom.chartEl.clientHeight,
      });
    });
    ro.observe(dom.chartEl);

    window.addEventListener("resize", () => {
      chart.applyOptions({
        width: dom.chartEl.clientWidth,
        height: dom.chartEl.clientHeight,
      });
    });
  }

  function movePin(dir) {
    if (!pinnedTime || !state.data || state.data.length === 0) return;
    var idx = state.data.findIndex(function (d) {
      return d.time === pinnedTime;
    });
    if (idx < 0) {
      idx = state.data.length - 1;
    }
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.data.length) return;
    var candle = state.data[newIdx];
    pinnedTime = candle.time;
    state.selectedTime = candle.time;
    state.selectedIndex = newIdx;
    updateOHLCBar(candle);
    updateNoteArea();
    updateMarkers();
  }

  function releaseKLine() {
    pinnedTime = null;
    state.selectedTime = null;
    state.selectedIndex = null;
    dom.ohlcBar.textContent = "";
    document.title = "abminder | " + state.symbol;
    dom.noteArea.classList.add("hidden");
    dom.noteInput.value = "";
    dom.noteInput.disabled = true;
    updateMarkers();
    showToast("已释放K线", "info");
  }

  function updateOHLCBar(candle) {
    if (!candle) return;
    const { time, open, high, low, close } = candle;
    const d = new Date(time * 1000);
    const ts = d.toLocaleString("zh-CN", { hour12: false });
    const fullData = state.data.find(function (cd) {
      return cd.time === time;
    });
    const volume = fullData ? fullData.volume : 0;
    dom.ohlcBar.innerHTML =
      `O: <span class="ohlc-val">${formatPrice(open)}</span> ` +
      `H: <span class="ohlc-val">${formatPrice(high)}</span> ` +
      `L: <span class="ohlc-val">${formatPrice(low)}</span> ` +
      `C: <span class="ohlc-val ${close >= open ? "up" : "down"}">${formatPrice(close)}</span> ` +
      `V: <span class="ohlc-val">${formatVolume(volume)}</span> ` +
      `<span class="ohlc-time">${ts}</span>`;
    lastDirection = close > open ? "↑" : close < open ? "↓" : "→";
    lastPrice = formatPrice(close);
    document.title =
      "abminder | " + state.symbol + " " + lastPrice + " " + lastDirection;
  }

  function showLoading(on) {
    document.getElementById("chart-container").classList.toggle("loading", on);
  }

  function updateDataSource() {
    var el = document.getElementById("data-source");
    if (!el) return;
    var parts = [];
    if (state.activeExchange) parts.push("via " + state.activeExchange);
    if (state.realtime && realtimeSource) {
      var label =
        realtimeSource === "okx-ws"
          ? "WS(OKX)"
          : realtimeSource === "binance-ws"
            ? "WS(Binance)"
            : "REST";
      parts.push("🟢 " + label);
    }
    el.textContent = parts.join(" | ");
  }

  async function loadChartData() {
    try {
      showLoading(true);
      state.activeExchange = "";
      updateDataSource();
      fetchGen++;
      var gen = fetchGen;
      var newData = await fetchOHLCV(state.symbol, state.timeframe);
      if (gen !== fetchGen) return; // stale, a newer loadChartData was started

      drawLineInstances.forEach(function (pl) {
        try {
          candleSeries.removePriceLine(pl);
        } catch (_) {}
      });
      drawLineInstances = [];

      state.data = newData;
      // Only pass time/o/h/l/c — no volume field
      candleSeries.setData(
        newData.map(function (d) {
          return {
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          };
        }),
      );

      var volData = state.data.map(function (d) {
        return {
          time: d.time,
          value: d.volume,
          color:
            d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
        };
      });
      volumeSeries.setData(volData);

      if (state.data.length > 0) {
        marketPriceLine.applyOptions({
          price: state.data[state.data.length - 1].close,
        });
        var c = state.data[state.data.length - 1];
        document.title =
          "abminder | " +
          state.symbol +
          " " +
          formatPrice(c.close) +
          " " +
          (c.close > c.open ? "↑" : c.close < c.open ? "↓" : "→");
      }
      chart.timeScale().fitContent();
      renderDrawings(state.symbol);
      updateMarkers();
      renderSignalLog();
      updateNoteArea();
      updateDataSource();
      showToast("数据来源: " + state.activeExchange, "success");
      refreshMarketData();
    } catch (err) {
      showToast("数据加载失败: " + err.message, "error");
      state.data = [];
      document.title = "abminder | " + state.symbol;
      try {
        candleSeries.setData([]);
      } catch (_) {}
      try {
        volumeSeries.setData([]);
      } catch (_) {}
    } finally {
      showLoading(false);
    }
  }

  // ============================================================
  // Real-time (WebSocket + fallback polling)
  // ============================================================

  var ws = null;
  var wsReconnectTimer = null;
  var WS_RECONNECT_DELAY = 3000;
  var realtimeSource = null; // 'okx-ws' | 'binance-ws' | 'rest-*'

  // ============================================================
  // Odaily Newsflash
  // ============================================================

  async function fetchNewsflash() {
    if (newsflashLoading && nfCategory !== "__bookmarked__") return;
    // Handle bookmark category
    if (nfCategory === "__bookmarked__") {
      newsflashLoading = false;
      newsflashCache = nfBookmarks;
      if (noteTab === "newsflash") renderNewsflash();
      updateNfCategoryCount();
      return;
    }
    newsflashLoading = true;
    try {
      var url =
        "https://api.odaily.news/api/v1/newsflash" +
        (nfCategory ? "/" + nfCategory : "") +
        "?page=1&size=30&lang=zh-cn";
      var r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (j.code === 200 && j.data && j.data.list) {
        newsflashCache = j.data.list;
        if (noteTab === "newsflash") renderNewsflash();
        updateNfCategoryCount();
      }
    } catch (err) {
      console.log("[快讯] 加载失败:", err.message);
    } finally {
      newsflashLoading = false;
    }
  }

  async function fetchArticles() {
    if (articleLoading && articleCategory !== "__bookmarked__") return;
    // Handle bookmark category
    if (articleCategory === "__bookmarked__") {
      articleLoading = false;
      articleCache = artBookmarks;
      if (noteTab === "article") renderArticles();
      updateArticleCategoryCount();
      return;
    }
    articleLoading = true;
    try {
      var url =
        "https://api.odaily.news/api/v1/article" +
        (articleCategory ? "/" + articleCategory : "") +
        "?page=1&size=30&lang=zh-cn";
      var r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (j.code === 200 && j.data && j.data.list) {
        articleCache = j.data.list;
        if (noteTab === "article") renderArticles();
        updateArticleCategoryCount();
      }
    } catch (err) {
      console.log("[文章] 加载失败:", err.message);
    } finally {
      articleLoading = false;
    }
  }

  async function searchContent(keyword) {
    if (searchLoading || !keyword) return;
    searchLoading = true;
    try {
      var url =
        "https://api.odaily.news/api/v1/search/" +
        searchSource +
        "?keyword=" +
        encodeURIComponent(keyword) +
        "&page=1&size=20&lang=zh-cn";
      var r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (j.code === 200 && j.data && j.data.list) {
        searchResults = j.data.list;
        if (noteTab === "search") renderSearchResults();
      } else {
        searchResults = [];
        if (noteTab === "search") renderSearchResults();
      }
    } catch (err) {
      console.log("[搜索] 失败:", err.message);
      searchResults = [];
    } finally {
      searchLoading = false;
    }
  }

  function renderNewsflash() {
    var el = document.getElementById("newsflash-list");
    if (!el) return;
    el.classList.remove("hidden");

    var data =
      searchResults !== null && noteTab === "search"
        ? searchResults
        : newsflashCache;
    if (!data || data.length === 0) {
      el.innerHTML = '<div class="signal-empty">暂无快讯</div>';
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
        var impClass = item.isImportant ? " news-imp" : "";
        var linkUrl = item.link || item.sourceUrl || "";
        var isBm = isBookmarked(item, "newsflash");
        return (
          '<div class="news-entry' +
          impClass +
          '" data-url="' +
          escapeHtml(linkUrl) +
          '">' +
          '<div class="news-top">' +
          '<span class="news-dot"></span>' +
          '<span class="news-time">' +
          timeStr +
          "</span>" +
          (item.isImportant ? '<span class="news-badge">重要</span>' : "") +
          '<span class="news-bm" data-bm="newsflash" data-bmid="' +
          escapeHtml(linkUrl || String(item.publishTimestamp || "")) +
          '" style="margin-left:auto;cursor:pointer;font-size:13px;">' +
          (isBm ? "★" : "☆") +
          "</span>" +
          "</div>" +
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
    el.classList.remove("hidden");

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
          '<div class="news-top">' +
          '<span class="news-dot"></span>' +
          '<span class="news-time">' +
          timeStr +
          "</span>" +
          '<span class="news-bm" data-bm="article" data-bmid="' +
          escapeHtml(linkUrl || String(item.publishTimestamp || "")) +
          '" style="margin-left:auto;cursor:pointer;font-size:13px;">' +
          (isBm ? "★" : "☆") +
          "</span>" +
          "</div>" +
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
          "</div>" +
          "</div></div>" +
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

  function extractTitleText(title) {
    var t = (title || "").trim();
    var parts = t.split(/[：:]/);
    if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
    parts = t.split("|");
    if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
    parts = t.split(/[，,]/);
    if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
    return t || "?";
  }

  function generateArticleImage(title) {
    var text = extractTitleText(title);
    var w = 120,
      h = 80;
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    // Gradient background
    var grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#1a0533");
    grad.addColorStop(1, "#0d1b3e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Accent line
    ctx.fillStyle = "#8b5cf6";
    ctx.fillRect(0, 0, 3, h);
    // Title text
    ctx.fillStyle = "#e0d4f5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var fontSize = text.length > 6 ? 11 : text.length > 4 ? 13 : 15;
    ctx.font = "bold " + fontSize + "px sans-serif";
    // Word wrap
    var maxW = w - 12;
    if (ctx.measureText(text).width > maxW) {
      var words = text.split("");
      var line1 = "",
        line2 = "";
      for (var i = 0; i < words.length; i++) {
        if (
          ctx.measureText(line1 + words[i]).width < maxW &&
          line1.length < text.length * 0.6
        ) {
          line1 += words[i];
        } else {
          line2 += words[i];
        }
      }
      if (line2) {
        ctx.fillText(line1, w / 2, h / 2 - 8);
        ctx.fillText(line2, w / 2, h / 2 + 8);
      } else {
        ctx.fillText(line1, w / 2, h / 2);
      }
    } else {
      ctx.fillText(text, w / 2, h / 2);
    }
    // Bottom indicator
    ctx.fillStyle = "#6d28d9";
    ctx.fillRect(0, h - 2, w, 2);
    return c.toDataURL();
  }

  function renderSearchResults() {
    if (searchSource === "newsflash") renderNewsflash();
    else renderArticles();
  }

  function updateNfCategoryCount() {
    var ctrl = document.getElementById("signal-controls");
    if (ctrl && noteTab === "newsflash") updateSignalControls();
  }

  function updateArticleCategoryCount() {
    var ctrl = document.getElementById("signal-controls");
    if (ctrl && noteTab === "article") updateSignalControls();
  }

  function updateLiveIndicator() {
    var el = document.getElementById("btn-live");
    if (!el) return;
    el.classList.toggle("active", state.realtime);
  }

  // --- Shared candle update (called by any source) ---

  function updateCandleFromRealtime(candle) {
    var gen = fetchGen;
    var data = state.data;
    var last = data[data.length - 1];
    var ts = candle.time;

    var updated = false;
    if (last && last.time === ts) {
      last.open = candle.open;
      last.high = candle.high;
      last.low = candle.low;
      last.close = candle.close;
      last.volume = candle.volume;
      updated = true;
    } else if (ts > (last ? last.time : 0)) {
      data.push(candle);
      updated = true;
    }

    if (!updated) return;
    if (gen !== fetchGen) return; // stale, chart was reloaded

    var tip = data[data.length - 1];
    candleSeries.update({
      time: tip.time,
      open: tip.open,
      high: tip.high,
      low: tip.low,
      close: tip.close,
    });
    volumeSeries.update({
      time: tip.time,
      value: tip.volume,
      color:
        tip.close >= tip.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    });
    marketPriceLine.applyOptions({ price: tip.close });
    document.title =
      "abminder | " +
      state.symbol +
      " " +
      formatPrice(tip.close) +
      " " +
      (tip.close > tip.open ? "↑" : tip.close < tip.open ? "↓" : "→");
    // Auto-scroll only if user hasn't scrolled back more than 1 candle
    if (!updated && state.realtime) {
      var vr = chart.timeScale().getVisibleRange();
      if (!vr || vr.to >= tip.time - state.timeframe * 60) {
        chart.timeScale().scrollToRealTime();
      }
    }
  }

  // ============================================================
  // OKX WebSocket
  // ============================================================

  function wsChannelFor(symbol, tfMin) {
    var ex = EXCHANGES[0];
    var instId = ex.instMap[symbol];
    if (!instId) return null;
    var interval = ex.tfMap[tfMin];
    if (!interval) return null;
    return [instId, "candle" + interval];
  }

  function connectOKXWS() {
    if (ws) return;
    var ch = wsChannelFor(state.symbol, state.timeframe);
    if (!ch) return;
    var instId = ch[0],
      channel = ch[1];

    var wsUrl = "wss://ws.okx.com:8443/ws/v5/public";
    console.log(
      "[OKX WS] connecting to " +
        wsUrl +
        " channel=" +
        channel +
        " instId=" +
        instId,
    );

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.log("[OKX WS] constructor failed:", e);
      return;
    }

    // Timeout: if not connected in 5s, give up and try Binance
    var connTimer = setTimeout(function () {
      if (ws && ws.readyState <= 1) {
        console.log("[OKX WS] connection timeout");
        ws.onclose = null;
        ws.close();
        ws = null;
        if (state.realtime) connectBinanceWS();
      }
    }, 5000);

    ws.onopen = function () {
      clearTimeout(connTimer);
      console.log("[OKX WS] connected");
      realtimeSource = "okx-ws";
      updateDataSource();
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: [{ channel: channel, instId: instId }],
        }),
      );
    };

    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.event === "subscribe") {
          console.log(
            "[OKX WS] subscribed:",
            msg.arg && msg.arg.channel,
            msg.arg && msg.arg.instId,
          );
          return;
        }
        if (msg.event === "error") {
          console.log("[OKX WS] error event:", msg);
          return;
        }
        if (msg.arg && msg.data && msg.data[0]) {
          var arr = msg.data[0];
          var ts = Math.floor(Number(arr[0]) / 1000);
          var open = parseFloat(arr[1]);
          var high = parseFloat(arr[2]);
          var low = parseFloat(arr[3]);
          var close = parseFloat(arr[4]);
          var volume = parseFloat(arr[5]);
          if (!isFinite(open)) {
            console.log("[OKX WS] invalid candle:", arr);
            return;
          }
          updateCandleFromRealtime({
            time: ts,
            open: open,
            high: high,
            low: low,
            close: close,
            volume: volume,
          });
        }
      } catch (e) {
        console.log("[OKX WS] parse error:", e);
      }
    };

    ws.onclose = function (e) {
      clearTimeout(connTimer);
      console.log("[OKX WS] closed code=" + e.code + " reason=" + e.reason);
      ws = null;
      if (state.realtime) {
        // If OKX failed (never connected), try Binance WS
        if (realtimeSource !== "okx-ws") {
          console.log("[OKX WS] never connected, trying Binance WS");
          connectBinanceWS();
        } else {
          wsReconnectTimer = setTimeout(connectOKXWS, WS_RECONNECT_DELAY);
        }
      }
    };

    ws.onerror = function () {
      console.log("[OKX WS] error (onclose will follow)");
    };
  }

  // ============================================================
  // Binance WebSocket (more reliable in China)
  // ============================================================

  var BINANCE_WS_SYMBOLS = {
    "BTC-PERP": "btcusdt",
    "ETH-PERP": "ethusdt",
    "SOL-PERP": "solusdt",
    "BNB-PERP": "bnbusdt",
    "HYPE-PERP": "hypeusdt",
    "ZEC-PERP": "zecusdt",
    "XAU-PERP": "paxgusdt",
  };

  var BINANCE_WS_TF = {
    1: "1m",
    5: "5m",
    15: "15m",
    60: "1h",
    240: "4h",
    1440: "1d",
  };

  function connectBinanceWS() {
    if (ws) return;
    var bSymbol = BINANCE_WS_SYMBOLS[state.symbol];
    var bInterval = BINANCE_WS_TF[state.timeframe];
    if (!bSymbol || !bInterval) {
      console.log("[Binance WS] no mapping for", state.symbol, state.timeframe);
      return;
    }

    var stream = bSymbol + "@kline_" + bInterval;
    var wsUrl = "wss://fstream.binance.com/ws/" + stream;
    console.log("[Binance WS] connecting to " + wsUrl);

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.log("[Binance WS] constructor failed:", e);
      return;
    }

    ws.onopen = function () {
      console.log("[Binance WS] connected: " + stream);
      realtimeSource = "binance-ws";
      updateDataSource();
    };

    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.e !== "kline" || !msg.k) return;
        var k = msg.k;
        var ts = Math.floor(k.t / 1000);
        var close = parseFloat(k.c);
        if (!isFinite(close)) return;
        updateCandleFromRealtime({
          time: ts,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: close,
          volume: parseFloat(k.v),
        });
      } catch (e) {
        console.log("[Binance WS] parse error:", e);
      }
    };

    ws.onclose = function (e) {
      console.log("[Binance WS] closed code=" + e.code);
      ws = null;
      if (state.realtime) {
        wsReconnectTimer = setTimeout(connectBinanceWS, WS_RECONNECT_DELAY);
      }
    };

    ws.onerror = function () {
      console.log("[Binance WS] error");
    };
  }

  function disconnectWS() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    realtimeSource = null;
  }

  // ============================================================
  // Fallback REST polling
  // ============================================================

  var pollTimer = null;

  async function restPollUpdate() {
    try {
      var gen = fetchGen;
      var newData = await fetchOHLCV(state.symbol, state.timeframe);
      if (gen !== fetchGen) return; // stale, chart data was reloaded
      if (!newData || newData.length < 10) return;
      var oldLast = state.data[state.data.length - 1];
      var newLast = newData[newData.length - 1];
      if (
        oldLast &&
        newLast &&
        oldLast.time === newLast.time &&
        oldLast.close === newLast.close &&
        oldLast.high === newLast.high &&
        oldLast.low === newLast.low
      ) {
        return;
      }

      // Use update() instead of setData() — avoids full re-render crashes
      var tip = {
        time: newLast.time,
        open: newLast.open,
        high: newLast.high,
        low: newLast.low,
        close: newLast.close,
        volume: newLast.volume,
      };
      if (oldLast && oldLast.time === tip.time) {
        state.data[state.data.length - 1] = tip;
      } else {
        state.data.push(tip);
      }
      try {
        candleSeries.update({
          time: tip.time,
          open: tip.open,
          high: tip.high,
          low: tip.low,
          close: tip.close,
        });
      } catch (_) {}
      try {
        volumeSeries.update({
          time: tip.time,
          value: tip.volume,
          color:
            tip.close >= tip.open
              ? "rgba(34,197,94,0.3)"
              : "rgba(239,68,68,0.3)",
        });
      } catch (_) {}
      marketPriceLine.applyOptions({ price: tip.close });
      document.title =
        "abminder | " +
        state.symbol +
        " " +
        formatPrice(tip.close) +
        " " +
        (tip.close > tip.open ? "↑" : tip.close < tip.open ? "↓" : "→");
      if (oldLast && oldLast.time !== tip.time && state.realtime) {
        var vr = chart.timeScale().getVisibleRange();
        if (!vr || vr.to >= tip.time - state.timeframe * 60) {
          chart.timeScale().scrollToRealTime();
        }
      }
      updateMarkers();
      updateDataSource();
      console.log("[REST] poll update from", state.activeExchange);
    } catch (_) {
      /* silent */
    }
  }

  // ============================================================
  // Public API
  // ============================================================

  function startRealtime() {
    if (state.realtime) return;
    state.realtime = true;
    updateLiveIndicator();
    updateDataSource();
    // Try OKX WS first, with Binance WS as fallback
    realtimeSource = null;
    connectOKXWS();
    // REST polling every 0.5s as ultimate fallback
    restPollUpdate();
    pollTimer = setInterval(restPollUpdate, 500);
  }

  function stopRealtime() {
    disconnectWS();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    state.realtime = false;
    updateLiveIndicator();
    updateDataSource();
  }

  function toggleRealtime() {
    if (state.realtime) stopRealtime();
    else startRealtime();
  }

  function restartRealtime() {
    if (state.realtime) {
      stopRealtime();
      startRealtime();
    }
  }

  function updateMarkers() {
    const signals = getAllSignalsForSymbol();
    const markers = [];
    for (const [timeStr, sig] of Object.entries(signals)) {
      const time = Number(timeStr);
      if (!state.data.some((d) => d.time === time)) continue;
      const cfg = SIGNAL_CFG[sig.type];
      if (!cfg) continue;
      markers.push({
        time,
        position: cfg.pos,
        shape: cfg.shape,
        color: cfg.color,
        text: cfg.label,
      });
      // Note indicator dot
      var noteData = getNoteData(sig);
      if (noteData.text) {
        var cat =
          NOTE_CATEGORIES.find(function (c) {
            return c.key === noteData.category;
          }) || NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];
        markers.push({
          time: time,
          position: sig.type === "buy" ? "aboveBar" : "belowBar",
          shape: "circle",
          color: cat.color,
          text: "",
          size: 0.5,
        });
      }
    }
    // Auto structure marks
    if (showStructures && state.data.length > 10) {
      var swings = findSwingPoints(state.data, 2);
      swings.forEach(function (s) {
        // Don't overlap with signal markers
        if (
          markers.some(function (m) {
            return m.time === s.time;
          })
        )
          return;
        markers.push({
          time: s.time,
          position: s.type === "high" ? "aboveBar" : "belowBar",
          shape: s.type === "high" ? "arrowDown" : "arrowUp",
          color:
            s.type === "high" ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)",
          text: s.type === "high" ? "H" : "L",
        });
      });
    }
    // Pinned candle marker
    if (
      pinnedTime &&
      state.data.some(function (d) {
        return d.time === pinnedTime;
      })
    ) {
      markers.push({
        time: pinnedTime,
        position: "aboveBar",
        shape: "square",
        color: "#f59e0b",
        text: "固定",
        size: 1.2,
      });
    }
    markers.sort((a, b) => a.time - b.time);
    candleSeries.setMarkers(markers);
  }

  // ============================================================
  // Market Data Layers (Funding Rate, OI, Volatility, Depth)
  // ============================================================

  function getSwapId(symbol) {
    return EXCHANGES[0].instMap[symbol] || symbol.replace("-PERP", "-USD-SWAP");
  }

  // --- Depth Chart (overlay on chart container) ---

  function initDepthChart() {
    if (depthChartIns) return;
    var container = document.getElementById("chart-container");
    if (!container) return;

    container.style.position = "relative";
    depthDiv = document.createElement("div");
    depthDiv.id = "depth-chart";
    depthDiv.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:0;z-index:50;display:none;background:#0d1117;";
    container.appendChild(depthDiv);

    var header = document.createElement("div");
    header.style.cssText =
      "position:absolute;top:4px;left:8px;right:8px;z-index:55;display:flex;justify-content:space-between;align-items:center;";
    var title = document.createElement("span");
    title.textContent = "订单簿深度";
    title.style.cssText = "color:#8b949e;font-size:11px;";
    header.appendChild(title);
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ 关闭";
    closeBtn.style.cssText =
      "background:var(--bg3);border:1px solid var(--border);color:var(--text);cursor:pointer;border-radius:3px;padding:2px 8px;font-size:11px;";
    closeBtn.addEventListener("click", function () {
      toggleDepthChart(false);
    });
    closeBtn.addEventListener("mouseenter", function () {
      this.style.background = "var(--bg)";
    });
    closeBtn.addEventListener("mouseleave", function () {
      this.style.background = "var(--bg3)";
    });
    header.appendChild(closeBtn);
    depthDiv.appendChild(header);

    var inner = document.createElement("div");
    inner.id = "depth-chart-inner";
    inner.style.cssText =
      "width:100%;height:calc(100% - 28px);margin-top:28px;";
    depthDiv.appendChild(inner);
  }

  function renderDepthChart(asks, bids) {
    var el = document.getElementById("depth-chart-inner");
    if (!el) return;

    if (!depthChartIns) {
      depthChartIns = LightweightCharts.createChart(el, {
        layout: {
          background: { color: "#0d1117" },
          textColor: "#8b949e",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "#21262d" },
          horzLines: { color: "#21262d" },
        },
        rightPriceScale: {
          borderColor: "#30363d",
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: { visible: false },
        handleScroll: false,
        handleScale: false,
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      });
    }

    var now = Math.floor(Date.now() / 1000);
    var askData = asks.map(function (a, i) {
      return { time: now + i, value: a.total };
    });
    var bidData = bids.map(function (b, i) {
      return { time: now + i, value: b.total };
    });

    if (depthAskSeries) {
      depthAskSeries.setData(askData);
      depthBidSeries.setData(bidData);
      depthChartIns.timeScale().fitContent();
      return;
    }

    depthAskSeries = depthChartIns.addAreaSeries({
      lineColor: "#ef4444",
      lineWidth: 1,
      topColor: "rgba(239,68,68,0.3)",
      bottomColor: "rgba(239,68,68,0.01)",
    });
    depthBidSeries = depthChartIns.addAreaSeries({
      lineColor: "#22c55e",
      lineWidth: 1,
      topColor: "rgba(34,197,94,0.3)",
      bottomColor: "rgba(34,197,94,0.01)",
    });

    depthAskSeries.setData(askData);
    depthBidSeries.setData(bidData);
    depthChartIns.timeScale().fitContent();

    // Update container height
    depthChartIns.applyOptions({
      width: el.clientWidth,
      height: el.clientHeight,
    });
  }

  async function fetchOrderBook() {
    var spotId = state.symbol.replace("-PERP", "-USDT");
    try {
      var r = await fetch(
        "https://www.okx.com/api/v5/market/books?instId=" +
          encodeURIComponent(spotId) +
          "&sz=200",
      );
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (j.code === "0" && j.data && j.data[0]) {
        var asks = j.data[0].asks
          .map(function (a) {
            return { price: parseFloat(a[0]), size: parseFloat(a[1]) };
          })
          .filter(function (a) {
            return a.price > 0 && a.size > 0;
          });
        var bids = j.data[0].bids
          .map(function (b) {
            return { price: parseFloat(b[0]), size: parseFloat(b[1]) };
          })
          .filter(function (b) {
            return b.price > 0 && b.size > 0;
          });
        return processDepth(asks, bids);
      }
    } catch (err) {
      showToast("深度图加载失败: " + err.message, "error");
    }
    return null;
  }

  function processDepth(asks, bids) {
    asks.sort(function (a, b) {
      return a.price - b.price;
    });
    bids.sort(function (a, b) {
      return b.price - a.price;
    });

    var askCum = [],
      total = 0;
    for (var i = asks.length - 1; i >= 0; i--) {
      total += asks[i].size;
      askCum.unshift({
        price: asks[i].price,
        total: total,
        index: askCum.length,
      });
    }

    var bidCum = [];
    total = 0;
    for (var i = 0; i < bids.length; i++) {
      total += bids[i].size;
      bidCum.push({ price: bids[i].price, total: total, index: i });
    }

    return { asks: askCum, bids: bidCum };
  }

  async function toggleDepthChart(force) {
    var show =
      force !== undefined
        ? force
        : !depthDiv || depthDiv.style.display === "none";
    if (show) {
      if (!depthDiv) initDepthChart();
      depthDiv.style.display = "block";
      if (depthChartIns) {
        setTimeout(function () {
          var el = document.getElementById("depth-chart-inner");
          if (el)
            depthChartIns.applyOptions({
              width: el.clientWidth,
              height: el.clientHeight,
            });
        }, 50);
      }
      var data = await fetchOrderBook();
      if (data) renderDepthChart(data.asks, data.bids);
      else showToast("深度数据加载失败", "error");
      var btn = document.getElementById("btn-depth");
      if (btn) btn.classList.add("active");
    } else {
      if (depthDiv) depthDiv.style.display = "none";
      var btn = document.getElementById("btn-depth");
      if (btn) btn.classList.remove("active");
    }
  }

  // --- Market data refresh (placeholder) ---
  function refreshMarketData() {}
  function startMarketDataRefresh() {}
  // ============================================================

  var symbolChangeLock = false;

  async function changeSymbol(sym) {
    if (symbolChangeLock) return;
    symbolChangeLock = true;
    try {
      state.symbol = sym;
      document.title = "abminder | " + sym;
      signalFilter = "all";
      histStack = [];
      histIndex = -1;
      loadSignals();
      pushHist();
      loadDrawings();
      await loadChartData();
      restartRealtime();
      startMarketDataRefresh();
    } finally {
      symbolChangeLock = false;
    }
  }

  function renderToolbar() {
    // --- Symbol select (grouped dropdown) ---
    var leftGroup = document.querySelector(".toolbar-left");
    var sel = document.createElement("select");
    sel.className = "sym-select";
    sel.title = "选择标的";

    var catOrder = ["加密货币", "大宗商品", "ETF", "美股"];
    var groups = {};
    SYMBOLS.forEach(function (s) {
      var c = s.cat || "其他";
      if (!groups[c]) groups[c] = [];
      groups[c].push(s);
    });

    catOrder.forEach(function (cat) {
      if (!groups[cat]) return;
      var optgroup = document.createElement("optgroup");
      optgroup.label = cat;
      groups[cat].forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s.name;
        opt.textContent = s.name + "  " + s.label;
        if (s.name === state.symbol) opt.selected = true;
        optgroup.appendChild(opt);
      });
      sel.appendChild(optgroup);
    });

    sel.addEventListener("change", function () {
      changeSymbol(this.value);
    });

    leftGroup.insertBefore(sel, leftGroup.firstChild);

    // --- Timeframe buttons ---
    dom.timeframeGroup.innerHTML = TIMEFRAMES.map(function (tf) {
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
    dom.timeframeGroup.addEventListener("click", async function (e) {
      var btn = e.target.closest(".tf-btn");
      if (!btn) return;
      state.timeframe = Number(btn.dataset.tf);
      dom.timeframeGroup.querySelectorAll(".tf-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      await loadChartData();
      restartRealtime();
    });
  }

  // --- Toolbar extra buttons (added after renderToolbar) ---

  function renderExtraTools() {
    var right = document.querySelector(".toolbar-right");
    if (!right) return;

    // Candle limit (dropdown)
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
      candleLimit = Number(this.value);
      loadChartData();
    });
    right.appendChild(limitSel);

    // Draw mode toggle
    var drawBtn = document.createElement("button");
    drawBtn.className = "tool-btn";
    drawBtn.dataset.toolbar = "draw";
    drawBtn.title = "绘制水平线 (点击图表放置)";
    drawBtn.textContent = "绘制";
    drawBtn.addEventListener("click", toggleDrawMode);
    right.appendChild(drawBtn);

    // Clear drawings
    var clearDrawBtn = document.createElement("button");
    clearDrawBtn.className = "tool-btn";
    clearDrawBtn.title = "清除所有水平线";
    clearDrawBtn.textContent = "清除绘制";
    clearDrawBtn.addEventListener("click", clearDrawings);
    right.appendChild(clearDrawBtn);

    // Structure toggle
    var structBtn = document.createElement("button");
    structBtn.className = "tool-btn";
    structBtn.id = "btn-struct";
    structBtn.title = "波段高低点 (S)";
    structBtn.textContent = "结构";
    structBtn.addEventListener("click", function () {
      showStructures = !showStructures;
      structBtn.classList.toggle("active", showStructures);
      updateMarkers();
    });
    right.appendChild(structBtn);

    // Separator before depth button
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

    // Move fullscreen button to end
    var fsBtn = document.getElementById("btn-fullscreen");
    if (fsBtn) right.appendChild(fsBtn);
  }

  // ============================================================
  // UI – Signal Buttons & Notes
  // ============================================================

  function renderSignalButtons() {
    const shortcuts = { buy: "1", hold: "2", sell: "3" };
    const container = $("#signal-buttons");
    container.innerHTML = "";
    for (const [type, cfg] of Object.entries(SIGNAL_CFG)) {
      const btn = document.createElement("button");
      btn.className = `signal-btn ${type}-btn`;
      btn.dataset.type = type;
      btn.dataset.shortcut = shortcuts[type] || "";
      btn.innerHTML = cfg.label;
      btn.addEventListener("click", () => handleSignalClick(type));
      container.appendChild(btn);
    }
  }

  function handleSignalClick(type) {
    let time = pinnedTime || state.selectedTime;
    if (!time) {
      const last = state.data[state.data.length - 1];
      if (!last) {
        showToast("没有可用的K线数据", "error");
        return;
      }
      time = last.time;
      state.selectedTime = time;
      chart.timeScale().scrollToRealTime();
    }
    const result = placeSignal(time, type);
    if (result.action === "placed") {
      // Focus note input for the new signal
      focusNoteForTime(time);
    }
  }

  function updateNoteArea() {
    var t = state.selectedTime;
    if (t === null || t === undefined) {
      dom.noteArea.classList.add("hidden");
      return;
    }
    var sig = getSignal(t);
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

  function focusNoteForTime(time) {
    const sig = getSignal(time);
    if (!sig) return;
    state.selectedTime = time;
    // Scroll chart to that time
    chart.timeScale().scrollToPosition(0, false);
    // Trigger crosshair update
    updateNoteArea();
    dom.noteInput.focus();
  }

  function bindNoteInput() {
    // Save on blur (text or category change)
    function saveNote() {
      var t = Number(dom.noteInput.dataset.time);
      if (t) {
        updateNote(t, dom.noteInput.value.trim(), dom.noteCategory.value);
      }
    }
    dom.noteInput.addEventListener("blur", saveNote);
    dom.noteCategory.addEventListener("change", saveNote);

    // Auto-resize textarea
    dom.noteInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 80) + "px";
    });

    dom.noteInput.addEventListener("keydown", function (e) {
      // Ctrl+Enter or Cmd+Enter to save and blur
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

  function showFlashPicker() {
    var picker = document.getElementById("flash-picker");
    if (!picker) return;
    doPicker(
      "flash-picker",
      "flash-picker-list",
      newsflashCache,
      function (item) {
        var url = item.link || "";
        var title = (item.title || "").slice(0, 60) || "无标题";
        return { url: url, title: title, ts: item.publishTimestamp };
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
        var url = item.link || "";
        var title = (item.title || "").slice(0, 60) || "无标题";
        return { url: url, title: title, ts: item.publishTimestamp };
      },
      "选择文章",
    );
  }

  function showNotePicker() {
    var allNotes = [];
    var symSignals = state.signals;
    for (var sym in symSignals) {
      var sigs = symSignals[sym];
      for (var time in sigs) {
        var sig = sigs[time];
        var noteData = getNoteData(sig);
        if (noteData.text) {
          allNotes.push({
            symbol: sym,
            time: Number(time),
            price: sig.price,
            type: sig.type,
            noteText: noteData.text.slice(0, 80),
          });
        }
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
          (info.extra
            ? " data-extra='" + JSON.stringify(info.extra) + "'"
            : "") +
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
      if (prefix === "笔记" && extra) {
        ref = "【笔记:" + extra.symbol + "|" + extra.time + "】";
      } else if (url) {
        ref = "【" + prefix + ":" + title + "|" + url + "】";
      } else {
        ref = "【" + prefix + ":" + title + "】";
      }
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
  // UI – Signal Log
  // ============================================================

  function updateSignalControls() {
    var ctrl = document.getElementById("signal-controls");
    if (!ctrl) return;
    if (noteTab === "newsflash") {
      var opts = NF_CATEGORIES.map(function (c) {
        return (
          '<option value="' +
          c.endpoint +
          '"' +
          (c.endpoint === nfCategory ? " selected" : "") +
          ">" +
          c.label +
          "</option>"
        );
      }).join("");
      ctrl.innerHTML =
        '<span style="color:var(--text);opacity:0.6;">分类</span> ' +
        '<select id="nf-cat" class="sig-ctrl-select">' +
        opts +
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
      var opts2 = ARTICLE_CATEGORIES.map(function (c) {
        return (
          '<option value="' +
          c.endpoint +
          '"' +
          (c.endpoint === articleCategory ? " selected" : "") +
          ">" +
          c.label +
          "</option>"
        );
      }).join("");
      ctrl.innerHTML =
        '<span style="color:var(--text);opacity:0.6;">分类</span> ' +
        '<select id="art-cat" class="sig-ctrl-select">' +
        opts2 +
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
        ">文章</option>" +
        "</select> " +
        '<button class="sig-ctrl-btn" data-action="search-go" title="搜索">🔍</button> ' +
        '<button class="sig-ctrl-btn" data-action="search-clear" title="清除搜索">✕</button>';
      ctrl.classList.remove("hidden");
    } else {
      ctrl.classList.add("hidden");
    }
  }

  function renderSignalLog() {
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

    // Filter by type
    if (signalFilter !== "all") {
      entries = entries.filter(function (e) {
        return e.type === signalFilter;
      });
    }

    // Header with tabs
    var header = document.querySelector(".signal-history-header");
    if (header) {
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
        var filters = [
          { key: "all", label: "全部" },
          { key: "buy", label: "买入" },
          { key: "hold", label: "观望" },
          { key: "sell", label: "卖出" },
        ];
        header.innerHTML =
          tabsHtml +
          '<span class="sig-header-left">' +
          '信号记录 <span class="sig-count">' +
          allCount +
          "</span>" +
          '<span class="sig-stats">' +
          '<span class="sig-stat-up">▲' +
          stats.buy +
          "</span> " +
          '<span class="sig-stat-mid">◆' +
          stats.hold +
          "</span> " +
          '<span class="sig-stat-down">▼' +
          stats.sell +
          "</span>" +
          "</span></span>" +
          '<span class="sig-filters">' +
          filters
            .map(function (f) {
              return (
                '<button class="sig-filter' +
                (f.key === signalFilter ? " active" : "") +
                '" data-filter="' +
                f.key +
                '">' +
                f.label +
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
        var catFilters = [{ key: "all", label: "全部" }].concat(
          NOTE_CATEGORIES.map(function (c) {
            return { key: c.key, label: c.label };
          }),
        );
        header.innerHTML =
          tabsHtml +
          '<span class="sig-header-left">' +
          '笔记列表 <span class="sig-count">' +
          noteCount +
          "</span>" +
          "</span>" +
          '<span class="sig-filters">' +
          catFilters
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
        var nfCount = newsflashCache ? newsflashCache.length : 0;
        header.innerHTML =
          tabsHtml +
          '<span class="sig-header-left">' +
          '快讯 <span class="sig-count">' +
          nfCount +
          "</span>" +
          "</span>" +
          '<button class="sig-filter" id="btn-nf-refresh" title="刷新快讯">⟳</button>';
      } else if (noteTab === "article") {
        var artCount = articleCache ? articleCache.length : 0;
        header.innerHTML =
          tabsHtml +
          '<span class="sig-header-left">' +
          '文章 <span class="sig-count">' +
          artCount +
          "</span>" +
          "</span>" +
          '<button class="sig-filter" id="btn-nf-refresh" title="刷新文章">⟳</button>';
      } else if (noteTab === "search") {
        header.innerHTML =
          tabsHtml +
          '<span class="sig-header-left">搜索结果</span>' +
          '<button class="sig-filter" id="btn-search-clear" title="清除搜索">✕</button>';
      }
    }

    if (noteTab === "note") {
      dom.signalList.classList.add("hidden");
      var nfListEl = document.getElementById("newsflash-list");
      if (nfListEl) nfListEl.classList.add("hidden");
      renderNoteList();
      updateSignalControls();
      return;
    }
    if (noteTab === "newsflash" || noteTab === "search") {
      dom.signalList.classList.add("hidden");
      var nlEl = document.getElementById("note-list");
      if (nlEl) nlEl.classList.add("hidden");
      renderNewsflash();
      updateSignalControls();
      return;
    }
    if (noteTab === "article") {
      dom.signalList.classList.add("hidden");
      var nlEl2 = document.getElementById("note-list");
      if (nlEl2) nlEl2.classList.add("hidden");
      renderArticles();
      updateSignalControls();
      return;
    }
    dom.signalList.classList.remove("hidden");
    var noteListEl = document.getElementById("note-list");
    if (noteListEl) noteListEl.classList.add("hidden");
    var nfListEl3 = document.getElementById("newsflash-list");
    if (nfListEl3) nfListEl3.classList.add("hidden");

    if (entries.length === 0) {
      dom.signalList.innerHTML = '<div class="signal-empty">暂无信号记录</div>';
      return;
    }

    dom.signalList.innerHTML = entries
      .map(function (entry) {
        var cfg = SIGNAL_CFG[entry.type];
        if (!cfg) return "";
        var noteData = getNoteData(entry);
        var cat =
          NOTE_CATEGORIES.find(function (c) {
            return c.key === noteData.category;
          }) || NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];
        var catBadge = noteData.text
          ? '<span class="sig-cat" style="background:' +
            cat.color +
            "22;color:" +
            cat.color +
            '">' +
            cat.label +
            "</span>"
          : "";
        var noteHtml = noteData.text
          ? '<div class="sig-note">' +
            catBadge +
            renderNoteText(noteData.text) +
            "</div>"
          : "";
        return (
          '<div class="sig-entry" data-time="' +
          entry.time +
          '">' +
          '<span class="sig-dot" style="background:' +
          cfg.color +
          '"></span>' +
          '<span class="sig-info">' +
          '<span class="sig-type">' +
          cfg.label +
          "</span>" +
          '<span class="sig-meta">' +
          formatTime(entry.time) +
          " @ " +
          formatPrice(entry.price) +
          "</span>" +
          "</span>" +
          noteHtml +
          '<button class="sig-del" data-time="' +
          entry.time +
          '" title="删除信号">×</button>' +
          "</div>"
        );
      })
      .join("");
    updateSignalControls();
  }

  function renderNoteList() {
    var el = document.getElementById("note-list");
    if (!el) return;
    el.classList.remove("hidden");

    var signals = getAllSignalsForSymbol();
    var entries = Object.entries(signals)
      .map(function (_a) {
        var time = Number(_a[0]),
          sig = _a[1];
        var noteData = getNoteData(sig);
        return { time: time, type: sig.type, price: sig.price, note: noteData };
      })
      .filter(function (e) {
        return e.note.text;
      })
      .filter(function (e) {
        if (state.noteFilter === "all") return true;
        return e.note.category === state.noteFilter;
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
          '<div class="note-body">' +
          '<span class="note-meta">' +
          cat.label +
          "</span>" +
          '<div class="note-text">' +
          renderNoteText(e.note.text) +
          "</div>" +
          '<div class="note-time">' +
          formatTime(e.time) +
          "</div>" +
          "</div></div>"
        );
      })
      .join("");
  }

  function bindSignalLogClick() {
    var historyEl = dom.signalList.parentElement;
    if (!historyEl) return;
    historyEl.addEventListener("click", function (e) {
      // Tab click
      var tabBtn = e.target.closest(".sig-tab");
      if (tabBtn) {
        noteTab = tabBtn.dataset.tab;
        renderSignalLog();
        return;
      }
      // Filter click (signal filter or note filter)
      var filterBtn = e.target.closest(".sig-filter");
      if (filterBtn) {
        if (filterBtn.dataset.note) {
          state.noteFilter = filterBtn.dataset.filter;
        } else {
          signalFilter = filterBtn.dataset.filter;
        }
        renderSignalLog();
        return;
      }
      // Delete click
      var delBtn = e.target.closest(".sig-del");
      if (delBtn) {
        var time = Number(delBtn.dataset.time);
        if (time) {
          removeSignal(time);
          showToast("已删除信号", "info");
        }
        return;
      }
      // Newsflash/article refresh
      if (e.target.id === "btn-nf-refresh") {
        if (noteTab === "article") fetchArticles();
        else fetchNewsflash();
        return;
      }
      // Search clear
      if (e.target.id === "btn-search-clear") {
        searchResults = null;
        noteTab = "newsflash";
        renderSignalLog();
        return;
      }
      // Entry click → navigate
      var entry = e.target.closest(".sig-entry");
      if (!entry) return;
      var time = Number(entry.dataset.time);
      if (time) {
        state.selectedTime = time;
        var visible = chart.timeScale().getVisibleRange();
        if (visible) {
          var range = visible.to - visible.from;
          chart.timeScale().setVisibleRange({
            from: time - range * 0.3,
            to: time + range * 0.7,
          });
        }
        updateNoteArea();
        showToast("已定位到 " + formatTime(time), "info");
      }
    });
  }

  function bindNoteListClick() {
    var el = document.getElementById("note-list");
    if (!el) return;
    el.addEventListener("click", function (e) {
      var entry = e.target.closest(".note-entry");
      if (!entry) return;
      var time = Number(entry.dataset.time);
      if (time) {
        state.selectedTime = time;
        var visible = chart.timeScale().getVisibleRange();
        if (visible) {
          var range = visible.to - visible.from;
          chart.timeScale().setVisibleRange({
            from: time - range * 0.3,
            to: time + range * 0.7,
          });
        }
        noteTab = "signal";
        renderSignalLog();
        updateNoteArea();
      }
    });
  }

  function bindNewsflashClick() {
    var el = document.getElementById("newsflash-list");
    if (!el) return;
    el.addEventListener("click", async function (e) {
      // Bookmark star click
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
        // Also check search results
        if (!item && searchResults) {
          item = searchResults.find(function (c) {
            return (c.link || String(c.publishTimestamp || "")) === id;
          });
        }
        if (item) {
          var alreadyBm = isBookmarked(item, type);
          if (alreadyBm) {
            var ok = await showConfirm("确认取消收藏？");
            if (!ok) return;
          }
          toggleBookmark(item, type);
          var isBm = isBookmarked(item, type);
          bm.textContent = isBm ? "★" : "☆";
          showToast(isBm ? "已收藏" : "已取消收藏", "info");
          // If on the bookmark category, re-render to show/hide items
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
      // Regular entry click → open link
      var entry = e.target.closest(".news-entry");
      if (!entry) return;
      var url = entry.dataset.url;
      if (url) window.open(url, "_blank");
    });
  }

  // ============================================================
  // UI – Bottom actions (clear, export, import)
  // ============================================================

  function bindToolActions() {
    document.getElementById("btn-refresh").addEventListener("click", () => {
      loadChartData();
      showToast("已刷新", "info");
    });
    document.getElementById("btn-clear-all").addEventListener("click", () => {
      const sym = state.symbol;
      const count = Object.keys(state.signals[sym] || {}).length;
      if (count === 0) {
        showToast("暂无信号可清除", "info");
        return;
      }
      if (confirm("确认清除 " + sym + " 的所有信号？")) {
        pushHist();
        state.signals[sym] = {};
        saveSignals();
        renderAll();
        showToast("已清除所有信号", "info");
      }
    });

    document.getElementById("btn-export").addEventListener("click", exportData);
    document.getElementById("btn-import").addEventListener("click", importData);
    document
      .getElementById("btn-live")
      .addEventListener("click", toggleRealtime);

    // Fullscreen button
    var fsBtn = document.createElement("button");
    fsBtn.className = "tool-btn";
    fsBtn.id = "btn-fullscreen";
    fsBtn.title = "全屏图表 (F)";
    fsBtn.textContent = "⛶";
    document.querySelector(".toolbar-right").appendChild(fsBtn);
    fsBtn.addEventListener("click", toggleFullscreenChart);
  }

  function exportData() {
    const data = {
      version: 1,
      exported: Date.now(),
      signals: state.signals,
      symbol: state.symbol,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
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
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.signals) {
            // Merge imported signals with existing
            for (const [sym, sigs] of Object.entries(data.signals)) {
              if (!state.signals[sym]) state.signals[sym] = {};
              Object.assign(state.signals[sym], sigs);
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
  // Keyboard shortcuts
  // ============================================================

  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      // Don't trigger when typing in input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      // Ctrl+Z / Ctrl+Shift+Z undo-redo
      if (e.ctrlKey && e.key === "z") {
        if (e.shiftKey) {
          if (redoHist()) showToast("重做", "info");
          else showToast("没有可重做的操作", "info");
        } else {
          if (undoHist()) showToast("撤销", "info");
          else showToast("没有可撤销的操作", "info");
        }
        e.preventDefault();
        return;
      }

      switch (e.key) {
        case "1":
          handleSignalClick("buy");
          e.preventDefault();
          break;
        case "2":
          handleSignalClick("hold");
          e.preventDefault();
          break;
        case "3":
          handleSignalClick("sell");
          e.preventDefault();
          break;
        case "ArrowLeft":
          if (pinnedTime) movePin(-1);
          e.preventDefault();
          break;
        case "ArrowRight":
          if (pinnedTime) movePin(1);
          e.preventDefault();
          break;
        case "n":
        case "N":
          if (pinnedTime && dom.noteInput.disabled === false) {
            dom.noteInput.focus();
          }
          e.preventDefault();
          break;
        case "d":
        case "D":
          toggleDrawMode();
          e.preventDefault();
          break;
        case "s":
        case "S":
          showStructures = !showStructures;
          var sb = document.getElementById("btn-struct");
          if (sb) sb.classList.toggle("active", showStructures);
          updateMarkers();
          showToast(showStructures ? "波段高低点 开" : "波段高低点 关", "info");
          e.preventDefault();
          break;
        case "Escape":
          if (pinnedTime) {
            releaseKLine();
          } else if (drawMode) {
            toggleDrawMode();
          } else if (fullscreenMode) {
            toggleFullscreenChart();
          }
          e.preventDefault();
          break;
        case "f":
        case "F":
          toggleFullscreenChart();
          e.preventDefault();
          break;
        case "Delete":
        case "Backspace":
          var t = pinnedTime || state.selectedTime;
          if (t) {
            const sig = getSignal(t);
            if (sig) {
              removeSignal(t);
              showToast("已移除信号", "info");
            }
          }
          e.preventDefault();
          break;
        case "?":
          showToast(
            "快捷键: 1=买入 2=观望 3=卖出 | ←→=切换固定K线 | N=笔记 | D=绘制 | S=结构 | F=全屏 | Esc=释放 | Del=删除信号",
            "info",
          );
          e.preventDefault();
          break;
      }
    });
  }

  // ============================================================
  // Helpers
  // ============================================================

  function getNoteData(sig) {
    if (!sig || !sig.note)
      return { text: "", category: "other", updated: null };
    if (typeof sig.note === "string")
      return { text: sig.note, category: "other", updated: null };
    return sig.note;
  }

  function formatPrice(val) {
    if (val === undefined || val === null) return "--";
    if (val >= 100) return val.toFixed(1);
    return val.toPrecision(4);
  }

  function formatVolume(val) {
    if (!val) return "0";
    if (val > 1e6) return (val / 1e6).toFixed(2) + "M";
    if (val > 1e3) return (val / 1e3).toFixed(2) + "K";
    return val.toFixed(2);
  }

  function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleString("zh-CN", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function padNum(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function renderNoteText(text) {
    if (!text) return "";
    // Parse 【快讯:TITLE|URL】, 【文章:TITLE|URL】, and 【笔记:SYMBOL|TIME】
    var parts = text.split(/(【[^】]+】)/g);
    return parts
      .map(function (part) {
        var flashMatch = part.match(/^【快讯:([^|]+)\|([^】]+)】$/);
        if (flashMatch) {
          var title = escapeHtml(flashMatch[1]);
          return (
            '<a class="note-ref note-ref-flash" href="' +
            escapeHtml(flashMatch[2]) +
            '" target="_blank" title="' +
            title +
            '">📰 ' +
            title +
            "</a>"
          );
        }
        var articleMatch = part.match(/^【文章:([^|]+)\|([^】]+)】$/);
        if (articleMatch) {
          var artTitle = escapeHtml(articleMatch[1]);
          return (
            '<a class="note-ref note-ref-article" href="' +
            escapeHtml(articleMatch[2]) +
            '" target="_blank" title="' +
            artTitle +
            '">📄 ' +
            artTitle +
            "</a>"
          );
        }
        var noteMatch = part.match(/^【笔记:([^|]+)\|([^】]+)】$/);
        if (noteMatch) {
          var sym = noteMatch[1],
            t = Number(noteMatch[2]);
          var noteText = "";
          if (state.signals[sym] && state.signals[sym][t]) {
            var nd = getNoteData(state.signals[sym][t]);
            noteText = nd.text ? nd.text.slice(0, 60) : "(无笔记内容)";
          } else {
            noteText = "(笔记不存在)";
          }
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
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    textarea.value =
      textarea.value.substring(0, start) + text + textarea.value.substring(end);
    var pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
  }

  // ============================================================
  // Render All
  // ============================================================

  function renderAll() {
    updateMarkers();
    renderSignalLog();
    updateNoteArea();
  }

  // ============================================================
  // Init
  // ============================================================

  function initSignalControls() {
    // Create controls div after signal-history-header
    var header = document.querySelector(".signal-history-header");
    if (!header) return;
    var ctrlDiv = document.createElement("div");
    ctrlDiv.id = "signal-controls";
    ctrlDiv.className = "hidden";
    header.parentElement.insertBefore(ctrlDiv, header.nextSibling);

    // Event delegation for controls
    ctrlDiv.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === "nf-refresh") fetchNewsflash();
      else if (action === "art-refresh") fetchArticles();
      else if (action === "search-go") doSearch();
      else if (action === "ctrl-search") doCtrlSearch();
      else if (action === "search-clear") {
        searchResults = null;
        noteTab = "newsflash";
        renderSignalLog();
      }
    });
    ctrlDiv.addEventListener("change", function (e) {
      var sel = e.target.closest("select");
      if (!sel) return;
      if (sel.id === "nf-cat") {
        nfCategory = sel.value;
        fetchNewsflash();
      } else if (sel.id === "art-cat") {
        articleCategory = sel.value;
        fetchArticles();
      } else if (sel.id === "search-source") {
        searchSource = sel.value;
      }
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
      searchSource = document.getElementById("search-source")
        ? document.getElementById("search-source").value
        : "newsflash";
      searchContent(kw).then(function () {
        noteTab = "search";
        renderSignalLog();
      });
    }

    function doCtrlSearch() {
      var input = document.getElementById("ctrl-search-input");
      if (!input) return;
      var kw = input.value.trim();
      if (!kw) return;
      searchSource = noteTab === "article" ? "article" : "newsflash";
      searchContent(kw).then(function () {
        noteTab = "search";
        renderSignalLog();
      });
    }
  }

  function setFavicon() {
    var c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    var ctx = c.getContext("2d");
    var size = 6,
      gap = 1,
      cellW = Math.floor(64 / size);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var r = Math.floor(Math.random() * 256);
        var g = Math.floor(Math.random() * 256);
        var b = Math.floor(Math.random() * 256);
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.fillRect(
          x * cellW + gap,
          y * cellW + gap,
          cellW - gap * 2,
          cellW - gap * 2,
        );
      }
    }
    var link =
      document.querySelector('link[rel="icon"]') ||
      document.createElement("link");
    link.rel = "icon";
    link.href = c.toDataURL();
    document.head.appendChild(link);
  }

  // Remote control API (callable from browser DevTools console)
  window.remote = {
    state: state,
    addSignal: function (type, noteText, noteCategory) {
      var t = state.selectedTime || pinnedTime;
      if (!t) {
        showToast("请先选择或固定一个K线", "error");
        return false;
      }
      if (!SIGNAL_CFG[type]) {
        showToast("无效信号类型: " + type, "error");
        return false;
      }
      handleSignalClick(type);
      if (noteText) {
        setTimeout(function () {
          dom.noteInput.value = noteText;
          dom.noteCategory.value = noteCategory || "technical";
          dom.noteInput.dataset.time = state.selectedTime || pinnedTime;
          dom.noteInput.disabled = false;
          updateNote(
            Number(dom.noteInput.dataset.time),
            noteText,
            dom.noteCategory.value,
          );
          renderAll();
          showToast("已添加信号+笔记", "success");
        }, 100);
      }
      return true;
    },
    pinByIndex: function (idx) {
      if (!state.data || idx < 0 || idx >= state.data.length) return false;
      var candle = state.data[idx];
      pinnedTime = candle.time;
      state.selectedTime = candle.time;
      state.selectedIndex = idx;
      updateOHLCBar(candle);
      updateNoteArea();
      updateMarkers();
      showToast("已固定第 " + (idx + 1) + " 根K线", "info");
      return true;
    },
    pinLatest: function () {
      if (!state.data || state.data.length === 0) return false;
      return this.pinByIndex(state.data.length - 1);
    },
    drawLine: function (price) {
      addDrawLine(price);
      showToast("已绘制水平线 @ " + formatPrice(price), "success");
      return true;
    },
    helper: function () {
      console.log("使用方法:");
      console.log("  remote.pinLatest()              — 固定最新K线");
      console.log("  remote.pinByIndex(5)            — 固定第5根K线");
      console.log('  remote.addSignal("buy")         — 标记买入信号');
      console.log(
        '  remote.addSignal("sell", "突破阻力位") — 标记卖出信号+笔记',
      );
      console.log(
        '  remote.addSignal("hold", "观望", "technical") — 观望+技术分析笔记',
      );
      console.log("  remote.state.symbol             — 当前标的");
      console.log("  remote.state.data               — K线数据");
    },
  };

  async function init() {
    document.title = "abminder | " + state.symbol;
    setFavicon();
    cacheDom();
    loadSignals();
    loadBookmarks();
    pushHist(); // initial undo snapshot
    initChart();
    renderToolbar();
    renderSignalButtons();
    initSignalControls();
    renderSignalLog();
    updateNoteArea();
    bindNoteInput();
    bindToolActions();
    bindKeyboard();
    bindSignalLogClick();
    loadDrawings();
    // Note list div
    var noteListEl = document.createElement("div");
    noteListEl.id = "note-list";
    noteListEl.className = "hidden";
    dom.signalList.parentElement.appendChild(noteListEl);
    bindNoteListClick();
    // Newsflash list div
    var nfListEl = document.createElement("div");
    nfListEl.id = "newsflash-list";
    nfListEl.className = "hidden";
    nfListEl.style.flex = "1";
    nfListEl.style.overflowY = "auto";
    nfListEl.style.minHeight = "0";
    dom.signalList.parentElement.appendChild(nfListEl);
    bindNewsflashClick();
    // Note ref buttons — use event delegation for robustness
    document.addEventListener("click", function (e) {
      if (e.target.id === "btn-ins-flash") showFlashPicker();
      if (e.target.id === "btn-ins-article") showArticlePicker();
      if (e.target.id === "btn-ins-note") showNotePicker();
      if (e.target.id === "btn-release") releaseKLine();
    });
    // Picker close buttons
    document.querySelectorAll(".picker-close").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.closest(".picker-overlay").classList.add("hidden");
      });
    });
    // Click outside any picker to close
    document.addEventListener("click", function (e) {
      document
        .querySelectorAll(".picker-overlay:not(.hidden)")
        .forEach(function (picker) {
          if (
            !picker.contains(e.target) &&
            e.target.id !== "btn-ins-flash" &&
            e.target.id !== "btn-ins-article" &&
            e.target.id !== "btn-ins-note"
          ) {
            picker.classList.add("hidden");
          }
        });
    });
    renderExtraTools();
    // Fullscreen exit button (floating over chart)
    var fsExit = document.createElement("button");
    fsExit.id = "btn-fs-exit";
    fsExit.textContent = "✕ 退出全屏 (F)";
    fsExit.addEventListener("click", toggleFullscreenChart);
    document.getElementById("chart-container").appendChild(fsExit);
    updateDataSource();
    await loadChartData();
    // 初始化深度图
    initDepthChart();
    // 默认开启实时模式
    startRealtime();
    // 加载快讯
    fetchNewsflash();
    fetchArticles();
    // 远程控制轮询
    startRemotePoll();
  }

  function startRemotePoll() {
    var base =
      window.location.origin === "null" || window.location.protocol === "file:"
        ? "http://localhost:3456"
        : "";
    var pollUrl = base + "/api/poll";
    var connected = false;
    setInterval(function () {
      var statusUrl = base + "/api/status";
      fetch(pollUrl)
        .then(function (r) {
          return r.json();
        })
        .then(function (actions) {
          if (!connected) {
            connected = true;
            storageAPI = base + "/api/data";
            showToast("远程控制已连接", "success");
            // Sync from server files on connect (merge, not overwrite)
            loadSignals();
            loadBookmarks();
            loadDrawings();
            // Push local data to server (signals added before connection)
            setTimeout(function () {
              saveSignals();
              saveBookmarks();
              saveDrawings();
            }, 300);
          }
          // Push current state
          fetch(statusUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: state.symbol,
              timeframe: state.timeframe,
              dataLength: state.data ? state.data.length : 0,
            }),
          }).catch(function () {});
          if (!actions || actions.length === 0) return;
          actions.forEach(function (a) {
            executeRemoteAction(a);
          });
        })
        .catch(function () {
          connected = false;
          storageAPI = null;
        });
    }, 1500);
  }

  function executeRemoteAction(a) {
    if (!a || !a.type) return;
    switch (a.type) {
      case "signal":
        if (a.target === "latest") {
          // Pin latest candle
          if (!state.data || state.data.length === 0) break;
          var c = state.data[state.data.length - 1];
          pinnedTime = c.time;
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
            dom.noteCategory.value = a.category || "technical";
            dom.noteInput.dataset.time = state.selectedTime || pinnedTime;
            dom.noteInput.disabled = false;
            updateNote(
              Number(dom.noteInput.dataset.time),
              a.note,
              dom.noteCategory.value,
            );
            renderAll();
          }, 150);
        }
        showToast(
          "远程: " + (a.signalType || "") + (a.note ? " +笔记" : ""),
          "info",
        );
        break;
      case "toast":
        showToast(a.msg || "", "info");
        break;
      case "reload":
        loadChartData();
        break;
      case "symbol":
        changeSymbol(a.symbol);
        break;
      case "exec":
        try {
          var fn = new Function(a.code);
          var r = fn();
          if (r && r.then)
            r.catch(function (e) {
              showToast("远程执行错误: " + e.message, "error");
            });
        } catch (e) {
          showToast("远程执行错误: " + e.message, "error");
        }
        break;
    }
  }

  // Remote import — called from remote exec
  window.importRemoteData = function (data) {
    if (data.signals) {
      for (var sym in data.signals) {
        if (!state.signals[sym]) state.signals[sym] = {};
        Object.assign(state.signals[sym], data.signals[sym]);
      }
      saveSignals();
      renderAll();
      showToast(
        "已远程导入 " + Object.keys(data.signals).length + " 个交易对的信号",
        "success",
      );
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
