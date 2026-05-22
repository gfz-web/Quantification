function round(value, digits) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(parts) {
  const valid = parts.filter((part) => part.value !== null && Number.isFinite(part.value));
  const weightSum = valid.reduce((sum, part) => sum + part.weight, 0);
  if (!valid.length || weightSum === 0) {
    return null;
  }
  return valid.reduce((sum, part) => sum + part.value * part.weight, 0) / weightSum;
}

function quantile(values, probability) {
  const valid = values.filter((value) => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) {
    return null;
  }
  const position = (valid.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return valid[lowerIndex];
  }
  const weight = position - lowerIndex;
  return valid[lowerIndex] * (1 - weight) + valid[upperIndex] * weight;
}

function buildThresholds(scores) {
  const fallback = {
    extremeFear: 25,
    fear: 45,
    greed: 56,
    extremeGreed: 75
  };
  const thresholds = {
    extremeFear: quantile(scores, 0.2),
    fear: quantile(scores, 0.4),
    greed: quantile(scores, 0.6),
    extremeGreed: quantile(scores, 0.8)
  };

  if (Object.values(thresholds).some((value) => value === null)) {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(thresholds).map(([key, value]) => [key, round(value, 2)])
  );
}

const DISPLAY_START_DATE = '2024-01-01';

