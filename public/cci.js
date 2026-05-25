import { fetchIndexHistory } from './tencentDataSource.js';

const CCI_INDEXES = {
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
const DEFAULT_PERIOD = 14;
const BUY_THRESHOLD = 70;
const SELL_THRESHOLD = 100;
const INITIAL_CASH = 1000000;

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let chartInstance = null;
let cciPayload = {};
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

function calculateCci(rows, period = DEFAULT_PERIOD) {
  const typicalPrices = rows.map((row) => (row.high + row.low + row.close) / 3);

  return rows.map((row, index) => {
    if (index + 1 < period) {
      return {
        ...row,
        typicalPrice: round(typicalPrices[index]),
        tpMa: null,
        meanDeviation: null,
        cci: null
      };
    }

    const windowPrices = typicalPrices.slice(index + 1 - period, index + 1);
    const tpMa = average(windowPrices);
    const meanDeviation = average(windowPrices.map((value) => Math.abs(value - tpMa)));
    const cci = meanDeviation === 0 ? null : (typicalPrices[index] - tpMa) / (0.015 * meanDeviation);

    return {
      ...row,
      typicalPrice: round(typicalPrices[index]),
      tpMa: round(tpMa),
      meanDeviation: round(meanDeviation, 4),
      cci: cci === null ? null : round(cci)
    };
  });
}

function cciZone(value) {
  if (value === null || !Number.isFinite(value)) {
    return '暂无数据';
  }
  if (value >= BUY_THRESHOLD) {
    return '强势区';
  }
  if (value <= -100) {
    return '弱势区';
  }
  return '常态区';
}

function cciColor(value) {
  if (value >= BUY_THRESHOLD) {
    return '#ff9468';
  }
  if (value <= -100) {
    return '#77b7ff';
  }
  return '#d8e6ff';
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
    if (row.cci === null) {
      return [];
    }

    if (row.cci > BUY_THRESHOLD && !holding) {
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

    if (row.cci < SELL_THRESHOLD && holding) {
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
    cci: rows[0].cci,
    profitPct: null,
    holdingDays: null
  }].concat(rows.slice(1).flatMap((row) => {
    if (row.cci === null) {
      return [];
    }

    if (row.cci > BUY_THRESHOLD && holdingTrade === null) {
      holdingTrade = row;
      return [{
        date: row.date,
        action: '买入',
        close: row.close,
        cci: row.cci,
        profitPct: null,
        holdingDays: null
      }];
    }

    if (row.cci < SELL_THRESHOLD && holdingTrade !== null) {
      const buyRow = holdingTrade;
      holdingTrade = null;
      return [{
        date: row.date,
        action: '卖出',
        close: row.close,
        cci: row.cci,
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
    if (row.cci === null) {
      return;
    }

    if (row.cci > BUY_THRESHOLD && !holding) {
      shares = cash / row.close;
      cash = 0;
      holding = true;
      buyPrice = row.close;
      operationCount += 1;
      return;
    }

    if (row.cci < SELL_THRESHOLD && holding) {
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
      <td>${formatNumber(record.cci)}</td>
      <td class="${profitClass}">${record.profitPct === null ? '--' : `${formatNumber(record.profitPct)}%`}</td>
      <td>${record.holdingDays === null ? '--' : `${record.holdingDays} 天`}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function buildOption(rows, period, meta) {
  const dates = rows.map((row) => row.date);
  const closes = rows.map((row) => row.close);
  const cciValues = rows.map((row) => row.cci);
  const tradeSignals = buildTradeSignals(rows);
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8ea6cb';
  const priceColor = getComputedStyle(document.documentElement).getPropertyValue('--price').trim() || '#73a8ff';
  const cciLineColor = '#ffbe72';
  const axisColor = 'rgba(152, 189, 255, 0.26)';
  const splitColor = 'rgba(152, 189, 255, 0.12)';

  return {
    animation: true,
    backgroundColor: 'transparent',
    color: [priceColor, cciLineColor],
    grid: [
      { left: 70, right: 70, top: 48, height: 240 },
      { left: 70, right: 70, top: 356, height: 180 }
    ],
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
          `${params[1].marker} CCI${period}: ${formatNumber(row.cci)}`,
          signals.length ? `<div style="margin:6px 0 4px;color:#ffd7a8;">交易信号: ${signals.join(' / ')}</div>` : '',
          `典型价格 TP: ${formatNumber(row.typicalPrice)}`,
          `${period}日 TP 均值: ${formatNumber(row.tpMa)}`,
          `平均绝对偏差: ${formatNumber(row.meanDeviation)}`
        ].filter(Boolean).join('<br>');
      }
    },
    axisPointer: {
      link: [{ xAxisIndex: [0, 1] }]
    },
    toolbox: {
      right: 18,
      top: 10,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
        saveAsImage: { name: `${meta.symbol}-cci-${START_DATE}` }
      },
      iconStyle: { borderColor: mutedColor }
    },
    legend: {
      top: 10,
      left: 22,
      textStyle: { color: mutedColor },
      data: [meta.name, `CCI${period}`]
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        data: dates,
        gridIndex: 0,
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: mutedColor, show: false },
        splitLine: { show: false }
      },
      {
        type: 'category',
        boundaryGap: false,
        data: dates,
        gridIndex: 1,
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: mutedColor, hideOverlap: true },
        splitLine: { show: false }
      }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        scale: true,
        axisLabel: {
          color: mutedColor,
          formatter(value) {
            return value.toFixed(0);
          }
        },
        splitLine: { lineStyle: { color: splitColor, type: 'dashed' } }
      },
      {
        type: 'value',
        gridIndex: 1,
        scale: true,
        axisLabel: { color: mutedColor },
        splitLine: { lineStyle: { color: splitColor, type: 'dashed' } }
      }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
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
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: priceColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(115, 168, 255, 0.28)' },
            { offset: 1, color: 'rgba(115, 168, 255, 0.02)' }
          ])
        },
        data: closes,
        markPoint: {
          data: tradeSignals
        }
      },
      {
        name: `CCI${period}`,
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: cciLineColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 190, 114, 0.22)' },
            { offset: 1, color: 'rgba(255, 190, 114, 0.02)' }
          ])
        },
        markLine: {
          symbol: 'none',
          label: { color: mutedColor },
          lineStyle: { color: 'rgba(152, 189, 255, 0.36)', type: 'dashed' },
          data: [{ yAxis: SELL_THRESHOLD, name: `+${SELL_THRESHOLD}` }, { yAxis: BUY_THRESHOLD, name: `+${BUY_THRESHOLD}` }, { yAxis: 0, name: '0' }, { yAxis: -100, name: '-100' }]
        },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.68 },
          data: [
            [{ yAxis: BUY_THRESHOLD, itemStyle: { color: 'rgba(255, 148, 104, 0.15)' } }, { yAxis: 1000 }],
            [{ yAxis: -1000, itemStyle: { color: 'rgba(119, 183, 255, 0.15)' } }, { yAxis: -100 }]
          ]
        },
        data: cciValues
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
  const switcher = document.getElementById('cci-switcher');
  switcher.innerHTML = '';

  Object.entries(payload).forEach(([symbol, indexData]) => {
    const latest = indexData.latest;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `index-pill${symbol === defaultSymbol ? ' active' : ''}`;
    button.dataset.symbol = symbol;
    button.innerHTML = `
      <strong>${indexData.meta.name}</strong>
      <span>CCI14 ${formatNumber(latest.cci)} / ${cciZone(latest.cci)}</span>
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
  const selected = cciPayload[symbol];
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
  const validRows = rows.filter((row) => row.cci !== null);
  const latest = validRows[validRows.length - 1];
  const meta = selected.meta;

  if (!rows.length || !latest) {
    document.getElementById('error').hidden = false;
    document.getElementById('error').textContent = '当前日期范围没有可用的 CCI 数据。';
    return;
  }

  document.getElementById('error').hidden = true;
  setText('page-title', `${meta.name} CCI`);
  setText('badge-symbol', `Tencent 数据源 / ${meta.name} / CCI14`);
  setText('intro-text', `按自定义日期区间展示${meta.name} CCI。计算公式为 TP = (High + Low + Close) / 3，CCI = (TP - TP 的 14 日均值) / (0.015 × 14 日平均绝对偏差)。`);
  setText('cci-value', formatNumber(latest.cci));
  setText('cci-zone', cciZone(latest.cci));
  document.getElementById('cci-zone').style.color = cciColor(latest.cci);
  document.documentElement.style.setProperty('--score-accent', cciColor(latest.cci));
  document.documentElement.style.setProperty('--score-progress', `${Math.max(0, Math.min(100, (latest.cci + 200) / 4))}%`);
  setText('latest-close', formatNumber(latest.close));
  setText('latest-date', latest.date);
  setText('period-value', `${DEFAULT_PERIOD} 日`);
  setText('tp-value', formatNumber(latest.typicalPrice));
  setText('ma-value', formatNumber(latest.tpMa));
  setText('md-value', formatNumber(latest.meanDeviation));
  setText('range-label', `${rows[0].date} 到 ${rows[rows.length - 1].date}`);
  setText('point-count', `${validRows.length} 个交易日`);
  setText('chart-heading', `2025 年以来 ${meta.name} CCI 走势`);
  setText('chart-subtitle', `上方为${meta.name}收盘价，下方为 CCI14；支持拖动缩放、悬停查看每日计算明细。`);
  setText('legend-price', `${meta.name}收盘价`);
  document.title = `${meta.name} CCI 计算`;

  renderTradeTable(rows);
  renderBacktestSummary(rows);
  renderChart(rows, DEFAULT_PERIOD, meta);
}

async function loadIndex(symbol, name) {
  const rows = await fetchIndexHistory(symbol);
  const cciRows = calculateCci(rows, DEFAULT_PERIOD);
  const validRows = cciRows.filter((row) => row.cci !== null);
  const latest = validRows[validRows.length - 1];

  if (!latest) {
    throw new Error(`${name} 没有可用的 CCI 数据。`);
  }

  return [symbol, {
    latest,
    meta: { symbol, name },
    data: cciRows,
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

async function init() {
  chartInstance = null;
  const errorBox = document.getElementById('error');

  try {
    const results = await Promise.allSettled(
      Object.entries(CCI_INDEXES).map(([symbol, name]) => loadIndex(symbol, name))
    );
    const warnings = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const [symbol, payload] = result.value;
        cciPayload[symbol] = payload;
        return;
      }
      warnings.push(result.reason.message);
    });

    const defaultSymbol = cciPayload[DEFAULT_SYMBOL] ? DEFAULT_SYMBOL : Object.keys(cciPayload)[0];
    if (!defaultSymbol) {
      throw new Error(warnings.join('; ') || '没有可用的 CCI 数据。');
    }

    if (warnings.length) {
      errorBox.hidden = false;
      errorBox.textContent = `部分数据加载失败：${warnings.join('；')}`;
    }

    const maxDate = Object.values(cciPayload)
      .map((payload) => payload.data[payload.data.length - 1].date)
      .sort()
      .pop();

    initDateControls(maxDate);
    renderSwitcher(defaultSymbol, cciPayload);
    showIndex(defaultSymbol);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  }
}

export { init };

