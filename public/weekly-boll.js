import { fetchIndexHistory } from './tencentDataSource.js';

const BOLL_INDEXES = {
  sh000300: '沪深300',
  sh000905: '中证500',
  sh000688: '科创50',
  sh000852: '中证1000',
  sh513160: '港股科技ETF',
  sh518880: '黄金ETF',
  sz159941: '纳指ETF'
};

const DEFAULT_SYMBOL = 'sh000300';
const START_DATE = '2024-01-01';
const BOLL_PERIOD = 20;
const BOLL_MULTIPLIER = 2;

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let chartInstance = null;
let bollPayload = {};
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

function standardDeviation(values, mean) {
  if (!values.length) {
    return null;
  }
  const variance = average(values.map((value) => Math.pow(value - mean, 2)));
  return Math.sqrt(variance);
}

function weekKey(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function aggregateDailyToWeekly(rows) {
  const weeks = [];
  let current = null;

  rows.forEach((row) => {
    const key = weekKey(row.date);
    if (!current || current.key !== key) {
      current = {
        key,
        date: row.date,
        open: row.open,
        close: row.close,
        high: row.high,
        low: row.low,
        volume: row.volume || 0
      };
      weeks.push(current);
      return;
    }

    current.date = row.date;
    current.close = row.close;
    current.high = Math.max(current.high, row.high);
    current.low = Math.min(current.low, row.low);
    current.volume += row.volume || 0;
  });

  return weeks.map(({ key, ...row }) => row);
}

async function fetchWeeklyHistory(symbol) {
  try {
    return await fetchIndexHistory(symbol, 'week');
  } catch (error) {
    const dailyRows = await fetchIndexHistory(symbol);
    return aggregateDailyToWeekly(dailyRows);
  }
}

function calculateBoll(rows, period = BOLL_PERIOD, multiplier = BOLL_MULTIPLIER) {
  return rows.map((row, index) => {
    if (index + 1 < period) {
      return {
        ...row,
        middle: null,
        upper: null,
        lower: null,
        widthPct: null,
        positionPct: null
      };
    }

    const closes = rows.slice(index + 1 - period, index + 1).map((item) => item.close);
    const middle = average(closes);
    const deviation = standardDeviation(closes, middle);
    const upper = middle + multiplier * deviation;
    const lower = middle - multiplier * deviation;
    const widthPct = middle === 0 ? null : ((upper - lower) / middle) * 100;
    const positionPct = upper === lower ? null : ((row.close - lower) / (upper - lower)) * 100;

    return {
      ...row,
      middle: round(middle),
      upper: round(upper),
      lower: round(lower),
      widthPct: widthPct === null ? null : round(widthPct),
      positionPct: positionPct === null ? null : round(positionPct)
    };
  });
}

function bollZone(row) {
  if (!row || row.middle === null) {
    return '暂无数据';
  }
  if (row.close > row.upper) {
    return '收盘突破上轨';
  }
  if (row.close < row.lower) {
    return '收盘跌破下轨';
  }
  if (row.close >= row.middle) {
    return '位于中轨上方';
  }
  return '位于中轨下方';
}

function bollColor(row) {
  if (!row || row.middle === null) {
    return '#d8e6ff';
  }
  if (row.close > row.upper) {
    return '#ff9468';
  }
  if (row.close < row.lower) {
    return '#77b7ff';
  }
  if (row.close >= row.middle) {
    return '#34d399';
  }
  return '#ffbe72';
}

function buildOption(rows, meta) {
  const dates = rows.map((row) => row.date);
  const candleValues = rows.map((row) => [row.open, row.close, row.low, row.high]);
  const upperValues = rows.map((row) => row.upper);
  const middleValues = rows.map((row) => row.middle);
  const lowerValues = rows.map((row) => row.lower);
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8ea6cb';
  const axisColor = 'rgba(152, 189, 255, 0.26)';
  const splitColor = 'rgba(152, 189, 255, 0.12)';
  const upColor = '#34d399';
  const downColor = '#ff5f57';
  const upperColor = '#ff9468';
  const middleColor = '#ffbe72';
  const lowerColor = '#77b7ff';

  return {
    animation: true,
    backgroundColor: 'transparent',
    color: [upColor, upperColor, middleColor, lowerColor],
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
        const marker = (seriesName) => {
          const item = params.find((param) => param.seriesName === seriesName);
          return item ? item.marker : '';
        };
        return [
          `<div style="margin-bottom:6px;font-weight:600;">${row.date}</div>`,
          `${meta.name} 周K: 开 ${formatNumber(row.open)} / 收 ${formatNumber(row.close)}`,
          `最高: ${formatNumber(row.high)} / 最低: ${formatNumber(row.low)}`,
          `${marker('BOLL上轨')} 上轨: ${formatNumber(row.upper)}`,
          `${marker('BOLL中轨')} 中轨: ${formatNumber(row.middle)}`,
          `${marker('BOLL下轨')} 下轨: ${formatNumber(row.lower)}`,
          `带宽: ${formatNumber(row.widthPct)}%`,
          `区间位置: ${formatNumber(row.positionPct)}%`
        ].join('<br>');
      }
    },
    toolbox: {
      right: 18,
      top: 10,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
        saveAsImage: { name: `${meta.symbol}-weekly-boll-${START_DATE}` }
      },
      iconStyle: { borderColor: mutedColor }
    },
    legend: {
      top: 12,
      left: 22,
      textStyle: { color: mutedColor },
      data: ['周K', 'BOLL上轨', 'BOLL中轨', 'BOLL下轨']
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
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
        name: '周K',
        type: 'candlestick',
        data: candleValues,
        itemStyle: {
          color: upColor,
          color0: downColor,
          borderColor: upColor,
          borderColor0: downColor
        }
      },
      {
        name: 'BOLL上轨',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: upperColor },
        data: upperValues
      },
      {
        name: 'BOLL中轨',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: middleColor },
        data: middleValues
      },
      {
        name: 'BOLL下轨',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: lowerColor },
        data: lowerValues
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
  const switcher = document.getElementById('boll-switcher');
  switcher.innerHTML = '';

  Object.entries(payload).forEach(([symbol, indexData]) => {
    const latest = indexData.latest;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `index-pill${symbol === defaultSymbol ? ' active' : ''}`;
    button.dataset.symbol = symbol;
    button.innerHTML = `
      <strong>${indexData.meta.name}</strong>
      <span>BOLL20 ${bollZone(latest)} / ${formatNumber(latest.widthPct)}%</span>
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
  const selected = bollPayload[symbol];
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
  const validRows = rows.filter((row) => row.middle !== null);
  const latest = validRows[validRows.length - 1];
  const meta = selected.meta;

  if (!rows.length || !latest) {
    document.getElementById('error').hidden = false;
    document.getElementById('error').textContent = '当前日期范围没有可用的周 K 布林数据。';
    return;
  }

  const color = bollColor(latest);

  document.getElementById('error').hidden = true;
  setText('page-title', `${meta.name} 周K布林`);
  setText('badge-symbol', `Tencent 数据源 / ${meta.name} / 周K / BOLL20`);
  setText('intro-text', `按周 K 展示${meta.name}布林带。中轨为 20 周收盘价均线，上下轨为中轨加减 2 倍标准差。`);
  setText('boll-width', `${formatNumber(latest.widthPct)}%`);
  setText('boll-zone', bollZone(latest));
  document.getElementById('boll-zone').style.color = color;
  document.documentElement.style.setProperty('--score-accent', color);
  document.documentElement.style.setProperty('--score-progress', `${Math.max(0, Math.min(100, latest.positionPct))}%`);
  setText('latest-close', formatNumber(latest.close));
  setText('latest-date', latest.date);
  setText('period-value', `${BOLL_PERIOD} 周`);
  setText('upper-value', formatNumber(latest.upper));
  setText('middle-value', formatNumber(latest.middle));
  setText('lower-value', formatNumber(latest.lower));
  setText('range-label', `${rows[0].date} 到 ${rows[rows.length - 1].date}`);
  setText('point-count', `${validRows.length} 根有效周 K`);
  setText('chart-heading', `2024 年以来 ${meta.name} 周 K 布林走势`);
  setText('chart-subtitle', `展示${meta.name}周 K 以及 BOLL20 上中下轨；支持拖动缩放、悬停查看每周 OHLC 和布林位置。`);
  setText('legend-price', `${meta.name}周K`);
  document.title = `${meta.name} 周K布林`;

  renderChart(rows, meta);
}

async function loadIndex(symbol, name) {
  const rows = await fetchWeeklyHistory(symbol);
  const bollRows = calculateBoll(rows, BOLL_PERIOD, BOLL_MULTIPLIER);
  const validRows = bollRows.filter((row) => row.middle !== null);
  const latest = validRows[validRows.length - 1];

  if (!latest) {
    throw new Error(`${name} 没有可用的周 K 布林数据。`);
  }

  return [symbol, {
    latest,
    meta: { symbol, name },
    data: bollRows,
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
  bollPayload = {};
  currentSymbol = null;
  const errorBox = document.getElementById('error');

  try {
    const results = await Promise.allSettled(
      Object.entries(BOLL_INDEXES).map(([symbol, name]) => loadIndex(symbol, name))
    );
    const warnings = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const [symbol, payload] = result.value;
        bollPayload[symbol] = payload;
        return;
      }
      warnings.push(result.reason.message);
    });

    const defaultSymbol = bollPayload[DEFAULT_SYMBOL] ? DEFAULT_SYMBOL : Object.keys(bollPayload)[0];
    if (!defaultSymbol) {
      throw new Error(warnings.join('; ') || '没有可用的周 K 布林数据。');
    }

    if (warnings.length) {
      errorBox.hidden = false;
      errorBox.textContent = `部分数据加载失败：${warnings.join('；')}`;
    }

    const maxDate = Object.values(bollPayload)
      .map((payload) => payload.data[payload.data.length - 1].date)
      .sort()
      .pop();

    initDateControls(maxDate);
    renderSwitcher(defaultSymbol, bollPayload);
    showIndex(defaultSymbol);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  }
}

export { init };
