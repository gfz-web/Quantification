const tabs = [
  { id: 'fear-greed', label: '恐贪值', title: 'A 股指数恐贪值 Demo', module: './app.js' },
  { id: 'cci', label: '多指数 CCI', title: '多指数 CCI 计算', module: './cci.js' },
  { id: 'weekly-boll', label: '周K布林', title: '周 K 布林带', module: './weekly-boll.js' },
  { id: 'sh-chan', label: '缠论日K', title: '缠论日 K 策略', module: './chan.js' },
  { id: 'sh-chan-intraday', label: '分钟缠论', title: '多标的分钟缠论策略', module: './chan-intraday.js' },
  { id: 'ma5', label: '五日线策略', title: '五日线策略计算', module: './ma5.js' },
  { id: 'ma5-turn', label: '五日线拐头', title: '五日线拐头策略计算', module: './ma5-turn.js' },
  { id: 'ma10', label: '十日线策略', title: '十日线策略计算', module: './ma10.js' },
  { id: 'ma10-turn', label: '十日线拐头', title: '十日线拐头策略计算', module: './ma10-turn.js' },
  { id: 'ma10-turn-fear', label: '拐头+恐贪', title: '十日线拐头 + 恐贪策略', module: './ma10-turn-fear.js' },
  { id: 'ma20-turn', label: '二十日线拐头', title: '二十日线拐头策略计算', module: './ma20-turn.js' },
  { id: 'strategy-ranking', label: '策略收益排序', title: '策略收益排序', module: './strategy-ranking.js' },
  { id: 'ma-predict', label: '明日均线', title: '明日 5/10 日线预测', module: './ma-predict.js' },
  { id: 'asset-allocation', label: '资产策略分配', title: '资产策略分配', module: './asset-allocation.js' },
  { id: 'daily-reviews', label: '每日复盘', title: '每日复盘', module: './daily-reviews.js' }
];

