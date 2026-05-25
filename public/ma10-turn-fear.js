import { computeFearGreedSeries } from './fearGreed.js';
import { fetchIndexHistory } from './tencentDataSource.js';

const STRATEGY_INDEXES = {
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
const MA_PERIOD = 10;
const FEAR_BUY_THRESHOLD = 5;
const GREED_SELL_THRESHOLD = 88;
const INITIAL_CASH = 1000000;

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let chartInstance = null;
let strategyPayload = {};
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

function calculateTurnMa(rows, period = MA_PERIOD) {
  const maValues = rows.map((row, index) => {
    if (index + 1 < period) {
      return null;
    }
    return average(rows.slice(index + 1 - period, index + 1).map((item) => item.close));
  });

  return rows.map((row, index) => {
    const ma = maValues[index];
    const previousMa = index > 0 ? maValues[index - 1] : null;
    const beforePreviousMa = index > 1 ? maValues[index - 2] : null;
    const slope = ma !== null && previousMa !== null ? ma - previousMa : null;
    const previousSlope = previousMa !== null && beforePreviousMa !== null ? previousMa - beforePreviousMa : null;
    const maSignal =
      slope !== null && previousSlope !== null && previousSlope <= 0 && slope > 0
        ? 'buy'
        : slope !== null && previousSlope !== null && previousSlope >= 0 && slope < 0
          ? 'sell'
          : null;

    return {
      ...row,
      ma: ma === null ? null : round(ma),
      slope: slope === null ? null : round(slope, 4),
      maSignal
    };
  });
}

function mergeFearGreed(rows, fearGreedPoints) {
  const fearGreedByDate = new Map(fearGreedPoints.map((row) => [row.date, row]));

  return rows.map((row) => {
    const fearGreedRow = fearGreedByDate.get(row.date);
    const fearGreed = fearGreedRow ? fearGreedRow.fearGreed : null;
    const fearSignal =
      fearGreed !== null && fearGreed < FEAR_BUY_THRESHOLD
        ? 'buy'
        : fearGreed !== null && fearGreed > GREED_SELL_THRESHOLD
          ? 'sell'
          : null;
    const signal = row.maSignal || fearSignal;

    return {
      ...row,
      fearGreed,
      fearSignal,
      signal,
      signalReason: signalReason(row.maSignal, fearSignal)
    };
  });
}

function signalReason(maSignal, fearSignal) {
  if (maSignal && fearSignal && maSignal === fearSignal) {
    return maSignal === 'buy' ? 'MA10拐头向上 + 恐贪极低' : 'MA10拐头向下 + 恐贪极高';
  }
  if (maSignal) {
    return maSignal === 'buy' ? 'MA10拐头向上' : 'MA10拐头向下';
  }
  if (fearSignal) {
    return fearSignal === 'buy' ? `恐贪 < ${FEAR_BUY_THRESHOLD}` : `恐贪 > ${GREED_SELL_THRESHOLD}`;
  }
  return '';
}

function strategyZone(row) {
  if (!row) {
    return '暂无数据';
  }
  if (row.signal === 'buy') {
    return `最新信号: 买入 / ${row.signalReason}`;
  }
  if (row.signal === 'sell') {
    return `最新信号: 卖出 / ${row.signalReason}`;
  }
  if (row.slope > 0) {
    return 'MA10 向上，等待信号';
  }
  if (row.slope < 0) {
    return 'MA10 向下，等待信号';
  }
  return '暂无新信号';
}

function strategyColor(row) {
  if (!row) {
    return '#d8e6ff';
  }
  if (row.signal === 'buy') {
    return '#34d399';
  }
  if (row.signal === 'sell') {
    return '#ff5f57';
  }
  if (row.fearGreed !== null && row.fearGreed < FEAR_BUY_THRESHOLD) {
    return '#77b7ff';
  }
  if (row.fearGreed !== null && row.fearGreed > GREED_SELL_THRESHOLD) {
    return '#ff9468';
  }
  return '#d8e6ff';
}

function shouldBuy(row) {
  return (row.slope !== null && row.slope > 0) || (row.fearGreed !== null && row.fearGreed < FEAR_BUY_THRESHOLD);
}

function shouldSell(row) {
  return (row.slope !== null && row.slope < 0) || (row.fearGreed !== null && row.fearGreed > GREED_SELL_THRESHOLD);
}

function actionReason(row, action) {
  if (row.signal === action && row.signalReason) {
    return row.signalReason;
  }

  if (action === 'buy') {
    if (row.slope !== null && row.slope > 0 && row.fearGreed !== null && row.fearGreed < FEAR_BUY_THRESHOLD) {
      return 'MA10向上 + 恐贪极低';
    }
    if (row.slope !== null && row.slope > 0) {
      return 'MA10向上';
    }
    if (row.fearGreed !== null && row.fearGreed < FEAR_BUY_THRESHOLD) {
      return `恐贪 < ${FEAR_BUY_THRESHOLD}`;
    }
  }

  if (row.slope !== null && row.slope < 0 && row.fearGreed !== null && row.fearGreed > GREED_SELL_THRESHOLD) {
    return 'MA10向下 + 恐贪极高';
  }
  if (row.slope !== null && row.slope < 0) {
    return 'MA10向下';
  }
  if (row.fearGreed !== null && row.fearGreed > GREED_SELL_THRESHOLD) {
    return `恐贪 > ${GREED_SELL_THRESHOLD}`;
  }
  return action === 'buy' ? '买入' : '卖出';
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
        name: actionReason(row, 'buy'),
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
        name: actionReason(row, 'sell'),
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
    slope: rows[0].slope,
    fearGreed: rows[0].fearGreed,
    reason: '区间起始买入',
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
        slope: row.slope,
        fearGreed: row.fearGreed,
        reason: actionReason(row, 'buy'),
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
        slope: row.slope,
        fearGreed: row.fearGreed,
        reason: actionReason(row, 'sell'),
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
      <td>${formatNumber(record.slope)}</td>
      <td>${formatNumber(record.fearGreed)}</td>
      <td>${record.reason}</td>
      <td class="${profitClass}">${record.profitPct === null ? '--' : `${formatNumber(record.profitPct)}%`}</td>
      <td>${record.holdingDays === null ? '--' : `${record.holdingDays} 天`}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function buildOption(rows, meta) {
  const dates = rows.map((row) => row.date);
  const closes = rows.map((row) => row.close);
  const maValues = rows.map((row) => row.ma);
  const fearValues = rows.map((row) => row.fearGreed);
  const tradeSignals = buildTradeSignals(rows);
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8ea6cb';
  const priceColor = getComputedStyle(document.documentElement).getPropertyValue('--price').trim() || '#73a8ff';
  const maLineColor = '#ffbe72';
  const fearColor = '#ff8a57';
  const axisColor = 'rgba(152, 189, 255, 0.26)';
  const splitColor = 'rgba(152, 189, 255, 0.12)';

  return {
    animation: true,
    backgroundColor: 'transparent',
    color: [priceColor, maLineColor, fearColor],
    grid: [
      { left: 70, right: 70, top: 48, height: 240 },
      { left: 70, right: 70, top: 356, height: 160 }
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
        const priceItem = params.find((item) => item.seriesName === meta.name);
        const maItem = params.find((item) => item.seriesName === `MA${MA_PERIOD}`);
        const fearItem = params.find((item) => item.seriesName === '恐贪值');
        const signals = tradeSignals
          .filter((signal) => signal.coord[0] === row.date)
          .map((signal) => `${signal.value}: ${signal.name}`);
        return [
          `<div style="margin-bottom:6px;font-weight:600;">${row.date}</div>`,
          priceItem ? `${priceItem.marker} ${meta.name}收盘价: ${formatNumber(row.close)}` : '',
          maItem ? `${maItem.marker} MA${MA_PERIOD}: ${formatNumber(row.ma)}` : '',
          fearItem ? `${fearItem.marker} 恐贪值: ${formatNumber(row.fearGreed)}` : '',
          `MA10 日变化: ${formatNumber(row.slope)}`,
          signals.length ? `<div style="margin:6px 0 4px;color:#ffd7a8;">交易信号: ${signals.join(' / ')}</div>` : ''
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
        saveAsImage: { name: `${meta.symbol}-ma10-turn-fear-${START_DATE}` }
      },
      iconStyle: { borderColor: mutedColor }
    },
    legend: {
      top: 10,
      left: 22,
      textStyle: { color: mutedColor },
      data: [meta.name, `MA${MA_PERIOD}`, '恐贪值']
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
        min: 0,
        max: 100,
        interval: 25,
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
    visualMap: {
      show: false,
      seriesIndex: 2,
      dimension: 1,
      pieces: [
        { gte: 0, lt: FEAR_BUY_THRESHOLD, color: '#77b7ff' },
        { gte: FEAR_BUY_THRESHOLD, lte: GREED_SELL_THRESHOLD, color: fearColor },
        { gt: GREED_SELL_THRESHOLD, lte: 100, color: '#ff9468' }
      ]
    },
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
        name: `MA${MA_PERIOD}`,
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: maLineColor },
        data: maValues
      },
      {
        name: '恐贪值',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3, color: fearColor },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 138, 87, 0.22)' },
            { offset: 1, color: 'rgba(255, 138, 87, 0.03)' }
          ])
        },
        markLine: {
          symbol: 'none',
          label: { color: mutedColor },
          lineStyle: { color: 'rgba(152, 189, 255, 0.36)', type: 'dashed' },
          data: [
            { yAxis: FEAR_BUY_THRESHOLD, name: `买入阈值 ${FEAR_BUY_THRESHOLD}` },
            { yAxis: GREED_SELL_THRESHOLD, name: `卖出阈值 ${GREED_SELL_THRESHOLD}` }
          ]
        },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.72 },
          data: [
            [{ yAxis: 0, itemStyle: { color: 'rgba(119, 183, 255, 0.14)' } }, { yAxis: FEAR_BUY_THRESHOLD }],
            [{ yAxis: GREED_SELL_THRESHOLD, itemStyle: { color: 'rgba(255, 148, 104, 0.14)' } }, { yAxis: 100 }]
          ]
        },
        data: fearValues
      }
    ]
  };
}

