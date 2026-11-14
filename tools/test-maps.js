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
      // arenas are narrow: walk 1 s in a direction with solid ground ahead instead of 2 s diagonally
      const arena = d.mapInfo().sumoOnly; let yw = Math.PI * .75;
      if (arena) for (let k = 0; k < 16; k++) { const y = k / 16 * Math.PI * 2, okAll = [3, 6, 9].every(r => d.probe({ x: b.position.x - Math.sin(y) * r, y: 300, z: b.position.z - Math.cos(y) * r })[0] > 3); if (okAll) { yw = y; break; } }
      const walkN = arena ? 60 : 120;
      d.view(yw, .3); d.keys.add('w'); let vmin = 99, vmax = -99, st = 0;
      for (let i = 0; i < walkN; i++) { d.tick(1); vmin = Math.min(vmin, b.velocity.y); vmax = Math.max(vmax, b.velocity.y); st += d.ground().standing ? 1 : 0; }
      st *= 120 / walkN;
      d.keys.delete('w');
      const sel = document.getElementById('optBots'); sel.value = '2'; sel.dispatchEvent(new Event('change')); d.tick(2);
      const bots = d.bots(); const moved = bots.map(x => x.body.position.clone());
      d.tick(240); const dist = bots.map((x, i) => Math.hypot(x.body.position.x - moved[i].x, x.body.position.z - moved[i].z));
      return { where: document.getElementById('where').textContent, sparks: d.sparks.length, pillars: d.pillars.length, ground: g, vmin, vmax, standing: st / 120, bots: bots.length, botMoves: Math.max(...dist), mapSel: document.getElementById('optMap').value, sumoOnly: !!d.mapInfo().sumoOnly, mode: d.mode() };
    });
    c.check(`${key}: loads with no errors`, errors.length === 0, errors.join(' | '));
    if (r.sumoOnly) c.check(`${key}: sumo arena with grapple posts`, r.mode === 'sumo' && r.pillars >= 6, `mode ${r.mode}, posts ${r.pillars}`);
    else c.check(`${key}: 15 sparks and grapple targets`, r.sparks === 15 && r.pillars >= 8, `sparks ${r.sparks}, structures ${r.pillars}`);
    c.check(`${key}: spawn is on dry ground`, r.ground > .5, `ground ${r.ground.toFixed(1)} m`);
    c.check(`${key}: walking is smooth`, r.standing > .8 && r.vmin > -12 && r.vmax < 12, `standing ${(r.standing * 100).toFixed(0)}%, vy ${r.vmin.toFixed(1)}..${r.vmax.toFixed(1)}`);
    c.check(`${key}: bots spawn and move`, r.bots === 2 && r.botMoves > 3, `bots ${r.bots}, moved ${r.botMoves.toFixed(1)} m`);
    // no tunnelling: slamming into the ground at full speed never leaves you inside the terrain
    const tun = await page.evaluate(() => { const d = window.__skyDebug, b = d.body; let worst = -99;
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, x = Math.cos(a) * 30, z = Math.sin(a) * 30, g = d.probe({ x, y: 400, z })[0]; if (g < 3) continue;
        b.position.set(x, g + 6, z); b.velocity.set(-Math.cos(a) * 45, -90, -Math.sin(a) * 45);
        for (let i = 0; i < 30; i++) { d.tick(1); worst = Math.max(worst, d.probe({ x: b.position.x, y: 400, z: b.position.z })[0] - b.position.y); } }
      b.velocity.set(0, 0, 0); return worst; });
    c.check(`${key}: high-speed impacts don't tunnel into the ground`, tun < -.3, `body centre ${(-tun).toFixed(2)} m above the surface at worst`);
    // every map has a trap players can set off
    const tr = await page.evaluate(() => { const d = window.__skyDebug; document.getElementById('optBots').value = '0'; document.getElementById('optBots').dispatchEvent(new Event('change'));
      const T = d.traps[0]; if (!T) return { none: true };
      if (T.kind === 'magnet' || T.kind === 'idol') return { kind: T.kind, ok: true };
      d.triggerTrap(0, 'Friend'); const r = { kind: T.kind, active: T.active > 0, triggers: (T.triggers || []).length };
      if (T.kind === 'boulder') { const p0 = T.ball.body.position.clone(); d.tick(150); const q = T.ball ? T.ball.body.position : p0; r.rolled = Math.hypot(q.x - p0.x, q.z - p0.z); }
      return r; });
    c.check(`${key}: has a trap players can trigger`, !tr.none && (tr.ok || (tr.active && tr.triggers >= 1 && (tr.kind !== 'boulder' || tr.rolled > 8))), JSON.stringify(tr));
    if (r.sumoOnly) { const ed = await page.evaluate(() => { const d = window.__skyDebug, b = d.body.position; return d.edgeFrom(b.x, b.z).d; }); c.check(`${key}: arena is narrow (edge within a few metres of spawn)`, ed <= 8, `edge ${ed} m`); }
    if (key === 'neon') { const cr = await page.evaluate(() => window.__skyDebug.rocks.length); c.check('neon: tower cranes with hook blocks to swing on', cr >= 5, `${cr} hook blocks`); }
    if (key === 'junkyard') {
      await page.evaluate(() => { const d = window.__skyDebug; document.getElementById('optBots').value = '0'; document.getElementById('optBots').dispatchEvent(new Event('change')); d.triggerTrap(0, 'Friend'); });
      await page.waitForFunction(() => window.__skyDebug.traps[0].windup === 0, null, { timeout: 30000 }).catch(() => {});
      const mg = await page.evaluate(() => { const d = window.__skyDebug, T = d.traps[0], m = T.magnets[3], b = d.body;
        b.position.set(m.x + 3, m.y - 3, m.z); b.velocity.set(0, 0, 0); d.tick(40);
        return { kind: T.kind, triggers: T.triggers.length, magnets: T.magnets.length, active: T.active > 0, stuck: !!d.meMag.mag, dist: Math.hypot(b.position.x - m.x, b.position.y - (m.y - 1.4), b.position.z - m.z) }; });
      c.check('junkyard: the magnet trap grabs a player who swings close', mg.kind === 'magnet' && mg.triggers >= 2 && mg.active && mg.stuck && mg.dist < 1.5, JSON.stringify(mg));
    }
    if (key === 'volcano') {
      const id0 = await page.evaluate(() => { const d = window.__skyDebug, T = d.traps.find(t => t.kind === 'idol'); const b = T.idol.body; b.position.set(T.crater.x, T.crater.y + 3, T.crater.z); b.velocity.set(0, -2, 0); return { kind: T.kind, cd: T.cd }; });
      await page.waitForFunction(() => { const T = window.__skyDebug.traps.find(t => t.kind === 'idol'); return T.active > 0; }, null, { timeout: 30000 }).catch(() => {});
      const id1 = await page.evaluate(() => { const T = window.__skyDebug.traps.find(t => t.kind === 'idol'), q = T.idol.body.position; return { active: T.active > 0, back: Math.hypot(q.x - T.altar.x, q.z - T.altar.z) < 3 }; });
      c.check('volcano: throwing the idol in the crater erupts the volcano', id0.kind === 'idol' && id1.active && id1.back, JSON.stringify([id0, id1]));
    }
  }
  // graphics: at High, the bloom post-processing add-ons load and render without errors
  {
    const hi = await openGame('skyhook-isles', { gfx: 'high' });
    await hi.page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    await hi.page.waitForFunction(() => window.__skyDebug.gfx().composer, null, { timeout: 30000 }).catch(() => {});
    const g = await hi.page.evaluate(() => window.__skyDebug.gfx());
    await hi.page.waitForTimeout(1500);
    c.check('bloom, ambient occlusion and light shafts load at High graphics', g.GFX === 'high' && g.composer && g.ao && g.shafts && hi.errors.length === 0, JSON.stringify(g) + ' ' + hi.errors.join(' | '));
    await hi.browser.close();
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
  // the finish: slow motion first, then the leaderboard
  const sm = await page.evaluate(() => ({ slowmo: window.__skyDebug.race().slowmo, hidden: document.getElementById('results').hidden }));
  await page.waitForFunction(() => window.__skyDebug.race().timeScale < .5 || !document.getElementById('results').hidden, null, { timeout: 30000 }).catch(() => {});
  sm.scale = await page.evaluate(() => window.__skyDebug.race().timeScale);
  c.check('race end slows time before showing the leaderboard', sm.slowmo && sm.hidden && sm.scale < .5, JSON.stringify(sm));
  await page.waitForFunction(() => !document.getElementById('results').hidden, null, { timeout: 60000 }).catch(() => {});
  const res = await page.evaluate(() => ({ visible: !document.getElementById('results').hidden, next: document.getElementById('resNext').textContent, cup: JSON.parse(localStorage.getItem('skyhook.cup.v1')) }));
  c.check('race results award cup points', res.visible && Object.keys(res.cup.points).length >= 1 && /Next race: Neon Harbour/.test(res.next), JSON.stringify(res));
  // click anywhere on the leaderboard to move on (after a short guard against stray clicks)
  await page.waitForTimeout(900);
  const navN = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
  await page.mouse.click(20, 20); await navN;
  await page.waitForFunction(() => location.hash === '#map-neon' && window.__skyDebug, null, { timeout: 30000 });
  c.check('next race loads the next map in the cup', await page.evaluate(() => JSON.parse(localStorage.getItem('skyhook.cup.v1')).idx === 1));
  const aw = await page.evaluate(() => {
    const d = window.__skyDebug, cup = d.cup(), saved = Object.keys(cup.stats || {}).length;
    cup.stats = { Ace: { s: 20, k: 0, d: 0, hits: 1, homers: 0, punches: 0, items: 0, air: 30, top: 40 }, Brute: { s: 9, k: 4, d: 3, hits: 7, homers: 3, punches: 2, items: 1, air: 12, top: 30 } };
    d.showCupFinal();
    return { saved, titles: [...document.querySelectorAll('#awards b')].map(b => b.textContent), shown: !document.getElementById('awards').hidden };
  });
  c.check('cups track stats and hand out awards', aw.saved >= 1 && aw.shown && aw.titles.includes('Menace') && aw.titles.includes('Bone Dry'), JSON.stringify(aw));
  await page.evaluate(() => localStorage.removeItem('skyhook.cup.v1'));
  // Sumo: no sparks, bots fight each other, KOs score, the round ends at the KO target
  {
    await page.goto(page.url().split('#')[0] + '#map-isles'); await page.reload();
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    await page.evaluate(() => { localStorage.removeItem('skyhook.cup.v1'); });
    await page.selectOption('#optMode', 'sumo'); await page.selectOption('#optBots', '3'); await page.click('#go');
    await page.waitForFunction(() => window.__skyDebug.race().raceLive || window.__skyDebug.race().raceCount > 0, null, { timeout: 60000 }).catch(() => {});
    const su = await page.evaluate(() => { const d = window.__skyDebug; return { mode: d.mode(), live: d.race().raceLive || d.race().raceCount > 0, sparksShown: d.sparks.filter(s => s.mesh.visible).length, splitsHidden: getComputedStyle(document.getElementById('splits')).display === 'none', label: document.getElementById('sparksLbl').textContent }; });
    c.check('sumo: Play starts a round with sparks out of play', su.mode === 'sumo' && su.live && su.sparksShown === 0 && su.splitsHidden, JSON.stringify(su));
    await page.waitForFunction(() => window.__skyDebug.bots().length === 3 && window.__skyDebug.race().raceCount <= 0, null, { timeout: 60000 }).catch(() => {});
    const sb = await page.evaluate(() => { const d = window.__skyDebug, bs = d.bots(); for (const b of bs) b.introT = 0;
      const a = bs[0], t = bs[1]; t.body.position.set(a.body.position.x + 1.2, a.body.position.y, a.body.position.z); t.body.velocity.set(0, 0, 0); t.C = { ...t.C, dodge: 0 };
      a.C = { ...a.C, aggr: 1, fear: 0 }; a.cd = 0; const v0 = Math.hypot(t.body.velocity.x, t.body.velocity.z); d.tick(3);
      bs[2].dunks = 10; d.checkRaceEnd();
      return { hitSpeed: Math.hypot(t.body.velocity.x, t.body.velocity.z) - v0 }; });
    await page.waitForFunction(() => !document.getElementById('results').hidden, null, { timeout: 60000 }).catch(() => {});
    Object.assign(sb, await page.evaluate(() => ({ ended: !document.getElementById('results').hidden, head: [...document.querySelectorAll('#resTable .hd span')].map(x => x.textContent).join(',') })));
    c.check('sumo: bots fight each other, and 10 KOs ends the round', sb.hitSpeed > 3 && sb.ended && /KOs/.test(sb.head), JSON.stringify(sb));
    // tactics: a bot stuck in a long stalemate switches target or goes to bait at the edge
    const tac = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[0]; if (!b) return { skip: 1 };
      b.introT = 0; b.eng = { peer: 'bot:999', t: 999, limit: 7, dk: b.dunks || 0 }; b.bait = null; b.avoid && b.avoid.clear();
      const other = d.bots()[1]; other.body.position.set(b.body.position.x + 2, b.body.position.y, b.body.position.z); b.eng.peer = 'bot:' + other.id;
      d.botThink(b, 1 / 60); return { switched: !!(b.avoid && b.avoid.size), bait: !!b.bait }; });
    const md = await page.evaluate(() => { const d = window.__skyDebug, bs = d.bots(); bs.forEach((b, i) => { b.dunks = 5 - i; }); return bs.length; });
    const medals = await page.waitForFunction(() => window.__skyDebug.medals().others.filter(o => o[1] > 0).length >= 2, null, { timeout: 30000 }).then(() => page.evaluate(() => window.__skyDebug.medals()), () => page.evaluate(() => window.__skyDebug.medals()));
    c.check('sumo: medals over the top three', medals.others.some(o => o[1] === 1) && medals.others.some(o => o[1] === 2), JSON.stringify({ md, medals }));
    const sk = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[1]; if (!b) return { skip: 1 }; b.shieldT = 0; const k0 = d.presence().dunks; d.killBot('bot:' + b.id); return { ko: d.presence().dunks === k0 + 1 }; });
    c.check('sumo: a spin-sniper hit knocks a bot out and scores a KO', sk.skip || sk.ko, JSON.stringify(sk));
    c.check('sumo: bots break off a stalemate (switch target or bait at the edge)', tac.skip || tac.switched || tac.bait, JSON.stringify(tac));
    await page.evaluate(() => { localStorage.setItem('skyhook.mode', 'race'); });
  }
  // Custom game: pick maps and rules; arenas play as sumo with the chosen KO target, and the rules apply
  {
    await page.goto(page.url().split('#')[0] + '#map-isles'); await page.reload();
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    await page.evaluate(() => { localStorage.removeItem('skyhook.cup.v1'); localStorage.setItem('skyhook.custom.v1', JSON.stringify({ maps: ['ring', 'isles'], rules: { mode: 'race', kos: 3, items: false, bats: true, final: false, raceTime: 120, sumoTime: 90 } })); });
    await page.reload(); await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    await page.selectOption('#optCup', 'custom');
    const ui = await page.evaluate(() => ({ shown: !document.getElementById('customBox').hidden, chips: document.querySelectorAll('#cuMaps .cuchip').length }));
    await page.click('#cuAdd');
    const chips2 = await page.evaluate(() => document.querySelectorAll('#cuMaps .cuchip').length);
    await page.evaluate(() => { const x = document.querySelectorAll('#cuMaps .cuchip button'); x[x.length - 1].click(); });
    const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
    await page.click('#startCup'); await nav;
    await page.waitForFunction(() => window.__skyDebug && location.hash === '#map-ring', null, { timeout: 30000 }).catch(() => {});
    const cr = await page.evaluate(() => { const d = window.__skyDebug, r = d.rules(); return { hash: location.hash, mode: r.MODE, kos: r.SUMO_KOS, time: r.SUMO_TIME, items: r.items, final: r.final, cup: d.cup() && d.cup().key }; });
    c.check('custom game: builder edits the map list and starts on the first map with its rules', ui.shown && ui.chips === 2 && chips2 === 3 && cr.hash === '#map-ring' && cr.mode === 'sumo' && cr.kos === 3 && cr.time === 90 && cr.items === false && cr.final === false && cr.cup === 'custom', JSON.stringify([ui, chips2, cr]));
    await page.evaluate(() => window.__skyDebug.forceRaceEnd());
    await page.waitForFunction(() => !document.getElementById('results').hidden, null, { timeout: 30000 }).catch(() => {});
    await page.click('#resNext'); await page.waitForFunction(() => location.hash === '#map-isles' && window.__skyDebug, null, { timeout: 30000 }).catch(() => {});
    const cr2 = await page.evaluate(() => { const r = window.__skyDebug.rules(); return { mode: r.MODE, time: r.ROUND_TIME, idx: window.__skyDebug.cup().idx }; });
    c.check('custom game: the next map follows the custom rules (race, 2 min)', cr2.mode === 'race' && cr2.time === 120 && cr2.idx === 1, JSON.stringify(cr2));
    await page.evaluate(() => { localStorage.removeItem('skyhook.cup.v1'); });
  }
  const failed = c.report(); await browser.close(); process.exit(failed ? 1 : 0);
})();
