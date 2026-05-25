const https = require('https');

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

const HISTORY_START_DATE = '2022-01-01';
const HISTORY_LIMIT = 2000;

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 Node FearGreed Demo',
            Accept: 'application/json,text/plain,*/*'
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Tencent API responded with ${res.statusCode}`));
            res.resume();
            return;
          }

          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch (error) {
              reject(new Error(`Failed to parse Tencent API payload: ${error.message}`));
            }
          });
        }
      )
      .on('error', (error) => reject(error));
  });
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchIndexHistory(symbol) {
  if (!INDEXES[symbol]) {
    throw new Error(`Unsupported index symbol: ${symbol}`);
  }

  const apiUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${HISTORY_LIMIT},qfq`;
  const payload = await httpsGetJson(apiUrl);
  const root = payload && payload.data && payload.data[symbol];
  const rows =
    root && Array.isArray(root.day)
      ? root.day
      : root && Array.isArray(root.qfqday)
        ? root.qfqday
        : null;

  if (!rows || rows.length === 0) {
    throw new Error(`Tencent API did not return daily data for ${symbol}.`);
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

module.exports = {
  INDEXES,
  fetchIndexHistory
};
