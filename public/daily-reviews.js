let cleanup = null;
let lastTrigger = null;
let activeModalAbortController = null;

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

function closeReviewModal() {
  stopActiveModalRequest();
  const modal = getEl('daily-review-modal');
  const shouldRestoreFocus = Boolean(modal && !modal.hidden);

  if (modal) {
    modal.hidden = true;
  }
  document.body.classList.remove('modal-open');
  if (shouldRestoreFocus && lastTrigger) {
    lastTrigger.focus();
  }
  lastTrigger = null;
}

async function openReviewModal(review, trigger) {
  const modal = getEl('daily-review-modal');
  const content = getEl('daily-review-content');
  const requestController = new AbortController();

  stopActiveModalRequest();
  activeModalAbortController = requestController;
  lastTrigger = trigger;

  setText('daily-review-modal-title', review.label);
  setText('daily-review-modal-meta', review.title);
  content.innerHTML = '<p>加载中...</p>';
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
    setText('daily-review-modal-title', detail.label);
    setText('daily-review-modal-meta', detail.title);
    content.innerHTML = renderMarkdown(detail.content);
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    content.innerHTML = `<div class="error">加载失败：${escapeHtml(error.message)}</div>`;
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'daily-review-item';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `${review.label}，点击查看复盘`);
    button.textContent = review.label;
    button.addEventListener('click', () => openReviewModal(review, button));
    list.appendChild(button);
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

  try {
    const payload = await fetchJson('/api/daily-reviews', { signal: abortController.signal });
    const reviews = payload.reviews || [];
    renderReviewList(reviews);
    setText('daily-review-count', String(reviews.length));
    setText('daily-review-status', reviews.length ? '已归档' : '暂无文档');
    setText('daily-review-latest', reviews[0] ? reviews[0].date : '--');
  } catch (error) {
    if (error.name === 'AbortError') {
      return destroy;
    }
    renderReviewList([]);
    setText('daily-review-count', '0');
    setText('daily-review-status', '加载失败');
    setText('daily-review-latest', '--');
    errorBox.hidden = false;
    errorBox.textContent = `加载失败：${error.message}`;
  } finally {
    list.setAttribute('aria-busy', 'false');
  }

  return destroy;
}

export { destroy, init };