function renderChart(rows, meta) {
  const chartDom = document.getElementById('chart');
  if (!chartInstance) {
    chartInstance = echarts.init(chartDom, null, { renderer: 'canvas' });
    window.addEventListener('resize', () => chartInstance && chartInstance.resize());
  }

  chartInstance.setOption(buildOption(rows, meta), true);
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
      <span>FG ${formatNumber(latest.fearGreed)} / ${strategyZone(latest)}</span>
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
  const selected = strategyPayload[symbol];
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
  const validRows = rows.filter((row) => row.slope !== null && row.fearGreed !== null);
  const latest = validRows[validRows.length - 1];
  const meta = selected.meta;

  if (!rows.length || !latest) {
    document.getElementById('error').hidden = false;
    document.getElementById('error').textContent = '当前日期范围没有可用的 MA10 拐头 + 恐贪数据。';
    return;
  }

  const color = strategyColor(latest);

  document.getElementById('error').hidden = true;
  setText('page-title', `${meta.name}十日线拐头 + 恐贪`);
  setText('badge-symbol', `Tencent 数据源 / ${meta.name} / MA10 拐头 + 恐贪`);
  setText('intro-text', `在 MA10 拐头策略基础上叠加极端恐贪：MA10 斜率由非正转正或恐贪小于 ${FEAR_BUY_THRESHOLD} 买入；MA10 斜率由非负转负或恐贪大于 ${GREED_SELL_THRESHOLD} 卖出。`);
  setText('ma-slope', formatNumber(latest.fearGreed));
  setText('ma-zone', strategyZone(latest));
  document.getElementById('ma-zone').style.color = color;
  document.documentElement.style.setProperty('--score-accent', color);
  document.documentElement.style.setProperty('--score-progress', `${latest.fearGreed}%`);
  setText('latest-close', formatNumber(latest.close));
  setText('latest-date', latest.date);
  setText('period-value', `${MA_PERIOD} 日`);
  setText('ma-value', formatNumber(latest.ma));
  setText('slope-value', formatNumber(latest.slope));
  setText('fear-value', formatNumber(latest.fearGreed));
  setText('range-label', `${rows[0].date} 到 ${rows[rows.length - 1].date}`);
  setText('point-count', `${validRows.length} 个交易日`);
  setText('chart-heading', `2025 年以来 ${meta.name} MA10 拐头 + 恐贪走势`);
  setText('chart-subtitle', `上方展示${meta.name}收盘价与 MA10，下方展示恐贪值；买入阈值 ${FEAR_BUY_THRESHOLD}，卖出阈值 ${GREED_SELL_THRESHOLD}。`);
  setText('legend-price', `${meta.name}收盘价`);
  document.title = `${meta.name} MA10 拐头 + 恐贪策略`;

  renderTradeTable(rows);
  renderBacktestSummary(rows);
  renderChart(rows, meta);
}