const templates = {
  'fear-greed': `
    <section class="hero">
      <aside class="panel summary">
        <div class="summary-head">
          <div>
            <div class="eyebrow">市场脉搏</div>
            <strong>实时情绪刻度</strong>
          </div>
          <div class="pulse-dot" aria-hidden="true"></div>
        </div>
        <div id="index-switcher" class="index-switcher" aria-label="指数切换"></div>
        <div class="score">
          <small id="score-label">最新恐贪值</small>
          <strong id="score-value">--</strong>
          <span id="score-zone">加载中...</span>
        </div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新点位</div><strong id="latest-close">--</strong></div>
          <div class="metric"><div class="metric-label">更新时间</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header">
        <div>
          <h2 id="chart-title">2024 年以来走势</h2>
          <div id="chart-subtitle" class="meta">指数点位和恐贪值双轴展示，支持拖动缩放、悬停查看每日明细。</div>
        </div>
        <div class="meta" id="range-label">2024-01-01 至今</div>
      </div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="指数和恐贪值图表"></div></div>
      <div class="legend">
        <span id="legend-price" class="price">指数收盘价</span>
        <span class="fear">恐贪值</span>
        <span class="band">恐惧 / 中性 / 贪婪区间</span>
      </div>
      <div class="factors">
        <div class="factor"><div class="metric-label">趋势结构</div><strong id="factor-trend">--</strong><div class="meta">close 相对 MA60 / MA120 + 120日位置</div></div>
        <div class="factor"><div class="metric-label">短线动量</div><strong id="factor-momentum">--</strong><div class="meta">20 日收益率 + RSI14</div></div>
        <div class="factor"><div class="metric-label">风险压力</div><strong id="factor-risk">--</strong><div class="meta">下跌压力 + 上涨舒适度</div></div>
        <div class="factor"><div class="metric-label">量能热度</div><strong id="factor-volume">--</strong><div class="meta">方向成交量: 量比 x 涨跌方向</div></div>
      </div>
      <div id="error" class="error" hidden></div>
    </section>
  `,

  cci: `
    <section class="hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">Tencent 数据源 / 沪深300 / CCI14</div>
        <h1 id="page-title">沪深300 CCI</h1>
        <p id="intro-text">从 2025-01-01 开始展示沪深300 CCI。计算公式为 TP = (High + Low + Close) / 3，CCI = (TP - TP 的 14 日均值) / (0.015 x 14 日平均绝对偏差)。</p>
        <div class="hero-signals" aria-label="CCI 区间">
          <span>CCI > 70 强势</span><span>-100 到 70 常态</span><span>CCI < -100 弱势</span>
        </div>
        <div class="date-controls" aria-label="回测日期区间">
          <label><span>开始日期</span><input id="start-date" type="date"></label>
          <label><span>结束日期</span><input id="end-date" type="date"></label>
          <button id="apply-date-range" type="button">应用区间</button>
          <button id="reset-date-range" type="button" class="ghost">重置</button>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Commodity Channel Index</div><strong>最新 CCI 状态</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="cci-switcher" class="index-switcher" aria-label="CCI 标的切换"></div>
        <div class="score"><small>最新 CCI14</small><strong id="cci-value">--</strong><span id="cci-zone">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新点位</div><strong id="latest-close">--</strong></div>
          <div class="metric"><div class="metric-label">更新时间</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>
    <section class="panel section">
      <div class="section-header"><div><h2 id="chart-heading">2025 年以来沪深300 CCI 走势</h2><div id="chart-subtitle" class="meta">上方为沪深300收盘价，下方为 CCI14；支持拖动缩放、悬停查看每日计算明细。</div></div><div class="meta" id="range-label">2025-01-01 至今</div></div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="沪深300收盘价和 CCI 图表"></div></div>
      <div class="legend"><span id="legend-price" class="price">沪深300收盘价</span><span class="cci">CCI14</span><span class="buy">买入点</span><span class="sell">卖出点</span><span class="band">+70 / +100 / -100 参考区间</span></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">计算周期</div><strong id="period-value">--</strong><div class="meta">默认使用常见 CCI14</div></div>
        <div class="factor"><div class="metric-label">最新 TP</div><strong id="tp-value">--</strong><div class="meta">(High + Low + Close) / 3</div></div>
        <div class="factor"><div class="metric-label">TP 14日均值</div><strong id="ma-value">--</strong><div class="meta">典型价格的简单移动平均</div></div>
        <div class="factor"><div class="metric-label">平均绝对偏差</div><strong id="md-value">--</strong><div class="meta" id="point-count">--</div></div>
      </div>
      ${tradeSection('收盘价', 'CCI14', '', '按收盘 CCI14 信号生成：突破 70 买入，跌破 100 卖出；卖出行展示本轮收益。')}
      <div id="error" class="error" hidden></div>
    </section>
  `,

  'weekly-boll': `
    <section class="hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">Tencent 数据源 / 沪深300 / 周K / BOLL20</div>
        <h1 id="page-title">沪深300 周K布林</h1>
        <p id="intro-text">按周 K 展示沪深300布林带。中轨为 20 周收盘价均线，上下轨为中轨加减 2 倍标准差。</p>
        <div class="hero-signals" aria-label="周 K 布林口径">
          <span>周 K</span><span>BOLL20</span><span>2 倍标准差</span>
        </div>
        <div class="date-controls" aria-label="周 K 日期区间">
          <label><span>开始日期</span><input id="start-date" type="date"></label>
          <label><span>结束日期</span><input id="end-date" type="date"></label>
          <button id="apply-date-range" type="button">应用区间</button>
          <button id="reset-date-range" type="button" class="ghost">重置</button>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Weekly Bollinger Bands</div><strong>最新周 K 状态</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="boll-switcher" class="index-switcher" aria-label="周 K 布林标的切换"></div>
        <div class="score"><small>BOLL 带宽</small><strong id="boll-width">--</strong><span id="boll-zone">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新周收盘</div><strong id="latest-close">--</strong></div>
          <div class="metric"><div class="metric-label">最新周日期</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>
    <section class="panel section">
      <div class="section-header"><div><h2 id="chart-heading">2024 年以来沪深300周 K 布林走势</h2><div id="chart-subtitle" class="meta">展示沪深300周 K 以及 BOLL20 上中下轨；支持拖动缩放、悬停查看每周 OHLC 和布林位置。</div></div><div class="meta" id="range-label">2024-01-01 至今</div></div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="周 K 和布林带图表"></div></div>
      <div class="legend"><span id="legend-price" class="price">沪深300周K</span><span class="cci">BOLL中轨</span><span class="sell">上轨</span><span class="buy">下轨</span></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">计算周期</div><strong id="period-value">--</strong><div class="meta">20 周收盘价简单移动平均</div></div>
        <div class="factor"><div class="metric-label">BOLL 上轨</div><strong id="upper-value">--</strong><div class="meta">中轨 + 2 倍标准差</div></div>
        <div class="factor"><div class="metric-label">BOLL 中轨</div><strong id="middle-value">--</strong><div class="meta">20 周收盘均值</div></div>
        <div class="factor"><div class="metric-label">BOLL 下轨</div><strong id="lower-value">--</strong><div class="meta" id="point-count">--</div></div>
      </div>
      <div id="error" class="error" hidden></div>
    </section>
  `,

  'sh-chan': `
    <section class="hero chan-hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">Tencent 数据源 / 上证指数 / 日K缠论</div>
        <h1 id="page-title">上证指数日K缠论</h1>
        <p>这是项目内多标的日 K 缠论策略：先把 K 线整理成笔和线段，再跟踪中枢形成、延伸、离开，并加入一买一卖与 MACD 面积背驰信号。</p>
        <div class="hero-signals" aria-label="缠论策略规则">
          <span id="chan-symbol-chip">上证指数</span><span>日K结构</span><span>一买一卖</span>
        </div>
        <div class="date-controls" aria-label="缠论回测日期区间">
          <label><span>开始日期</span><input id="start-date" type="date"></label>
          <label><span>结束日期</span><input id="end-date" type="date"></label>
          <button id="apply-date-range" type="button">应用区间</button>
          <button id="reset-date-range" type="button" class="ghost">重置</button>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Chan Structure</div><strong>最新走势结构</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="chan-symbol-switcher" class="index-switcher" aria-label="日 K 缠论标的切换"></div>
        <div class="score"><small>策略状态</small><strong id="chan-signal">--</strong><span id="chan-zone">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新点位</div><strong id="latest-close">--</strong></div>
          <div class="metric"><div class="metric-label">更新时间</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header">
        <div>
          <h2 id="chart-heading">上证指数日K缠论结构</h2>
          <div id="chart-subtitle" class="meta">一买/一卖要求中枢离开后的背驰；二买/二卖看回踩和反抽。</div>
        </div>
        <div class="meta" id="range-label">2024-01-01 至今</div>
      </div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="上证指数日 K 缠论结构图表"></div></div>
      <div class="legend"><span id="legend-price" class="price">上证指数日K</span><span class="cci">笔/线段</span><span class="band">中枢</span><span class="second-buy">一买/二买/底背驰</span><span class="second-sell">一卖/二卖/顶背驰</span></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">最近一笔</div><strong id="latest-stroke">--</strong><div class="meta" id="latest-stroke-meta">顶底分型连接</div></div>
        <div class="factor"><div class="metric-label">最新中枢</div><strong id="latest-center">--</strong><div class="meta" id="latest-center-meta">三笔重叠区间</div></div>
        <div class="factor"><div class="metric-label">结构数量</div><strong id="structure-count">--</strong><div class="meta" id="structure-meta">分型 / 笔 / 中枢</div></div>
        <div class="factor"><div class="metric-label">最近信号</div><strong id="latest-trade-signal">--</strong><div class="meta" id="latest-trade-meta">一买 / 二买 / 一卖 / 二卖</div></div>
      </div>
      <div class="trade-section">
        <div class="section-header trade-header"><div><h2>交易操作列表</h2><div class="meta">回测起点空仓，买入信号后下一交易日开盘买入，卖出信号后下一交易日开盘卖出；不计手续费和滑点。</div></div></div>
        <div class="backtest-summary">
          <div class="metric"><div class="metric-label">起始资金</div><strong id="initial-cash">--</strong></div>
          <div class="metric"><div class="metric-label">当前总资产</div><strong id="final-value">--</strong></div>
          <div class="metric"><div class="metric-label">总收益</div><strong id="total-profit">--</strong></div>
          <div class="metric"><div class="metric-label">总收益率</div><strong id="total-return">--</strong></div>
          <div class="metric"><div class="metric-label">操作次数</div><strong id="operation-count">--</strong></div>
          <div class="metric"><div class="metric-label">胜率</div><strong id="win-rate">--</strong></div>
          <div class="metric"><div class="metric-label">当前状态</div><strong id="position-status">--</strong></div>
        </div>
        <div class="trade-table-wrap">
          <table class="trade-table chan-trade-table">
            <thead><tr><th>结构日</th><th>确认日</th><th>成交日</th><th>操作</th><th>信号</th><th>成交价</th><th>结构参考</th><th>卖出收益</th><th>持仓天数</th></tr></thead>
            <tbody id="trade-list"></tbody>
          </table>
        </div>
        <div id="trade-empty" class="meta">当前区间暂无可执行缠论信号。</div>
      </div>
      <div class="trade-section">
        <div class="section-header trade-header"><div><h2>近期笔结构</h2><div class="meta">展示最近形成的有效笔，便于核对当前走势处在上行笔、下行笔或中枢震荡内。</div></div></div>
        <div class="trade-table-wrap">
          <table class="trade-table chan-structure-table">
            <thead><tr><th>方向</th><th>起点</th><th>终点</th><th>起点价</th><th>终点价</th><th>幅度</th><th>归属中枢</th></tr></thead>
            <tbody id="stroke-list"></tbody>
          </table>
        </div>
      </div>
      <div id="error" class="error" hidden></div>
    </section>
  `,

  'sh-chan-intraday': `
    <section class="hero chan-hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">Tencent 数据源 / 上证指数 / 30分钟K</div>
        <h1 id="page-title">上证指数30分钟缠论</h1>
        <p>这是项目内多标的分钟 K 的缠论小波段页。默认看上证指数 30 分钟，也可以切换 60 分钟、15 分钟和 5 分钟；策略加入线段、中枢生命周期、一买一卖和背驰信号。</p>
        <div class="hero-signals" aria-label="分钟缠论策略规则">
          <span id="intraday-symbol-chip">上证指数</span><span>周期切换</span><span>一买一卖</span>
        </div>
        <div id="intraday-period-switcher" class="period-controls" aria-label="分钟 K 周期切换"></div>
        <div id="intraday-notification-controls" class="notification-controls" aria-label="分钟缠论通知" hidden>
          <button id="intraday-notify-toggle" class="notify-button" type="button">开启微信提醒</button>
          <div class="notify-status">
            <strong id="intraday-notify-state">未开启</strong>
            <span id="intraday-notify-detail">监控 30分钟，微信推送新信号</span>
          </div>
        </div>
        <div class="intraday-status-panel" aria-label="分钟缠论策略状态">
          <div class="score"><small>策略状态</small><strong id="chan-signal">--</strong><span id="chan-zone">加载中...</span></div>
          <div class="score-track" aria-hidden="true"><span></span></div>
          <div class="metrics">
            <div class="metric"><div class="metric-label">最新点位</div><strong id="latest-close">--</strong></div>
            <div class="metric"><div class="metric-label">最新时间</div><strong id="latest-date">--</strong></div>
          </div>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Intraday Chan</div><strong>最新分钟结构</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="intraday-symbol-switcher" class="index-switcher" aria-label="分钟缠论标的切换"></div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header">
        <div>
          <h2 id="chart-heading">上证指数30分钟K缠论结构</h2>
          <div id="chart-subtitle" class="meta">一买/一卖要求中枢离开后的背驰；二买/二卖看回踩和反抽。</div>
        </div>
        <div class="meta" id="range-label">加载中...</div>
      </div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="上证指数分钟 K 缠论结构图表"></div></div>
      <div class="legend"><span id="legend-price" class="price">上证指数分钟K</span><span class="cci">笔/线段</span><span class="band">中枢</span><span class="intraday-buy-signals">一买/二买/底背驰</span><span class="intraday-sell-signals">一卖/二卖/顶背驰</span></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">当前周期</div><strong id="period-value">--</strong><div class="meta" id="period-meta">分钟 K 样本</div></div>
        <div class="factor"><div class="metric-label">最近一笔</div><strong id="latest-stroke">--</strong><div class="meta" id="latest-stroke-meta">顶底分型连接</div></div>
        <div class="factor"><div class="metric-label">最新中枢</div><strong id="latest-center">--</strong><div class="meta" id="latest-center-meta">三笔重叠区间</div></div>
        <div class="factor"><div class="metric-label">结构数量</div><strong id="structure-count">--</strong><div class="meta" id="structure-meta">分型 / 笔 / 中枢</div></div>
        <div class="factor"><div class="metric-label">最近信号</div><strong id="latest-trade-signal">--</strong><div class="meta" id="latest-trade-meta">一买 / 二买 / 一卖 / 二卖</div></div>
      </div>
      <div class="trade-section live-signal-section">
        <div class="section-header trade-header"><div><h2>实盘提示记录</h2><div class="meta">买点或卖点一旦触发就写入账本，后续刷新只更新状态和补救动作。</div></div></div>
        <div class="backtest-summary live-ledger-summary">
          <div class="metric"><div class="metric-label">记录数量</div><strong id="live-record-count">--</strong></div>
          <div class="metric"><div class="metric-label">有效跟踪</div><strong id="live-active-count">--</strong></div>
          <div class="metric"><div class="metric-label">需要补救</div><strong id="live-rescue-count">--</strong></div>
          <div class="metric"><div class="metric-label">最近检查</div><strong id="live-ledger-updated">--</strong></div>
        </div>
        <div class="trade-table-wrap">
          <table class="trade-table chan-live-signal-table">
            <thead><tr><th>提示时间</th><th>成交时间</th><th>操作</th><th>信号</th><th>提示价</th><th>结构位</th><th>状态</th><th>补救动作</th></tr></thead>
            <tbody id="live-signal-list"></tbody>
          </table>
        </div>
        <div id="live-signal-empty" class="meta">当前标的和周期还没有实盘提示记录。</div>
      </div>
      <div class="trade-section">
        <div class="section-header trade-header"><div><h2>回测操作列表</h2><div class="meta">回测起点空仓，买入信号后下一根分钟 K 开盘买入，卖出信号后下一根分钟 K 开盘卖出；不计手续费和滑点。</div></div></div>
        <div class="backtest-summary">
          <div class="metric"><div class="metric-label">起始资金</div><strong id="initial-cash">--</strong></div>
          <div class="metric"><div class="metric-label">当前总资产</div><strong id="final-value">--</strong></div>
          <div class="metric"><div class="metric-label">总收益</div><strong id="total-profit">--</strong></div>
          <div class="metric"><div class="metric-label">总收益率</div><strong id="total-return">--</strong></div>
          <div class="metric"><div class="metric-label">操作次数</div><strong id="operation-count">--</strong></div>
          <div class="metric"><div class="metric-label">胜率</div><strong id="win-rate">--</strong></div>
          <div class="metric"><div class="metric-label">当前状态</div><strong id="position-status">--</strong></div>
        </div>
        <div class="trade-table-wrap">
          <table class="trade-table chan-trade-table chan-intraday-trade-table">
            <thead><tr><th>结构时间</th><th>确认时间</th><th>成交时间</th><th>操作</th><th>信号</th><th>成交价</th><th>结构参考</th><th>卖出收益</th><th>持仓时长</th></tr></thead>
            <tbody id="trade-list"></tbody>
          </table>
        </div>
        <div id="trade-empty" class="meta">当前周期暂无可执行缠论信号。</div>
      </div>
      <div class="trade-section">
        <div class="section-header trade-header"><div><h2>近期笔结构</h2><div class="meta">展示当前分钟周期最近形成的有效笔，便于核对小波段结构。</div></div></div>
        <div class="trade-table-wrap">
          <table class="trade-table chan-structure-table">
            <thead><tr><th>方向</th><th>起点</th><th>终点</th><th>起点价</th><th>终点价</th><th>幅度</th><th>归属中枢</th></tr></thead>
            <tbody id="stroke-list"></tbody>
          </table>
        </div>
      </div>
      <div id="error" class="error" hidden></div>
    </section>
  `,

  ma10: `
    ${maHero('十日线策略', 'Tencent 数据源 / 沪深300 / MA10', '按收盘价和 10 日简单移动平均线计算交易信号：收盘价上穿十日线买入，收盘价下穿十日线卖出。', '收盘价 / MA10', 'ma-gap')}
    ${maSection('2025 年以来沪深300十日线走势', '展示收盘价、MA10 和上穿/下穿交易点；支持拖动缩放、悬停查看每日明细。', '偏离幅度', 'gap-value', '收盘价相对 MA10', tradeSection('收盘价', 'MA10', '<th>偏离幅度</th>', '按收盘价穿越 MA10 生成：上穿买入，下穿卖出；卖出行展示本轮收益。'))}
  `,

  ma5: `
    ${maHero('五日线策略', 'Tencent 数据源 / 沪深300 / MA5', '按收盘价和 5 日简单移动平均线计算交易信号：收盘价上穿五日线买入，收盘价下穿五日线卖出。', '收盘价 / MA5', 'ma-gap', 'MA5', '五日线')}
    ${maSection('2025 年以来沪深300五日线走势', '展示收盘价、MA5 和上穿/下穿交易点；支持拖动缩放、悬停查看每日明细。', '偏离幅度', 'gap-value', '收盘价相对 MA5', tradeSection('收盘价', 'MA5', '<th>偏离幅度</th>', '按收盘价穿越 MA5 生成：上穿买入，下穿卖出；卖出行展示本轮收益。'), 'MA5', '五日线')}
  `,

  'ma5-turn': `
    ${maHero('五日线拐头策略', 'Tencent 数据源 / 沪深300 / MA5 拐头', '按 MA5 斜率拐头计算交易信号：五日线由走弱转向上买入，由走强转向下卖出。', 'MA5 日变化', 'ma-slope', 'MA5', '五日线')}
    ${maSection('2025 年以来沪深300五日线拐头走势', '展示收盘价、MA5 和拐头买卖点；支持拖动缩放、悬停查看每日明细。', 'MA5 日变化', 'slope-value', '今日 MA5 - 昨日 MA5', tradeSection('收盘价', 'MA5', '<th>MA5 日变化</th>', '按 MA5 斜率拐头生成：拐头向上买入，拐头向下卖出；卖出行展示本轮收益。'), 'MA5', '五日线')}
  `,

  'ma10-turn': `
    ${maHero('十日线拐头策略', 'Tencent 数据源 / 沪深300 / MA10 拐头', '按 MA10 斜率拐头计算交易信号：十日线由走弱转向上买入，由走强转向下卖出。', 'MA10 日变化', 'ma-slope')}
    ${maSection('2025 年以来沪深300十日线拐头走势', '展示收盘价、MA10 和拐头买卖点；支持拖动缩放、悬停查看每日明细。', 'MA10 日变化', 'slope-value', '今日 MA10 - 昨日 MA10', tradeSection('收盘价', 'MA10', '<th>MA10 日变化</th>', '按 MA10 斜率拐头生成：拐头向上买入，拐头向下卖出；卖出行展示本轮收益。'))}
  `,

  'ma10-turn-fear': `
    <section class="hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">Tencent 数据源 / 沪深300 / MA10 拐头 + 恐贪</div>
        <h1 id="page-title">十日线拐头 + 恐贪策略</h1>
        <p id="intro-text">在 MA10 拐头策略基础上叠加极端恐贪：MA10 斜率由非正转正或恐贪小于 5 买入；MA10 斜率由非负转负或恐贪大于 88 卖出。</p>
        <div class="hero-signals" aria-label="组合策略规则">
          <span>MA10 拐头</span><span>恐贪 < 5 买入</span><span>恐贪 > 88 卖出</span>
        </div>
        <div class="date-controls" aria-label="回测日期区间">
          <label><span>开始日期</span><input id="start-date" type="date"></label>
          <label><span>结束日期</span><input id="end-date" type="date"></label>
          <button id="apply-date-range" type="button">应用区间</button>
          <button id="reset-date-range" type="button" class="ghost">重置</button>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">MA10 Turn + Fear Greed</div><strong>最新组合状态</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="ma-switcher" class="index-switcher" aria-label="组合策略标的切换"></div>
        <div class="score"><small>最新恐贪值</small><strong id="ma-slope">--</strong><span id="ma-zone">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新点位</div><strong id="latest-close">--</strong></div>
          <div class="metric"><div class="metric-label">更新时间</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>
    <section class="panel section">
      <div class="section-header"><div><h2 id="chart-heading">2025 年以来沪深300 MA10 拐头 + 恐贪走势</h2><div id="chart-subtitle" class="meta">上方展示沪深300收盘价与 MA10，下方展示恐贪值；买入阈值 5，卖出阈值 88。</div></div><div class="meta" id="range-label">2025-01-01 至今</div></div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="指数收盘价、MA10 和恐贪值图表"></div></div>
      <div class="legend"><span id="legend-price" class="price">沪深300收盘价</span><span class="cci">MA10</span><span class="fear">恐贪值</span><span class="buy">买入点</span><span class="sell">卖出点</span></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">计算周期</div><strong id="period-value">--</strong><div class="meta">十日线简单移动平均</div></div>
        <div class="factor"><div class="metric-label">最新 MA10</div><strong id="ma-value">--</strong><div class="meta">最近交易日收盘均值</div></div>
        <div class="factor"><div class="metric-label">MA10 日变化</div><strong id="slope-value">--</strong><div class="meta">今日 MA10 - 昨日 MA10</div></div>
        <div class="factor"><div class="metric-label">最新恐贪值</div><strong id="fear-value">--</strong><div class="meta" id="point-count">--</div></div>
      </div>
      ${tradeSection('收盘价', 'MA10', '<th>MA10 日变化</th><th>恐贪值</th><th>信号来源</th>', '按 MA10 拐头和极端恐贪生成：拐头向上或恐贪小于 5 买入，拐头向下或恐贪大于 88 卖出；卖出行展示本轮收益。')}
      <div id="error" class="error" hidden></div>
    </section>
  `,

  'ma20-turn': `
    ${maHero('二十日线拐头策略', 'Tencent 数据源 / 沪深300 / MA20 拐头', '按 MA20 斜率拐头计算交易信号：二十日线由走弱转向上买入，由走强转向下卖出。', 'MA20 日变化', 'ma-slope', 'MA20', '二十日线')}
    ${maSection('2025 年以来沪深300二十日线拐头走势', '展示收盘价、MA20 和拐头买卖点；支持拖动缩放、悬停查看每日明细。', 'MA20 日变化', 'slope-value', '今日 MA20 - 昨日 MA20', tradeSection('收盘价', 'MA20', '<th>MA20 日变化</th>', '按 MA20 斜率拐头生成：拐头向上买入，拐头向下卖出；卖出行展示本轮收益。'), 'MA20', '二十日线')}
  `,

  'strategy-ranking': `
    <section class="hero strategy-ranking-hero">
      <article class="panel hero-copy">
        <div class="badge">Tencent 数据源 / 多标的 / 七策略回测</div>
        <h1>策略收益排序</h1>
        <p>对每个标的分别回测 CCI、五日线、五日线拐头、十日线、十日线拐头、二十日线拐头、十日拐头+恐贪，并按总收益率从高到低排序。</p>
        <div class="hero-signals" aria-label="策略排序口径">
          <span>区间首日买入</span><span>按标的内排序</span><span>全仓买卖回测</span>
        </div>
        <div class="date-controls" aria-label="策略排序日期区间">
          <label><span>开始日期</span><input id="start-date" type="date"></label>
          <label><span>结束日期</span><input id="end-date" type="date"></label>
          <button id="apply-date-range" type="button">应用区间</button>
          <button id="reset-date-range" type="button" class="ghost">重置</button>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Strategy Ranking</div><strong>当前最优</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div class="score"><small>最高收益率</small><strong id="ranking-best-return">--</strong><span id="ranking-best-label">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">覆盖组合</div><strong id="ranking-coverage">--</strong></div>
          <div class="metric"><div class="metric-label">日期区间</div><strong id="ranking-range-label">--</strong></div>
        </div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header">
        <div>
          <h2>每个标的最佳策略</h2>
          <div class="meta">先看各标的第一名，再在下方明细表查看七个策略的完整收益排序。</div>
        </div>
        <div class="meta">不构成投资建议</div>
      </div>
      <div id="ranking-overview" class="ranking-grid" aria-label="每个标的最佳策略"></div>
      <div class="allocation-notes ranking-notes">
        <div class="factor"><div class="metric-label">正收益策略</div><strong id="ranking-positive-count">--</strong><div class="meta">当前区间内收益率大于 0 的策略数</div></div>
        <div class="factor"><div class="metric-label">当前持仓</div><strong id="ranking-holding-count">--</strong><div class="meta">回测结束时仍处于持仓状态的策略数</div></div>
        <div class="factor"><div class="metric-label">平均收益率</div><strong id="ranking-average-return">--</strong><div class="meta">全部标的和策略的简单平均</div></div>
      </div>
      <div class="trade-section">
        <div class="section-header trade-header">
          <div><h2>收益排序明细</h2><div class="meta">每张表对应一个标的，收益率按区间首日收盘价买入、初始 100 万全仓交易计算，不计手续费和滑点。</div></div>
        </div>
        <div id="ranking-groups" class="ranking-groups"></div>
      </div>
      <div id="error" class="error" hidden></div>
    </section>
  `,

  'ma-predict': `
    <section class="hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">Tencent 数据源 / 实时价 / MA5 + MA10</div>
        <h1 id="page-title">明日均线</h1>
        <p id="intro-text">用今天实时价格作为假设的明日收盘价，预演下一交易日 5 日线和 10 日线的位置、日变化和拐头条件。</p>
        <div class="hero-signals" aria-label="明日均线预测口径">
          <span>实时价代入</span><span>MA5 / MA10</span><span>拐头价位</span>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Moving Average Forecast</div><strong>当前标的</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="ma-switcher" class="index-switcher" aria-label="预测标的切换"></div>
        <div class="score"><small>假设明日收盘价</small><strong id="assumed-close">--</strong><span id="quote-status">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">行情时间</div><strong id="quote-time">--</strong></div>
          <div class="metric"><div class="metric-label">历史最新日</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header"><div><h2 id="chart-heading">明日 5/10 日线预测</h2><div id="chart-subtitle" class="meta">假设下一交易日收盘价等于当前实时价；表内同时给出均线走平/拐头向上的关键收盘价。</div></div><div class="meta" id="range-label">--</div></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">历史最新收盘</div><strong id="latest-close">--</strong><div class="meta">历史 K 线最新收盘</div></div>
        <div class="factor"><div class="metric-label">实时涨跌</div><strong id="realtime-change">--</strong><div class="meta">实时价相对历史最新收盘</div></div>
        <div class="factor"><div class="metric-label">预测 MA5</div><strong id="ma5-value">--</strong><div class="meta" id="ma5-note">--</div></div>
        <div class="factor"><div class="metric-label">预测 MA10</div><strong id="ma10-value">--</strong><div class="meta" id="ma10-note">--</div></div>
        <div class="factor"><div class="metric-label">实时价 - 当前 MA5</div><strong id="ma5-gap">--</strong><div class="meta">(实时价 - 当前 MA5) / 实时价</div></div>
        <div class="factor"><div class="metric-label">实时价 - 当前 MA10</div><strong id="ma10-gap">--</strong><div class="meta">(实时价 - 当前 MA10) / 实时价</div></div>
      </div>
      <div class="trade-section">
        <div class="section-header trade-header"><div><h2>预测明细</h2><div class="meta">公式：明日 MA = 最近 N-1 个交易日收盘价 + 假设明日收盘价，再除以 N。</div></div></div>
        <div class="trade-table-wrap">
          <table class="trade-table">
            <thead><tr><th>周期</th><th>明日预测均线</th><th>实时价偏离当前均线</th><th>当前均线</th><th>日变化</th><th>走向</th><th>拐头向上关键价</th></tr></thead>
            <tbody id="predict-list"></tbody>
          </table>
        </div>
      </div>
      <div id="error" class="error" hidden></div>
    </section>
  `,

  'asset-allocation': `
    <section class="hero allocation-hero">
      <article class="panel hero-copy">
        <div class="badge">2025-01-02 至 2026-05-11 / 现有策略回测</div>
        <h1>资产策略分配</h1>
        <p>基于现有可回测策略，在沪深300、中证500、中证1000、科创50、黄金ETF、纳指ETF之间做资产策略分配。不计手续费和滑点，结果用于策略分配参考。</p>
        <div class="hero-signals" aria-label="资产策略分配口径">
          <span>同一起始资金</span><span>全仓买卖回测</span><span>按资产指定策略</span>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Strategy Allocation</div><strong>组合口径</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div class="score"><small>覆盖标的</small><strong>6</strong><span>宽基 / 黄金 / 纳指</span></div>
        <div class="score-track" aria-hidden="true"><span style="width: 88%;"></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">主要策略</div><strong>MA10 拐头</strong></div>
          <div class="metric"><div class="metric-label">中期策略</div><strong>MA20 拐头</strong></div>
        </div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header">
        <div>
          <h2>推荐分配</h2>
          <div class="meta">每个标的采用当前指定的策略分配；当前状态来自该策略最后一个信号。</div>
        </div>
        <div class="meta">不构成投资建议</div>
      </div>
      <div id="allocation-list" class="allocation-grid" aria-label="资产策略卡片"></div>
      <div class="trade-section">
        <div class="section-header trade-header"><div><h2>策略明细</h2><div class="meta">回测区间为 2025-01-02 到 2026-05-11，收益率按初始 100 万全仓交易计算。</div></div></div>
        <div class="trade-table-wrap">
          <table class="trade-table allocation-table">
            <thead><tr><th>标的</th><th>推荐策略</th><th>回测收益</th><th>当前状态</th><th>分配说明</th></tr></thead>
            <tbody id="allocation-table"></tbody>
          </table>
        </div>
      </div>
      <div class="allocation-notes">
        <div class="factor"><div class="metric-label">使用方式</div><strong>按标的切换策略</strong><div class="meta">买入前回到对应策略页确认最新信号和日期区间。</div></div>
        <div class="factor"><div class="metric-label">主要风险</div><strong>历史最优偏差</strong><div class="meta">这只是当前回测区间最优，后续行情可能切换风格。</div></div>
        <div class="factor"><div class="metric-label">建议补充</div><strong>最大回撤</strong><div class="meta">下一步可以把回撤、交易次数、胜率一起纳入排序。</div></div>
      </div>
    </section>
  `,

  'daily-reviews': `
    <section class="hero daily-review-hero">
      <article class="panel hero-copy">
        <div class="badge">Daily Review / Markdown</div>
        <h1>每日复盘</h1>
        <p>每日记录盘面结构、关键价位与次日计划，沉淀到同一条复盘链路里。</p>
        <div class="hero-signals" aria-label="复盘要点">
          <span>盘面数据</span><span>多级别结构</span><span>次日计划</span>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Review Archive</div><strong>复盘归档</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div class="score"><small>文档数量</small><strong id="daily-review-count">--</strong><span id="daily-review-status">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span style="width: 100%;"></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新日期</div><strong id="daily-review-latest">--</strong></div>
          <div class="metric"><div class="metric-label">来源目录</div><strong>daily-reviews</strong></div>
        </div>
      </aside>
    </section>

    <section class="panel section">
      <div class="section-header">
        <div>
          <h2>复盘列表</h2>
          <div class="meta">按文档时间戳倒序排列；新文档命名：<code>YYYYMMDDHHmmss</code> + 类型 + <code>复盘</code>，如 <code>20260528150000上证复盘.md</code>。</div>
        </div>
        <div class="meta">Markdown</div>
      </div>
      <div id="daily-review-list" class="daily-review-list" aria-label="每日复盘列表"></div>
      <div id="daily-review-empty" class="meta" hidden>暂无复盘文档。</div>
      <div id="error" class="error" hidden></div>
    </section>

    <div id="daily-review-modal" class="daily-review-modal" role="dialog" aria-modal="true" aria-labelledby="daily-review-modal-title" hidden>
      <div class="daily-review-backdrop" data-review-close></div>
      <article class="daily-review-dialog">
        <header class="daily-review-dialog-head">
          <div>
            <div class="eyebrow">Daily Review</div>
            <h2 id="daily-review-modal-title">每日复盘</h2>
            <div id="daily-review-modal-meta" class="meta">--</div>
          </div>
          <button id="daily-review-close" class="daily-review-close" type="button" aria-label="关闭复盘弹窗">×</button>
        </header>
        <div id="daily-review-content" class="daily-review-markdown"></div>
      </article>
    </div>
  `
};

