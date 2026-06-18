import { readFile } from "node:fs/promises";
import nodemailer from "nodemailer";

const summary = JSON.parse(await readFile("daily-summary.json", "utf8"));
const pagesStatus = await readOptionalJson("pages-status.json");
const dashboardUrl = process.env.DASHBOARD_URL || summary.dashboardUrl;
const versionedDashboardUrl = new URL(dashboardUrl);
versionedDashboardUrl.searchParams.set("t", summary.generatedAt.replace(/\D/g, ""));
const defaultRecipients = [
  "yenhan0918@gmail.com",
  "jackyman691125@gmail.com",
  "shian03040508@gmail.com",
  "alexwen_1@yahoo.com.tw"
];
const configuredRecipients = splitRecipients(process.env.EMAIL_TO || summary.emailTo);
const to = uniqueRecipients([...configuredRecipients, ...defaultRecipients]).join(", ");
const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
const port = Number(process.env.SMTP_PORT || (secure ? 465 : 587));

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  throw new Error("Missing SMTP_HOST, SMTP_USER, or SMTP_PASS");
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function splitRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function uniqueRecipients(recipients) {
  return [...new Set(recipients)];
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const q = summary.quotes;
const pagesVerified = pagesStatus?.ok === true;
const pagesNote = pagesVerified
  ? `GitHub Pages 已驗證更新：${pagesStatus.expectedText}`
  : `GitHub Pages 尚未完成驗證，請先以本信附件 index.html 為當日版本；公開頁可能仍在同步。${pagesStatus?.message ? `狀態：${pagesStatus.message}` : ""}`;
const latestCloseDate = summary.latestCloseDate || "未提供";
const futuresTickAt = summary.futuresTickAt || "未提供";

function fmtPrice(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }) : "--";
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

const sourceText = (summary.sourceLinks || [])
  .map((item) => `- ${item.label}: ${item.url}`)
  .join("\n");

const categoryText = [
  "積極型：0050、2881 富邦金、2882 國泰金、2308 台達電。條件是權值與金融同步守住開盤低點，且 2330 沒有擴大跌幅。",
  "穩健型：2330 台積電、2454 聯發科、2382 廣達、6669 緯穎。條件是回測支撐後量縮守穩，且費半與 Nasdaq 期貨跌幅收斂再分批。",
  "觀望型：2317 鴻海、Apple 概念股、汽車電子。等法人回補與族群同步止穩，不搶第一根反彈。",
  "避開型：高槓桿中小型 AI、爆量跌破月線的投機股、只靠消息硬拉的純題材股。避免攤平與搶反彈。"
];

