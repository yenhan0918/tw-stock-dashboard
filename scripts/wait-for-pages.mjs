import { readFile } from "node:fs/promises";

const summary = JSON.parse(await readFile("daily-summary.json", "utf8"));
const dashboardUrl = process.env.DASHBOARD_URL || summary.dashboardUrl;
const expectedText = `最近更新：${summary.generatedAt}`;
const timeoutMs = Number(process.env.PAGES_WAIT_TIMEOUT_MS || 240000);
const intervalMs = Number(process.env.PAGES_WAIT_INTERVAL_MS || 10000);
const startedAt = Date.now();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

while (Date.now() - startedAt < timeoutMs) {
  const url = new URL(dashboardUrl);
  url.searchParams.set("t", `${Date.now()}`);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "tw-stock-dashboard/1.0" }
    });
    const html = await response.text();

    if (response.ok && html.includes(expectedText)) {
      console.log(JSON.stringify({ ok: true, url: url.toString(), expectedText }, null, 2));
      process.exit(0);
    }

    console.log(JSON.stringify({ ok: false, status: response.status, expectedText }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message, expectedText }, null, 2));
  }

  await sleep(intervalMs);
}

throw new Error(`Timed out waiting for GitHub Pages to publish ${expectedText}`);