function maHero(title, badge, intro, scoreLabel, scoreId, periodLabel = 'MA10', lineLabel = '十日线') {
  return `
    <section class="hero">
      <article class="panel hero-copy">
        <div id="badge-symbol" class="badge">${badge}</div>
        <h1 id="page-title">${title}</h1>
        <p id="intro-text">${intro}</p>
        <div class="hero-signals" aria-label="${lineLabel}策略规则">
          <span>${periodLabel} 信号</span><span>全仓买卖回测</span><span>支持日期区间</span>
        </div>
        <div class="date-controls" aria-label="回测日期区间">
          <label><span>开始日期</span><input id="start-date" type="date"></label>
          <label><span>结束日期</span><input id="end-date" type="date"></label>
          <button id="apply-date-range" type="button">应用区间</button>
          <button id="reset-date-range" type="button" class="ghost">重置</button>
        </div>
      </article>
      <aside class="panel summary">
        <div class="summary-head"><div><div class="eyebrow">Moving Average</div><strong>最新${lineLabel}状态</strong></div><div class="pulse-dot" aria-hidden="true"></div></div>
        <div id="ma-switcher" class="index-switcher" aria-label="${lineLabel}标的切换"></div>
        <div class="score"><small>${scoreLabel}</small><strong id="${scoreId}">--</strong><span id="ma-zone">加载中...</span></div>
        <div class="score-track" aria-hidden="true"><span></span></div>
        <div class="metrics">
          <div class="metric"><div class="metric-label">最新点位</div><strong id="latest-close">--</strong></div>
          <div class="metric"><div class="metric-label">更新时间</div><strong id="latest-date">--</strong></div>
        </div>
      </aside>
    </section>
  `;
}

