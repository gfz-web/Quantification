const recommendations = [
  {
    asset: '沪深300',
    strategy: 'MA10 拐头',
    returnPct: 20.04,
    status: '持仓中',
    note: '大盘宽基更适合用中短期趋势拐头过滤震荡。'
  },
  {
    asset: '中证500',
    strategy: 'MA10 拐头',
    returnPct: 56.33,
    status: '持仓中',
    note: '这段行情里 MA10 拐头兼顾趋势跟随和减少假突破。'
  },
  {
    asset: '中证1000',
    strategy: 'MA10 拐头',
    returnPct: 28.53,
    status: '持仓中',
    note: '小盘波动更大，采用 MA10 拐头来过滤一部分短线假突破。'
  },
  {
    asset: '科创50',
    strategy: 'MA10 拐头',
    returnPct: 54.25,
    status: '持仓中',
    note: '高弹性品种保留更灵敏的 MA10 拐头，方便更早跟随趋势变化。'
  },
  {
    asset: '黄金ETF',
    strategy: 'MA5 上穿/下穿',
    returnPct: 67.97,
    status: '空仓',
    note: '黄金这段更适合灵敏的短线均线，当前信号已经离场。'
  },
  {
    asset: '纳指ETF',
    strategy: 'MA20 拐头',
    returnPct: 34.41,
    status: '持仓中',
    note: '海外成长资产用 MA20 拐头偏中期跟踪，减少汇率和隔夜波动干扰。'
  }
];

const strategyTone = {
  'MA10 拐头': 'trend',
  'MA10 上穿/下穿': 'cross',
  'MA20 拐头': 'slow',
  'MA5 上穿/下穿': 'fast',
  'CCI14 强势': 'momentum'
};

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

function renderCards() {
  const list = document.getElementById('allocation-list');
  list.innerHTML = '';

  recommendations.forEach((item) => {
    const article = document.createElement('article');
    article.className = `allocation-card ${strategyTone[item.strategy] || 'trend'}`;
    article.innerHTML = `
      <div class="allocation-card-head">
        <div>
          <div class="metric-label">${item.asset}</div>
          <strong>${item.strategy}</strong>
        </div>
        <span class="status-badge ${item.status === '持仓中' ? 'holding' : 'empty'}">${item.status}</span>
      </div>
      <div class="allocation-return">${formatPct(item.returnPct)}</div>
      <p>${item.note}</p>
    `;
    list.appendChild(article);
  });
}

function renderTable() {
  const tableBody = document.getElementById('allocation-table');
  tableBody.innerHTML = '';

  recommendations.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.asset}</td>
      <td>${item.strategy}</td>
      <td class="positive">${formatPct(item.returnPct)}</td>
      <td><span class="status-badge ${item.status === '持仓中' ? 'holding' : 'empty'}">${item.status}</span></td>
      <td>${item.note}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function init() {
  renderCards();
  renderTable();
}

export { init };
