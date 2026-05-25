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
  sz159941: '纳指ETF'
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get('symbol');
    if (!INDEXES[symbol]) {
      return json({ error: `Unsupported index symbol: ${symbol}` }, 400);
    }

    const response = await fetch(`https://qt.gtimg.cn/q=${encodeURIComponent(symbol)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Node FearGreed Demo',
        Accept: 'text/plain,*/*'
      }
    });

    if (!response.ok) {
      return json({ error: `Tencent quote API responded with ${response.status}` }, 502);
    }

    const raw = await response.text();
    const match = raw.match(/="([^"]+)"/);
    const values = match ? match[1].split('~') : [];
    const price = parseNumber(values[3]);

    if (price === null) {
      return json({ error: `Tencent quote API did not return a realtime price for ${symbol}.` }, 502);
    }

    const quoteDate = values[30] && /^\d{8}$/.test(values[30])
      ? `${values[30].slice(0, 4)}-${values[30].slice(4, 6)}-${values[30].slice(6, 8)}`
      : null;
    const quoteTime = values[31] && /^\d{6}$/.test(values[31])
      ? `${values[31].slice(0, 2)}:${values[31].slice(2, 4)}:${values[31].slice(4, 6)}`
      : null;

    return json({
      symbol,
      name: values[1] || INDEXES[symbol],
      price,
      date: quoteDate,
      time: quoteTime
    });
  } catch (error) {
    return json({ error: error.message }, 500);
  }
};
