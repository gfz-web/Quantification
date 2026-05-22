import { computeFearGreedSeries } from './fearGreed.js';
import { INDEXES, fetchIndexHistory } from './tencentDataSource.js';

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let chartInstance = null;
let currentSymbol = null;
let indexPayload = {};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function formatNumber(value) {
  return numberFormatter.format(value);
}

const DEFAULT_THRESHOLDS = {
  extremeFear: 25,
  fear: 45,
  greed: 56,
  extremeGreed: 75
};

function getThresholds(meta) {
  return meta && meta.thresholds ? meta.thresholds : DEFAULT_THRESHOLDS;
}

function zoneColor(score, thresholds = DEFAULT_THRESHOLDS) {
  if (score >= thresholds.extremeGreed) {
    return '#c84d2a';
  }
  if (score >= thresholds.greed) {
    return '#df7b32';
  }
  if (score >= thresholds.fear) {
    return '#8a7a64';
  }
  if (score >= thresholds.extremeFear) {
    return '#5078a6';
  }
  return '#224f89';
}

function buildDividendTradeSignals(rows) {
  return rows.flatMap((row, index) => {
    const previous = rows[index - 1];
    const signals = [];

    if (
      row.fearGreed < 20 &&
      (!previous || previous.fearGreed >= 20)
    ) {
      signals.push({
        name: '买入',
        coord: [row.date, row.close],
        value: '买入',
        symbol: 'circle',
        symbolSize: 11,
        itemStyle: {
          color: '#3dd6a3',
          borderColor: '#d8fff2',
          borderWidth: 2
        },
        label: { show: false }
      });
    }

    if (
      row.fearGreed > 74 &&
      (!previous || previous.fearGreed <= 74)
    ) {
      signals.push({
        name: '卖出',
        coord: [row.date, row.close],
        value: '卖出',
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: {
          color: '#ffb15f',
          borderColor: '#fff0d9',
          borderWidth: 2
        },
        label: { show: false }
      });
    }

    return signals;
  });
}