function stdDev(values) {
  if (values.length < 2) {
    return null;
  }
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function movingAverage(values, windowSize) {
  return values.map((_, index) => {
    if (index + 1 < windowSize) {
      return null;
    }
    return average(values.slice(index + 1 - windowSize, index + 1));
  });
}

function rollingMax(values, windowSize) {
  return values.map((_, index) => {
    if (index + 1 < windowSize) {
      return null;
    }
    return Math.max.apply(null, values.slice(index + 1 - windowSize, index + 1));
  });
}

function shiftDays(dateString, dayOffset) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function zoneLabel(score, thresholds = buildThresholds([])) {
  if (score >= thresholds.extremeGreed) {
    return '极度贪婪';
  }
  if (score >= thresholds.greed) {
    return '贪婪';
  }
  if (score >= thresholds.fear) {
    return '中性';
  }
  if (score >= thresholds.extremeFear) {
    return '恐惧';
  }
  return '极度恐惧';
}

function percentileScores(values, invert) {
  const valid = values.filter((value) => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) {
    return values.map(() => null);
  }

  return values.map((value) => {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    let upperBound = 0;
    while (upperBound < valid.length && valid[upperBound] <= value) {
      upperBound += 1;
    }

    const percentile = (upperBound / valid.length) * 100;
    return invert ? round(100 - percentile, 2) : round(percentile, 2);
  });
}

function calcRsi(closes, windowSize) {
  const result = closes.map(() => null);
  if (closes.length < windowSize + 1) {
    return result;
  }

  let gainSum = 0;
  let lossSum = 0;
  for (let index = 1; index <= windowSize; index += 1) {
    const change = closes[index] - closes[index - 1];
    if (change > 0) {
      gainSum += change;
    } else {
      lossSum += Math.abs(change);
    }
  }

  let averageGain = gainSum / windowSize;
  let averageLoss = lossSum / windowSize;
  result[windowSize] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = windowSize + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    averageGain = (averageGain * (windowSize - 1) + gain) / windowSize;
    averageLoss = (averageLoss * (windowSize - 1) + loss) / windowSize;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return result;
}

function calcReturns(closes, windowSize) {
  return closes.map((close, index) => {
    if (index < windowSize) {
      return null;
    }
    return close / closes[index - windowSize] - 1;
  });
}

function calcRollingStd(values, windowSize) {
  return values.map((_, index) => {
    if (index + 1 < windowSize) {
      return null;
    }
    const slice = values.slice(index + 1 - windowSize, index + 1).filter((value) => value !== null);
    return slice.length === windowSize ? stdDev(slice) : null;
  });
}

function calcDrawdown(closes, windowSize) {
  const rollingHigh = rollingMax(closes, windowSize);
  return closes.map((close, index) => {
    if (rollingHigh[index] === null || rollingHigh[index] === 0) {
      return null;
    }
    return close / rollingHigh[index] - 1;
  });
}

function calcAmplitude(highs, lows, closes, windowSize) {
  return closes.map((close, index) => {
    if (index + 1 < windowSize || close === 0) {
      return null;
    }
    const high = Math.max.apply(null, highs.slice(index + 1 - windowSize, index + 1));
    const low = Math.min.apply(null, lows.slice(index + 1 - windowSize, index + 1));
    return (high - low) / close;
  });
}

function computeFearGreedSeries(rows, meta = {}) {
  const closes = rows.map((row) => row.close);
  const highs = rows.map((row) => row.high);
  const lows = rows.map((row) => row.low);
  const volumes = rows.map((row) => row.volume);

  const ma60 = movingAverage(closes, 60);
  const ma120 = movingAverage(closes, 120);
  const volumeMa20 = movingAverage(volumes, 20);
  const returns1 = calcReturns(closes, 1);
  const returns20 = calcReturns(closes, 20);
  const rsi14 = calcRsi(closes, 14);
  const vol20 = calcRollingStd(returns1, 20);
  const drawdown10 = calcDrawdown(closes, 10);
  const amplitude10 = calcAmplitude(highs, lows, closes, 10);
  const pricePosition120 = closes.map((close, index) => {
    if (index < 119) {
      return null;
    }
    const slice = closes.slice(index - 119, index + 1);
    const high = Math.max.apply(null, slice);
    const low = Math.min.apply(null, slice);
    if (high === low) {
      return 50;
    }
    return ((close - low) / (high - low)) * 100;
  });

  const momentum60Raw = closes.map((close, index) => {
    if (ma60[index] === null || ma60[index] === 0) {
      return null;
    }
    return close / ma60[index] - 1;
  });

  const momentum120Raw = closes.map((close, index) => {
    if (ma120[index] === null || ma120[index] === 0) {
      return null;
    }
    return close / ma120[index] - 1;
  });

  const volumeHeatRaw = volumes.map((volume, index) => {
    if (
      volumeMa20[index] === null ||
      volumeMa20[index] === 0 ||
      returns1[index] === null
    ) {
      return null;
    }
    const direction = returns1[index] >= 0 ? 1 : -1;
    return (volume / volumeMa20[index]) * direction;
  });

  const momentum60Score = percentileScores(momentum60Raw, false);
  const momentum120Score = percentileScores(momentum120Raw, false);
  const return20Score = percentileScores(returns20, false);
  const rsi14Score = percentileScores(rsi14, false);
  const vol20Score = percentileScores(vol20, true);
  const drawdown10Score = percentileScores(drawdown10, false);
  const amplitude10Score = percentileScores(amplitude10, true);
  const volumeHeatScore = percentileScores(volumeHeatRaw, false);

  const enriched = rows.map((row, index) => {
    const trendParts = [
      momentum60Score[index],
      momentum120Score[index],
      pricePosition120[index]
    ].filter((value) => value !== null);
    const momentumParts = [
      return20Score[index],
      rsi14Score[index]
    ].filter((value) => value !== null);
    const trendScore = trendParts.length ? average(trendParts) : null;
    const momentumScore = momentumParts.length ? average(momentumParts) : null;
    const downsideScore = average([
      drawdown10Score[index],
      return20Score[index]
    ].filter((value) => value !== null));
    const trendHealth = average([
      momentum60Score[index],
      return20Score[index],
      pricePosition120[index]
    ].filter((value) => value !== null));
    const rawComfortScore = average([
      vol20Score[index],
      amplitude10Score[index]
    ].filter((value) => value !== null));
    const comfortScore =
      rawComfortScore === null || trendHealth === null
        ? null
        : rawComfortScore * (trendHealth / 100);
    const riskScore = weightedAverage([
      { value: downsideScore, weight: 0.6 },
      { value: comfortScore, weight: 0.4 }
    ]);
    const volumeScore = volumeHeatScore[index];

    let fearGreed = null;
    if (
      trendScore !== null &&
      momentumScore !== null &&
      riskScore !== null &&
      volumeScore !== null
    ) {
      fearGreed =
        0.35 * trendScore +
        0.25 * momentumScore +
        0.35 * riskScore +
        0.05 * volumeScore;
    }

    return {
      date: row.date,
      open: round(row.open, 2),
      high: round(row.high, 2),
      low: round(row.low, 2),
      close: round(row.close, 2),
      volume: Math.round(row.volume),
      fearGreed: fearGreed === null ? null : round(fearGreed, 2),
      scores:
        fearGreed === null
          ? null
          : {
              trend: round(trendScore, 2),
              momentum: round(momentumScore, 2),
              risk: round(riskScore, 2),
              volume: round(volumeScore, 2)
      }
    };
  });

  const thresholds = buildThresholds(enriched.map((row) => row.fearGreed));
  const filtered = enriched.filter((row) => row.date >= DISPLAY_START_DATE && row.fearGreed !== null);
  const latest = filtered[filtered.length - 1];

  return {
    latest: latest
      ? {
          date: latest.date,
          close: latest.close,
          fearGreed: latest.fearGreed,
          zone: zoneLabel(latest.fearGreed, thresholds),
          scores: latest.scores
        }
      : null,
    points: filtered,
    meta: {
      symbol: meta.symbol || 'sh000001',
      name: meta.name || '上证指数',
      source: 'Tencent ifzq',
      model: 'v2 percentile model (AGU-inspired)',
      thresholds,
      windows: {
        ma60: 60,
        ma120: 120,
        pricePosition: 120,
        rsi: 14,
        return: 20,
        volatility: 20,
        drawdown: 10,
        amplitude: 10,
        volume: 20
      },
      weights: {
        trend: 0.35,
        momentum: 0.25,
        risk: 0.35,
        volume: 0.05
      }
    }
  };
}

module.exports = {
  computeFearGreedSeries,
  zoneLabel
};
