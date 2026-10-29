// Проверка встраивания VK Видео в браузере: плеер дошёл до inited и знает
// длительность (значит ролик доступен для встраивания из этого региона).
//   node scripts/vk-video/check.mjs "https://vkvideo.ru/video_ext.php?oid=..&id=..&hash=.." [...]
const { chromium } = await import("playwright-core").catch(() => {
  console.error("Нужен playwright-core: npm i --no-save playwright-core");
  process.exit(1);
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({
  viewport: { width: 960, height: 540 },
  locale: "ru-RU",
});
await ctx.route("https://vk-check.local/**", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<iframe id=f width=960 height=540 allow="autoplay; encrypted-media" frameborder=0></iframe>
<script src="https://vk.com/js/api/videoplayer.js"></script><script>
window.log=[];const f=document.getElementById('f');f.src=decodeURIComponent(location.hash.slice(1))+'&js_api=1';
const pl=VK.VideoPlayer(f);window.pl=pl;['inited','error'].forEach(e=>pl.on(e,d=>log.push(e)));
</script>`,
  }),
);
let failed = 0;
for (const url of process.argv.slice(2)) {
  const page = await ctx.newPage();
  await page.goto("https://vk-check.local/#" + encodeURIComponent(url));
  let state = null;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500);
    const button = page
      .frameLocator("#f")
      .getByRole("button", { name: "Продолжить" });
    if (await button.count().catch(() => 0))
      await button
        .first()
        .click()
        .catch(() => {});
    state = await page.evaluate(() => ({
      log: window.log,
      duration: (() => {
        try {
          return pl.getDuration();
        } catch {
          return 0;
        }
      })(),
    }));
    if (state.log.includes("inited")) break;
  }
  const ok = state?.log.includes("inited") && state.duration > 0;
  if (!ok) failed += 1;
  console.log(
    ok ? "OK  " : "FAIL",
    Math.round(state?.duration || 0) + "s",
    url,
  );
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
