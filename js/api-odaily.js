// ============================================================
// Odaily Newsflash, Articles & Search API
// ============================================================
import { NF_CATEGORIES, ARTICLE_CATEGORIES, MARKET_CONFIG } from './config.js';
import { state, nfBookmarks, artBookmarks } from './state.js';

// --- Cached data (module-level, shared across imports) ---
export let newsflashCache = null;
export let newsflashLoading = false;
export let nfCategory = '';

export let articleCache = null;
export let articleLoading = false;
export let articleCategory = '';

export let searchResults = null;
export let searchLoading = false;
export let searchSource = 'newsflash';
export function setSearchSource(s) { searchSource = s; }

export function setNfCategory(cat) { nfCategory = cat; }
export function setArticleCategory(cat) { articleCategory = cat; }
export function setSearchResults(r) { searchResults = r; }

// --- Callbacks (set by main.js) ---
export let onNewsflashLoaded = null;
export let onArticlesLoaded = null;
export let onSearchDone = null;

export function setOnNewsflashLoaded(fn) { onNewsflashLoaded = fn; }
export function setOnArticlesLoaded(fn) { onArticlesLoaded = fn; }
export function setOnSearchDone(fn) { onSearchDone = fn; }

// ============================================================
// Newsflash
// ============================================================

export async function fetchNewsflash() {
    var market = state.currentMarket || '加密市场';
    var newsSource = (MARKET_CONFIG[market] || {}).newsSource || 'odaily';

    // Route to the appropriate news source
    if (newsSource === 'finnhub-news') {
        await fetchFinnhubNews();
        return;
    }
    if (newsSource === 'eastmoney-news') {
        await fetchEastMoneyNews();
        return;
    }

    // Default: Odaily
    if (newsflashLoading && nfCategory !== '__bookmarked__') return;
    if (nfCategory === '__bookmarked__') {
        newsflashLoading = false;
        newsflashCache = nfBookmarks;
        if (onNewsflashLoaded) onNewsflashLoaded();
        return;
    }
    newsflashLoading = true;
    try {
        var url = 'https://api.odaily.news/api/v1/newsflash' + (nfCategory ? '/' + nfCategory : '') + '?page=1&size=30&lang=zh-cn';
        var r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        if (j.code === 200 && j.data && j.data.list) {
            newsflashCache = (j.data.list || []).map(function (item) {
                if (!item._source) item._source = 'Odaily';
                return item;
            });
            if (onNewsflashLoaded) onNewsflashLoaded();
        }
    } catch (err) { console.log('[快讯] 加载失败:', err.message); }
    finally { newsflashLoading = false; }
}

// ============================================================
// Articles
// ============================================================

export async function fetchArticles() {
    var market = state.currentMarket || '加密市场';
    var newsSource = (MARKET_CONFIG[market] || {}).newsSource || 'odaily';

    if (newsSource === 'finnhub-news') {
        // Finnhub doesn't have separate article/newsflash — reuse news cache
        if (!newsflashCache) await fetchFinnhubNews();
        articleCache = newsflashCache;
        if (onArticlesLoaded) onArticlesLoaded();
        return;
    }

    if (articleLoading && articleCategory !== '__bookmarked__') return;
    if (articleCategory === '__bookmarked__') {
        articleLoading = false;
        articleCache = artBookmarks;
        if (onArticlesLoaded) onArticlesLoaded();
        return;
    }
    articleLoading = true;
    try {
        var url = 'https://api.odaily.news/api/v1/article' + (articleCategory ? '/' + articleCategory : '') + '?page=1&size=30&lang=zh-cn';
        var r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        if (j.code === 200 && j.data && j.data.list) {
            articleCache = (j.data.list || []).map(function (item) {
                if (!item._source) item._source = 'Odaily';
                return item;
            });
            if (onArticlesLoaded) onArticlesLoaded();
        }
    } catch (err) { console.log('[文章] 加载失败:', err.message); }
    finally { articleLoading = false; }
}

// ============================================================
// Search
// ============================================================

export async function searchContent(keyword) {
    if (searchLoading || !keyword) return;
    searchLoading = true;
    try {
        var market = state.currentMarket || '加密市场';
        var newsSource = (MARKET_CONFIG[market] || {}).newsSource || 'odaily';
        if (newsSource === 'finnhub-news') {
            await searchFinnhub(keyword);
            return;
        }
        var url = 'https://api.odaily.news/api/v1/search/' + searchSource + '?keyword=' + encodeURIComponent(keyword) + '&page=1&size=20&lang=zh-cn';
        var r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        if (j.code === 200 && j.data && j.data.list) searchResults = (j.data.list || []).map(function (item) {
            if (!item._source) item._source = 'Odaily';
            return item;
        });
        else searchResults = [];
        if (onSearchDone) onSearchDone();
    } catch (err) { console.log('[搜索] 失败:', err.message); searchResults = []; }
    finally { searchLoading = false; }
}

