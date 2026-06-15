import { readFile, writeFile } from "node:fs/promises";

const summary = JSON.parse(await readFile("daily-summary.json", "utf8"));
const dashboardUrl = process.env.DASHBOARD_URL || summary.dashboardUrl;
const expectedText = `最近更新：${summary.generatedAt}`;
const timeoutMs = Number(process.env.PAGES_WAIT_TIMEOUT_MS || 240000);
const intervalMs = Number(process.env.PAGES_WAIT_INTERVAL_MS || 10000);
const strict = String(process.env.PAGES_WAIT_STRICT || "true").toLowerCase() !== "false";
const startedAt = Date.now();

async function writeStatus(status) {
  await writeFile("pages-status.json", `${JSON.stringify(status, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastStatus = null;

while (Date.now() - startedAt < timeoutMs) {
  const url = new URL(dashboardUrl);
  url.searchParams.set("t", `${Date.now()}`);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "tw-stock-dashboard/1.0" }
    });
    const html = await response.text();

    if (response.ok && html.includes(expectedText)) {
      const status = { ok: true, url: url.toString(), expectedText, checkedAt: new Date().toISOString() };
      await writeStatus(status);
      console.log(JSON.stringify(status, null, 2));
      process.exit(0);
    }

    lastStatus = { ok: false, status: response.status, url: url.toString(), expectedText, checkedAt: new Date().toISOString() };
    console.log(JSON.stringify(lastStatus, null, 2));
  } catch (error) {
    lastStatus = { ok: false, error: error.message, url: url.toString(), expectedText, checkedAt: new Date().toISOString() };
    console.log(JSON.stringify(lastStatus, null, 2));
  }

  await sleep(intervalMs);
}

const status = {
  ...(lastStatus ?? {}),
  ok: false,
  timedOut: true,
  expectedText,
  checkedAt: new Date().toISOString(),
  message: `Timed out waiting for GitHub Pages to publish ${expectedText}`
};
await writeStatus(status);

if (strict) {
  throw new Error(status.message);
}

console.log(JSON.stringify(status, null, 2));
