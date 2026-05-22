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
    const scale = url.searchParams.get('scale');
    const datalen = url.searchParams.get('datalen');

    if (!symbol || !scale || !datalen) {
      return json({ error: 'Missing required parameters: symbol, scale, datalen' }, 400);
    }

    const sinaUrl = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${encodeURIComponent(symbol)}&scale=${encodeURIComponent(scale)}&datalen=${encodeURIComponent(datalen)}`;
    const response = await fetch(sinaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Node FearGreed Demo',
        Accept: 'application/json,*/*'
      }
    });

    if (!response.ok) {
      return json({ error: `Sina API responded with ${response.status}` }, 502);
    }

    const raw = await response.text();
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return json({ error: 'Sina API returned invalid data format' }, 502);
    }

    return json(
      data.map((item) => ({
        date: item.day || '',
        open: parseNumber(item.open),
        close: parseNumber(item.close),
        high: parseNumber(item.high),
        low: parseNumber(item.low),
        volume: parseNumber(item.volume)
      }))
    );
  } catch (error) {
    return json({ error: error.message }, 500);
  }
};
