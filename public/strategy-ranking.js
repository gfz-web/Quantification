import { computeFearGreedSeries } from './fearGreed.js';
import { fetchIndexHistory } from './tencentDataSource.js';

const RANKING_INDEXES = {
  sh000001: '上证指数',
  sh000300: '沪深300',
  sh000905: '中证500',
  sh000688: '科创50',
  sh000852: '中证1000',
  sh513160: '港股科技ETF',
  sh518880: '黄金ETF',
  sz159941: '纳指ETF'
};

const START_DATE = '2025-01-01';
const INITIAL_CASH = 1000000;
const CCI_PERIOD = 14;
const CCI_BUY_THRESHOLD = 70;
const CCI_SELL_THRESHOLD = 100;
const FEAR_BUY_THRESHOLD = 5;
const GREED_SELL_THRESHOLD = 88;

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let rankingRows = [];
let currentStartDate = START_DATE;
let currentEndDate = null;

const strategies = [
  {
    id: 'cci',
    name: 'CCI',
    shortName: 'CCI',
    build(rows) {
      return calculateCci(rows);
    },
    prepareFiltered(rows) {
      return applyCciSignals(rows, true);
    }
  },
  {
    id: 'ma5',
    name: '五日线策略',
    shortName: 'MA5',
    build(rows) {
      return calculateMaCross(rows, 5);
    }
  },
  {
    id: 'ma5-turn',
    name: '五日线拐头',
    shortName: 'MA5拐头',
    build(rows) {
      return calculateTurnMa(rows, 5);
    }
  },
  {
    id: 'ma10',
    name: '十日线策略',
    shortName: 'MA10',
    build(rows) {
      return calculateMaCross(rows, 10);
    }
  },
  {
    id: 'ma10-turn',
    name: '十日线拐头',
    shortName: 'MA10拐头',
    build(rows) {
      return calculateTurnMa(rows, 10);
    }
  },
  {
    id: 'ma20-turn',
    name: '二十日线拐头',
    shortName: 'MA20拐头',
    build(rows) {
      return calculateTurnMa(rows, 20);
    }
  },
  {
    id: 'ma10-turn-fear',
    name: '十日拐头+恐贪',
    shortName: '拐头+恐贪',
    build(rows, meta) {
      return calculateTurnFear(rows, meta);
    }
  }
];

function formatNumber(value) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }
  return numberFormatter.format(value);
}

function formatPct(value) {
  return value === null || !Number.isFinite(value) ? '--' : `${formatNumber(value)}%`;
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

function calculateCci(rows, period = CCI_PERIOD) {
  const typicalPrices = rows.map((row) => (row.high + row.low + row.close) / 3);

  return rows.map((row, index) => {
    if (index + 1 < period) {
      return { ...row, signal: null, cci: null };
    }

    const windowPrices = typicalPrices.slice(index + 1 - period, index + 1);
    const tpMa = average(windowPrices);
    const meanDeviation = average(windowPrices.map((value) => Math.abs(value - tpMa)));
    const cci = meanDeviation === 0 ? null : (typicalPrices[index] - tpMa) / (0.015 * meanDeviation);
    const roundedCci = cci === null ? null : round(cci);

    return {
      ...row,
      cci: roundedCci,
      signal: null
    };
  });
}

function applyCciSignals(rows, startsHolding = false) {
  let holding = startsHolding;

  return rows.map((row) => {
    let signal = null;
    if (row.cci !== null && row.cci > CCI_BUY_THRESHOLD && !holding) {
      holding = true;
      signal = 'buy';
    } else if (row.cci !== null && row.cci < CCI_SELL_THRESHOLD && holding) {
      holding = false;
      signal = 'sell';
    }
    return { ...row, signal };
  });
}

function calculateMaCross(rows, period) {
  return rows.map((row, index) => {
    if (index + 1 < period) {
      return { ...row, ma: null, signal: null };
    }

    const ma = average(rows.slice(index + 1 - period, index + 1).map((item) => item.close));
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
      signal
    };
  });
}

function calculateTurnMa(rows, period) {
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
    const signal =
      slope !== null && previousSlope !== null && previousSlope <= 0 && slope > 0
        ? 'buy'
        : slope !== null && previousSlope !== null && previousSlope >= 0 && slope < 0
          ? 'sell'
          : null;

    return {
      ...row,
      ma: ma === null ? null : round(ma),
      slope: slope === null ? null : round(slope, 4),
      signal
    };
  });
}

function calculateTurnFear(rows, meta) {
  const maRows = calculateTurnMa(rows, 10);
  const fearGreedResult = computeFearGreedSeries(rows, meta);
  const fearGreedByDate = new Map(fearGreedResult.points.map((row) => [row.date, row]));

  return maRows.map((row) => {
    const fearGreedRow = fearGreedByDate.get(row.date);
    const fearGreed = fearGreedRow ? fearGreedRow.fearGreed : null;
    const fearSignal =
      fearGreed !== null && fearGreed < FEAR_BUY_THRESHOLD
        ? 'buy'
        : fearGreed !== null && fearGreed > GREED_SELL_THRESHOLD
          ? 'sell'
          : null;

    return {
      ...row,
      fearGreed,
      signal: row.signal || fearSignal
    };
  });
}

