import { existsSync } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSummaryFileName,
  buildSummaryPublicPath,
  extractReviewDate,
  extractReviewLabel,
  extractReviewTitle,
  sortReviewFileNames
} from './dailyReviewMeta.mjs';

const FUNCTION_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveDailyReviewsDir() {
  const candidates = [
    path.join(process.cwd(), 'daily-reviews'),
    path.resolve(FUNCTION_DIR, '../../daily-reviews')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`daily-reviews directory not found (cwd=${process.cwd()})`);
}

const DAILY_REVIEWS_DIR = resolveDailyReviewsDir();
const DAILY_REVIEW_SUMMARIES_DIR = resolveDailyReviewSummariesDir();

function resolveDailyReviewSummariesDir() {
  const candidates = [
    path.join(process.cwd(), 'public', 'daily-review-summaries'),
    path.resolve(FUNCTION_DIR, '../../public/daily-review-summaries')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

async function summaryExistsForReview(fileName) {
  const summaryFileName = buildSummaryFileName(fileName);
  if (!summaryFileName) {
    return false;
  }

  const summaryPath = path.join(DAILY_REVIEW_SUMMARIES_DIR, summaryFileName);
  try {
    await access(summaryPath);
    return true;
  } catch {
    return false;
  }
}

async function attachSummaryMeta(review) {
  const hasSummary = await summaryExistsForReview(review.fileName);
  return {
    ...review,
    hasSummary,
    summaryUrl: hasSummary ? buildSummaryPublicPath(review.fileName) : null
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function readReviewFile(fileName) {
  if (!fileName || path.basename(fileName) !== fileName || path.extname(fileName).toLowerCase() !== '.md') {
    throw new Error('Invalid review file name.');
  }

  const filePath = path.join(DAILY_REVIEWS_DIR, fileName);
  const relative = path.relative(DAILY_REVIEWS_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Forbidden review file path.');
  }

  return readFile(filePath, 'utf8');
}

async function listDailyReviews() {
  const files = await readdir(DAILY_REVIEWS_DIR, { withFileTypes: true });
  const reviewFiles = sortReviewFileNames(
    files
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => entry.name)
  );

  return Promise.all(reviewFiles.map(async (fileName) => {
    const content = await readReviewFile(fileName);
    const date = extractReviewDate(fileName);
    return attachSummaryMeta({
      id: fileName,
      fileName,
      date,
      label: extractReviewLabel(fileName),
      title: extractReviewTitle(content, fileName)
    });
  }));
}

async function getDailyReview(fileName) {
  const content = await readReviewFile(fileName);
  const date = extractReviewDate(fileName);
  return attachSummaryMeta({
    id: fileName,
    fileName,
    date,
    label: extractReviewLabel(fileName),
    title: extractReviewTitle(content, fileName),
    content
  });
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const fileName = url.searchParams.get('file');
    const payload = fileName ? await getDailyReview(fileName) : { reviews: await listDailyReviews() };
    return json(payload);
  } catch (error) {
    return json({ error: error.message }, error.code === 'ENOENT' ? 404 : 500);
  }
};
