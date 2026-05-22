const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 4009;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LIB_DIR = path.join(__dirname, 'lib');
const INDEXES = {
  sh000001: '上证指数',
  sh000300: '沪深300',
  sh000905: '中证500',
  sh000688: '科创50',
  sh000852: '中证1000',
  sh510880: '红利ETF',
  sh513120: '创新药ETF',
  sh513160: '港股科技',
  sh518880: '黄金ETF',
  sz159941: '纳指ETF'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 Node FearGreed Demo',
            Accept: 'text/plain,*/*'
          }
        },
        (remoteRes) => {
          if (remoteRes.statusCode !== 200) {
            reject(new Error(`Tencent quote API responded with ${remoteRes.statusCode}`));
            remoteRes.resume();
            return;
          }

          let raw = '';
          remoteRes.setEncoding('utf8');
          remoteRes.on('data', (chunk) => {
            raw += chunk;
          });
          remoteRes.on('end', () => resolve(raw));
        }
      )
      .on('error', (error) => reject(error));
  });
}

async function fetchRealtimeQuote(symbol) {
  if (!INDEXES[symbol]) {
    throw new Error(`Unsupported index symbol: ${symbol}`);
  }

  const raw = await httpsGetText(`https://qt.gtimg.cn/q=${symbol}`);
  const match = raw.match(/="([^"]+)"/);
  const values = match ? match[1].split('~') : [];
  const price = parseNumber(values[3]);

  if (price === null) {
    throw new Error(`Tencent quote API did not return a realtime price for ${symbol}.`);
  }

  const quoteDate = values[30] && /^\d{8}$/.test(values[30])
    ? `${values[30].slice(0, 4)}-${values[30].slice(4, 6)}-${values[30].slice(6, 8)}`
    : null;
  const quoteTime = values[31] && /^\d{6}$/.test(values[31])
    ? `${values[31].slice(0, 2)}:${values[31].slice(2, 4)}:${values[31].slice(4, 6)}`
    : null;

  return {
    symbol,
    name: values[1] || INDEXES[symbol],
    price,
    date: quoteDate,
    time: quoteTime
  };
}

function serveStatic(reqPath, res) {
  const isNotificationService = reqPath === '/lib/notificationService.js';
  const rootDir = isNotificationService ? LIB_DIR : PUBLIC_DIR;
  const targetPath = reqPath === '/'
    ? 'index.html'
    : isNotificationService
      ? 'notificationService.js'
      : reqPath.replace(/^\/+/, '');
  const normalized = path.normalize(targetPath);
  const filePath = path.join(rootDir, normalized);
  const relative = path.relative(rootDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      sendJson(res, 500, { error: 'Failed to read static asset' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
}

async function fetchSinaKLine(symbol, scale, datalen) {
  const sinaUrl = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${encodeURIComponent(symbol)}&scale=${scale}&datalen=${datalen}`;
  return new Promise((resolve, reject) => {
    https
      .get(
        sinaUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 Node FearGreed Demo',
            Accept: 'application/json,*/*'
          }
        },
        (remoteRes) => {
          if (remoteRes.statusCode !== 200) {
            reject(new Error(`Sina API responded with ${remoteRes.statusCode}`));
            remoteRes.resume();
            return;
          }

          let raw = '';
          remoteRes.setEncoding('utf8');
          remoteRes.on('data', (chunk) => {
            raw += chunk;
          });
          remoteRes.on('end', () => {
            try {
              const data = JSON.parse(raw);
              if (!Array.isArray(data)) {
                reject(new Error('Sina API returned invalid data format'));
                return;
              }
              const rows = data.map((item) => ({
                date: item.day || '',
                open: parseNumber(item.open),
                close: parseNumber(item.close),
                high: parseNumber(item.high),
                low: parseNumber(item.low),
                volume: parseNumber(item.volume)
              }));
              resolve(rows);
            } catch (error) {
              reject(new Error(`Failed to parse Sina API response: ${error.message}`));
            }
          });
        }
      )
      .on('error', (error) => reject(error));
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  
  if (requestUrl.pathname === '/api/quote') {
    fetchRealtimeQuote(requestUrl.searchParams.get('symbol'))
      .then((quote) => sendJson(res, 200, quote))
      .catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }

  if (requestUrl.pathname === '/api/sina-kline') {
    const symbol = requestUrl.searchParams.get('symbol');
    const scale = requestUrl.searchParams.get('scale');
    const datalen = requestUrl.searchParams.get('datalen');
    
    if (!symbol || !scale || !datalen) {
      sendJson(res, 400, { error: 'Missing required parameters: symbol, scale, datalen' });
      return;
    }

    fetchSinaKLine(symbol, scale, datalen)
      .then((data) => sendJson(res, 200, data))
      .catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }

  serveStatic(requestUrl.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
