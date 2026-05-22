import { fetchIndexMinuteHistory } from './tencentDataSource.js';

const SYMBOL = 'sh000001';
const SYMBOL_NAME = '上证指数';
const DEFAULT_PERIOD = 'm30';

const PERIOD_OPTIONS = [
  {
    value: 'm60',
    label: '60分钟',
    role: '方向',
    limit: 1600,
    reversalPct: 0.0075,
    atrMultiplier: 1.55,
    minBars: 4,
    weight: 0.36
  },
  {
    value: 'm30',
    label: '30分钟',
    role: '主浪',
    limit: 1600,
    reversalPct: 0.0055,
    atrMultiplier: 1.45,
    minBars: 4,
    weight: 0.32
  },
  {
    value: 'm15',
    label: '15分钟',
    role: '确认',
    limit: 1600,
    reversalPct: 0.004,
    atrMultiplier: 1.35,
    minBars: 4,
    weight: 0.2
  },
  {
    value: 'm5',
    label: '5分钟',
    role: '触发',
    limit: 1600,
    reversalPct: 0.0028,
    atrMultiplier: 1.2,
    minBars: 5,
    weight: 0.12
  }
];

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

let chartInstance = null;
let analysisPayload = {};
let currentPeriod = DEFAULT_PERIOD;
let isSwitching = false;

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char];
  });
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return numberFormatter.format(value);
}

function formatPct(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return `${round(value, digits)}%`;
}

function periodConfig(period) {
  return PERIOD_OPTIONS.find((item) => item.value === period) || PERIOD_OPTIONS[1];
}

function cleanRows(rows) {
  return rows.filter(
    (row) =>
      row &&
      row.date &&
      Number.isFinite(row.open) &&
      Number.isFinite(row.close) &&
      Number.isFinite(row.high) &&
      Number.isFinite(row.low)
  );
}

function trueRange(row, previous) {
  if (!previous) {
    return row.high - row.low;
  }
  return Math.max(
    row.high - row.low,
    Math.abs(row.high - previous.close),
    Math.abs(row.low - previous.close)
  );
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function estimateAtrPct(rows) {
  const sample = rows.slice(-80);
  const ranges = sample.map((row, index) => {
    const previous = index > 0 ? sample[index - 1] : null;
    return row.close ? trueRange(row, previous) / row.close : null;
  });
  return median(ranges) || 0;
}

function createPivot(row, index, type, price) {
  return {
    index,
    date: row.date,
    type,
    price,
    close: row.close
  };
}

function isMoreExtreme(next, current) {
  return next.type === 'high' ? next.price > current.price : next.price < current.price;
}

function addPivot(pivots, pivot) {
  const previous = pivots[pivots.length - 1];
  if (!previous) {
    pivots.push(pivot);
    return;
  }

  if (previous.type === pivot.type) {
    if (isMoreExtreme(pivot, previous)) {
      pivots[pivots.length - 1] = pivot;
    }
    return;
  }

  if (previous.index === pivot.index) {
    pivots[pivots.length - 1] = pivot;
    return;
  }

  pivots.push(pivot);
}

function compactPivots(pivots, thresholdPct, minBars) {
  const compacted = [];
  pivots.forEach((pivot) => {
    const previous = compacted[compacted.length - 1];
    if (!previous) {
      compacted.push(pivot);
      return;
    }

    if (previous.type === pivot.type) {
      if (isMoreExtreme(pivot, previous)) {
        compacted[compacted.length - 1] = pivot;
      }
      return;
    }

    const movePct = Math.abs(pivot.price / previous.price - 1);
    const barGap = pivot.index - previous.index;
    if (movePct < thresholdPct * 0.45 && barGap < minBars) {
      return;
    }

    compacted.push(pivot);
  });

  return compacted;
}

function buildPivots(rows, config) {
  const thresholdPct = Math.max(config.reversalPct, estimateAtrPct(rows) * config.atrMultiplier);
  const pivots = [];
  if (rows.length < 3) {
    return { pivots, thresholdPct };
  }

  let direction = null;
  let candidateHigh = createPivot(rows[0], 0, 'high', rows[0].high);
  let candidateLow = createPivot(rows[0], 0, 'low', rows[0].low);
  let extreme = null;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const highPivot = createPivot(row, index, 'high', row.high);
    const lowPivot = createPivot(row, index, 'low', row.low);

    if (!direction) {
      if (highPivot.price > candidateHigh.price) {
        candidateHigh = highPivot;
      }
      if (lowPivot.price < candidateLow.price) {
        candidateLow = lowPivot;
      }

      const rangePct = candidateLow.price > 0 ? candidateHigh.price / candidateLow.price - 1 : 0;
      if (rangePct >= thresholdPct) {
        if (candidateLow.index <= candidateHigh.index) {
          addPivot(pivots, candidateLow);
          direction = 'up';
          extreme = candidateHigh;
        } else {
          addPivot(pivots, candidateHigh);
          direction = 'down';
          extreme = candidateLow;
        }
      }
      continue;
    }

    if (direction === 'up') {
      if (highPivot.price >= extreme.price) {
        extreme = highPivot;
      }

      const reversalPct = extreme.price > 0 ? (extreme.price - lowPivot.price) / extreme.price : 0;
      if (reversalPct >= thresholdPct) {
        addPivot(pivots, extreme);
        direction = 'down';
        extreme = lowPivot;
      }
      continue;
    }

    if (lowPivot.price <= extreme.price) {
      extreme = lowPivot;
    }

    const reversalPct = extreme.price > 0 ? highPivot.price / extreme.price - 1 : 0;
    if (reversalPct >= thresholdPct) {
      addPivot(pivots, extreme);
      direction = 'up';
      extreme = highPivot;
    }
  }

  if (extreme) {
    addPivot(pivots, extreme);
  }

  return {
    pivots: compactPivots(pivots, thresholdPct, config.minBars),
    thresholdPct
  };
}

