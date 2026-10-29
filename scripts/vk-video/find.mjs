// Поиск на VK Видео без токена: открываем vkvideo.ru/?q=… в Chrome и читаем
// ответ catalog.getVideoSearchWeb2, который грузит сама страница (там есть
// hash для встраивания). С VK_API_TOKEN лучше video.search (src/lib/media/vk-search.ts).
//
//   npm i --no-save playwright-core
//   CHROME=/usr/bin/google-chrome node scripts/vk-video/find.mjs "Rick Astley Never Gonna Give You Up" [...]
//   MIN=30 — не короче N секунд; OUT=vk-search.json — куда сложить всё найденное.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const { chromium } = await import("playwright-core").catch(() => {
  console.error("Нужен playwright-core: npm i --no-save playwright-core");
  process.exit(1);
});
const OUT = process.env.OUT || "vk-search.json";
const db = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const ctx = await chromium.launchPersistentContext(
  process.env.PROFILE || "/tmp/vkprofile",
  {
    executablePath: process.env.CHROME || "/usr/bin/google-chrome",
    headless: true,
    args: ["--mute-audio"],
    viewport: { width: 1400, height: 1000 },
    locale: "ru-RU",
  },
);
const page = ctx.pages()[0] || (await ctx.newPage());

async function go(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  // «Проверяем, что вы не робот» — кнопка «Продолжить».
  for (let i = 0; i < 2; i++) {
    const button = page.getByRole("button", { name: "Продолжить" });
    if (!(await button.count())) break;
    await button.first().click();
    await page.waitForTimeout(5000);
  }
}

for (const q of process.argv.slice(2)) {
  let payload = null;
  const onResponse = (r) => {
    if (r.url().includes("catalog.getVideoSearchWeb2"))
      r.text()
        .then((t) => (payload = t))
        .catch(() => {});
  };
  page.on("response", onResponse);
  for (let attempt = 0; attempt < 3 && !payload; attempt++) {
    await go("https://vkvideo.ru/?q=" + encodeURIComponent(q));
    for (let i = 0; i < 20 && !payload; i++) await page.waitForTimeout(500);
  }
  page.off("response", onResponse);
  if (!payload) {
    console.log(`## ${q} — нет ответа`);
    continue;
  }
  const j = JSON.parse(payload).response || {};
  const groups = Object.fromEntries((j.groups || []).map((g) => [-g.id, g]));
  const videos = [
    ...(j.catalog_videos || []).map((c) => c.video || c),
    ...(j.videos || []),
  ]
    .filter(Boolean)
    .map((v) => ({
      oid: v.owner_id,
      id: v.id,
      hash: (v.player || "").match(/hash=([0-9a-f]+)/)?.[1] || null,
      title: v.title,
      dur: v.duration,
      views: v.views,
      owner: groups[v.owner_id]?.name || null,
      verified: Boolean(groups[v.owner_id]?.verified),
      restricted: v.restriction ? v.restriction.title || true : null,
    }))
    .filter(
      (v) => v.hash && (!process.env.MIN || (v.dur || 0) >= +process.env.MIN),
    );
  db[q] = videos;
  console.log(`## ${q}`);
  for (const v of videos.slice(0, +process.env.N || 10))
    console.log(
      `https://vkvideo.ru/video_ext.php?oid=${v.oid}&id=${v.id}&hash=${v.hash}  ${v.dur}s ${v.verified ? "✔" : " "} [${v.owner ?? "?"}] ${v.title.slice(0, 80)} · ${v.views}${v.restricted ? " R:" + v.restricted : ""}`,
    );
  writeFileSync(OUT, JSON.stringify(db, null, 1));
}
await ctx.close();
