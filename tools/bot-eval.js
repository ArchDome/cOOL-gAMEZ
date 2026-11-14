// Reproducible bot evaluation shared by bot-bench.js and train-bots.js.
// Each episode: reset the world, seed Math.random, start the bot at a fixed point, keep the player far away,
// simulate `seconds` at 60 Hz with exact physics steps, then score sparks collected minus half the falls.
const STARTS = [[-55, 8, 45], [10, 30, -10], [60, 12, 40]];

// Headless start: the real-time loop never advances the simulation, and entrances are skipped,
// so an evaluation depends only on its inputs, not on how fast the machine happens to be.
async function setupPage(page) {
  await page.waitForFunction(() => window.__skyDebug, null, { timeout: 120000 });
  await page.evaluate(() => { window.__skyDebug.headlessStart(1); window.__skyDebug.tick(2); });
}
async function reloadPage(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.reload({ timeout: 120000 }); await setupPage(page); return; }
    catch (e) { if (attempt === 2) throw e; }
  }
}

// returns { mean, rows: [{key, start, sparks, falls}] }
// Reloads the page first: the physics engine keeps internal ordering state, so only a fresh world is exactly reproducible.
async function evaluate(page, params, chars, seconds, starts = STARTS, overrides = null) {
  await reloadPage(page);
  return page.evaluate(([params, chars, seconds, starts, overrides]) => {
    const d = window.__skyDebug;
    if (params) d.setBotParams('default', params);
    if (overrides) for (const [k, v] of Object.entries(overrides)) d.setBotParams(k, v);
    const realRandom = Math.random;
    const rows = [];
    try {
      for (const key of chars) for (let si = 0; si < starts.length; si++) {
        let a = 1234 + si * 977 + key.length * 31;                    // seeded RNG per (character, start)
        Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        d.restartRun();
        const C = d.CHARACTERS.find(c => c.key === key), b = d.bots()[0];
        Object.assign(b, { C, ch: d.CHARACTERS.indexOf(C), name: C.name, introT: 0, target: null, hook: null, falls: 0, sparkCount: 0, bat: 0,
          pickup: null, grudge: null, stuck: 0, cd: 1, grappleCd: 0, knockUntil: -9, jumpT: -9, lastHitBy: null, skip: new Map(), targetT: 0, backoff: 0,
          speed: 7.5, airAcc: 9, reel: 16, standing: false, item: null, itemT: 0, shieldT: 0, magnetT: 0, perch: null, perchT: 0, wander: null, wanderT: 0, doneT: undefined });
        b.got.clear(); b.wish.set(0, 0, 0); b.body.angularVelocity.set(0, 0, 0);   // physics runs before the brain each tick, so stale state would leak in
        const [x, y, z] = starts[si]; b.body.position.set(x, d.probe({ x, y: 200, z })[0] + 1.2 || y, z); b.body.velocity.set(0, 0, 0);
        for (let i = 0; i < seconds * 60; i++) { d.body.position.set(0, 160, -150); d.body.velocity.set(0, 0, 0); d.tick(1); }
        rows.push({ key, start: si, sparks: b.sparkCount, falls: b.falls || 0 });
      }
    } finally { Math.random = realRandom; }
    const mean = rows.reduce((s, r) => s + r.sparks - .5 * r.falls, 0) / rows.length;
    return { mean, rows };
  }, [params || null, chars, seconds, starts, overrides]);
}

module.exports = { setupPage, evaluate, STARTS };
