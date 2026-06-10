import { readFile, writeFile } from "node:fs/promises";

const dashboardUrl = "https://yenhan0918.github.io/tw-stock-dashboard/";
const emailTo = "yenhan0918@gmail.com";
const now = new Date();
const taipeiDate = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(now);

const symbols = [
  ["dow", "^DJI", "道瓊"],
  ["sp500", "^GSPC", "S&P 500"],
  ["nasdaq", "^IXIC", "Nasdaq"],
  ["sox", "^SOX", "費半"],
  ["tsm", "TSM", "台積電 ADR"],
  ["nvda", "NVDA", "NVIDIA"],
  ["amd", "AMD", "AMD"],
  ["aapl", "AAPL", "Apple"],
  ["tsla", "TSLA", "Tesla"],
  ["dxy", "DX-Y.NYB", "美元指數"],
  ["tnx", "^TNX", "美債 10 年"],
  ["oil", "CL=F", "WTI 原油"]
];

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function pct(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function cssMoveClass(value) {
  if (!Number.isFinite(value)) return "watch";
  if (value > 0.15) return "up";
  if (value < -0.15) return "down";
  return "watch";
}

async function fetchQuote(symbol, label) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "tw-stock-dashboard/1.0" }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    const result = data.chart?.result?.[0];
    const meta = result?.meta ?? {};
    const price = Number(meta.regularMarketPrice);
    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
    const changePct =
      Number.isFinite(price) && Number.isFinite(previousClose) && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : NaN;

    return { symbol, label, price, previousClose, changePct, ok: true, url };
  } catch (error) {
    return { symbol, label, price: NaN, previousClose: NaN, changePct: NaN, ok: false, error: error.message, url };
  }
}

function replaceRequired(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Cannot update ${label}`);
  return html.replace(pattern, replacement);
}

function metricBlock(title, valueClass, value, note) {
  return `<h3>${title}</h3>
        <p class="value ${valueClass}">${value}</p>
        <p class="note">${note}</p>`;
}

function previousMetric(html, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<h3>${escaped}<\\/h3>\\s*<p class="value ([^"]+)">([\\s\\S]*?)<\\/p>\\s*<p class="note">([\\s\\S]*?)<\\/p>`)
  );
  return {
    valueClass: match?.[1] ?? "watch",
    value: match?.[2] ?? "-- / --",
    note: match?.[3] ?? "行情來源暫時無法更新，請以線上來源與開盤量價確認。"
  };
}

function quoteValue(quote, fallback) {
  if (!quote.ok || !Number.isFinite(quote.price) || !Number.isFinite(quote.changePct)) return fallback;
  return `${fmt(quote.price)} / ${pct(quote.changePct)}`;
}

const entries = await Promise.all(symbols.map(([key, symbol, label]) => fetchQuote(symbol, label).then((q) => [key, q])));
const quotes = Object.fromEntries(entries);
let html = await readFile("index.html", "utf8");
const previous = {
  nasdaq: previousMetric(html, "Nasdaq"),
  sox: previousMetric(html, "費半指數"),
  tsm: previousMetric(html, "台積電 ADR"),
  macro: previousMetric(html, "美元 / 美債")
};
const okCount = Object.values(quotes).filter((quote) => quote.ok).length;
const requiredDataOk = quotes.nasdaq.ok && quotes.sox.ok && quotes.tsm.ok && okCount >= 6;
const dataWarning = !requiredDataOk;

const nasdaq = quotes.nasdaq.changePct;
const sox = quotes.sox.changePct;
const dow = quotes.dow.changePct;
const sp500 = quotes.sp500.changePct;
const dxy = quotes.dxy.price;
const tnx = quotes.tnx.price;
const riskScore =
  (Number.isFinite(nasdaq) && nasdaq < -0.6 ? 2 : 0) +
  (Number.isFinite(sox) && sox < -1 ? 2 : 0) +
  (Number.isFinite(sp500) && sp500 < -0.5 ? 1 : 0) +
  (Number.isFinite(dow) && dow < -0.4 ? 1 : 0) +
  (Number.isFinite(tnx) && tnx > 45 ? 1 : 0) +
  (dataWarning ? 3 : 0);

