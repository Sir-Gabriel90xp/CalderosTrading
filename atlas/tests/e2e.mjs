import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
let server;
if (!process.env.BASE_URL) {
  server = http.createServer((req, res) => {
    const u = new URL(req.url, base),
      file = path.join(
        process.cwd(),
        "dist",
        u.pathname === "/" ? "index.html" : u.pathname,
      );
    const ext = path.extname(file),
      types = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
        ".html": "text/html",
      };
    res.setHeader("Content-Type", types[ext] || "text/plain");
    try {
      res.end(fs.readFileSync(file));
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  await new Promise((r) => server.listen(4173, "127.0.0.1", r));
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? {
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
        args: [
          "--no-sandbox",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--use-gl=disabled",
          "--disable-software-rasterizer",
        ],
      }
    : {}),
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function go(id) {
  await page.evaluate((id) => (location.hash = id), id);
  await page.locator(".view-enter").waitFor();
  await page.waitForTimeout(150);
}
try {
  await page.goto(base);
  await page.locator(".hero").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Activar modo blanco" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.reload();
  await page.locator(".hero").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "Activar modo oscuro" }).click();
  await go("cfd");
  const capital = page.getByLabel("Capital de cuenta ($)");
  await capital.fill("");
  await capital.pressSequentially("25000");
  assert.equal(await capital.inputValue(), "25,000");
  await capital.press("Backspace");
  assert.equal(await capital.inputValue(), "2,500");
  await capital.fill("5000");
  assert.equal(await page.getByLabel("Riesgo / beneficio").inputValue(), "3");
  await page.getByRole("button", { name: "$ Riesgo", exact: true }).click();
  await page.getByLabel("Riesgo ($)", { exact: true }).fill("50");
  await page.getByLabel("Distancia del stop loss").fill("25");
  assert(
    (await page.locator(".result-number").textContent()).startsWith("0.02"),
  );
  await go("consistency");
  await page
    .getByRole("button", { name: "Registrar día", exact: true })
    .click();
  await page.getByLabel("Resultado neto ($)").fill("25");
  await page.getByRole("button", { name: "Guardar día" }).click();
  assert.equal(await page.locator(".journal-row:not(.table-head)").count(), 1);
  await page.reload();
  await page.locator(".journal-row:not(.table-head)").waitFor();
  assert.equal(await page.locator(".journal-row:not(.table-head)").count(), 1);
  await page.getByRole("button", { name: /Editar \d/ }).click();
  await page.getByLabel("Resultado neto ($)").fill("30");
  await page.getByRole("button", { name: "Guardar día" }).click();
  assert(
    (
      await page.locator(".journal-row:not(.table-head)").textContent()
    ).includes("$30.00"),
  );
  await page
    .getByRole("button", { name: "Notificaciones: recordatorio del bróker" })
    .click();
  await page.getByRole("button", { name: /Revisar especificaciones/ }).click();
  await page.waitForFunction(
    () => document.querySelector("#broker-specs")?.open,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "home",
      "cfd",
      "futures",
      "consistency",
      "tools",
      "sessions",
      "settings",
      "learn",
    ]) {
      await go(route);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Overflow at ${width} ${route}`,
      );
    }
    if (width === 390) {
      await go("home");
      await page.screenshot({
        path: "/tmp/atlas-mobile-390.png",
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go("home");
  await page
    .locator(".sidebar .nav-item")
    .filter({ hasText: "Lotaje CFD" })
    .hover();
  await page.getByRole("tooltip").waitFor();
  await page.mouse.move(1200, 900);
  await page.waitForFunction(() => !document.querySelector("[role=tooltip]"));
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.locator(".hero").waitFor();
  for (const route of ["futures", "tools", "consistency", "learn"])
    await go(route);
  assert(await page.getByText("Este video necesita internet").isVisible());
  await go("consistency");
  assert.equal(await page.locator(".journal-row:not(.table-head)").count(), 1);
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: UI rendering, theme persistence, live numeric typing and deletion, CFD sizing, RR, journal create/edit/persistence, broker notification, all 8 views at 320/390/768/1440 px, delayed help and full offline reload with lazy modules.",
  );
} finally {
  await browser.close();
  if (server) server.close();
}
