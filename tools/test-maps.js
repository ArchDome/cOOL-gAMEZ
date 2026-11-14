// Headless checks for every Skyhook map, plus the cup flow. Run: node tools/test-maps.js
const { openGame, checker } = require('./harness');

(async () => {
  const c = checker();
  const { browser, page, errors } = await openGame('skyhook-isles');
  await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
  const keys = await page.evaluate(() => [...document.querySelectorAll('#optMap option')].map(o => o.value));
  c.check('map picker lists every map', keys.length >= 5, keys.join(', '));
  for (const key of keys) {
    errors.length = 0;
    await page.goto(page.url().split('#')[0] + '#map-' + key); await page.reload();
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    await page.selectOption('#optBots', '0'); await page.click('#go'); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const d = window.__skyDebug, b = d.body;
      d.tick(60);
      const g = d.probe(b.position)[0];
      d.view(Math.PI * .75, .3); d.keys.add('w'); let vmin = 99, vmax = -99, st = 0;
      for (let i = 0; i < 120; i++) { d.tick(1); vmin = Math.min(vmin, b.velocity.y); vmax = Math.max(vmax, b.velocity.y); st += d.ground().standing ? 1 : 0; }
      d.keys.delete('w');
      const sel = document.getElementById('optBots'); sel.value = '2'; sel.dispatchEvent(new Event('change')); d.tick(2);
      const bots = d.bots(); const moved = bots.map(x => x.body.position.clone());
      d.tick(240); const dist = bots.map((x, i) => Math.hypot(x.body.position.x - moved[i].x, x.body.position.z - moved[i].z));
      return { where: document.getElementById('where').textContent, sparks: d.sparks.length, pillars: d.pillars.length, ground: g, vmin, vmax, standing: st / 120, bots: bots.length, botMoves: Math.max(...dist), mapSel: document.getElementById('optMap').value };
    });
    c.check(`${key}: loads with no errors`, errors.length === 0, errors.join(' | '));
    c.check(`${key}: 15 sparks and grapple targets`, r.sparks === 15 && r.pillars >= 8, `sparks ${r.sparks}, structures ${r.pillars}`);
    c.check(`${key}: spawn is on dry ground`, r.ground > .5, `ground ${r.ground.toFixed(1)} m`);
    c.check(`${key}: walking is smooth`, r.standing > .8 && r.vmin > -12 && r.vmax < 12, `standing ${(r.standing * 100).toFixed(0)}%, vy ${r.vmin.toFixed(1)}..${r.vmax.toFixed(1)}`);
    c.check(`${key}: bots spawn and move`, r.bots === 2 && r.botMoves > 3, `bots ${r.bots}, moved ${r.botMoves.toFixed(1)} m`);
  }
  // cup: starting a cup goes to its first map and auto-starts a race there
  await page.goto(page.url().split('#')[0] + '#map-isles'); await page.reload();
  await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
  await page.evaluate(() => localStorage.removeItem('skyhook.cup.v1'));
  await page.selectOption('#optCup', 'pack1'); await page.click('#startCup'); await page.waitForTimeout(300);
  await page.click('#go'); await page.waitForTimeout(1200);
  const cupState = await page.evaluate(() => ({ cup: JSON.parse(localStorage.getItem('skyhook.cup.v1') || 'null'), race: window.__skyDebug.race() }));
  c.check('cup starts and auto-starts the first race', cupState.cup && cupState.cup.idx === 0 && (cupState.race.raceCount > 0 || cupState.race.raceLive), JSON.stringify(cupState));
  // finishing: force the end of the race and check points are awarded and Next goes to map 2
  await page.evaluate(() => window.__skyDebug.forceRaceEnd());
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => ({ visible: !document.getElementById('results').hidden, next: document.getElementById('resNext').textContent, cup: JSON.parse(localStorage.getItem('skyhook.cup.v1')) }));
  c.check('race results award cup points', res.visible && Object.keys(res.cup.points).length >= 1 && /Next race: Neon Harbour/.test(res.next), JSON.stringify(res));
  await page.click('#resNext'); await page.waitForFunction(() => location.hash === '#map-neon' && window.__skyDebug, null, { timeout: 30000 });
  c.check('next race loads the next map in the cup', await page.evaluate(() => JSON.parse(localStorage.getItem('skyhook.cup.v1')).idx === 1));
  await page.evaluate(() => localStorage.removeItem('skyhook.cup.v1'));
  const failed = c.report(); await browser.close(); process.exit(failed ? 1 : 0);
})();