const stance =
  dataWarning
    ? "資料源未完整更新，採保守觀察"
    : riskScore >= 4
    ? "偏保守，先守現金與風控"
    : riskScore >= 2
      ? "震盪偏保守，先看權值股承接"
      : "中性偏多，但仍等開盤量價確認";

const strategyText =
  dataWarning
    ? "自動資料源本次未完整回傳，今天不應用缺值推論方向；盤前先以線上來源、台指期、匯率與 2330 開盤承接做確認，部位以保守風控為優先。"
    : riskScore >= 4
    ? "美股科技與半導體壓力偏高，台股盤前不適合預設反彈延續；今天先檢查 2330、2454、AI 伺服器與金融權值是否同步止穩，再決定是否小量短打。"
    : riskScore >= 2
      ? "美股結構仍偏分化，台股今天重點不是追第一根，而是確認權值股與 AI 鏈能否在開盤後 15 至 30 分鐘守住承接。"
      : "美股風險相對收斂，台股可偏向找強勢族群，但仍要用開盤量價與美元、美債走勢確認，不把單日反彈直接當長線買點。";

const marketTemperature =
  dataWarning
    ? "今天屬於「資料源不完整、先保守驗證」的盤前結構。"
    : riskScore >= 4
    ? "今天屬於「外部風險升溫、先守再攻」的盤前結構。"
    : riskScore >= 2
      ? "今天屬於「高波動震盪、先看承接強度」的盤前結構。"
      : "今天屬於「風險降溫、可找強勢但不追高」的盤前結構。";

const aiTone =
  dataWarning ? "待確認" : Number.isFinite(sox) && sox < -1 ? "中性偏弱" : Number.isFinite(sox) && sox > 0.6 ? "偏強" : "中性";
const pressureTone = riskScore >= 4 ? "偏高" : riskScore >= 2 ? "中偏高" : "中性";
const watchCondition =
  dataWarning
    ? "若資料源未完整更新，先不要用缺值做交易決策，開盤後確認 2330、2454、AI 伺服器與金融權值再動作。"
    : riskScore >= 4
    ? "若 2330、2454、AI 伺服器與金融權值沒有同步止穩，短線部位以降風險為優先。"
    : "若權值股守住開盤低點且族群量能擴散，才考慮小量分批，不在第一根急拉追價。";

const metricNasdaq = quoteValue(quotes.nasdaq, previous.nasdaq.value);
const metricSox = quoteValue(quotes.sox, previous.sox.value);
const metricTsm = quoteValue(quotes.tsm, previous.tsm.value);
const metricMacro =
  quotes.dxy.ok && quotes.tnx.ok
    ? `DXY ${fmt(quotes.dxy.price)} / 美債 ${fmt(quotes.tnx.price / 10, 2)}%`
    : previous.macro.value;

const sourceRows = [
  ["美股與個股行情", "https://finance.yahoo.com/", "Yahoo Finance"],
  ["Nasdaq", "https://finance.yahoo.com/quote/%5EIXIC/", "Yahoo Finance Nasdaq"],
  ["費半指數", "https://finance.yahoo.com/quote/%5ESOX/", "Yahoo Finance SOX"],
  ["台積電 ADR / NVIDIA / AMD", "https://finance.yahoo.com/quote/TSM/", "Yahoo Finance TSM"],
  ["美元指數", "https://finance.yahoo.com/quote/DX-Y.NYB/", "Yahoo Finance DXY"],
  ["美債 10 年", "https://finance.yahoo.com/quote/%5ETNX/", "Yahoo Finance 10Y Yield"],
  ["台股官方資訊", "https://www.twse.com.tw/", "TWSE"],
  ["期貨官方資訊", "https://www.taifex.com.tw/enl/eIndex", "TAIFEX"]
];