function typePattern(points, pattern) {
  return points.length === pattern.length && points.every((point, index) => point.type === pattern[index]);
}

function impulseDirection(points) {
  if (typePattern(points, ['low', 'high', 'low', 'high', 'low', 'high'])) {
    return 'up';
  }
  if (typePattern(points, ['high', 'low', 'high', 'low', 'high', 'low'])) {
    return 'down';
  }
  return null;
}

function correctionDirection(points) {
  if (typePattern(points, ['high', 'low', 'high', 'low'])) {
    return 'down';
  }
  if (typePattern(points, ['low', 'high', 'low', 'high'])) {
    return 'up';
  }
  return null;
}

function directionalMove(start, end, direction) {
  return direction === 'up' ? end.price - start.price : start.price - end.price;
}

function retracement(start, end, back, direction) {
  const move = Math.abs(end.price - start.price);
  if (!move) {
    return null;
  }
  const retraced = direction === 'up' ? end.price - back.price : back.price - end.price;
  return retraced / move;
}

function scoreBand(value, low, high, weight) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value >= low && value <= high) {
    return weight;
  }

  const span = Math.max(0.01, high - low);
  const distance = value < low ? low - value : value - high;
  if (distance <= span * 0.6) {
    return weight * 0.35;
  }
  return -weight * 0.45;
}

function addRecency(candidate, rowCount) {
  if (candidate.recency === false) {
    const { recency, ...rest } = candidate;
    return {
      ...rest,
      score: clamp(Math.round(candidate.score), 0, 99)
    };
  }

  const tailGap = Math.max(0, rowCount - 1 - candidate.endIndex);
  const tailRatio = tailGap / Math.max(rowCount, 1);
  const recencyBonus = clamp(10 - tailRatio * 70, -6, 10);
  return {
    ...candidate,
    score: clamp(Math.round(candidate.score + recencyBonus), 0, 99)
  };
}

function scoreImpulse(points, rows, extra = {}) {
  const direction = impulseDirection(points);
  if (!direction) {
    return null;
  }

  const [p0, p1, p2, p3, p4, p5] = points;
  const w1 = directionalMove(p0, p1, direction);
  const w3 = directionalMove(p2, p3, direction);
  const w5 = directionalMove(p4, p5, direction);
  if (w1 <= 0 || w3 <= 0 || w5 <= 0) {
    return null;
  }

  let score = 46;
  const waveTwoValid = direction === 'up' ? p2.price > p0.price : p2.price < p0.price;
  const waveThreeBreaks = direction === 'up' ? p3.price > p1.price : p3.price < p1.price;
  const waveFourNoOverlap = direction === 'up' ? p4.price > p1.price : p4.price < p1.price;
  const waveThreeShortest = w3 < w1 && w3 < w5;

  score += waveTwoValid ? 14 : -34;
  score += waveThreeBreaks ? 12 : -26;
  score += waveFourNoOverlap ? 8 : -16;
  score += waveThreeShortest ? -30 : 10;

  const r2 = retracement(p0, p1, p2, direction);
  const r4 = retracement(p2, p3, p4, direction);
  const ratio3 = w3 / w1;
  const ratio5 = w5 / w1;

  score += scoreBand(r2, 0.382, 0.786, 10);
  score += scoreBand(r4, 0.146, 0.5, 8);
  score += scoreBand(ratio3, 1, 2.618, 8);
  score += scoreBand(ratio5, 0.5, 1.618, 6);
  if (Number.isFinite(r2) && Number.isFinite(r4) && r2 > 0.5 && r4 < 0.5) {
    score += 3;
  }

  return addRecency(
    {
      kind: 'impulse',
      direction,
      points,
      startIndex: p0.index,
      endIndex: p5.index,
      score: clamp(score, 0, 96),
      ratios: {
        wave2: r2,
        wave4: r4,
        wave3: ratio3,
        wave5: ratio5
      },
      ...extra
    },
    rows.length
  );
}

function scoreCorrection(points, rows, extra = {}) {
  const direction = correctionDirection(points);
  if (!direction) {
    return null;
  }

  const [p0, p1, p2, p3] = points;
  const waveA = directionalMove(p0, p1, direction);
  const waveB = directionalMove(p1, p2, direction === 'up' ? 'down' : 'up');
  const waveC = directionalMove(p2, p3, direction);
  if (waveA <= 0 || waveB <= 0 || waveC <= 0) {
    return null;
  }

  let score = 44;
  const bRetrace = waveB / waveA;
  const cRatio = waveC / waveA;
  const cExtendsA = direction === 'down' ? p3.price < p1.price : p3.price > p1.price;
  const bNotTooFar = direction === 'down' ? p2.price <= p0.price * 1.012 : p2.price >= p0.price * 0.988;

  score += scoreBand(bRetrace, 0.382, 1.236, 14);
  score += scoreBand(cRatio, 0.618, 1.618, 16);
  score += cExtendsA ? 8 : 2;
  score += bNotTooFar ? 5 : -10;

  return addRecency(
    {
      kind: 'correction',
      direction,
      points,
      startIndex: p0.index,
      endIndex: p3.index,
      score: clamp(score, 0, 94),
      ratios: {
        waveB: bRetrace,
        waveC: cRatio
      },
      ...extra
    },
    rows.length
  );
}

function latestExtremeAfter(rows, pivot, type) {
  const startIndex = pivot.index + 1;
  if (startIndex >= rows.length) {
    return null;
  }
  const tail = rows.slice(startIndex);
  if (!tail.length) {
    return null;
  }

  return tail.reduce((best, row, offset) => {
    const index = startIndex + offset;
    const price = type === 'high' ? row.high : row.low;
    if (!best) {
      return createPivot(row, index, type, price);
    }
    return type === 'high'
      ? price > best.price
        ? createPivot(row, index, type, price)
        : best
      : price < best.price
        ? createPivot(row, index, type, price)
        : best;
  }, null);
}

