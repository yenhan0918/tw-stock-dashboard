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
const lines = [
  `今日結論：${summary.stance}`,
  "",
  summary.strategyText,
  "",
  `線上儀表板：${versionedDashboardUrl.toString()}`,
  pagesNote,
  "",
  "關鍵數據：",
  `- Nasdaq：${q.nasdaq?.price?.toLocaleString?.("en-US") ?? "--"} / ${Number.isFinite(q.nasdaq?.changePct) ? q.nasdaq.changePct.toFixed(2) + "%" : "--"}`,
  `- 費半：${q.sox?.price?.toLocaleString?.("en-US") ?? "--"} / ${Number.isFinite(q.sox?.changePct) ? q.sox.changePct.toFixed(2) + "%" : "--"}`,
  `- 台積電 ADR：${q.tsm?.price?.toLocaleString?.("en-US") ?? "--"} / ${Number.isFinite(q.tsm?.changePct) ? q.tsm.changePct.toFixed(2) + "%" : "--"}`,
  "",
  "短線建議：以 1 至 10 個交易日為主，先看開盤後權值股、AI 鏈與金融是否同步承接；未確認前不追第一根。",
  "長線建議：以 3 個月以上為主，只在基本面、估值與產業趨勢仍成立時分批，不把短線反彈當長線理由。",
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
    <p><strong>今日結論：</strong>${summary.stance}</p>
    <p>${summary.strategyText}</p>
    <p><a href="${versionedDashboardUrl.toString()}">開啟線上儀表板</a></p>
    <p style="color:${pagesVerified ? "#00a878" : "#b45309"}">${pagesNote}</p>
    <h3>短線建議</h3>
    <p>以 1 至 10 個交易日為主，先看開盤後權值股、AI 鏈與金融是否同步承接；未確認前不追第一根。</p>
    <h3>長線建議</h3>
    <p>以 3 個月以上為主，只在基本面、估值與產業趨勢仍成立時分批，不把短線反彈當長線理由。</p>
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
