// Headless regression test for Skyhook Isles. Run: node tools/test-skyhook.js
// Exits non-zero if any check fails, so it can be looped by scripts or agents.
const { openGame, checker } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame('skyhook-isles', { fakeRoom: true });
  const c = checker();
  try {
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    c.check('engine boots', true);
    await page.fill('#nick', 'Tester');
    await page.click('#go');
    await page.waitForTimeout(300);

    // Ground smoothness, measured with exact 1/60 s physics steps
    const walk = await page.evaluate(() => {
      const d = window.__skyDebug, b = d.body; d.tick(60); d.view(Math.PI * 1.6, .3); d.keys.add('w');
      const vys = [], st = [];
      for (let i = 0; i < 240; i++) { d.tick(1); vys.push(b.velocity.y); st.push(d.ground().standing ? 1 : 0); }
      d.keys.delete('w');
      return { vyMin: Math.min(...vys), vyMax: Math.max(...vys), standing: st.reduce((a, x) => a + x, 0) / st.length };
    });
    c.check('walking stays on the ground', walk.standing > .95, `standing ${(walk.standing * 100).toFixed(0)}%`);
    c.check('no vertical bouncing while walking', walk.vyMin > -6 && walk.vyMax < 6, `vy ${walk.vyMin.toFixed(1)}..${walk.vyMax.toFixed(1)} m/s`);

    // Glider
    const glide = await page.evaluate(() => {
      const d = window.__skyDebug, g = d.gliderPickups[0]; d.body.position.set(g.pos.x, g.pos.y, g.pos.z); return null;
    });
    await page.waitForTimeout(500);
    c.check('glider pickup grants time', (await page.evaluate(() => window.__skyDebug.glide().gliderTime)) > 25);

    // Bat pickup
    await page.evaluate(() => { const d = window.__skyDebug, g = d.batPickups[0]; d.body.position.set(g.pos.x, g.pos.y, g.pos.z); });
    await page.waitForTimeout(500);
    c.check('bat pickup grants time', (await page.evaluate(() => window.__skyDebug.bat())) > 25);

    // Multiplayer with a scripted friend
    const me = await page.evaluate(() => { const p = window.__skyDebug.body.position; return [p.x, p.y, p.z]; });
    const friendAt = (extra = {}) => page.evaluate(([me, extra]) => window.__fake.setFriend({ n: 'Friend', p: [me[0], me[1], me[2] - 2], v: [0, 0, 0], yw: 0, g: 0, h: 0, s: 0, t: 0, rs: 'running', ps: 0, race: 1, sw: 0, bt: 0, hit: 0, sp: 0, dk: 0, ...extra }), [me, extra]);
    await friendAt();
    await page.waitForTimeout(800);
    c.check('friend avatar appears', (await page.evaluate(() => window.__skyDebug.avatars.size)) === 1);

    // I swing at the friend (facing -z, friend is 2 m in front)
    await page.evaluate(() => { window.__skyDebug.view(0, .3); window.__skyDebug.attack(); });
    await page.waitForTimeout(200);
    const sentHit = await page.evaluate(() => window.__fake.mine().hit);
    c.check('bat swing sends a hit to the friend', sentHit && sentHit.to === 'fr1end00peer0000' && sentHit.f === 1, JSON.stringify(sentHit));

    // The friend hits me: first set a baseline counter, then bump it
    await friendAt({ hit: { n: 1, to: 'x', d: [1, 0], f: 0 } });
    await page.waitForTimeout(400);
    const vx0 = await page.evaluate(() => window.__skyDebug.body.velocity.x);
    await friendAt({ hit: { n: 2, to: 'me000000peer0000', d: [1, 0], f: 1 } });
    await page.waitForTimeout(400);
    const vx1 = await page.evaluate(() => window.__skyDebug.body.velocity.x);
    c.check('being hit by a bat knocks me back', vx1 - vx0 > 5, `vx ${vx0.toFixed(1)} -> ${vx1.toFixed(1)}`);

    // Falling in the sea after being hit credits the friend
    await page.evaluate(() => { const b = window.__skyDebug.body; b.position.set(0, -4, -116); b.velocity.set(0, 0, 0); }); // out over the sea
    await page.waitForTimeout(400);
    const sp = await page.evaluate(() => window.__fake.mine().sp);
    c.check('splash is broadcast with who knocked me in', sp && sp.by === 'fr1end00peer0000', JSON.stringify(sp));

    // Friend splashes because of me -> my dunk count goes up
    await friendAt({ sp: { n: 1, by: 'nobody' } }); await page.waitForTimeout(300);
    await friendAt({ sp: { n: 2, by: 'me000000peer0000' } }); await page.waitForTimeout(400);
    c.check('dunking the friend scores', (await page.evaluate(() => window.__skyDebug.presence().dunks)) === 1);

    // Race
    await friendAt({ race: 2 }); await page.waitForTimeout(400);
    c.check('friend starting a race triggers my countdown', /3|2|1|GO/.test(await page.textContent('#toast')));

    // Audio: music sequencer is running
    await page.waitForTimeout(600);
    const au = await page.evaluate(() => window.__skyDebug.audio());
    c.check('music sequencer runs', au.ctx && au.musicOn && au.step > 0, JSON.stringify(au));

    const maxPresence = await page.evaluate(() => Math.max(...window.__fake.sent));
    c.check('presence stays well under 4 KiB', maxPresence < 1500, `${maxPresence} bytes`);
  } catch (e) {
    c.check('test run completed', false, e.message);
  }
  c.check('no page errors', errors.length === 0, errors.join(' | '));
  const failed = c.report();
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