function maSection(heading, subtitle, metricLabel, metricId, metricMeta, trades, periodLabel = 'MA10', lineLabel = '十日线') {
  return `
    <section class="panel section">
      <div class="section-header"><div><h2 id="chart-heading">${heading}</h2><div id="chart-subtitle" class="meta">${subtitle}</div></div><div class="meta" id="range-label">2025-01-01 至今</div></div>
      <div class="chart-frame"><div id="chart" class="chart-canvas" aria-label="指数收盘价和${lineLabel}图表"></div></div>
      <div class="legend"><span id="legend-price" class="price">沪深300收盘价</span><span class="cci">${periodLabel}</span><span class="buy">买入点</span><span class="sell">卖出点</span></div>
      <div class="factors">
        <div class="factor"><div class="metric-label">计算周期</div><strong id="period-value">--</strong><div class="meta">${lineLabel}简单移动平均</div></div>
        <div class="factor"><div class="metric-label">最新 ${periodLabel}</div><strong id="ma-value">--</strong><div class="meta">最近交易日收盘均值</div></div>
        <div class="factor"><div class="metric-label">${metricLabel}</div><strong id="${metricId}">--</strong><div class="meta">${metricMeta}</div></div>
        <div class="factor"><div class="metric-label">有效样本</div><strong id="point-count">--</strong><div class="meta">已形成 ${periodLabel} 的交易日</div></div>
      </div>
      ${trades}
      <div id="error" class="error" hidden></div>
    </section>
  `;
}

