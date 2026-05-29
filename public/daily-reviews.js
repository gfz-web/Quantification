let cleanup = null;
let lastTrigger = null;
let activeModalAbortController = null;
let activeReview = null;
let activeView = 'full';

function getEl(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  getEl(id).textContent = value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function isTableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.indexOf('|', 1) !== trimmed.length - 1;
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(lines) {
  const rows = lines.map(parseTableRow);
  if (!rows.length) {
    return '';
  }

  const hasHeader = rows.length > 1 && isSeparatorRow(rows[1]);
  const bodyRows = hasHeader ? rows.slice(2) : rows;
  const header = hasHeader
    ? `<thead><tr>${rows[0].map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead>`
    : '';
  const body = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `<div class="markdown-table-wrap"><table>${header}<tbody>${body}</tbody></table></div>`;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let listType = null;
  let tableLines = [];
  let codeLines = [];
  let inCode = false;

  function closeList() {
    if (!listType) {
      return;
    }
    html.push(`</${listType}>`);
    listType = null;
  }

  function openList(type) {
    if (listType === type) {
      return;
    }
    closeList();
    listType = type;
    html.push(`<${type}>`);
  }

  function flushTable() {
    if (!tableLines.length) {
      return;
    }
    closeList();
    html.push(renderTable(tableLines));
    tableLines = [];
  }

  lines.forEach((line) => {
    if (/^```/.test(line.trim())) {
      flushTable();
      closeList();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (isTableLine(line)) {
      tableLines.push(line);
      return;
    }

    flushTable();

    if (!line.trim()) {
      closeList();
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 6);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      return;
    }

    if (/^-{3,}$/.test(line.trim())) {
      closeList();
      html.push('<hr>');
      return;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      openList('ul');
      html.push(`<li>${formatInline(unordered[1])}</li>`);
      return;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      openList('ol');
      html.push(`<li>${formatInline(ordered[1])}</li>`);
      return;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote>${formatInline(quote[1])}</blockquote>`);
      return;
    }

    closeList();
    html.push(`<p>${formatInline(line)}</p>`);
  });

  flushTable();
  closeList();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return html.join('');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function stopActiveModalRequest() {
  if (activeModalAbortController) {
    activeModalAbortController.abort();
    activeModalAbortController = null;
  }
}

function setReviewView(view) {
  const normalizedView = view === 'summary' ? 'summary' : 'full';
  const canShowSummary = Boolean(activeReview && activeReview.summaryUrl);
  activeView = canShowSummary && normalizedView === 'summary' ? 'summary' : 'full';

  const tabs = getEl('daily-review-view-tabs');
  const fullTab = getEl('daily-review-tab-full');
  const summaryTab = getEl('daily-review-tab-summary');
  const content = getEl('daily-review-content');
  const summaryFrame = getEl('daily-review-summary-frame');
  const dialog = getEl('daily-review-modal')?.querySelector('.daily-review-dialog');

  if (dialog) {
    dialog.classList.toggle('is-summary-view', activeView === 'summary');
  }

  if (tabs) {
    tabs.hidden = !canShowSummary;
  }

  if (fullTab && summaryTab) {
    fullTab.classList.toggle('is-active', activeView === 'full');
    summaryTab.classList.toggle('is-active', activeView === 'summary');
    fullTab.setAttribute('aria-selected', activeView === 'full' ? 'true' : 'false');
    summaryTab.setAttribute('aria-selected', activeView === 'summary' ? 'true' : 'false');
    summaryTab.disabled = !canShowSummary;
  }

  if (content && summaryFrame) {
    content.hidden = activeView !== 'full';
    summaryFrame.hidden = activeView !== 'summary';

    if (activeView === 'summary' && canShowSummary) {
      if (summaryFrame.getAttribute('src') !== activeReview.summaryUrl) {
        summaryFrame.setAttribute('src', activeReview.summaryUrl);
      }
    } else {
      summaryFrame.removeAttribute('src');
    }
  }
}

function closeReviewModal() {
  stopActiveModalRequest();
  const modal = getEl('daily-review-modal');
  const shouldRestoreFocus = Boolean(modal && !modal.hidden);

  activeReview = null;
  activeView = 'full';
  setReviewView('full');

  if (modal) {
    modal.hidden = true;
  }
  document.body.classList.remove('modal-open');
  if (shouldRestoreFocus && lastTrigger) {
    lastTrigger.focus();
  }
  lastTrigger = null;
}

async function openReviewModal(review, trigger, preferredView = 'full') {
  const modal = getEl('daily-review-modal');
  const content = getEl('daily-review-content');
  const requestController = new AbortController();

  stopActiveModalRequest();
  activeModalAbortController = requestController;
  lastTrigger = trigger;
  activeReview = review;
  activeView = preferredView === 'summary' && review.summaryUrl ? 'summary' : 'full';

  setText('daily-review-modal-title', review.label);
  setText('daily-review-modal-meta', review.title);
  content.innerHTML = '<p>加载中...</p>';
  setReviewView(activeView);
  modal.hidden = false;
  document.body.classList.add('modal-open');
  getEl('daily-review-close').focus();

  try {
    const detail = await fetchJson(`/api/daily-reviews?file=${encodeURIComponent(review.fileName)}`, {
      signal: requestController.signal
    });
    if (activeModalAbortController !== requestController) {
      return;
    }
    activeReview = detail;
    setText('daily-review-modal-title', detail.label);
    setText('daily-review-modal-meta', detail.title);
    content.innerHTML = renderMarkdown(detail.content);
    setReviewView(activeView);
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    content.innerHTML = `<div class="error">加载失败：${escapeHtml(error.message)}</div>`;
    setReviewView('full');
  } finally {
    if (activeModalAbortController === requestController) {
      activeModalAbortController = null;
    }
  }
}

function renderReviewList(reviews) {
  const list = getEl('daily-review-list');
  const empty = getEl('daily-review-empty');
  list.innerHTML = '';
  empty.hidden = reviews.length > 0;

  reviews.forEach((review) => {
    const row = document.createElement('div');
    row.className = 'daily-review-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'daily-review-item';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `${review.label}，点击查看完整复盘`);
    button.textContent = review.label;
    button.addEventListener('click', () => openReviewModal(review, button, 'full'));
    row.appendChild(button);

    if (review.hasSummary) {
      const summaryButton = document.createElement('button');
      summaryButton.type = 'button';
      summaryButton.className = 'daily-review-summary-btn';
      summaryButton.setAttribute('aria-label', `${review.label}，查看分模块摘要`);
      summaryButton.textContent = '摘要';
      summaryButton.addEventListener('click', () => openReviewModal(review, summaryButton, 'summary'));
      row.appendChild(summaryButton);
    }

    list.appendChild(row);
  });
}

function destroy() {
  stopActiveModalRequest();
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  closeReviewModal();
}

async function init() {
  destroy();

  const abortController = new AbortController();
  cleanup = () => abortController.abort();

  const list = getEl('daily-review-list');
  const errorBox = getEl('error');
  list.setAttribute('aria-busy', 'true');
  errorBox.hidden = true;

  getEl('daily-review-close').addEventListener('click', closeReviewModal, { signal: abortController.signal });
  getEl('daily-review-modal').addEventListener('click', (event) => {
    if (event.target && event.target.hasAttribute('data-review-close')) {
      closeReviewModal();
    }
  }, { signal: abortController.signal });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeReviewModal();
    }
  }, { signal: abortController.signal });

  getEl('daily-review-tab-full').addEventListener('click', () => setReviewView('full'), { signal: abortController.signal });
  getEl('daily-review-tab-summary').addEventListener('click', () => setReviewView('summary'), { signal: abortController.signal });

  try {
    const payload = await fetchJson('/api/daily-reviews', { signal: abortController.signal });
    const reviews = payload.reviews || [];
    const summaryCount = reviews.filter((review) => review.hasSummary).length;

    renderReviewList(reviews);
    setText('daily-review-count', String(reviews.length));
    setText('daily-review-status', reviews.length ? '已归档' : '暂无文档');
    setText('daily-review-latest', reviews[0] ? reviews[0].date : '--');
    setText('daily-review-summary-count', String(summaryCount));

    const summaryIndexLink = getEl('daily-review-summary-index');
    if (summaryIndexLink) {
      summaryIndexLink.hidden = summaryCount === 0;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return destroy;
    }
    renderReviewList([]);
    setText('daily-review-count', '0');
    setText('daily-review-status', '加载失败');
    setText('daily-review-latest', '--');
    setText('daily-review-summary-count', '0');
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  } finally {
    list.setAttribute('aria-busy', 'false');
  }

  return destroy;
}

export { destroy, init };