function shouldBuy(row, strategy) {
  if (strategy.id === 'cci') {
    return row.cci !== null && row.cci > CCI_BUY_THRESHOLD;
  }
  if (strategy.id === 'ma5' || strategy.id === 'ma10') {
    return row.ma !== null && row.close > row.ma;
  }
  if (strategy.id === 'ma10-turn-fear') {
    return (row.slope !== null && row.slope > 0) || (row.fearGreed !== null && row.fearGreed < FEAR_BUY_THRESHOLD);
  }
  return row.slope !== null && row.slope > 0;
}

function shouldSell(row, strategy) {
  if (strategy.id === 'cci') {
    return row.cci !== null && row.cci < CCI_SELL_THRESHOLD;
  }
  if (strategy.id === 'ma5' || strategy.id === 'ma10') {
    return row.ma !== null && row.close < row.ma;
  }
  if (strategy.id === 'ma10-turn-fear') {
    return (row.slope !== null && row.slope < 0) || (row.fearGreed !== null && row.fearGreed > GREED_SELL_THRESHOLD);
  }
  return row.slope !== null && row.slope < 0;
}

function backtest(rows, strategy, initialCash = INITIAL_CASH) {
  if (!rows.length) {
    return {
      finalValue: initialCash,
      returnPct: 0,
      profit: 0,
      holding: false,
      operationCount: 0,
      completedTrades: 0,
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
    if (shouldBuy(row, strategy) && !holding) {
      shares = cash / row.close;
      cash = 0;
      holding = true;
      buyPrice = row.close;
      operationCount += 1;
      return;
    }

    if (shouldSell(row, strategy) && holding) {
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
  const returnPct = (finalValue / initialCash - 1) * 100;

  return {
    finalValue,
    returnPct,
    profit: finalValue - initialCash,
    holding,
    operationCount,
    completedTrades,
    winRatePct: completedTrades ? (winningTrades / completedTrades) * 100 : null
  };
}

function filterRows(rows) {
  return rows.filter((row) => {
    const afterStart = !currentStartDate || row.date >= currentStartDate;
    const beforeEnd = !currentEndDate || row.date <= currentEndDate;
    return afterStart && beforeEnd;
  });
}

function evaluateStrategy(historyRows, meta, strategy) {
  const builtRows = strategy.build(historyRows, meta);
  const strategyRows = strategy.prepareFiltered
    ? strategy.prepareFiltered(filterRows(builtRows))
    : filterRows(builtRows);
  const result = backtest(strategyRows, strategy);
  const latest = strategyRows[strategyRows.length - 1];

  return {
    symbol: meta.symbol,
    asset: meta.name,
    strategyId: strategy.id,
    strategy: strategy.name,
    shortName: strategy.shortName,
    latestDate: latest ? latest.date : '--',
    returnPct: result.returnPct,
    finalValue: result.finalValue,
    profit: result.profit,
    holding: result.holding,
    operationCount: result.operationCount,
    winRatePct: result.winRatePct
  };
}

async function loadAsset(symbol, name) {
  const historyRows = await fetchIndexHistory(symbol);
  const meta = { symbol, name };
  return strategies.map((strategy) => evaluateStrategy(historyRows, meta, strategy));
}

function groupByAsset(rows) {
  return Object.values(rows.reduce((groups, row) => {
    if (!groups[row.symbol]) {
      groups[row.symbol] = {
        symbol: row.symbol,
        asset: row.asset,
        rows: []
      };
    }
    groups[row.symbol].rows.push(row);
    return groups;
  }, {})).map((group) => ({
    ...group,
    rows: group.rows.sort((a, b) => b.returnPct - a.returnPct)
  }));
}

function renderSummary(rows) {
  const sorted = [...rows].sort((a, b) => b.returnPct - a.returnPct);
  const best = sorted[0];
  const positiveCount = rows.filter((row) => row.returnPct > 0).length;
  const holdingCount = rows.filter((row) => row.holding).length;
  const averageReturn = rows.length
    ? rows.reduce((sum, row) => sum + row.returnPct, 0) / rows.length
    : null;

  setText('ranking-best-return', best ? formatPct(best.returnPct) : '--');
  setText('ranking-best-label', best ? `${best.asset} / ${best.strategy}` : '加载中...');
  setText('ranking-coverage', `${Object.keys(RANKING_INDEXES).length} x ${strategies.length}`);
  setText('ranking-positive-count', `${positiveCount} 个`);
  setText('ranking-holding-count', `${holdingCount} 个`);
  setText('ranking-average-return', formatPct(averageReturn));
  setText('ranking-range-label', currentEndDate ? `${currentStartDate} 到 ${currentEndDate}` : `${currentStartDate} 至今`);
  document.documentElement.style.setProperty('--score-progress', best ? `${Math.max(0, Math.min(100, best.returnPct))}%` : '0%');
  document.documentElement.style.setProperty('--score-accent', best && best.returnPct >= 0 ? '#059669' : '#dc2626');
}

function renderOverview(rows) {
  const list = document.getElementById('ranking-overview');
  const bestByAsset = groupByAsset(rows).map((group) => group.rows[0]);
  list.innerHTML = '';

  bestByAsset.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'ranking-card';
    article.innerHTML = `
      <div class="allocation-card-head">
        <div>
          <div class="metric-label">${item.asset}</div>
          <strong>${item.strategy}</strong>
        </div>
        <span class="status-badge ${item.holding ? 'holding' : 'empty'}">${item.holding ? '持仓中' : '空仓'}</span>
      </div>
      <div class="ranking-return ${item.returnPct >= 0 ? 'positive' : 'negative'}">${formatPct(item.returnPct)}</div>
      <p>操作 ${item.operationCount} 次，胜率 ${formatPct(item.winRatePct)}，最新日期 ${item.latestDate}</p>
    `;
    list.appendChild(article);
  });
}

function renderTables(rows) {
  const root = document.getElementById('ranking-groups');
  root.innerHTML = '';

  groupByAsset(rows).forEach((group) => {
    const section = document.createElement('section');
    section.className = 'ranking-group';
    section.innerHTML = `
      <div class="section-header trade-header">
        <div>
          <h2>${group.asset}</h2>
          <div class="meta">七个已实现策略按总收益率从高到低排序。</div>
        </div>
        <div class="meta">${group.symbol}</div>
      </div>
      <div class="trade-table-wrap">
        <table class="trade-table ranking-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>策略</th>
              <th>总收益率</th>
              <th>当前总资产</th>
              <th>总收益</th>
              <th>操作次数</th>
              <th>胜率</th>
              <th>当前状态</th>
              <th>最新日期</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    const tableBody = section.querySelector('tbody');
    group.rows.forEach((item, index) => {
      const tr = document.createElement('tr');
      const profitClass = item.returnPct >= 0 ? 'positive' : 'negative';
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${item.strategy}</td>
        <td class="${profitClass}">${formatPct(item.returnPct)}</td>
        <td>${formatNumber(item.finalValue)}</td>
        <td class="${profitClass}">${formatNumber(item.profit)}</td>
        <td>${item.operationCount} 次</td>
        <td>${formatPct(item.winRatePct)}</td>
        <td><span class="status-badge ${item.holding ? 'holding' : 'empty'}">${item.holding ? '持仓中' : '空仓'}</span></td>
        <td>${item.latestDate}</td>
      `;
      tableBody.appendChild(tr);
    });

    root.appendChild(section);
  });
}