function buildOption(rows, latest, meta) {
  const dates = rows.map((row) => row.date);
  const closes = rows.map((row) => row.close);
  const scores = rows.map((row) => row.fearGreed);
  const thresholds = getThresholds(meta);
  const dividendSignals = meta.symbol === 'sh510880'
    ? buildDividendTradeSignals(rows)
    : [];
  const latestColor = zoneColor(latest.fearGreed, thresholds);
  const priceColor = cssVar('--price') || '#73a8ff';
  const fearColor = cssVar('--fear') || '#ff8a57';
  const mutedColor = cssVar('--muted') || '#8ea6cb';
  const axisColor = 'rgba(152, 189, 255, 0.26)';
  const splitColor = 'rgba(152, 189, 255, 0.12)';

  return {
    animation: true,
    backgroundColor: 'transparent',
    color: [priceColor, fearColor],
    grid: [
      { left: 70, right: 70, top: 48, height: 240 },
      { left: 70, right: 70, top: 356, height: 160 }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#3d4854'
        }
      },
      backgroundColor: 'rgba(30, 35, 41, 0.92)',
      borderWidth: 0,
      textStyle: {
        color: '#fdf8f1'
      },
      formatter(params) {
        const priceItem = params.find((item) => item.seriesName === meta.name);
        const scoreItem = params.find((item) => item.seriesName === '恐贪值');
        const row = rows[params[0].dataIndex];
        const signals = dividendSignals
          .filter((signal) => signal.coord[0] === params[0].axisValue)
          .map((signal) => signal.value);
        const factorLines = row && row.scores
          ? [
              `趋势结构: ${formatNumber(row.scores.trend)}`,
              `短线动量: ${formatNumber(row.scores.momentum)}`,
              `风险压力: ${formatNumber(row.scores.risk)}`,
              `量能热度: ${formatNumber(row.scores.volume)}`
            ]
          : [];
        return [
          `<div style="margin-bottom:6px;font-weight:600;">${params[0].axisValue}</div>`,
          priceItem ? `${priceItem.marker} ${meta.name}: ${formatNumber(priceItem.data)}` : '',
          scoreItem ? `${scoreItem.marker} 恐贪值: ${formatNumber(scoreItem.data)}` : '',
          signals.length ? `<div style="margin:6px 0 4px;color:#ffd7a8;">交易信号: ${signals.join(' / ')}</div>` : '',
          factorLines.length ? '<div style="margin:6px 0 4px;color:#cbbba8;">分项得分</div>' : '',
          ...factorLines
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
        saveAsImage: { name: `${meta.symbol}-fear-greed` }
      },
      iconStyle: {
        borderColor: mutedColor
      }
    },
    legend: {
      top: 10,
      left: 22,
      textStyle: {
        color: mutedColor
      },
      data: [meta.name, '恐贪值']
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
        splitLine: {
          lineStyle: { color: splitColor, type: 'dashed' }
        }
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: {
          color: mutedColor
        },
        splitLine: {
          lineStyle: { color: splitColor, type: 'dashed' }
        }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 0,
        end: 100
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        height: 24,
        bottom: 18,
        borderColor: 'rgba(152, 189, 255, 0.18)',
        backgroundColor: 'rgba(7, 17, 33, 0.92)',
        fillerColor: 'rgba(115, 168, 255, 0.18)',
        handleStyle: {
          color: '#8ec5ff'
        }
      }
    ],
    visualMap: {
      show: false,
      seriesIndex: 1,
      dimension: 1,
      pieces: [
        { gte: 0, lt: thresholds.extremeFear, color: '#5d97ff' },
        { gte: thresholds.extremeFear, lt: thresholds.fear, color: '#7eb6ff' },
        { gte: thresholds.fear, lt: thresholds.greed, color: '#98a7c7' },
        { gte: thresholds.greed, lt: thresholds.extremeGreed, color: '#ffb15f' },
        { gte: thresholds.extremeGreed, lte: 100, color: '#ff7b55' }
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
        lineStyle: {
          width: 3,
          color: priceColor
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(115, 168, 255, 0.28)' },
            { offset: 1, color: 'rgba(115, 168, 255, 0.02)' }
          ])
        },
        data: closes,
        markPoint: {
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: { color: priceColor },
          label: {
            show: false,
            fontSize: 11,
            fontWeight: 700
          },
          data: [
            { coord: [dates[dates.length - 1], closes[closes.length - 1]], label: { show: false } },
            ...dividendSignals
          ]
        }
      },
      {
        name: '恐贪值',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 3,
          color: fearColor
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 138, 87, 0.24)' },
            { offset: 1, color: 'rgba(255, 138, 87, 0.03)' }
          ])
        },
        markLine: {
          symbol: 'none',
          label: {
            color: mutedColor
          },
          lineStyle: {
            color: 'rgba(152, 189, 255, 0.32)',
            type: 'dashed'
          },
          data: [
            { yAxis: thresholds.extremeFear },
            { yAxis: thresholds.fear },
            { yAxis: thresholds.greed },
            { yAxis: thresholds.extremeGreed }
          ]
        },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.72 },
          data: [
            [{ yAxis: 0, itemStyle: { color: 'rgba(89, 147, 255, 0.16)' } }, { yAxis: thresholds.extremeFear }],
            [{ yAxis: thresholds.extremeFear, itemStyle: { color: 'rgba(116, 182, 255, 0.12)' } }, { yAxis: thresholds.fear }],
            [{ yAxis: thresholds.fear, itemStyle: { color: 'rgba(148, 164, 196, 0.10)' } }, { yAxis: thresholds.greed }],
            [{ yAxis: thresholds.greed, itemStyle: { color: 'rgba(255, 190, 112, 0.13)' } }, { yAxis: thresholds.extremeGreed }],
            [{ yAxis: thresholds.extremeGreed, itemStyle: { color: 'rgba(255, 127, 90, 0.14)' } }, { yAxis: 100 }]
          ]
        },
        markPoint: {
          symbol: 'circle',
          symbolSize: 14,
          itemStyle: { color: latestColor },
          data: [{ coord: [dates[dates.length - 1], scores[scores.length - 1]] }]
        },
        data: scores
      }
    ]
  };
}