function tradeSection(closeHead, signalHead, extraHead, summary) {
  return `
    <div class="trade-section">
      <div class="section-header trade-header"><div><h2>交易操作列表</h2><div class="meta">${summary} 回测起点按区间首日收盘价先买入。</div></div></div>
      <div class="backtest-summary">
        <div class="metric"><div class="metric-label">起始资金</div><strong id="initial-cash">--</strong></div>
        <div class="metric"><div class="metric-label">当前总资产</div><strong id="final-value">--</strong></div>
        <div class="metric"><div class="metric-label">总收益</div><strong id="total-profit">--</strong></div>
        <div class="metric"><div class="metric-label">总收益率</div><strong id="total-return">--</strong></div>
        <div class="metric"><div class="metric-label">操作次数</div><strong id="operation-count">--</strong></div>
        <div class="metric"><div class="metric-label">胜率</div><strong id="win-rate">--</strong></div>
        <div class="metric"><div class="metric-label">当前状态</div><strong id="position-status">--</strong></div>
      </div>
      <div class="trade-table-wrap">
        <table class="trade-table">
          <thead><tr><th>日期</th><th>操作</th><th>${closeHead}</th><th>${signalHead}</th>${extraHead}<th>卖出收益</th><th>持仓天数</th></tr></thead>
          <tbody id="trade-list"></tbody>
        </table>
      </div>
      <div id="trade-empty" class="meta">暂无交易信号。</div>
    </div>
  `;
}

