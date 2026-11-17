// Deathmatch checks for Skyhook: Rock Garden, the round clock, kill and losing streaks, the 30-streak nuke,
// stacking daze/ragdoll, and bots chasing you onto a tightrope. Run: node tools/test-deathmatch.js
const { openGame, checker } = require('./harness');

(async () => {
  const c = checker();
  const { browser, page, errors } = await openGame('skyhook-isles', { hash: '#map-garden' });
  try {
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 60000 });
    // --- the map ---
    const m = await page.evaluate(() => { const d = window.__skyDebug; return { key: d.mapInfo().key, sumo: d.mapInfo().sumoOnly, mode: d.mode(), rocks: d.rocks.length, posts: d.pillars.length, rules: d.rules() }; });
    c.check('Rock Garden: sumo arena with lots of little rocks', m.key === 'garden' && m.sumo && m.mode === 'sumo' && m.rocks >= 40 && m.posts >= 6, JSON.stringify(m));
    c.check('deathmatch default: 5:00 clock, no KO limit', m.rules.SUMO_TIME === 300 && m.rules.SUMO_KOS === 0, JSON.stringify(m.rules));

    // start a live round with two bots
    await page.selectOption('#optBots', '2'); await page.click('#go');
    await page.evaluate(() => window.__skyDebug.startRound());
    await page.waitForFunction(() => { const d = window.__skyDebug; return d.race().raceLive && d.race().raceCount <= 0 && d.bots().length === 2; }, null, { timeout: 90000 });
    await page.evaluate(() => { const d = window.__skyDebug; d.headlessStart(2); for (const b of d.bots()) b.introT = 0; });

    // --- streaks ---
    const st = await page.evaluate(() => {
      const d = window.__skyDebug; for (let i = 0; i < 3; i++) d.gotKO(); d.tick(1);   // the HUD watches my counts every frame
      return { ks: d.streak().ks };
    });
    const shown = await page.waitForFunction(() => /ON A ROLL/.test(window.__skyDebug.streak().banner), null, { timeout: 30000 }).then(() => true, () => false);
    await page.evaluate(() => { const d = window.__skyDebug; d.gotKO(); d.gotKO(); });
    await page.waitForFunction(() => window.__skyDebug.streak().log.some(t => /HEATING UP/.test(t)), null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => window.__skyDebug.myDied());
    await page.waitForFunction(() => window.__skyDebug.streak().log.includes('SHUTDOWN'), null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => { const d = window.__skyDebug; d.myDied(); d.myDied(); });
    await page.waitForFunction(() => window.__skyDebug.streak().log.includes('TAKING ON WATER'), null, { timeout: 30000 }).catch(() => {});
    const log = await page.evaluate(() => window.__skyDebug.streak().log);
    c.check('kill streaks are called at 3 and 5, and a 5+ streak ending is a shutdown', st.ks === 3 && log.includes('ON A ROLL!') && log.includes('HEATING UP!') && log.includes('SHUTDOWN'), JSON.stringify(log));
    c.check('the streak banner shows on screen', shown, '');
    c.check('losing streak is called at 3 falls without a KO', log.includes('TAKING ON WATER'), JSON.stringify(log));
    // someone else's streak (a friend or bot): watched from their shared counts
    const other = await page.evaluate(() => { const d = window.__skyDebug; d.watchStreak('fr', 'Friend', 0, 0); d.watchStreak('fr', 'Friend', 3, 0); d.watchStreak('fr', 'Friend', 0, 1); return d.streak().log.slice(-3); });
    c.check('other players\' streaks are announced to everyone', other.some(t => t === 'Friend: ON A ROLL'), JSON.stringify(other));
    const botStk = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[0]; for (let i = 0; i < 3; i++) d.creditBot('bot:' + b.id); d.tick(1); return { ks: b.ks, log: d.streak().log.slice(-2) }; });
    c.check('bot streaks count and are called', botStk.ks === 3 && botStk.log.some(t => /ON A ROLL/.test(t)), JSON.stringify(botStk));

    // --- daze: repeated hits stun longer, and the second quick hit ragdolls ---
    const dz = await page.evaluate(() => {
      const d = window.__skyDebug, b = d.body; d.calm(); d.respawnNow(); d.tick(30);
      const from = { peer: 'x', name: 'Tester' };
      d.takeHit([1, 0], false, from); const a = d.dazeInfo();
      d.takeHit([1, 0], false, from); const b2 = d.dazeInfo();
      d.takeHit([1, 0], true, from); const c3 = d.dazeInfo();
      // while ragdolled, a hook can't take hold
      d.view(0, .6); d.hookUp(); d.tick(20); const hooked = d.hook();
      return { a, b2, c3, hooked };
    });
    c.check('daze: each quick hit stuns longer (x1, x1.6, x2.2)', dz.a.knockLeft > .4 && dz.a.knockLeft < .5 && dz.b2.knockLeft > .65 && dz.c3.knockLeft > 2.5, JSON.stringify(dz));
    c.check('daze: a second quick hit ragdolls you, and ragdolled you cannot hook', !dz.a.rag && dz.b2.rag && dz.c3.rag && (dz.hooked == null || dz.hooked === 'retract'), JSON.stringify(dz));
    const dzDecay = await page.evaluate(() => { const d = window.__skyDebug; d.tick(60 * 12); return d.dazeInfo(); });
    c.check('daze wears off over time', dzDecay.daze < .7 && !dzDecay.rag, JSON.stringify(dzDecay));
    const botDz = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[0]; b.C = { ...b.C, dodge: 0 }; b.daze = 0; b.shieldT = 0; b.item = null;   /* a bot shield would block the hits */ d.hitBot('bot:' + b.id, [1, 0], false, 'x', 'T'); const r1 = b.ragdollUntil > d.simTime(); d.hitBot('bot:' + b.id, [1, 0], true, 'x', 'T'); return { r1, r2: b.ragdollUntil > d.simTime(), left: b.knockUntil - d.simTime() }; });
    c.check('bots stack daze too (second hit ragdolls them)', !botDz.r1 && botDz.r2 && botDz.left > 2, JSON.stringify(botDz));

    // --- bots chase you onto a tightrope ---
    const rope = await page.evaluate(() => {
      const d = window.__skyDebug, bs = d.bots(); d.calm(); d.respawnNow();
      // a rope over the island, me standing in the middle of it, one aggressive bot on the ground below
      d.makeRope([-9, 14, 0], [9, 14, 0]); const b = d.body; b.position.set(2, 14.8, 0); b.velocity.set(0, 0, 0);
      const bot = bs[0]; bot.C = { ...bot.C, aggr: 1, fear: 0, grapple: 1 }; bot.daze = 0; bot.ragdollUntil = -9; bot.knockUntil = -9; bot.grappleCd = 0; bot.cd = 9; bot.grudge = null; bot.bait = null; bot.avoid && bot.avoid.clear();
      bot.body.position.set(-3, 8, 4); bot.body.velocity.set(0, 0, 0); bs[1].body.position.set(30, 40, 30); bs[1].body.mass = 0;
      let hooked = false, onRope = false, closest = 99;
      for (let i = 0; i < 60 * 8; i++) { b.position.set(2, 14.8, 0); b.velocity.set(0, 0, 0); bot.cd = 9; d.tick(1);
        if (bot.hook && bot.hook.rope) hooked = true;
        if (d.ropeUnder(bot.body.position)) onRope = true;
        if (onRope) closest = Math.min(closest, Math.hypot(bot.body.position.x - 2, bot.body.position.z));
        if (onRope && closest < 2.2) break; }
      bs[1].body.mass = 5;
      return { hooked, onRope, closest: +closest.toFixed(2), at: bot.body.position.toArray().map(n => +n.toFixed(1)) };
    });
    c.check('a bot hooks the tightrope, climbs on and walks it to you', rope.hooked && rope.onRope && rope.closest < 2.2, JSON.stringify(rope));

    // --- the nuke: 30 KOs in a row ---
    const nk = await page.evaluate(() => {
      const d = window.__skyDebug; d.calm(); d.respawnNow(); d.myDied(); for (let i = 0; i < 29; i++) d.gotKO(); const at29 = d.streak().nukeReady; d.gotKO();
      return { at29, ready: d.streak().nukeReady, held: d.streak().held };
    });
    c.check('30 KOs in a row (deathmatch round) earns the nuke', !nk.at29 && nk.ready && nk.held === 'nuke', JSON.stringify(nk));
    const boom = await page.evaluate(() => {
      const d = window.__skyDebug, falls0 = d.bots().map(b => b.falls || 0), k0 = d.presence().dunks;
      d.useItem(); const ev = d.lastNk(), ph = d.streak().phase;
      d.tick(60 * 4); const s = d.streak();
      return { ev, ph, after: s.phase, endAt: s.endAt > 0, winner: s.winner, botsOut: d.bots().every((b, i) => (b.falls || 0) > falls0[i]), kos: d.presence().dunks - k0 };
    });
    c.check('dropping the nuke: shared event, it falls, then everyone else is out and the KOs are yours', boom.ev.n === 1 && boom.ph === 'fall' && boom.after === 'boom' && boom.botsOut && boom.kos === 2, JSON.stringify(boom));
    await page.evaluate(() => window.__skyDebug.tick(60 * 6));
    await page.waitForFunction(() => !document.getElementById('results').hidden, null, { timeout: 60000 }).catch(() => {});
    const res = await page.evaluate(() => ({ shown: !document.getElementById('results').hidden, title: document.getElementById('resTitle').textContent }));
    c.check('the nuke ends the round with the nuker on top', res.shown && /nuked the match/.test(res.title), JSON.stringify(res));
  } catch (e) {
    c.check('test run completed', false, e.message);
  }
  c.check('no page errors', errors.length === 0, errors.join(' | '));
  const failed = c.report();
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