async function loadIndex(symbol, name) {
  const rows = await fetchIndexHistory(symbol);
  const maRows = calculateTurnMa(rows, MA_PERIOD);
  const fearGreedResult = computeFearGreedSeries(rows, { symbol, name });
  const strategyRows = mergeFearGreed(maRows, fearGreedResult.points);
  const validRows = strategyRows.filter((row) => row.slope !== null && row.fearGreed !== null);
  const latest = validRows[validRows.length - 1];

  if (!latest) {
    throw new Error(`${name} 没有可用的 MA10 拐头 + 恐贪数据。`);
  }

  return [symbol, {
    latest,
    meta: { symbol, name },
    data: strategyRows,
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
  strategyPayload = {};
  currentSymbol = null;
  const errorBox = document.getElementById('error');

  try {
    const results = await Promise.allSettled(
      Object.entries(STRATEGY_INDEXES).map(([symbol, name]) => loadIndex(symbol, name))
    );
    const warnings = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const [symbol, payload] = result.value;
        strategyPayload[symbol] = payload;
        return;
      }
      warnings.push(result.reason.message);
    });

    const defaultSymbol = strategyPayload[DEFAULT_SYMBOL] ? DEFAULT_SYMBOL : Object.keys(strategyPayload)[0];
    if (!defaultSymbol) {
      throw new Error(warnings.join('; ') || '没有可用的 MA10 拐头 + 恐贪数据。');
    }

    if (warnings.length) {
      errorBox.hidden = false;
      errorBox.textContent = `部分数据加载失败：${warnings.join('；')}`;
    }

    const maxDate = Object.values(strategyPayload)
      .map((payload) => payload.data[payload.data.length - 1].date)
      .sort()
      .pop();

    initDateControls(maxDate);
    renderSwitcher(defaultSymbol, strategyPayload);
    showIndex(defaultSymbol);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  }
}

export { init };
