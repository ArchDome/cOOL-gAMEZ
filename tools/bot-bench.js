// Measure how well each bot character races for sparks. Run: node tools/bot-bench.js [seconds] [characterKey...]
// Reproducible: seeded randomness, world reset, three fixed start points per character (see bot-eval.js).
const { openGame } = require('./harness');
const { setupPage, evaluate } = require('./bot-eval');
const SECONDS = +process.argv[2] || 60;
const ONLY = process.argv.slice(3);

(async () => {
  const { browser, page, errors } = await openGame('skyhook-isles');
  await setupPage(page);
  const keys = ONLY.length ? ONLY : await page.evaluate(() => window.__skyDebug.CHARACTERS.map(c => c.key));
  let total = 0;
  for (const k of keys) {
    const { mean, rows } = await evaluate(page, null, [k], SECONDS);
    const sp = rows.map(r => r.sparks), fl = rows.reduce((s, r) => s + r.falls, 0);
    total += sp.reduce((a, b) => a + b, 0);
    console.log(`${k.padEnd(10)} sparks per start ${sp.join('/').padEnd(10)} falls ${fl}  score ${mean.toFixed(2)}`);
  }
  console.log(`\ntotal sparks ${total} (${keys.length} characters x 3 starts x ${SECONDS}s)` + (errors.length ? `\nerrors: ${errors.join(' | ')}` : ''));
  await browser.close();
})();
