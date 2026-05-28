import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DAILY_REVIEWS_DIR = path.resolve(process.cwd(), 'daily-reviews');

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function extractReviewDate(fileName) {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : fileName.replace(/\.md$/i, '');
}

function extractReviewTitle(content, fileName) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : `${extractReviewDate(fileName)} 复盘`;
}

function extractReviewLabel(fileName) {
  const date = extractReviewDate(fileName);
  const slugMatch = fileName.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/i);
  if (!slugMatch) {
    return `${date} 复盘`;
  }

  const slugLabels = {
    'shanghai-index-chan-review': '上证缠论复盘',
    '红利复盘': '红利复盘'
  };
  const name = slugLabels[slugMatch[1]] || slugMatch[1].replace(/-/g, ' ');
  return `${date} ${name}`;
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
  const reviewFiles = files
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  return Promise.all(reviewFiles.map(async (fileName) => {
    const content = await readReviewFile(fileName);
    const date = extractReviewDate(fileName);
    return {
      id: fileName,
      fileName,
      date,
      label: extractReviewLabel(fileName),
      title: extractReviewTitle(content, fileName)
    };
  }));
}

async function getDailyReview(fileName) {
  const content = await readReviewFile(fileName);
  const date = extractReviewDate(fileName);
  return {
    id: fileName,
    fileName,
    date,
    label: extractReviewLabel(fileName),
    title: extractReviewTitle(content, fileName),
    content
  };
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