const lines = [
  `線上儀表板：${versionedDashboardUrl.toString()}`,
  pagesNote,
  "",
  `今日結論：${summary.stance}`,
  `最新可驗證美股正式收盤日：${latestCloseDate}`,
  `可取得盤前期貨時間：${futuresTickAt}`,
  "",
  summary.strategyText,
  "",
  "關鍵數據：",
  `- 道瓊：${fmtPrice(q.dow?.price)} / ${fmtPct(q.dow?.changePct)}`,
  `- S&P 500：${fmtPrice(q.sp500?.price)} / ${fmtPct(q.sp500?.changePct)}`,
  `- Nasdaq：${fmtPrice(q.nasdaq?.price)} / ${fmtPct(q.nasdaq?.changePct)}`,
  `- 費半：${fmtPrice(q.sox?.price)} / ${fmtPct(q.sox?.changePct)}`,
  `- 台積電 ADR：${fmtPrice(q.tsm?.price)} / ${fmtPct(q.tsm?.changePct)}`,
  `- NVIDIA：${fmtPrice(q.nvda?.price)} / ${fmtPct(q.nvda?.changePct)}`,
  `- AMD：${fmtPrice(q.amd?.price)} / ${fmtPct(q.amd?.changePct)}`,
  `- Apple：${fmtPrice(q.aapl?.price)} / ${fmtPct(q.aapl?.changePct)}`,
  `- Tesla：${fmtPrice(q.tsla?.price)} / ${fmtPct(q.tsla?.changePct)}`,
  `- 美元指數：${fmtPrice(q.dxy?.price)} / ${fmtPct(q.dxy?.changePct)}`,
  `- 美債 10 年：${fmtPrice(q.tnx?.price, 3)} / ${fmtPct(q.tnx?.changePct)}`,
  `- WTI 原油：${fmtPrice(q.oil?.price)} / ${fmtPct(q.oil?.changePct)}`,
  `- 黃金：${fmtPrice(q.gold?.price)} / ${fmtPct(q.gold?.changePct)}`,
  `- 美元兌台幣：${fmtPrice(q.twd?.price, 3)} / ${fmtPct(q.twd?.changePct)}`,
  `- S&P 期貨：${fmtPrice(q.es?.price)} / ${fmtPct(q.es?.changePct)}`,
  `- Nasdaq 期貨：${fmtPrice(q.nq?.price)} / ${fmtPct(q.nq?.changePct)}`,
  `- 道瓊期貨：${fmtPrice(q.ym?.price)} / ${fmtPct(q.ym?.changePct)}`,
  "",
  "短線建議：",
  "- 適合情境：開盤後 15 到 30 分鐘，2330、2454、金融權值與台指期至少兩到三組同步止穩。",
  "- 操作方向：先看承接再做強弱切換，優先觀察台積電、聯發科、0050、金融龍頭與伺服器權值。",
  "- 進場條件：站回昨收、VWAP 或第一段殺低低點不破，再小量分批。",
  "- 退出條件：跌破開盤低點、第一支撐失守，或美元與黃金同步走強時退出。",
  "",
  "長線建議：",
  "- 適合情境：AI 算力、先進製程、伺服器與高現金流企業的產業方向未變，但估值回到可接受區間。",
  "- 布局方向：核心布局放在台積電、AI 伺服器供應鏈龍頭、電源散熱、金融龍頭與大型 ETF。",
  "- 分批進場條件：分 3 到 5 批，只在月營收、法說、產業訂單與資本支出趨勢確認後加碼。",
  "- 每月檢查條件：檢查營收、毛利率、資本支出、AI 訂單延續性、匯率、殖利率與外資持股變化。",
  "",
  "標的分級：",
  ...categoryText.map((line) => `- ${line}`),
  "",
  "自選標的分析提醒：頁面已保留 `twStockPremarketWatchlist` 輸入區與 localStorage；若今天要聚焦，建議優先輸入 2330、2454、2317、2382、6669，或 NVDA / AMD / AAPL / TSLA。",
  "互動提問區提醒：頁面已保留 `twStockPremarketQuestions`、初步建議、歷史問題與清除功能；目前未讀到既有保存問題，若你有盤前疑問請回面板補充。",
  "",
  "資料來源連結：",
  sourceText,
  "",
  "免責提醒：本信件為投資研究與風險控管參考，不構成保證獲利或個別買賣承諾。"
];