const tabNav = document.getElementById('tab-nav');
const pageRoot = document.getElementById('page-root');
let isLoading = false;
let currentCleanup = null;

function directChildByClass(parent, className) {
  return Array.from(parent.children).find((child) => child.classList.contains(className));
}

function moveSummaryStatusLeft() {
  const hero = pageRoot.querySelector('.hero');
  const heroCopy = hero && hero.querySelector('.hero-copy');
  const summary = hero && hero.querySelector('.summary');

  if (!heroCopy || !summary || !summary.querySelector('.index-switcher')) {
    return;
  }

  const statusNodes = [
    directChildByClass(summary, 'score'),
    directChildByClass(summary, 'score-track'),
    directChildByClass(summary, 'metrics')
  ].filter(Boolean);

  if (!statusNodes.length) {
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'hero-status-panel';
  panel.setAttribute('aria-label', '状态概览');
  statusNodes.forEach((node) => panel.appendChild(node));
  heroCopy.appendChild(panel);
}

function renderNav(activeId) {
  tabNav.innerHTML = '';
  tabs.forEach((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab-button${tab.id === activeId ? ' active' : ''}`;
    button.textContent = tab.label;
    button.addEventListener('click', () => showTab(tab.id));
    tabNav.appendChild(button);
  });
}

async function showTab(tabId) {
  if (isLoading) {
    return;
  }

  isLoading = true;
  const tab = tabs.find((item) => item.id === tabId) || tabs[0];
  try {
    if (currentCleanup) {
      try {
        currentCleanup();
      } catch (error) {
        console.error(`Failed to clean up tab "${tab.id}"`, error);
      }
      currentCleanup = null;
    }

    renderNav(tab.id);
    document.title = tab.title;
    pageRoot.innerHTML = templates[tab.id];
    moveSummaryStatusLeft();
    history.replaceState(null, '', tab.id === tabs[0].id ? '/' : `/#${tab.id}`);

    const module = await import(tab.module);
    const nextCleanup = await module.init();
    if (typeof nextCleanup === 'function') {
      currentCleanup = nextCleanup;
    } else if (typeof module.destroy === 'function') {
      currentCleanup = () => module.destroy();
    }
  } finally {
    isLoading = false;
  }
}

window.addEventListener('app:navigate-tab', async (event) => {
  const detail = event.detail || {};
  if (!detail.tabId) {
    return;
  }

  await showTab(detail.tabId);
  if (detail.eventName) {
    window.dispatchEvent(new CustomEvent(detail.eventName, { detail: detail.payload || {} }));
  }
});

const initialTab = location.hash.replace('#', '') || tabs[0].id;
showTab(initialTab);