// ============================================================
// Article Image Generation (Canvas)
// ============================================================

export function extractTitleText(title) {
    var t = (title || '').trim();
    var parts = t.split(/[：:]/);
    if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
    parts = t.split('|');
    if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
    parts = t.split(/[，,]/);
    if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
    return t || '?';
}

export function generateArticleImage(title) {
    var text = extractTitleText(title);
    var w = 120, h = 80;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1a0533');
    grad.addColorStop(1, '#0d1b3e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(0, 0, 3, h);
    ctx.fillStyle = '#e0d4f5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var fontSize = text.length > 6 ? 11 : text.length > 4 ? 13 : 15;
    ctx.font = 'bold ' + fontSize + 'px sans-serif';
    var maxW = w - 12;
    if (ctx.measureText(text).width > maxW) {
        var words = text.split('');
        var line1 = '', line2 = '';
        for (var i = 0; i < words.length; i++) {
            if (ctx.measureText(line1 + words[i]).width < maxW && line1.length < text.length * 0.6) line1 += words[i];
            else line2 += words[i];
        }
        if (line2) { ctx.fillText(line1, w / 2, h / 2 - 8); ctx.fillText(line2, w / 2, h / 2 + 8); }
        else ctx.fillText(line1, w / 2, h / 2);
    } else ctx.fillText(text, w / 2, h / 2);
    ctx.fillStyle = '#6d28d9';
    ctx.fillRect(0, h - 2, w, 2);
    return c.toDataURL();
}

// ============================================================
// US stock market news — placeholder (needs API key)
// ============================================================

// ============================================================
// Finnhub News (US market)
// ============================================================

async function fetchFinnhubNews() {
    newsflashLoading = true;
    try {
        var url = '/api/finnhub?path=' + encodeURIComponent('news?category=general');
        var r = await fetch(url);
        if (!r.ok) throw new Error('Finnhub HTTP ' + r.status);
        var j = await r.json();
        if (Array.isArray(j)) {
            newsflashCache = j.slice(0, 50).map(function (item) {
                return {
                    _source: item.source || 'Finnhub',
                    title: item.headline || '',
                    content: (item.summary || '').replace(/<[^>]*>/g, '').trim(),
                    publishTimestamp: (item.datetime || 0) * 1000,
                    link: item.url || '',
                    sourceUrl: item.url || '',
                    isImportant: false,
                };
            });
            if (onNewsflashLoaded) onNewsflashLoaded();
        }
    } catch (err) { console.log('[Finnhub] 新闻加载失败:', err.message); }
    finally { newsflashLoading = false; }
}

async function searchFinnhub(keyword) {
    searchLoading = true;
    try {
        var url = '/api/finnhub?path=' + encodeURIComponent('search?q=' + encodeURIComponent(keyword));
        var r = await fetch(url);
        if (!r.ok) throw new Error('Finnhub search HTTP ' + r.status);
        var j = await r.json();
        if (j.result && Array.isArray(j.result)) {
            searchResults = j.result.slice(0, 20).map(function (item) {
                return {
                    _source: 'Finnhub',
                    title: item.description || item.symbol || '',
                    content: item.type || '',
                    publishTimestamp: Date.now(),
                    link: '',
                    symbol: item.symbol || '',
                };
            });
        }
        if (onSearchDone) onSearchDone();
    } catch (err) { console.log('[Finnhub] 搜索失败:', err.message); searchResults = []; }
    finally { searchLoading = false; }
}

// ============================================================
// East Money News (A-share market)
// ============================================================

async function fetchEastMoneyNews() {
    newsflashLoading = true;
    try {
        var url = '/api/proxy?url=' + encodeURIComponent('https://push2.eastmoney.com/api/qt/stock/news/get?secid=&fltt=2&count=30');
        var r = await fetch(url);
        if (!r.ok) throw new Error('East Money HTTP ' + r.status);
        var j = await r.json();
        if (j.data && Array.isArray(j.data)) {
            newsflashCache = j.data.map(function (item) {
                var content = item.content || item.title || '';
                return {
                    _source: '东方财富',
                    title: item.title || '',
                    content: content.replace(/<[^>]*>/g, '').trim(),
                    publishTimestamp: item.date || item.showTime || Date.now(),
                    link: item.url || item.articleUrl || '',
                    sourceUrl: item.url || '',
                    isImportant: item.essential ? true : false,
                };
            }).slice(0, 50);
            if (onNewsflashLoaded) onNewsflashLoaded();
        }
    } catch (err) { console.log('[东方财富] 新闻加载失败:', err.message); }
    finally { newsflashLoading = false; }
}