await transporter.sendMail({
  from,
  to,
  subject: `台股盤前儀表板 - ${summary.generatedAt}`,
  text: lines.join("\n"),
  html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Noto Sans TC',sans-serif;line-height:1.6;color:#14213d">
    <h2>台股盤前儀表板</h2>
    <p><a href="${versionedDashboardUrl.toString()}">開啟線上儀表板</a></p>
    <p style="color:${pagesVerified ? "#00a878" : "#b45309"}">${pagesNote}</p>
    <p><strong>今日結論：</strong>${summary.stance}</p>
    <p><strong>最新可驗證美股正式收盤日：</strong>${latestCloseDate}<br><strong>可取得盤前期貨時間：</strong>${futuresTickAt}</p>
    <p>${summary.strategyText}</p>
    <h3>關鍵數據</h3>
    <ul>
      <li>道瓊：${fmtPrice(q.dow?.price)} / ${fmtPct(q.dow?.changePct)}</li>
      <li>S&amp;P 500：${fmtPrice(q.sp500?.price)} / ${fmtPct(q.sp500?.changePct)}</li>
      <li>Nasdaq：${fmtPrice(q.nasdaq?.price)} / ${fmtPct(q.nasdaq?.changePct)}</li>
      <li>費半：${fmtPrice(q.sox?.price)} / ${fmtPct(q.sox?.changePct)}</li>
      <li>台積電 ADR：${fmtPrice(q.tsm?.price)} / ${fmtPct(q.tsm?.changePct)}</li>
      <li>NVIDIA / AMD：${fmtPrice(q.nvda?.price)} / ${fmtPct(q.nvda?.changePct)}；${fmtPrice(q.amd?.price)} / ${fmtPct(q.amd?.changePct)}</li>
      <li>Apple / Tesla：${fmtPrice(q.aapl?.price)} / ${fmtPct(q.aapl?.changePct)}；${fmtPrice(q.tsla?.price)} / ${fmtPct(q.tsla?.changePct)}</li>
      <li>美元指數 / 美債 10 年：${fmtPrice(q.dxy?.price)} / ${fmtPrice(q.tnx?.price, 3)}</li>
      <li>商品與匯率：WTI ${fmtPrice(q.oil?.price)} / ${fmtPct(q.oil?.changePct)}；黃金 ${fmtPrice(q.gold?.price)} / ${fmtPct(q.gold?.changePct)}；美元兌台幣 ${fmtPrice(q.twd?.price, 3)}</li>
      <li>盤前線索：S&amp;P 期貨 ${fmtPrice(q.es?.price)} / ${fmtPct(q.es?.changePct)}；Nasdaq 期貨 ${fmtPrice(q.nq?.price)} / ${fmtPct(q.nq?.changePct)}；道瓊期貨 ${fmtPrice(q.ym?.price)} / ${fmtPct(q.ym?.changePct)}</li>
    </ul>
    <h3>短線建議</h3>
    <ul>
      <li>適合情境：開盤後 15 到 30 分鐘，2330、2454、金融權值與台指期至少兩到三組同步止穩。</li>
      <li>操作方向：先看承接再做強弱切換，優先觀察台積電、聯發科、0050、金融龍頭與伺服器權值。</li>
      <li>進場條件：站回昨收、VWAP 或第一段殺低低點不破，再小量分批。</li>
      <li>退出條件：跌破開盤低點、第一支撐失守，或美元與黃金同步走強時退出。</li>
    </ul>
    <h3>長線建議</h3>
    <ul>
      <li>適合情境：AI 算力、先進製程、伺服器與高現金流企業的產業方向未變，但估值回到可接受區間。</li>
      <li>布局方向：核心布局放在台積電、AI 伺服器供應鏈龍頭、電源散熱、金融龍頭與大型 ETF。</li>
      <li>分批進場條件：分 3 到 5 批，只在月營收、法說、產業訂單與資本支出趨勢確認後加碼。</li>
      <li>每月檢查條件：檢查營收、毛利率、資本支出、AI 訂單延續性、匯率、殖利率與外資持股變化。</li>
    </ul>
    <h3>標的分級</h3>
    <ul>${categoryText.map((line) => `<li>${line}</li>`).join("")}</ul>
    <h3>自選標的與互動提問提醒</h3>
    <p>頁面已保留自選標的分析輸入區與 twStockPremarketWatchlist localStorage，也保留互動提問區、twStockPremarketQuestions、初步建議與歷史問題功能；目前未讀到既有保存內容，請直接在面板補充今天想追蹤的標的與問題。</p>
    <h3>資料來源</h3>
    <ul>${(summary.sourceLinks || []).map((item) => `<li><a href="${item.url}">${item.label}</a></li>`).join("")}</ul>
    <p style="color:#5d667a">免責提醒：本信件為投資研究與風險控管參考，不構成保證獲利或個別買賣承諾。</p>
  </div>`,
  attachments: [
    {
      filename: "tw-stock-premarket-dashboard.html",
      path: "index.html",
      contentType: "text/html"
    }
  ]
});

console.log(JSON.stringify({ ok: true, to, subject: `台股盤前儀表板 - ${summary.generatedAt}`, pagesVerified }, null, 2));