html = replaceRequired(
  html,
  /<p class="meta">最近更新：[\s\S]*?<\/p>/,
  `<p class="meta">最近更新：${taipeiDate}（台北時間）<br>收件人：${emailTo}</p>`,
  "meta"
);
html = replaceRequired(
  html,
  /<h2>今日策略<\/h2>\s*<strong>[\s\S]*?<\/strong>\s*<p class="muted">[\s\S]*?<\/p>/,
  `<h2>今日策略</h2>
          <strong>${stance}</strong>
          <p class="muted">${strategyText}</p>`,
  "strategy"
);
html = replaceRequired(
  html,
  /<h2>風險燈號<\/h2>\s*<ul>[\s\S]*?<\/ul>/,
  `<h2>風險燈號</h2>
        <ul>
          <li><span class="watch">匯率：</span>${quotes.dxy.ok ? `美元指數約 ${fmt(quotes.dxy.price)}` : "美元指數資料源未完整回傳"}，若續強會壓抑外資回補與電子股估值。</li>
          <li><span class="watch">利率：</span>${quotes.tnx.ok ? `美債 10 年殖利率約 ${fmt(quotes.tnx.price / 10, 2)}%` : "美債 10 年殖利率資料源未完整回傳"}，高利率環境仍會壓縮高本益比族群。</li>
          <li><span class="watch">事件：</span>盤前先看美股期貨、匯率與台指期；若三者同向偏弱，短線先降低槓桿。</li>
        </ul>`,
  "risk"
);
html = replaceRequired(
  html,
  /<h2>市場溫度圖<\/h2>\s*<p class="muted">[\s\S]*?<\/p>/,
  `<h2>市場溫度圖</h2>
            <p class="muted">${marketTemperature}</p>`,
  "market temperature"
);
html = replaceRequired(
  html,
  /<h2>題材雷達<\/h2>\s*<p class="muted">[\s\S]*?<\/p>/,
  `<h2>題材雷達</h2>
            <p class="muted">AI 鏈目前為${aiTone}，權值股承接與資金壓力為今天的主要判斷軸。</p>`,
  "sector radar"
);
html = replaceRequired(
  html,
  /<div class="heat-label"><span>AI 鏈<\/span><strong>[\s\S]*?<\/strong><\/div>/,
  `<div class="heat-label"><span>AI 鏈</span><strong>${aiTone}</strong></div>`,
  "AI heat label"
);
html = replaceRequired(
  html,
  /<div class="heat-label"><span>資金壓力<\/span><strong>[\s\S]*?<\/strong><\/div>/,
  `<div class="heat-label"><span>資金壓力</span><strong>${pressureTone}</strong></div>`,
  "pressure heat label"
);
html = replaceRequired(
  html,
  /<h2>操作提醒<\/h2>\s*<p class="muted">[\s\S]*?<\/p>/,
  `<h2>操作提醒</h2>
            <p class="muted">${riskScore >= 4 ? "今天先守風險，等跌勢收斂與權值股同步止穩。" : "今天可以觀察強勢股，但仍要先確認量價與權值股同步。"}</p>`,
  "operation hint"
);
html = replaceRequired(
  html,
  /<ul>\s*<li>若 2330[\s\S]*?<\/li>\s*<li>短線只做[\s\S]*?<\/li>\s*<li>今天先寫[\s\S]*?<\/li>\s*<\/ul>/,
  `<ul>
          <li>${watchCondition}</li>
          <li>短線只做有量有承接的族群，長線仍只看基本面、估值與資本支出趨勢。</li>
          <li>今天先寫停損與避險條件，再決定要不要進場，不做攤平式交易。</li>
        </ul>`,
  "operation list"
);
html = replaceRequired(
  html,
  /<h3>Nasdaq<\/h3>\s*<p class="value [^"]+">[\s\S]*?<\/p>\s*<p class="note">[\s\S]*?<\/p>/,
  metricBlock("Nasdaq", quotes.nasdaq.ok ? cssMoveClass(quotes.nasdaq.changePct) : previous.nasdaq.valueClass, metricNasdaq, quotes.nasdaq.ok ? "科技股動能是台股電子開盤的重要風向；若 Nasdaq 轉弱，短線先看承接不追價" : "行情來源暫時無法更新，沿用上一版數字；請以來源連結與開盤量價確認"),
  "Nasdaq metric"
);
html = replaceRequired(
  html,
  /<h3>費半指數<\/h3>\s*<p class="value [^"]+">[\s\S]*?<\/p>\s*<p class="note">[\s\S]*?<\/p>/,
  metricBlock("費半指數", quotes.sox.ok ? cssMoveClass(quotes.sox.changePct) : previous.sox.valueClass, metricSox, quotes.sox.ok ? "半導體方向會牽動 2330、2454 與 AI 供應鏈，先看開盤是否有法人承接" : "行情來源暫時無法更新，沿用上一版數字；請以來源連結與開盤量價確認"),
  "SOX metric"
);
html = replaceRequired(
  html,
  /<h3>台積電 ADR<\/h3>\s*<p class="value [^"]+">[\s\S]*?<\/p>\s*<p class="note">[\s\S]*?<\/p>/,
  metricBlock("台積電 ADR", quotes.tsm.ok ? cssMoveClass(quotes.tsm.changePct) : previous.tsm.valueClass, metricTsm, quotes.tsm.ok ? "ADR 只作盤前參考，仍要搭配 2330 現股開盤量價與台幣走勢確認" : "行情來源暫時無法更新，沿用上一版數字；仍要搭配 2330 現股確認"),
  "TSM metric"
);
html = replaceRequired(
  html,
  /<h3>美元 \/ 美債<\/h3>\s*<p class="value [^"]+">[\s\S]*?<\/p>\s*<p class="note">[\s\S]*?<\/p>/,
  metricBlock("美元 / 美債", "watch", metricMacro, "美元與殖利率若同步走強，台股高本益比電子股的反彈空間容易被壓縮"),
  "macro metric"
);
html = replaceRequired(
  html,
  /<h2>今日觀察重點<\/h2>\s*<ul>[\s\S]*?<\/ul>/,
  `<h2>今日觀察重點</h2>
        <ul>
          <li>${dataWarning ? "本次自動行情資料未完整回傳，請先以來源連結和開盤量價確認，不用缺值推論方向。" : `道瓊 ${fmt(quotes.dow.price)} / ${pct(quotes.dow.changePct)}，S&amp;P 500 ${fmt(quotes.sp500.price)} / ${pct(quotes.sp500.changePct)}，Nasdaq ${metricNasdaq}，先判斷美股是全面風險轉強還是結構分化。`}</li>
          <li>費半 ${metricSox}${quotes.nvda.ok ? `，NVIDIA ${fmt(quotes.nvda.price)} / ${pct(quotes.nvda.changePct)}` : ""}${quotes.amd.ok ? `，AMD ${fmt(quotes.amd.price)} / ${pct(quotes.amd.changePct)}` : ""}，AI 鏈以開盤承接和量能擴散作為短線判斷。</li>
          <li>台積電 ADR ${metricTsm}，今天仍要以 2330 現股、台幣與外資動向確認，不用單一 ADR 報價下結論。</li>
          <li>${metricMacro}，若盤中美元與利率再往上頂，電子股評價壓力會升高。</li>
          <li>短線以 1 至 10 個交易日控風險，長線以 3 個月以上檢查基本面，不把短線動能直接當成長線買進理由。</li>
        </ul>`,
  "observations"
);
html = replaceRequired(
  html,
  /<table class="source-list">\s*<tbody>[\s\S]*?<\/tbody>\s*<\/table>/,
  `<table class="source-list">
        <tbody>
          ${sourceRows.map(([name, href, text]) => `<tr>
            <td>${name}</td>
            <td><a href="${href}" target="_blank" rel="noreferrer">${text}</a></td>
          </tr>`).join("\n          ")}
        </tbody>
      </table>`,
  "sources"
);

await writeFile("index.html", html);

const summary = {
  generatedAt: taipeiDate,
  dashboardUrl,
  emailTo,
  stance,
  strategyText,
  riskScore,
  dataWarning,
  quotes,
  sourceRows
};

await writeFile("daily-summary.json", `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, generatedAt: taipeiDate, stance, riskScore }, null, 2));