function renderChart(rows, latest, meta) {
  const chartDom = document.getElementById('chart');
  if (!chartInstance) {
    chartInstance = echarts.init(chartDom, null, { renderer: 'canvas' });
    window.addEventListener('resize', () => chartInstance && chartInstance.resize());
  }

  chartInstance.setOption(buildOption(rows, latest, meta), true);
}

function renderSwitcher(defaultSymbol, indexes) {
  const switcher = document.getElementById('index-switcher');
  switcher.innerHTML = '';

  Object.entries(indexes).forEach(([symbol, indexData]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `index-pill${symbol === defaultSymbol ? ' active' : ''}`;
    button.dataset.symbol = symbol;
    button.innerHTML = `
      <strong>${indexData.meta.name}</strong>
      <span>${formatNumber(indexData.latest.fearGreed)} / ${indexData.latest.zone}</span>
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
  const selected = indexPayload[symbol];
  if (!selected) {
    return;
  }

  currentSymbol = symbol;
  updateActivePill(symbol);

  const latest = selected.latest;
  const rows = selected.data || [];
  const meta = selected.meta;
  const thresholds = getThresholds(meta);

  setText('score-label', `${meta.name}恐贪值`);
  setText('score-value', formatNumber(latest.fearGreed));
  setText('score-zone', latest.zone);
  document.getElementById('score-zone').style.color = zoneColor(latest.fearGreed, thresholds);
  document.documentElement.style.setProperty('--score-accent', zoneColor(latest.fearGreed, thresholds));
  document.documentElement.style.setProperty('--score-progress', `${latest.fearGreed}%`);
  setText('latest-close', formatNumber(latest.close));
  setText('latest-date', latest.date);
  setText('factor-trend', formatNumber(latest.scores.trend));
  setText('factor-momentum', formatNumber(latest.scores.momentum));
  setText('factor-risk', formatNumber(latest.scores.risk));
  setText('factor-volume', formatNumber(latest.scores.volume));
  setText('range-label', `${rows[0].date} 到 ${rows[rows.length - 1].date}`);
  setText('chart-title', `${meta.name}2024 年以来走势`);
  setText('chart-subtitle', `${meta.name}点位和恐贪值双轴展示，支持拖动缩放、悬停查看每日明细。`);
  setText('legend-price', `${meta.name}收盘价`);
  document.title = `${meta.name}恐贪值 Demo`;

  renderChart(rows, latest, meta);
}

async function getFearGreedPayload() {
  const results = await Promise.allSettled(
    Object.entries(INDEXES).map(async ([symbol, name]) => {
      const rows = await fetchIndexHistory(symbol);
      const result = computeFearGreedSeries(rows, { symbol, name });
      return [symbol, {
        latest: result.latest,
        meta: result.meta,
        data: result.points
      }];
    })
  );

  const indexes = {};
  const warnings = [];
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const [symbol, payload] = result.value;
      indexes[symbol] = payload;
      return;
    }
    warnings.push(result.reason.message);
  });

  const defaultSymbol = indexes.sh000001 ? 'sh000001' : Object.keys(indexes)[0];
  if (!defaultSymbol) {
    throw new Error(warnings.join('; ') || 'No index data available.');
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    defaultSymbol,
    indexes,
    warnings,
    latest: indexes[defaultSymbol].latest,
    meta: indexes[defaultSymbol].meta,
    data: indexes[defaultSymbol].data
  };

  return payload;
}

async function init() {
  chartInstance = null;
  const errorBox = document.getElementById('error');

  try {
    const payload = await getFearGreedPayload();
    const indexes = payload.indexes || {};
    const defaultSymbol = payload.defaultSymbol;

    if (!defaultSymbol || !indexes[defaultSymbol]) {
      throw new Error('没有可用的指数数据。');
    }

    indexPayload = indexes;
    renderSwitcher(defaultSymbol, indexes);
    showIndex(defaultSymbol);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  }
}

export { init };
