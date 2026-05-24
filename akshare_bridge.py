#!/usr/bin/env python3
"""A-share K-line data bridge using AkShare (called by server.js)."""
import sys, json, traceback
import akshare as ak


def fetch_daily(symbol, limit=300):
    """Fetch daily K-line via Tencent backend (stock_zh_a_hist_tx)."""
    sym = symbol.lower()
    if not sym.startswith(('sh', 'sz')):
        sym = 'sh' + sym

    df = ak.stock_zh_a_hist_tx(symbol=sym, start_date='2025-01-01', end_date='2050-01-01')
    if df is None or df.empty:
        return []

    result = []
    for _, row in df.iterrows():
        try:
            date_str = str(row['date'])
            ts = int(__import__('datetime').datetime.strptime(date_str, '%Y-%m-%d').timestamp())
            result.append({
                'time': ts,
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'volume': float(row.get('volume', row.get('amount', 0))),
            })
        except Exception:
            continue

    return result[-limit:]


def fetch_minute(symbol, period='5', limit=300):
    """Fetch minute K-line via Sina backend (stock_zh_a_minute)."""
    sym = symbol.lower()
    if not sym.startswith(('sh', 'sz')):
        sym = 'sh' + sym

    df = ak.stock_zh_a_minute(symbol=sym, period=period, adjust='')
    if df is None or df.empty:
        return []

    result = []
    for _, row in df.iterrows():
        try:
            time_str = str(row['day'])
            ts = int(__import__('datetime').datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S').timestamp())
            result.append({
                'time': ts,
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'volume': float(row.get('volume', row.get('amount', 0))),
            })
        except Exception:
            continue

    return result[-limit:]


def fetch_intraday_sina(symbol, limit=300):
    """Fetch intraday tick data via Sina (for real-time)."""
    sym = symbol.lower()
    if not sym.startswith(('sh', 'sz')):
        sym = 'sh' + sym

    df = ak.stock_intraday_sina(symbol=sym)
    if df is None or df.empty:
        return []

    result = []
    for _, row in df.iterrows():
        try:
            result.append({
                'time': str(row.get('时间', row.get('time', ''))),
                'price': float(row.get('current', row.get('price', 0))),
                'volume': float(row.get('volume', 0)),
            })
        except Exception:
            continue

    return result


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Usage: akshare_bridge.py <symbol> <period> [limit]'}))
        sys.exit(1)

    symbol = sys.argv[1]
    period = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 300

    try:
        # Map period to available API
        if period == '101' or period == '1440':
            data = fetch_daily(symbol, limit)
        elif period == '240':
            # No 4h API, use 60m as closest approximation
            data = fetch_minute(symbol, '60', limit)
        elif period in ('1', '5', '15', '30', '60'):
            data = fetch_minute(symbol, period, limit)
        else:
            data = fetch_daily(symbol, limit)
        print(json.dumps(data))
    except Exception as e:
        print(json.dumps({'error': str(e), 'traceback': traceback.format_exc()}))
        sys.exit(1)
