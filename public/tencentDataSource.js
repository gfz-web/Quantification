const INDEXES = {
  sh000001: '上证指数',
  sh000300: '沪深300',
  sh000905: '中证500',
  sh000688: '科创50',
  sh000852: '中证1000',
  sh510880: '红利ETF',
  sh513120: '创新药ETF',
  sh513160: '港股科技ETF',
  sh518880: '黄金ETF',
  sz159941: '纳指ETF',
  sh511090: '30年国债'
};

const MINUTE_INDEXES = {
  ...INDEXES,
  sh511380: '可转债ETF',
  sh512800: '银行ETF',
  sh512690: '白酒ETF',
  sh560090: '证券ETF'
};

const HISTORY_START_DATE = '2022-01-01';
const HISTORY_LIMIT = 2000;
const MINUTE_HISTORY_LIMIT = 1600;
const MINUTE_HISTORY_MAX_LIMIT = 1600;
const PERIOD_KEYS = {
  day: ['day', 'qfqday'],
  week: ['week', 'qfqweek']
};
const MINUTE_PERIODS = new Set(['m5', 'm15', 'm30', 'm60']);
const historyCache = new Map();
const minuteHistoryCache = new Map();
const realtimeCache = new Map();

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchIndexHistory(symbol, period = 'day') {
  if (!INDEXES[symbol]) {
    throw new Error(`Unsupported index symbol: ${symbol}`);
  }

  if (!PERIOD_KEYS[period]) {
    throw new Error(`Unsupported history period: ${period}`);
  }

  const cacheKey = `${symbol}:${period}`;
  if (historyCache.has(cacheKey)) {
    return historyCache.get(cacheKey);
  }

  const historyPromise = requestIndexHistory(symbol, period);
  historyCache.set(cacheKey, historyPromise);
  return historyPromise;
}

async function fetchIndexMinuteHistory(symbol, period = 'm30', limit = MINUTE_HISTORY_LIMIT, options = {}) {
  if (!MINUTE_INDEXES[symbol]) {
    throw new Error(`Unsupported index symbol: ${symbol}`);
  }

  if (!MINUTE_PERIODS.has(period)) {
    throw new Error(`Unsupported minute period: ${period}`);
  }

  const forceRefresh = options && options.forceRefresh === true;
  const cacheKey = `${symbol}:${period}:${limit}`;
  if (!forceRefresh && minuteHistoryCache.has(cacheKey)) {
    return minuteHistoryCache.get(cacheKey);
  }

  const historyPromise = requestIndexMinuteHistory(symbol, period, limit);
  minuteHistoryCache.set(cacheKey, historyPromise);
  try {
    return await historyPromise;
  } catch (error) {
    if (minuteHistoryCache.get(cacheKey) === historyPromise) {
      minuteHistoryCache.delete(cacheKey);
    }
    throw error;
  }
}

async function fetchRealtimeQuote(symbol) {
  if (!INDEXES[symbol]) {
    throw new Error(`Unsupported index symbol: ${symbol}`);
  }

  const cached = realtimeCache.get(symbol);
  if (cached && Date.now() - cached.cachedAt < 15000) {
    return cached.value;
  }

  const quotePromise = requestRealtimeQuote(symbol);
  realtimeCache.set(symbol, {
    cachedAt: Date.now(),
    value: quotePromise
  });
  return quotePromise;
}

function formatMinuteDate(value) {
  const text = String(value || '');
  if (!/^\d{12}$/.test(text)) {
    return text;
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}`;
}

async function requestIndexHistory(symbol, period) {
  const apiUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},${period},,,${HISTORY_LIMIT},qfq`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*'
    }
  });

  if (!response.ok) {
    throw new Error(`Tencent API responded with ${response.status}`);
  }

  const payload = await response.json();
  const root = payload && payload.data && payload.data[symbol];
  const [rawKey, adjustedKey] = PERIOD_KEYS[period];
  const rows =
    root && Array.isArray(root[rawKey])
      ? root[rawKey]
      : root && Array.isArray(root[adjustedKey])
        ? root[adjustedKey]
        : null;

  if (!rows || rows.length === 0) {
    throw new Error(`Tencent API did not return ${period} data for ${symbol}.`);
  }

  return rows
    .filter((row) => row[0] >= HISTORY_START_DATE)
    .map((row) => ({
      date: row[0],
      open: parseNumber(row[1]),
      close: parseNumber(row[2]),
      high: parseNumber(row[3]),
      low: parseNumber(row[4]),
      volume: parseNumber(row[5])
    }));
}

function periodToScale(period) {
  const scaleMap = {
    'm5': 5,
    'm15': 15,
    'm30': 30,
    'm60': 60
  };
  return scaleMap[period] || 30;
}

async function requestIndexMinuteHistory(symbol, period, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || MINUTE_HISTORY_LIMIT, MINUTE_HISTORY_MAX_LIMIT));
  const scale = periodToScale(period);
  const apiUrl = `/api/sina-kline?symbol=${encodeURIComponent(symbol)}&scale=${scale}&datalen=${safeLimit}`;
  
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*'
    }
  });

  if (!response.ok) {
    throw new Error(`Sina KLine API responded with ${response.status}`);
  }

  const rows = await response.json();

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Sina KLine API did not return ${period} data for ${symbol}.`);
  }

  return rows.map((row) => ({
    date: row.date || '',
    open: parseNumber(row.open),
    close: parseNumber(row.close),
    high: parseNumber(row.high),
    low: parseNumber(row.low),
    volume: parseNumber(row.volume)
  }));
}

async function requestRealtimeQuote(symbol) {
  const apiUrl = `/api/quote?symbol=${encodeURIComponent(symbol)}`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*'
    }
  });

  if (!response.ok) {
    throw new Error(`Realtime quote API responded with ${response.status}`);
  }

  const payload = await response.json();
  const price = parseNumber(payload.price);

  if (price === null) {
    throw new Error(`Realtime quote API did not return a price for ${symbol}.`);
  }

  return {
    symbol,
    name: payload.name || INDEXES[symbol],
    price,
    date: payload.date || null,
    time: payload.time || null
  };
}

export {
  INDEXES,
  MINUTE_INDEXES,
  fetchIndexHistory,
  fetchIndexMinuteHistory,
  fetchRealtimeQuote
};
