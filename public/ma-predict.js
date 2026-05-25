import { fetchIndexHistory, fetchRealtimeQuote } from './tencentDataSource.js';

const MA_INDEXES = {
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

const DEFAULT_SYMBOL = 'sh000300';
const PERIODS = [5, 10];

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let predictPayload = {};
let currentSymbol = null;

function formatNumber(value) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }
  return numberFormatter.format(value);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function pct(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return `${formatNumber(value)}%`;
}

function trendLabel(change) {
  if (change > 0) {
    return '向上';
  }
  if (change < 0) {
    return '向下';
  }
  return '走平';
}

function trendColor(change) {
  if (change > 0) {
    return '#34d399';
  }
  if (change < 0) {
    return '#ff5f57';
  }
  return '#d8e6ff';
}

function buildPrediction(rows, quote) {
  const closes = rows
    .map((row) => row.close)
    .filter((value) => Number.isFinite(value));
  const latest = rows[rows.length - 1];

  if (!latest || closes.length < 10) {
    throw new Error('历史收盘价不足，无法计算 MA5/MA10。');
  }

  const periods = PERIODS.map((period) => {
    const todayMa = average(closes.slice(-period));
    const forecastMa = average([...closes.slice(-(period - 1)), quote.price]);
    const turningPrice = closes[closes.length - period];
    const change = forecastMa - todayMa;

    return {
      period,
      todayMa: round(todayMa),
      forecastMa: round(forecastMa),
      change: round(change, 4),
      gapPct: ((quote.price - todayMa) / quote.price) * 100,
      turningPrice,
      trend: trendLabel(change)
    };
  });

  return {
    latest,
    quote,
    periods,
    changePct: (quote.price / latest.close - 1) * 100
  };
}

function renderSwitcher(defaultSymbol, payload) {
  const switcher = document.getElementById('ma-switcher');
  switcher.innerHTML = '';

  Object.entries(payload).forEach(([symbol, indexData]) => {
    const ma5 = indexData.prediction.periods.find((item) => item.period === 5);
    const ma10 = indexData.prediction.periods.find((item) => item.period === 10);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `index-pill${symbol === defaultSymbol ? ' active' : ''}`;
    button.dataset.symbol = symbol;
    button.innerHTML = `
      <strong>${indexData.meta.name}</strong>
      <span>MA5 ${formatNumber(ma5.forecastMa)} / MA10 ${formatNumber(ma10.forecastMa)}</span>
    `;
    button.addEventListener('click', () => showIndex(symbol));
    switcher.appendChild(button);
  });
}

function updateActivePill(symbol) {
  document.querySelectorAll('.index-pill').forEach((button) => {
    button.classList.toggle('active', button.dataset.symbol === symbol);
  });
}

function renderPredictionTable(periods) {
  const tableBody = document.getElementById('predict-list');
  tableBody.innerHTML = '';

  periods.forEach((item) => {
    const color = trendColor(item.change);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>MA${item.period}</td>
      <td>${formatNumber(item.forecastMa)}</td>
      <td style="color:${trendColor(item.gapPct)}">${pct(item.gapPct)}</td>
      <td>${formatNumber(item.todayMa)}</td>
      <td style="color:${color}">${formatNumber(item.change)}</td>
      <td style="color:${color}">${item.trend}</td>
      <td>${formatNumber(item.turningPrice)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function showIndex(symbol) {
  const selected = predictPayload[symbol];
  if (!selected) {
    return;
  }

  currentSymbol = symbol;
  updateActivePill(symbol);

  const { meta, prediction } = selected;
  const { latest, quote, periods, changePct } = prediction;
  const ma5 = periods.find((item) => item.period === 5);
  const ma10 = periods.find((item) => item.period === 10);
  const color = trendColor(ma10.change);
  const progress = Math.max(0, Math.min(100, changePct + 50));
  const quoteTime = [quote.date, quote.time].filter(Boolean).join(' ') || '实时行情';

  document.getElementById('error').hidden = true;
  setText('page-title', `${meta.name}明日均线`);
  setText('badge-symbol', `Tencent 数据源 / ${meta.name} / 实时价代入`);
  setText('intro-text', `假设${meta.name}下一交易日收盘价等于当前实时价，预演明日 MA5 和 MA10。`);
  setText('assumed-close', formatNumber(quote.price));
  setText('quote-status', `MA10 ${ma10.trend}`);
  document.getElementById('quote-status').style.color = color;
  document.documentElement.style.setProperty('--score-accent', color);
  document.documentElement.style.setProperty('--score-progress', `${progress}%`);
  setText('quote-time', quoteTime);
  setText('latest-date', latest.date);
  setText('latest-close', formatNumber(latest.close));
  setText('realtime-change', pct(changePct));
  document.getElementById('realtime-change').style.color = trendColor(changePct);
  setText('ma5-value', formatNumber(ma5.forecastMa));
  setText('ma5-note', `${ma5.trend}，变化 ${formatNumber(ma5.change)}`);
  setText('ma10-value', formatNumber(ma10.forecastMa));
  setText('ma10-note', `${ma10.trend}，变化 ${formatNumber(ma10.change)}`);
  setText('ma5-gap', pct(ma5.gapPct));
  document.getElementById('ma5-gap').style.color = trendColor(ma5.gapPct);
  setText('ma10-gap', pct(ma10.gapPct));
  document.getElementById('ma10-gap').style.color = trendColor(ma10.gapPct);
  setText('chart-heading', `${meta.name}明日 5/10 日线预测`);
  setText('range-label', `历史最新：${latest.date}`);
  document.title = `${meta.name} 明日均线预测`;

  renderPredictionTable(periods);
}

async function loadIndex(symbol, name) {
  const [rows, quote] = await Promise.all([
    fetchIndexHistory(symbol),
    fetchRealtimeQuote(symbol)
  ]);
  const prediction = buildPrediction(rows, quote);

  return [symbol, {
    meta: { symbol, name },
    prediction
  }];
}

async function init() {
  const errorBox = document.getElementById('error');

  try {
    predictPayload = {};
    const results = await Promise.allSettled(
      Object.entries(MA_INDEXES).map(([symbol, name]) => loadIndex(symbol, name))
    );
    const warnings = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const [symbol, payload] = result.value;
        predictPayload[symbol] = payload;
        return;
      }
      warnings.push(result.reason.message);
    });

    const defaultSymbol = predictPayload[DEFAULT_SYMBOL] ? DEFAULT_SYMBOL : Object.keys(predictPayload)[0];
    if (!defaultSymbol) {
      throw new Error(warnings.join('；') || '没有可用的明日均线预测数据。');
    }

    if (warnings.length) {
      errorBox.hidden = false;
      errorBox.textContent = `部分数据加载失败：${warnings.join('；')}`;
    }

    renderSwitcher(defaultSymbol, predictPayload);
    showIndex(defaultSymbol);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  }
}

export { init };