function findBestImpulse(rows, pivots) {
  const candidates = [];
  const firstIndex = Math.max(0, pivots.length - 10);
  for (let index = firstIndex; index <= pivots.length - 6; index += 1) {
    const candidate = scoreImpulse(pivots.slice(index, index + 6), rows);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (let index = Math.max(0, pivots.length - 7); index <= pivots.length - 5; index += 1) {
    const prefix = pivots.slice(index, index + 5);
    if (typePattern(prefix, ['low', 'high', 'low', 'high', 'low'])) {
      const latestHigh = latestExtremeAfter(rows, prefix[4], 'high');
      if (latestHigh && latestHigh.price > prefix[4].price) {
        const candidate = scoreImpulse(prefix.concat(latestHigh), rows, {
          developing: true,
          stage: '第5浪推进'
        });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
    if (typePattern(prefix, ['high', 'low', 'high', 'low', 'high'])) {
      const latestLow = latestExtremeAfter(rows, prefix[4], 'low');
      if (latestLow && latestLow.price < prefix[4].price) {
        const candidate = scoreImpulse(prefix.concat(latestLow), rows, {
          developing: true,
          stage: '第5浪推进'
        });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score || b.endIndex - a.endIndex)[0] || null;
}

function findBestCorrection(rows, pivots) {
  const candidates = [];
  const firstIndex = Math.max(0, pivots.length - 9);
  for (let index = firstIndex; index <= pivots.length - 4; index += 1) {
    const candidate = scoreCorrection(pivots.slice(index, index + 4), rows);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (let index = Math.max(0, pivots.length - 6); index <= pivots.length - 3; index += 1) {
    const prefix = pivots.slice(index, index + 3);
    if (typePattern(prefix, ['high', 'low', 'high'])) {
      const latestLow = latestExtremeAfter(rows, prefix[2], 'low');
      if (latestLow && latestLow.price < prefix[2].price) {
        const candidate = scoreCorrection(prefix.concat(latestLow), rows, {
          developing: true,
          stage: 'C浪推进'
        });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
    if (typePattern(prefix, ['low', 'high', 'low'])) {
      const latestHigh = latestExtremeAfter(rows, prefix[2], 'high');
      if (latestHigh && latestHigh.price > prefix[2].price) {
        const candidate = scoreCorrection(prefix.concat(latestHigh), rows, {
          developing: true,
          stage: 'C浪推进'
        });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score || b.endIndex - a.endIndex)[0] || null;
}

function ratioSummary(candidate) {
  const ratios = candidate.ratios || {};
  if (candidate.kind === 'impulse') {
    return [
      `2浪回撤 ${formatPct(Number.isFinite(ratios.wave2) ? ratios.wave2 * 100 : null)}`,
      `4浪回撤 ${formatPct(Number.isFinite(ratios.wave4) ? ratios.wave4 * 100 : null)}`,
      `3浪 ${round(ratios.wave3, 2) || '--'}倍1浪`
    ].join(' / ');
  }

  if (candidate.kind === 'correction') {
    return [
      `B浪回撤 ${formatPct(Number.isFinite(ratios.waveB) ? ratios.waveB * 100 : null)}`,
      `C浪 ${round(ratios.waveC, 2) || '--'}倍A`
    ].join(' / ');
  }

  return '--';
}

function collectHistoricalCandidates(rows, pivots) {
  const candidates = [];

  for (let index = 0; index <= pivots.length - 6; index += 1) {
    const candidate = scoreImpulse(pivots.slice(index, index + 6), rows, { recency: false });
    if (candidate && candidate.score >= 58) {
      candidates.push(candidate);
    }
  }

  for (let index = 0; index <= pivots.length - 4; index += 1) {
    const candidate = scoreCorrection(pivots.slice(index, index + 4), rows, { recency: false });
    if (candidate && candidate.score >= 58) {
      candidates.push(candidate);
    }
  }

  const seen = new Set();
  return candidates
    .sort((a, b) => b.endIndex - a.endIndex || b.score - a.score)
    .filter((candidate) => {
      const key = `${candidate.kind}:${candidate.direction}:${candidate.startIndex}:${candidate.endIndex}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 36);
}

function fallbackCandidate(rows, pivots) {
  if (pivots.length < 2) {
    return {
      kind: 'neutral',
      direction: 'neutral',
      points: [],
      endIndex: rows.length - 1,
      score: 20
    };
  }

  const previous = pivots[pivots.length - 2];
  const latest = pivots[pivots.length - 1];
  return {
    kind: 'swing',
    direction: latest.price >= previous.price ? 'up' : 'down',
    points: [previous, latest],
    endIndex: latest.index,
    score: 36
  };
}

function chooseCandidate(impulse, correction, rows, pivots) {
  if (correction && (!impulse || (correction.endIndex >= impulse.endIndex && correction.score + 4 >= impulse.score))) {
    return correction;
  }
  if (impulse) {
    return impulse;
  }
  if (correction) {
    return correction;
  }
  return fallbackCandidate(rows, pivots);
}

function analyzePeriod(config, rows) {
  const filteredRows = cleanRows(rows);
  const { pivots, thresholdPct } = buildPivots(filteredRows, config);
  const recentPivots = pivots.slice(-18);
  const impulse = findBestImpulse(filteredRows, recentPivots);
  const correction = findBestCorrection(filteredRows, recentPivots);
  const candidate = chooseCandidate(impulse, correction, filteredRows, recentPivots);
  const historyCandidates = collectHistoricalCandidates(filteredRows, pivots);
  const latest = filteredRows[filteredRows.length - 1] || null;

  return {
    config,
    rows: filteredRows,
    pivots: recentPivots,
    allPivotCount: pivots.length,
    thresholdPct,
    candidate: candidate || fallbackCandidate(filteredRows, recentPivots),
    historyCandidates,
    latest
  };
}

function directionText(direction) {
  if (direction === 'up') {
    return '向上';
  }
  if (direction === 'down') {
    return '向下';
  }
  return '中性';
}

function biasClass(analysis) {
  const { candidate } = analysis;
  if (candidate.kind === 'correction') {
    return 'corrective';
  }
  if (candidate.direction === 'up') {
    return 'bullish';
  }
  if (candidate.direction === 'down') {
    return 'bearish';
  }
  return 'neutral';
}

function patternLabel(analysis) {
  const { candidate } = analysis;
  return candidatePatternLabel(candidate);
}

function candidatePatternLabel(candidate) {
  if (candidate.kind === 'impulse') {
    const prefix = candidate.developing ? `${candidate.stage || '进行中'}：` : '';
    return `${prefix}${directionText(candidate.direction)}5浪推动`;
  }
  if (candidate.kind === 'correction') {
    const prefix = candidate.developing ? `${candidate.stage || '进行中'}：` : '';
    return `${prefix}${directionText(candidate.direction)}ABC修正`;
  }
  if (candidate.kind === 'swing') {
    return `${directionText(candidate.direction)}单段摆动`;
  }
  return '结构不足';
}

function biasLabel(analysis) {
  const { candidate } = analysis;
  if (candidate.kind === 'correction') {
    return candidate.direction === 'down' ? '修正偏空' : '修正偏多';
  }
  if (candidate.direction === 'up') {
    return '偏多';
  }
  if (candidate.direction === 'down') {
    return '偏空';
  }
  return '中性';
}

function keyLevel(analysis) {
  const { candidate } = analysis;
  if (candidate.kind === 'impulse' && candidate.points.length >= 5) {
    const waveFour = candidate.points[4];
    return {
      value: formatNumber(waveFour.price),
      meta: candidate.direction === 'up' ? '跌破4浪低点则降级' : '突破4浪高点则降级'
    };
  }

  if (candidate.kind === 'correction' && candidate.points.length >= 4) {
    const waveC = candidate.points[3];
    return {
      value: formatNumber(waveC.price),
      meta: candidate.direction === 'down' ? '跌破C浪低点则修正延长' : '突破C浪高点则修正延长'
    };
  }

  const lastPivot = analysis.pivots[analysis.pivots.length - 1];
  return {
    value: lastPivot ? formatNumber(lastPivot.price) : '--',
    meta: '最近拐点'
  };
}

function targetLevel(analysis) {
  const { candidate } = analysis;
  if (candidate.kind === 'impulse' && candidate.points.length >= 5) {
    const [p0, p1, , , p4] = candidate.points;
    const waveOne = Math.abs(p1.price - p0.price);
    const targetOne = candidate.direction === 'up' ? p4.price + waveOne : p4.price - waveOne;
    const targetTwo = candidate.direction === 'up' ? p4.price + waveOne * 1.618 : p4.price - waveOne * 1.618;
    return {
      value: `${formatNumber(targetOne)} / ${formatNumber(targetTwo)}`,
      meta: '按1浪等长和1.618扩展'
    };
  }

  if (candidate.kind === 'correction' && candidate.points.length >= 4) {
    const waveB = candidate.points[2];
    const waveC = candidate.points[3];
    return {
      value: `${formatNumber(waveB.price)} / ${formatNumber(waveC.price)}`,
      meta: candidate.direction === 'down' ? 'B浪确认 / C浪防守' : 'B浪确认 / C浪防守'
    };
  }

  return {
    value: '--',
    meta: '等待更多拐点'
  };
}

function candidateDefensePrice(analysis) {
  const { candidate } = analysis;
  if (candidate.kind === 'impulse' && candidate.points.length >= 5) {
    return candidate.points[4].price;
  }
  if (candidate.kind === 'correction' && candidate.points.length >= 4) {
    return candidate.points[3].price;
  }
  const latest = analysis.pivots[analysis.pivots.length - 1];
  return latest ? latest.price : null;
}

function recentExtreme(analysis, type, count = 16) {
  if (!analysis || !analysis.rows.length) {
    return null;
  }

  const rows = analysis.rows.slice(-count);
  return rows.reduce((extreme, row) => {
    const price = type === 'high' ? row.high : row.low;
    if (!Number.isFinite(price)) {
      return extreme;
    }
    if (!Number.isFinite(extreme)) {
      return price;
    }
    return type === 'high' ? Math.max(extreme, price) : Math.min(extreme, price);
  }, null);
}

function latestClose(payload) {
  const analysis = payload.m5 || payload.m15 || payload.m30 || payload.m60;
  return analysis && analysis.latest ? analysis.latest.close : null;
}

function nearestBelow(reference, values) {
  const valid = values
    .filter((value) => Number.isFinite(value) && Number.isFinite(reference) && value < reference)
    .sort((a, b) => b - a);
  return valid[0] || null;
}

function nearestAbove(reference, values) {
  const valid = values
    .filter((value) => Number.isFinite(value) && Number.isFinite(reference) && value > reference)
    .sort((a, b) => a - b);
  return valid[0] || null;
}

function weightedDirectionalScore(items) {
  const valid = items.filter((item) => item && item.analysis);
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!weightSum) {
    return 0;
  }
  return valid.reduce((sum, item) => sum + directionalScore(item.analysis) * item.weight, 0) / weightSum;
}

function tradeBadgeClass(type) {
  const classMap = {
    buy: 'bullish',
    hold: 'bullish',
    sell: 'bearish',
    reduce: 'bearish',
    wait: 'waiting',
    watch: 'corrective'
  };
  return classMap[type] || 'neutral';
}

function makeTradeRow(type, action, trigger, reference, stop, target, position, reason) {
  return {
    type,
    action,
    trigger,
    reference,
    stop,
    target,
    position,
    reason
  };
}

function buildTradePlan(payload) {
  const m60 = payload.m60;
  const m30 = payload.m30;
  const m15 = payload.m15;
  const m5 = payload.m5;
  const price = latestClose(payload);

  if (!m30 || !m15 || !m5 || !Number.isFinite(price)) {
    return {
      action: '等待数据',
      actionType: 'wait',
      trigger: '--',
      stop: '--',
      position: '0成',
      rows: [
        makeTradeRow('wait', '等待', '等待 30/15/5 分钟数据完整', '--', '--', '--', '0成', '分钟K数据不足，暂不生成操作计划')
      ]
    };
  }

  const majorScore = weightedDirectionalScore([
    { analysis: m60, weight: 0.55 },
    { analysis: m30, weight: 0.45 }
  ]);
  const shortScore = weightedDirectionalScore([
    { analysis: m15, weight: 0.55 },
    { analysis: m5, weight: 0.45 }
  ]);
  const buyTrigger = Math.max(
    recentExtreme(m5, 'high', 18) || -Infinity,
    recentExtreme(m15, 'high', 10) || -Infinity
  );
  const sellTrigger = Math.min(
    recentExtreme(m5, 'low', 18) || Infinity,
    recentExtreme(m15, 'low', 10) || Infinity
  );
  const longStop = nearestBelow(price, [
    candidateDefensePrice(m5),
    candidateDefensePrice(m15),
    candidateDefensePrice(m30),
    recentExtreme(m5, 'low', 24),
    recentExtreme(m15, 'low', 16)
  ]);
  const shortInvalidation = nearestAbove(price, [
    candidateDefensePrice(m5),
    candidateDefensePrice(m15),
    candidateDefensePrice(m30),
    recentExtreme(m5, 'high', 24),
    recentExtreme(m15, 'high', 16)
  ]);
  const primaryTarget = targetLevel(m30).value !== '--' ? targetLevel(m30).value : targetLevel(m60 || m30).value;
  const majorText = `${m60 ? patternLabel(m60) : '60分钟不足'}；${patternLabel(m30)}`;
  const shortText = `${patternLabel(m15)}；${patternLabel(m5)}`;
  const buyTriggerText = Number.isFinite(buyTrigger) ? `5/15分钟放量站上 ${formatNumber(buyTrigger)}` : '等待短周期上破';
  const sellTriggerText = Number.isFinite(sellTrigger) ? `5/15分钟跌破 ${formatNumber(sellTrigger)}` : '等待短周期跌破';
  const stopText = Number.isFinite(longStop) ? formatNumber(longStop) : '--';
  const invalidationText = Number.isFinite(shortInvalidation) ? formatNumber(shortInvalidation) : '--';
  const rows = [];

  if (majorScore > 0.28 && shortScore > -0.15) {
    const strongShort = shortScore > 0.18;
    rows.push(
      makeTradeRow(
        strongShort ? 'buy' : 'watch',
        strongShort ? '计划买入' : '等确认买入',
        buyTriggerText,
        formatNumber(price),
        stopText,
        primaryTarget,
        strongShort ? '3-5成' : '1-3成',
        `大周期偏多：${majorText}；短周期：${shortText}`
      )
    );
    rows.push(
      makeTradeRow(
        'sell',
        '防守卖出',
        Number.isFinite(longStop) ? `跌破 ${formatNumber(longStop)}` : '跌破短周期最近低点',
        formatNumber(price),
        stopText,
        '--',
        '降至0-2成',
        '买入后若跌破结构防守位，说明当前数浪失效或修正延长'
      )
    );
    rows.push(
      makeTradeRow(
        'reduce',
        '分批止盈',
        primaryTarget !== '--' ? `接近 ${primaryTarget}` : '出现30分钟顶背离或第5浪末端',
        formatNumber(price),
        stopText,
        primaryTarget,
        '降1-2成',
        '推动浪末段或目标区附近不追高，优先锁定部分利润'
      )
    );

    return {
      action: strongShort ? '计划买入' : '等确认买入',
      actionType: strongShort ? 'buy' : 'watch',
      trigger: Number.isFinite(buyTrigger) ? formatNumber(buyTrigger) : '--',
      stop: stopText,
      position: strongShort ? '3-5成' : '1-3成',
      rows
    };
  }

  if (majorScore < -0.28) {
    rows.push(
      makeTradeRow(
        'sell',
        '卖出/空仓',
        sellTriggerText,
        formatNumber(price),
        invalidationText,
        '--',
        '0-2成',
        `大周期偏空：${majorText}；短周期：${shortText}`
      )
    );
    rows.push(
      makeTradeRow(
        'watch',
        '反抽观察',
        Number.isFinite(shortInvalidation) ? `重新站上 ${formatNumber(shortInvalidation)}` : '重新站上短周期压力',
        formatNumber(price),
        Number.isFinite(sellTrigger) ? formatNumber(sellTrigger) : '--',
        primaryTarget,
        '1-2成试探',
        '只有短周期重新转强，才考虑把下跌后的反弹当作修复结构'
      )
    );

    return {
      action: '卖出/空仓',
      actionType: 'sell',
      trigger: Number.isFinite(sellTrigger) ? formatNumber(sellTrigger) : '--',
      stop: invalidationText,
      position: '0-2成',
      rows
    };
  }

  rows.push(
    makeTradeRow(
      'wait',
      '震荡观望',
      `${buyTriggerText} 或 ${sellTriggerText}`,
      formatNumber(price),
      `${stopText} / ${invalidationText}`,
      primaryTarget,
      '0-2成',
      `多周期分歧：${majorText}；短周期：${shortText}`
    )
  );
  rows.push(
    makeTradeRow(
      shortScore > 0 ? 'buy' : 'sell',
      shortScore > 0 ? '突破试多' : '跌破防守',
      shortScore > 0 ? buyTriggerText : sellTriggerText,
      formatNumber(price),
      shortScore > 0 ? stopText : invalidationText,
      primaryTarget,
      '1-2成',
      '震荡区只适合小仓位试错，等待30/60分钟重新同向'
    )
  );

  return {
    action: '震荡观望',
    actionType: 'wait',
    trigger: Number.isFinite(buyTrigger) ? formatNumber(buyTrigger) : '--',
    stop: stopText !== '--' ? stopText : invalidationText,
    position: '0-2成',
    rows
  };
}

function latestPivotText(analysis) {
  const pivot = analysis.pivots[analysis.pivots.length - 1];
  if (!pivot) {
    return '--';
  }
  return `${pivot.type === 'high' ? '高点' : '低点'} ${pivot.date} / ${formatNumber(pivot.price)}`;
}

function confidenceText(analysis) {
  return `${Math.round(analysis.candidate.score)} / 100`;
}

function directionalScore(analysis) {
  const raw = analysis.candidate.score / 100;
  if (analysis.candidate.kind === 'correction') {
    return (analysis.candidate.direction === 'up' ? 1 : -1) * raw * 0.62;
  }
  if (analysis.candidate.direction === 'up') {
    return raw;
  }
  if (analysis.candidate.direction === 'down') {
    return -raw;
  }
  return 0;
}

function buildSynthesis(payload) {
  const analyses = PERIOD_OPTIONS.map((option) => payload[option.value]).filter(Boolean);
  if (!analyses.length) {
    return {
      label: '加载中',
      detail: '等待分钟 K 数据',
      score: 0,
      accent: '#687789',
      className: 'neutral'
    };
  }

  const weighted = analyses.reduce((sum, analysis) => sum + directionalScore(analysis) * analysis.config.weight, 0);
  const strength = Math.round(clamp(Math.abs(weighted) * 100, 0, 100));
  const m60 = payload.m60;
  const m30 = payload.m30;
  const m15 = payload.m15;
  const m5 = payload.m5;

  if (weighted > 0.28) {
    const detail = m15 && m5 && (m15.candidate.kind === 'correction' || m5.candidate.kind === 'correction')
      ? '大周期偏多，短周期处在修正确认段'
      : '60/30分钟结构偏多，等待短周期延续';
    return {
      label: '偏多观察',
      detail,
      score: strength,
      accent: '#059669',
      className: 'bullish'
    };
  }

  if (weighted < -0.28) {
    const detail = m60 && m30 && m60.candidate.direction === 'down' && m30.candidate.direction === 'down'
      ? '60/30分钟同向偏空，反弹先看修正'
      : '结构偏空，短周期反弹需要确认突破';
    return {
      label: '偏空防守',
      detail,
      score: strength,
      accent: '#dc2626',
      className: 'bearish'
    };
  }

  return {
    label: '震荡待确认',
    detail: '多周期方向分歧，优先看关键位突破',
    score: Math.max(28, strength),
    accent: '#d97706',
    className: 'corrective'
  };
}

function renderPeriodSwitcher() {
  const switcher = document.getElementById('wave-period-switcher');
  if (!switcher) {
    return;
  }

  switcher.innerHTML = '';
  PERIOD_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `period-pill${option.value === currentPeriod ? ' active' : ''}`;
    button.dataset.period = option.value;
    button.textContent = option.label;
    button.addEventListener('click', () => showPeriod(option.value));
    switcher.appendChild(button);
  });
}

function updateActivePeriod(period) {
  document.querySelectorAll('#wave-period-switcher .period-pill').forEach((button) => {
    button.classList.toggle('active', button.dataset.period === period);
  });
}

function renderSummary() {
  const synthesis = buildSynthesis(analysisPayload);
  const latestDates = PERIOD_OPTIONS
    .map((option) => analysisPayload[option.value] && analysisPayload[option.value].latest)
    .filter(Boolean)
    .map((row) => row.date)
    .sort();
  const latestDate = latestDates[latestDates.length - 1] || '--';

  setText('wave-signal', synthesis.label);
  setText('wave-signal-detail', synthesis.detail);
  setText('wave-score', `${synthesis.score} / 100`);
  setText('wave-updated', latestDate);
  document.documentElement.style.setProperty('--score-accent', synthesis.accent);
  document.documentElement.style.setProperty('--score-progress', `${synthesis.score}%`);
  const detail = document.getElementById('wave-signal-detail');
  if (detail) {
    detail.style.color = synthesis.accent;
  }
  document.title = `000001 波浪结构 - ${synthesis.label}`;
}

function renderActiveFacts(analysis) {
  const key = keyLevel(analysis);
  const target = targetLevel(analysis);
  const ratios = analysis.candidate.ratios || {};
  const ratioText = analysis.candidate.kind === 'impulse'
    ? `2浪 ${formatPct(Number.isFinite(ratios.wave2) ? ratios.wave2 * 100 : null)} / 4浪 ${formatPct(Number.isFinite(ratios.wave4) ? ratios.wave4 * 100 : null)}`
    : analysis.candidate.kind === 'correction'
      ? `B浪 ${formatPct((ratios.waveB || 0) * 100)} / C浪 ${round(ratios.waveC || 0, 2)}倍A`
      : `${analysis.pivots.length} 个拐点`;

  setText('wave-active-pattern', patternLabel(analysis));
  setText('wave-active-meta', ratioText);
  setText('wave-active-bias', biasLabel(analysis));
  setText('wave-active-confidence', `置信度 ${confidenceText(analysis)}`);
  setText('wave-active-level', key.value);
  setText('wave-active-level-meta', key.meta);
  setText('wave-active-target', target.value);
  setText('wave-active-target-meta', target.meta);
}

function renderTable() {
  const tableBody = document.getElementById('wave-table-list');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';
  PERIOD_OPTIONS.forEach((option) => {
    const analysis = analysisPayload[option.value];
    const tr = document.createElement('tr');
    if (!analysis) {
      tr.innerHTML = `
        <td>${option.label}</td>
        <td>${option.role}</td>
        <td colspan="6">加载中...</td>
      `;
      tableBody.appendChild(tr);
      return;
    }

    const key = keyLevel(analysis);
    const target = targetLevel(analysis);
    const className = biasClass(analysis);
    tr.innerHTML = `
      <td>${option.label}</td>
      <td>${option.role}</td>
      <td>${escapeHtml(patternLabel(analysis))}</td>
      <td><span class="wave-badge ${className}">${escapeHtml(biasLabel(analysis))}</span></td>
      <td>${confidenceText(analysis)}</td>
      <td>${escapeHtml(key.value)}<div class="meta">${escapeHtml(key.meta)}</div></td>
      <td>${escapeHtml(target.value)}<div class="meta">${escapeHtml(target.meta)}</div></td>
      <td>${escapeHtml(latestPivotText(analysis))}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function candidateKeyLevel(candidate) {
  if (candidate.kind === 'impulse' && candidate.points.length >= 5) {
    return {
      value: formatNumber(candidate.points[4].price),
      meta: candidate.direction === 'up' ? '4浪低点' : '4浪高点'
    };
  }

  if (candidate.kind === 'correction' && candidate.points.length >= 4) {
    return {
      value: formatNumber(candidate.points[3].price),
      meta: candidate.direction === 'down' ? 'C浪低点' : 'C浪高点'
    };
  }

  const latest = candidate.points[candidate.points.length - 1];
  return {
    value: latest ? formatNumber(latest.price) : '--',
    meta: '末端拐点'
  };
}

function renderHistoryTable(analysis) {
  const tableBody = document.getElementById('wave-history-list');
  const emptyText = document.getElementById('wave-history-empty');
  if (!tableBody || !emptyText) {
    return;
  }

  const candidates = analysis.historyCandidates || [];
  setText('wave-history-heading', `${analysis.config.label}历史浪型`);
  setText(
    'wave-history-subtitle',
    `回放 ${analysis.rows[0].date} 到 ${analysis.latest.date} 内识别到的高分推动浪和 ABC 修正，按结束时间倒序展示。`
  );

  tableBody.innerHTML = '';
  emptyText.hidden = candidates.length > 0;

  candidates.forEach((candidate) => {
    const start = candidate.points[0];
    const end = candidate.points[candidate.points.length - 1];
    const key = candidateKeyLevel(candidate);
    const className = candidate.kind === 'correction'
      ? 'corrective'
      : candidate.direction === 'up'
        ? 'bullish'
        : 'bearish';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(end.date)}</td>
      <td>${escapeHtml(candidate.kind === 'impulse' ? '5浪推动' : 'ABC修正')}</td>
      <td><span class="wave-badge ${className}">${escapeHtml(biasLabel({ candidate }))}</span></td>
      <td>${Math.round(candidate.score)} / 100</td>
      <td>${escapeHtml(start.date)}<div class="meta">${formatNumber(start.price)}</div></td>
      <td>${escapeHtml(end.date)}<div class="meta">${formatNumber(end.price)}</div></td>
      <td>${escapeHtml(ratioSummary(candidate))}</td>
      <td>${escapeHtml(key.value)}<div class="meta">${escapeHtml(key.meta)}</div></td>
    `;
    tableBody.appendChild(tr);
  });
}

function renderTradePlan() {
  const plan = buildTradePlan(analysisPayload);
  const actionElement = document.getElementById('wave-trade-action');
  setText('wave-trade-action', plan.action);
  setText('wave-trade-trigger', plan.trigger);
  setText('wave-trade-stop', plan.stop);
  setText('wave-trade-position', plan.position);
  if (actionElement) {
    actionElement.className = plan.actionType === 'buy' || plan.actionType === 'hold'
      ? 'positive'
      : plan.actionType === 'sell' || plan.actionType === 'reduce'
        ? 'negative'
        : '';
  }

  const tableBody = document.getElementById('wave-trade-list');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';
  plan.rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="wave-badge ${tradeBadgeClass(row.type)}">${escapeHtml(row.action)}</span></td>
      <td>${escapeHtml(row.trigger)}</td>
      <td>${escapeHtml(row.reference)}</td>
      <td>${escapeHtml(row.stop)}</td>
      <td>${escapeHtml(row.target)}</td>
      <td>${escapeHtml(row.position)}</td>
      <td>${escapeHtml(row.reason)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function waveLabel(candidate, index) {
  if (candidate.kind === 'impulse') {
    return String(index);
  }
  if (candidate.kind === 'correction') {
    return index === 0 ? '起' : ['A', 'B', 'C'][index - 1];
  }
  return index === 0 ? '前' : '后';
}

function waveLineData(analysis) {
  const points = analysis.candidate.points && analysis.candidate.points.length
    ? analysis.candidate.points
    : analysis.pivots.slice(-8);
  return points.map((point) => [point.date, point.price]);
}

function waveScatterData(analysis) {
  const points = analysis.candidate.points && analysis.candidate.points.length
    ? analysis.candidate.points
    : analysis.pivots.slice(-8);
  return points.map((point, index) => ({
    name: waveLabel(analysis.candidate, index),
    value: [point.date, point.price],
    label: {
      show: true,
      formatter: waveLabel(analysis.candidate, index)
    }
  }));
}

function pivotScatterData(analysis) {
  return analysis.pivots.slice(-14).map((point) => ({
    name: point.type === 'high' ? '高点' : '低点',
    value: [point.date, point.price]
  }));
}

function buildOption(analysis) {
  const rows = analysis.rows;
  const dates = rows.map((row) => row.date);
  const candles = rows.map((row) => [row.open, row.close, row.low, row.high]);
  const mutedColor = cssVar('--muted', '#687789');
  const priceColor = cssVar('--price', '#2563eb');
  const splitColor = 'rgba(104, 119, 137, 0.16)';
  const waveColor = analysis.candidate.direction === 'down' ? '#dc2626' : '#0d9488';

  return {
    animation: true,
    backgroundColor: 'transparent',
    grid: { left: 70, right: 70, top: 54, bottom: 78 },
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
        const items = Array.isArray(params) ? params : [params];
        const axisDate = items[0] && (items[0].axisValue || (items[0].value && items[0].value[0]));
        const row = rows.find((item) => item.date === axisDate);
        if (!row) {
          return '';
        }
        const pivot = analysis.pivots.find((item) => item.date === axisDate);
        return [
          `<div style="margin-bottom:6px;font-weight:600;">${row.date}</div>`,
          `${SYMBOL_NAME} 开: ${formatNumber(row.open)} 高: ${formatNumber(row.high)}`,
          `低: ${formatNumber(row.low)} 收: ${formatNumber(row.close)}`,
          pivot ? `<div style="margin-top:6px;color:#ffd7a8;">拐点: ${pivot.type === 'high' ? '高点' : '低点'} ${formatNumber(pivot.price)}</div>` : '',
          `<div style="margin-top:6px;color:#bae6fd;">判断: ${patternLabel(analysis)} / ${confidenceText(analysis)}</div>`
        ]
          .filter(Boolean)
          .join('<br>');
      }
    },
    toolbox: {
      right: 18,
      top: 10,
      feature: {
        dataZoom: { yAxisIndex: 'none' },
        restore: {},
        saveAsImage: { name: `${SYMBOL}-wave-${analysis.config.value}` }
      },
      iconStyle: { borderColor: mutedColor }
    },
    legend: {
      top: 12,
      left: 22,
      textStyle: { color: mutedColor },
      data: [SYMBOL_NAME, '波浪路径', '浪点', '拐点']
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: true,
      axisLine: { lineStyle: { color: splitColor } },
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
        borderColor: 'rgba(104, 119, 137, 0.24)',
        backgroundColor: '#f8fafc',
        fillerColor: 'rgba(37, 99, 235, 0.14)',
        handleStyle: { color: priceColor }
      }
    ],
    series: [
      {
        name: SYMBOL_NAME,
        type: 'candlestick',
        data: candles,
        itemStyle: {
          color: '#dc2626',
          color0: '#059669',
          borderColor: '#dc2626',
          borderColor0: '#059669'
        }
      },
      {
        name: '拐点',
        type: 'scatter',
        data: pivotScatterData(analysis),
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: {
          color: '#94a3b8',
          borderColor: '#f8fafc',
          borderWidth: 1
        },
        z: 3
      },
      {
        name: '波浪路径',
        type: 'line',
        data: waveLineData(analysis),
        showSymbol: true,
        symbolSize: 7,
        smooth: false,
        lineStyle: {
          width: 3,
          color: waveColor
        },
        itemStyle: { color: waveColor },
        z: 4
      },
      {
        name: '浪点',
        type: 'scatter',
        data: waveScatterData(analysis),
        symbol: 'diamond',
        symbolSize: 16,
        label: {
          color: '#17202a',
          fontSize: 11,
          fontWeight: 800,
          position: 'top'
        },
        itemStyle: {
          color: '#f8fafc',
          borderColor: waveColor,
          borderWidth: 2,
          shadowBlur: 4,
          shadowColor: 'rgba(15, 23, 42, 0.2)'
        },
        z: 5
      }
    ]
  };
}

function renderChart(analysis) {
  const chartDom = document.getElementById('wave-chart');
  if (!chartDom) {
    return;
  }

  if (!chartInstance) {
    chartInstance = echarts.init(chartDom, null, { renderer: 'canvas' });
    window.addEventListener('resize', () => chartInstance && chartInstance.resize());
  }

  chartInstance.setOption(buildOption(analysis), true);
}

function renderCurrentPeriod() {
  const analysis = analysisPayload[currentPeriod];
  if (!analysis || !analysis.rows.length) {
    return;
  }

  const first = analysis.rows[0];
  const latest = analysis.latest;
  setText('wave-chart-heading', `000001 ${analysis.config.label}波浪路径`);
  setText(
    'wave-chart-subtitle',
    `${patternLabel(analysis)}，${biasLabel(analysis)}，拐点阈值 ${formatPct(analysis.thresholdPct * 100, 2)}，共识别 ${analysis.allPivotCount} 个拐点。`
  );
  setText('wave-range-label', `${first.date} 到 ${latest.date}`);
  setText('wave-pivot-note', `${formatPct(analysis.thresholdPct * 100, 2)} / ${analysis.allPivotCount}点`);
  renderActiveFacts(analysis);
  renderHistoryTable(analysis);
  renderChart(analysis);
}

function renderAll() {
  renderSummary();
  renderTradePlan();
  renderTable();
  renderCurrentPeriod();
}

async function showPeriod(period) {
  if (isSwitching || !analysisPayload[period]) {
    return;
  }
  isSwitching = true;
  currentPeriod = period;
  updateActivePeriod(period);
  renderCurrentPeriod();
  isSwitching = false;
}

async function loadAnalyses() {
  const results = await Promise.allSettled(
    PERIOD_OPTIONS.map(async (config) => {
      const rows = await fetchIndexMinuteHistory(SYMBOL, config.value, config.limit);
      return [config.value, analyzePeriod(config, rows)];
    })
  );

  const payload = {};
  const warnings = [];
  results.forEach((result, index) => {
    const config = PERIOD_OPTIONS[index];
    if (result.status === 'fulfilled') {
      const [period, analysis] = result.value;
      payload[period] = analysis;
      return;
    }
    warnings.push(`${config.label}: ${result.reason.message}`);
  });

  if (!Object.keys(payload).length) {
    throw new Error(warnings.join('; ') || '没有可用的 000001 分钟 K 数据。');
  }

  analysisPayload = payload;
}

async function init() {
  chartInstance = null;
  analysisPayload = {};
  currentPeriod = DEFAULT_PERIOD;
  renderPeriodSwitcher();
  const errorBox = document.getElementById('error');
  if (errorBox) {
    errorBox.hidden = true;
  }

  try {
    await loadAnalyses();
    if (!analysisPayload[currentPeriod]) {
      currentPeriod = Object.keys(analysisPayload)[0];
    }
    updateActivePeriod(currentPeriod);
    renderAll();
  } catch (error) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = `加载失败：${error.message}`;
    }
  }
}

export { init };
