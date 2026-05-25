import { fetchIndexHistory } from './tencentDataSource.js';

const MA_INDEXES = {
  sh000300: '沪深300',
  sh000905: '中证500',
  sh000688: '科创50',
  sh000852: '中证1000',
  sh513160: '港股科技ETF',
  sh518880: '黄金ETF',
  sz159941: '纳指ETF'
};

const DEFAULT_SYMBOL = 'sh000300';
const START_DATE = '2025-01-01';
const DEFAULT_MA_PERIOD = 10;
const INITIAL_CASH = 1000000;

let strategy = {
  period: DEFAULT_MA_PERIOD,
  lineLabel: '十日线'
};

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let chartInstance = null;
let maPayload = {};
let currentSymbol = null;
let currentStartDate = START_DATE;
let currentEndDate = null;

function formatNumber(value) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }
  return numberFormatter.format(value);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function round(value, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateMa(rows, period = strategy.period) {
  return rows.map((row, index) => {
    if (index + 1 < period) {
      return {
        ...row,
        ma: null,
        gapPct: null,
        signal: null
      };
    }

    const closes = rows.slice(index + 1 - period, index + 1).map((item) => item.close);
    const ma = average(closes);
    const previous = index > 0 ? rows[index - 1] : null;
    const previousCloses = index >= period
      ? rows.slice(index - period, index).map((item) => item.close)
      : [];
    const previousMa = previousCloses.length === period ? average(previousCloses) : null;
    const signal =
      previous && previousMa !== null && previous.close <= previousMa && row.close > ma
        ? 'buy'
        : previous && previousMa !== null && previous.close >= previousMa && row.close < ma
          ? 'sell'
          : null;

    return {
      ...row,
      ma: round(ma),
      gapPct: round((row.close / ma - 1) * 100),
      signal
    };
  });
}

function maZone(row) {
  if (!row || row.ma === null || row.gapPct === null) {
    return '暂无数据';
  }
  if (row.close > row.ma) {
    return `收盘价在${strategy.lineLabel}上方`;
  }
  if (row.close < row.ma) {
    return `收盘价在${strategy.lineLabel}下方`;
  }
  return `收盘价贴近${strategy.lineLabel}`;
}

function maColor(row) {
  if (!row || row.ma === null) {
    return '#d8e6ff';
  }
  if (row.close > row.ma) {
    return '#34d399';
  }
  if (row.close < row.ma) {
    return '#ff5f57';
  }
  return '#d8e6ff';
}

function shouldBuy(row) {
  return row.ma !== null && row.close > row.ma;
}

function shouldSell(row) {
  return row.ma !== null && row.close < row.ma;
}

function buildTradeSignals(rows) {
  let holding = rows.length > 0;
  const startSignals = rows.length
    ? [{
      name: '区间起始买入',
      value: '买入',
      coord: [rows[0].date, rows[0].close],
      symbol: 'circle',
      symbolSize: 12,
      itemStyle: {
        color: '#34d399',
        borderColor: '#d8fff2',
        borderWidth: 2
      },
      label: { show: false }
    }]
    : [];

  return startSignals.concat(rows.slice(1).flatMap((row) => {
    if (shouldBuy(row) && !holding) {
      holding = true;
      return [{
        name: '买入',
        value: '买入',
        coord: [row.date, row.close],
        symbol: 'circle',
        symbolSize: 12,
        itemStyle: {
          color: '#34d399',
          borderColor: '#d8fff2',
          borderWidth: 2
        },
        label: { show: false }
      }];
    }

    if (shouldSell(row) && holding) {
      holding = false;
      return [{
        name: '卖出',
        value: '卖出',
        coord: [row.date, row.close],
        symbol: 'circle',
        symbolSize: 12,
        itemStyle: {
          color: '#ff5f57',
          borderColor: '#ffe2dc',
          borderWidth: 2
        },
        label: { show: false }
      }];
    }

    return [];
  }));
}

function buildTradeRecords(rows) {
  if (!rows.length) {
    return [];
  }

  let holdingTrade = rows[0];

  return [{
    date: rows[0].date,
    action: '买入',
    close: rows[0].close,
    ma: rows[0].ma,
    gapPct: rows[0].gapPct,
    profitPct: null,
    holdingDays: null
  }].concat(rows.slice(1).flatMap((row) => {
    if (shouldBuy(row) && holdingTrade === null) {
      holdingTrade = row;
      return [{
        date: row.date,
        action: '买入',
        close: row.close,
        ma: row.ma,
        gapPct: row.gapPct,
        profitPct: null,
        holdingDays: null
      }];
    }

    if (shouldSell(row) && holdingTrade !== null) {
      const buyRow = holdingTrade;
      holdingTrade = null;
      return [{
        date: row.date,
        action: '卖出',
        close: row.close,
        ma: row.ma,
        gapPct: row.gapPct,
        profitPct: (row.close / buyRow.close - 1) * 100,
        holdingDays: Math.round((new Date(`${row.date}T00:00:00Z`) - new Date(`${buyRow.date}T00:00:00Z`)) / 86400000)
      }];
    }

    return [];
  }));
}

function backtest(rows, initialCash = INITIAL_CASH) {
  if (!rows.length) {
    return {
      finalValue: initialCash,
      profit: 0,
      returnPct: 0,
      holding: false,
      operationCount: 0,
      winRatePct: null
    };
  }

  let cash = 0;
  let shares = initialCash / rows[0].close;
  let holding = true;
  let buyPrice = rows[0].close;
  let operationCount = 1;
  let completedTrades = 0;
  let winningTrades = 0;

  rows.slice(1).forEach((row) => {
    if (shouldBuy(row) && !holding) {
      shares = cash / row.close;
      cash = 0;
      holding = true;
      buyPrice = row.close;
      operationCount += 1;
      return;
    }

    if (shouldSell(row) && holding) {
      cash = shares * row.close;
      shares = 0;
      holding = false;
      operationCount += 1;
      completedTrades += 1;
      if (buyPrice !== null && row.close > buyPrice) {
        winningTrades += 1;
      }
      buyPrice = null;
    }
  });

  const latest = rows[rows.length - 1];
  const finalValue = latest ? cash + shares * latest.close : initialCash;
  const winRatePct = completedTrades ? (winningTrades / completedTrades) * 100 : null;

  return {
    finalValue,
    profit: finalValue - initialCash,
    returnPct: (finalValue / initialCash - 1) * 100,
    holding,
    operationCount,
    winRatePct
  };
}

function renderBacktestSummary(rows) {
  const result = backtest(rows);
  const profitClass = result.profit >= 0 ? 'positive' : 'negative';

  setText('initial-cash', formatNumber(INITIAL_CASH));
  setText('final-value', formatNumber(result.finalValue));
  setText('total-profit', formatNumber(result.profit));
  setText('total-return', `${formatNumber(result.returnPct)}%`);
  setText('operation-count', `${result.operationCount} 次`);
  setText('win-rate', result.winRatePct === null ? '--' : `${formatNumber(result.winRatePct)}%`);
  setText('position-status', result.holding ? '持仓中' : '空仓');

  document.getElementById('total-profit').className = profitClass;
  document.getElementById('total-return').className = profitClass;
}

function renderTradeTable(rows) {
  const tableBody = document.getElementById('trade-list');
  const emptyText = document.getElementById('trade-empty');
  const records = buildTradeRecords(rows);

  tableBody.innerHTML = '';
  emptyText.hidden = records.length > 0;

  records.forEach((record) => {
    const tr = document.createElement('tr');
    const isBuy = record.action === '买入';
    const profitClass =
      record.profitPct === null
        ? ''
        : record.profitPct >= 0
          ? 'positive'
          : 'negative';

    tr.innerHTML = `
      <td>${record.date}</td>
      <td><span class="trade-badge ${isBuy ? 'buy' : 'sell'}">${record.action}</span></td>
      <td>${formatNumber(record.close)}</td>
      <td>${formatNumber(record.ma)}</td>
      <td>${formatNumber(record.gapPct)}%</td>
      <td class="${profitClass}">${record.profitPct === null ? '--' : `${formatNumber(record.profitPct)}%`}</td>
      <td>${record.holdingDays === null ? '--' : `${record.holdingDays} 天`}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function buildOption(rows, period, meta) {
  const dates = rows.map((row) => row.date);
  const closes = rows.map((row) => row.close);
  const maValues = rows.map((row) => row.ma);
  const tradeSignals = buildTradeSignals(rows);
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8ea6cb';
  const priceColor = getComputedStyle(document.documentElement).getPropertyValue('--price').trim() || '#73a8ff';
  const maLineColor = '#ffbe72';
  const axisColor = 'rgba(152, 189, 255, 0.26)';
  const splitColor = 'rgba(152, 189, 255, 0.12)';

  return {
    animation: true,
    backgroundColor: 'transparent',
    color: [priceColor, maLineColor],
    grid: { left: 70, right: 70, top: 52, bottom: 74 },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: { backgroundColor: '#3d4854' }
      },
      backgroundColor: 'rgba(30, 35, 41, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fdf8f1' },
      formatter(params) {
        const row = rows[params[0].dataIndex];
        const signals = tradeSignals
          .filter((signal) => signal.coord[0] === row.date)
          .map((signal) => signal.value);
        return [
          `<div style="margin-bottom:6px;font-weight:600;">${row.date}</div>`,
          `${params[0].marker} ${meta.name}收盘价: ${formatNumber(row.close)}`,
          `${params[1].marker} MA${period}: ${formatNumber(row.ma)}`,
          `偏离幅度: ${formatNumber(row.gapPct)}%`,
          signals.length ? `<div style="margin:6px 0 4px;color:#ffd7a8;">交易信号: ${signals.join(' / ')}</div>` : ''
        ].filter(Boolean).join('<br>');
      }
    },
    toolbox: {
      right: 18,
      top: 10,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
        saveAsImage: { name: `${meta.symbol}-ma${period}-${START_DATE}` }
      },
      iconStyle: { borderColor: mutedColor }
    },
    legend: {
      top: 12,
      left: 22,
      textStyle: { color: mutedColor },
      data: [meta.name, `MA${period}`]
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: mutedColor, hideOverlap: true },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: mutedColor,
        formatter(value) {
          return value.toFixed(0);
        }
      },
      splitLine: { lineStyle: { color: splitColor, type: 'dashed' } }
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        height: 24,
        bottom: 18,
        borderColor: 'rgba(152, 189, 255, 0.18)',
        backgroundColor: 'rgba(7, 17, 33, 0.92)',
        fillerColor: 'rgba(115, 168, 255, 0.18)',
        handleStyle: { color: '#8ec5ff' }
      }
    ],
    series: [
      {
        name: meta.name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: priceColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(115, 168, 255, 0.24)' },
            { offset: 1, color: 'rgba(115, 168, 255, 0.02)' }
          ])
        },
        data: closes,
        markPoint: {
          data: tradeSignals
        }
      },
      {
        name: `MA${period}`,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: maLineColor },
        data: maValues
      }
    ]
  };
}

function renderChart(rows, period, meta) {
  const chartDom = document.getElementById('chart');
  if (!chartInstance) {
    chartInstance = echarts.init(chartDom, null, { renderer: 'canvas' });
    window.addEventListener('resize', () => chartInstance && chartInstance.resize());
  }

  chartInstance.setOption(buildOption(rows, period, meta), true);
}

function renderSwitcher(defaultSymbol, payload) {
  const switcher = document.getElementById('ma-switcher');
  switcher.innerHTML = '';

  Object.entries(payload).forEach(([symbol, indexData]) => {
    const latest = indexData.latest;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `index-pill${symbol === defaultSymbol ? ' active' : ''}`;
    button.dataset.symbol = symbol;
    button.innerHTML = `
      <strong>${indexData.meta.name}</strong>
      <span>MA${strategy.period} ${formatNumber(latest.ma)} / ${formatNumber(latest.gapPct)}%</span>
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

function showIndex(symbol) {
  const selected = maPayload[symbol];
  if (!selected) {
    return;
  }

  currentSymbol = symbol;
  updateActivePill(symbol);

  const rows = selected.data.filter((row) => {
    const afterStart = !currentStartDate || row.date >= currentStartDate;
    const beforeEnd = !currentEndDate || row.date <= currentEndDate;
    return afterStart && beforeEnd;
  });
  const validRows = rows.filter((row) => row.ma !== null);
  const latest = validRows[validRows.length - 1];
  const meta = selected.meta;

  if (!rows.length || !latest) {
    document.getElementById('error').hidden = false;
    document.getElementById('error').textContent = `当前日期范围没有可用的${strategy.lineLabel}数据。`;
    return;
  }

  const color = maColor(latest);
  const progress = Math.max(0, Math.min(100, latest.gapPct + 50));

  document.getElementById('error').hidden = true;
  setText('page-title', `${meta.name}${strategy.lineLabel}`);
  setText('badge-symbol', `Tencent 数据源 / ${meta.name} / MA${strategy.period}`);
  setText('intro-text', `按自定义日期区间展示${meta.name}${strategy.lineLabel}策略。规则为收盘价上穿 MA${strategy.period} 买入，收盘价下穿 MA${strategy.period} 卖出。`);
  setText('ma-gap', `${formatNumber(latest.gapPct)}%`);
  setText('ma-zone', maZone(latest));
  document.getElementById('ma-zone').style.color = color;
  document.documentElement.style.setProperty('--score-accent', color);
  document.documentElement.style.setProperty('--score-progress', `${progress}%`);
  setText('latest-close', formatNumber(latest.close));
  setText('latest-date', latest.date);
  setText('period-value', `${strategy.period} 日`);
  setText('ma-value', formatNumber(latest.ma));
  setText('gap-value', `${formatNumber(latest.gapPct)}%`);
  setText('range-label', `${rows[0].date} 到 ${rows[rows.length - 1].date}`);
  setText('point-count', `${validRows.length} 个交易日`);
  setText('chart-heading', `2025 年以来 ${meta.name} ${strategy.lineLabel}走势`);
  setText('chart-subtitle', `展示${meta.name}收盘价、MA${strategy.period} 和上穿/下穿交易点；支持拖动缩放、悬停查看每日明细。`);
  setText('legend-price', `${meta.name}收盘价`);
  document.title = `${meta.name} ${strategy.lineLabel}策略`;

  renderTradeTable(rows);
  renderBacktestSummary(rows);
  renderChart(rows, strategy.period, meta);
}

async function loadIndex(symbol, name) {
  const rows = await fetchIndexHistory(symbol);
  const maRows = calculateMa(rows, strategy.period);
  const validRows = maRows.filter((row) => row.ma !== null);
  const latest = validRows[validRows.length - 1];

  if (!latest) {
    throw new Error(`${name} 没有可用的${strategy.lineLabel}数据。`);
  }

  return [symbol, {
    latest,
    meta: { symbol, name },
    data: maRows,
    validCount: validRows.length
  }];
}

function initDateControls(maxDate) {
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  const applyButton = document.getElementById('apply-date-range');
  const resetButton = document.getElementById('reset-date-range');

  currentStartDate = START_DATE;
  currentEndDate = maxDate;
  startInput.value = currentStartDate;
  endInput.value = currentEndDate;
  startInput.max = maxDate;
  endInput.max = maxDate;

  applyButton.addEventListener('click', () => {
    if (startInput.value && endInput.value && startInput.value > endInput.value) {
      document.getElementById('error').hidden = false;
      document.getElementById('error').textContent = '开始日期不能晚于结束日期。';
      return;
    }

    currentStartDate = startInput.value || START_DATE;
    currentEndDate = endInput.value || maxDate;
    showIndex(currentSymbol || DEFAULT_SYMBOL);
  });

  resetButton.addEventListener('click', () => {
    currentStartDate = START_DATE;
    currentEndDate = maxDate;
    startInput.value = currentStartDate;
    endInput.value = currentEndDate;
    showIndex(currentSymbol || DEFAULT_SYMBOL);
  });
}

async function initInternal() {
  chartInstance = null;
  maPayload = {};
  currentSymbol = null;
  const errorBox = document.getElementById('error');

  try {
    const results = await Promise.allSettled(
      Object.entries(MA_INDEXES).map(([symbol, name]) => loadIndex(symbol, name))
    );
    const warnings = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const [symbol, payload] = result.value;
        maPayload[symbol] = payload;
        return;
      }
      warnings.push(result.reason.message);
    });

    const defaultSymbol = maPayload[DEFAULT_SYMBOL] ? DEFAULT_SYMBOL : Object.keys(maPayload)[0];
    if (!defaultSymbol) {
      throw new Error(warnings.join('; ') || `没有可用的${strategy.lineLabel}数据。`);
    }

    if (warnings.length) {
      errorBox.hidden = false;
      errorBox.textContent = `部分数据加载失败：${warnings.join('；')}`;
    }

    const maxDate = Object.values(maPayload)
      .map((payload) => payload.data[payload.data.length - 1].date)
      .sort()
      .pop();

    initDateControls(maxDate);
    renderSwitcher(defaultSymbol, maPayload);
    showIndex(defaultSymbol);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  }
}

function initMaStrategy(config = {}) {
  strategy = {
    period: config.period || DEFAULT_MA_PERIOD,
    lineLabel: config.lineLabel || '十日线'
  };
  return initInternal();
}

function init() {
  return initMaStrategy();
}

export { init, initMaStrategy };