function renderError(message) {
  const errorBox = document.getElementById('error');
  errorBox.hidden = false;
  errorBox.textContent = message;
}

function setLoading(isLoading) {
  const button = document.getElementById('apply-date-range');
  button.disabled = isLoading;
  button.textContent = isLoading ? '计算中...' : '应用区间';
}

async function refreshRanking() {
  const errorBox = document.getElementById('error');
  setLoading(true);
  errorBox.hidden = true;

  try {
    const results = await Promise.allSettled(
      Object.entries(RANKING_INDEXES).map(([symbol, name]) => loadAsset(symbol, name))
    );
    const warnings = [];
    rankingRows = results.flatMap((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      warnings.push(result.reason.message);
      return [];
    });

    if (!rankingRows.length) {
      throw new Error(warnings.join('；') || '没有可用的策略排名数据。');
    }

    if (warnings.length) {
      renderError(`部分数据加载失败：${warnings.join('；')}`);
    }

    renderSummary(rankingRows);
    renderOverview(rankingRows);
    renderTables(rankingRows);
  } catch (error) {
    renderError(`加载失败：${error.message}`);
  } finally {
    setLoading(false);
  }
}

function initDateControls() {
  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  const applyButton = document.getElementById('apply-date-range');
  const resetButton = document.getElementById('reset-date-range');

  currentStartDate = START_DATE;
  currentEndDate = null;
  startInput.value = currentStartDate;
  endInput.value = '';

  applyButton.addEventListener('click', () => {
    if (startInput.value && endInput.value && startInput.value > endInput.value) {
      renderError('开始日期不能晚于结束日期。');
      return;
    }

    currentStartDate = startInput.value || START_DATE;
    currentEndDate = endInput.value || null;
    refreshRanking();
  });

  resetButton.addEventListener('click', () => {
    currentStartDate = START_DATE;
    currentEndDate = null;
    startInput.value = currentStartDate;
    endInput.value = '';
    refreshRanking();
  });
}

function init() {
  rankingRows = [];
  initDateControls();
  return refreshRanking();
}

export { init };
