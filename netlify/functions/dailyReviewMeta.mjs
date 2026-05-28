const LEGACY_SLUG_LABELS = {
  'shanghai-index-chan-review': '上证缠论复盘',
  '红利复盘': '红利复盘'
};

const COMPACT_NAME_PATTERN = /^(\d{14})(.+)\.md$/i;
const DASHED_NAME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/i;

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function formatTimestampLabel(stamp) {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}`;
}

function buildReviewFileName(suffix, date = new Date()) {
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
  return `${stamp}${suffix}.md`;
}

function parseReviewFileName(fileName) {
  const compactMatch = fileName.match(COMPACT_NAME_PATTERN);
  if (compactMatch) {
    const [, stamp, suffix] = compactMatch;
    return {
      fileName,
      sortKey: stamp,
      date: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
      label: `${formatTimestampLabel(stamp)} ${suffix}`,
      suffix
    };
  }

  const dashedMatch = fileName.match(DASHED_NAME_PATTERN);
  if (dashedMatch) {
    const [, year, month, day, slug] = dashedMatch;
    const stamp = `${year}${month}${day}000000`;
    const suffixLabel = LEGACY_SLUG_LABELS[slug] || slug.replace(/-/g, ' ');
    return {
      fileName,
      sortKey: stamp,
      date: `${year}-${month}-${day}`,
      label: `${year}-${month}-${day} ${suffixLabel}`,
      suffix: suffixLabel
    };
  }

  const baseName = fileName.replace(/\.md$/i, '');
  return {
    fileName,
    sortKey: baseName,
    date: baseName,
    label: `${baseName} 复盘`,
    suffix: '复盘'
  };
}

function sortReviewFileNames(fileNames) {
  return [...fileNames].sort((a, b) => {
    const left = parseReviewFileName(a).sortKey;
    const right = parseReviewFileName(b).sortKey;
    return right.localeCompare(left) || b.localeCompare(a);
  });
}

function extractReviewDate(fileName) {
  return parseReviewFileName(fileName).date;
}

function extractReviewLabel(fileName) {
  return parseReviewFileName(fileName).label;
}

function extractReviewTitle(content, fileName) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : extractReviewLabel(fileName);
}

export {
  buildReviewFileName,
  parseReviewFileName,
  sortReviewFileNames,
  extractReviewDate,
  extractReviewLabel,
  extractReviewTitle
};
