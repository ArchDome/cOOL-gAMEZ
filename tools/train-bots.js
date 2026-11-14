// Evolve the bots' swing technique by simulation. Run: node tools/train-bots.js [generations] [population] [seconds] [characterKey]
// With a character key, tunes that character's own parameter set (on that character); otherwise tunes "default".
// Fitness = sparks collected minus falls into the sea, averaged over several characters.
// The best parameter set is written to skyhook-isles/js/bot-params.js (as the "default" set used by every character).
const fs = require('fs');
const path = require('path');
const { openGame, ROOT } = require('./harness');
const { setupPage, evaluate } = require('./bot-eval');

const GENS = +process.argv[2] || 8, POP = +process.argv[3] || 8, SECONDS = +process.argv[4] || 45, TARGET = process.argv[5] || 'default';
const CHARS = TARGET === 'default' ? ['yuki', 'lars', 'dylan'] : [TARGET];   // a spread of speeds and sizes (each runs from 3 start points)
const RANGES = {                                          // [min, max] for each parameter
  fireDist: [30, 75], aimDrop: [0, 3], lenFactor: [.6, 1], reel: [8, 30], releaseDist: [1.5, 8],
  boostUp: [0, 14], boostFwd: [0, 14], cooldown: [.2, 1.5], heightCost: [0, 2], stepMin: [8, 30], stepMax: [40, 75],
};
const clamp = (k, v) => Math.max(RANGES[k][0], Math.min(RANGES[k][1], v));
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
function mutate(p, scale) {
  const q = { ...p };
  for (const k of Object.keys(RANGES)) if (Math.random() < .5) { const span = RANGES[k][1] - RANGES[k][0]; q[k] = clamp(k, q[k] + (Math.random() * 2 - 1) * span * scale); }
  return q;
}

async function score(page, params, seconds) {
  // evaluate() sets the default set; for a character, install its set as an override instead
  if (TARGET === 'default') return (await evaluate(page, params, CHARS, seconds)).mean;
  return (await evaluate(page, null, CHARS, seconds, undefined, { [TARGET]: params })).mean;
}

(async () => {
  const { browser, page, errors } = await openGame('skyhook-isles');
  await setupPage(page);
  const all = await page.evaluate(() => window.__skyDebug.getBotParams());
  let best = { ...all.default, ...(all[TARGET] || {}) };
  let bestScore = await score(page, best, SECONDS);
  console.log(`start  score ${bestScore.toFixed(2)}`, JSON.stringify(round(best)));
  for (let g = 1; g <= GENS; g++) {
    const scale = .25 * (1 - (g - 1) / GENS) + .05;         // explore early, refine late
    for (let i = 0; i < POP; i++) {
      const cand = mutate(best, scale), sc = await score(page, cand, SECONDS);   // episodes are seeded, so scores are reproducible
      if (sc > bestScore) { best = cand; bestScore = sc; console.log(`gen ${g}  new best ${bestScore.toFixed(2)}`, JSON.stringify(round(best))); }
    }
    console.log(`gen ${g} done  best ${bestScore.toFixed(2)}`);
  }
  const file = path.join(ROOT, 'skyhook-isles', 'js', 'bot-params.js');
  all[TARGET] = round(best);
  const fmt = (o) => JSON.stringify(o).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ');
  fs.writeFileSync(file, `// Swing-technique parameters for bots, per character key (falls back to "default").
// Written by tools/train-bots.js on ${new Date().toISOString().slice(0, 10)}; last run tuned "${TARGET}": ${GENS} generations x ${POP}, ${SECONDS}s episodes,
// fitness ${bestScore.toFixed(2)} (sparks minus half the falls, per episode; seeded, 3 starts x ${CHARS.join('/')}).
export const BOT_PARAMS = {
${Object.entries(all).map(([k, v]) => `  ${k}: ${fmt(v)},`).join('\n')}
};
`);
  console.log(`\nwrote ${path.relative(ROOT, file)}` + (errors.length ? `\nerrors: ${errors.join(' | ')}` : ''));
  await browser.close();
})();
