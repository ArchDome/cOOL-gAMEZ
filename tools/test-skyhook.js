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
    await page.selectOption('#optBots', '0'); // movement checks first, without bots shoving us
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
    await page.waitForFunction(() => { const d = window.__skyDebug, g = d.gliderPickups[0]; d.body.position.set(g.pos.x, g.pos.y, g.pos.z); d.body.velocity.set(0, 0, 0); return d.glide().gliderTime > 0; }, null, { timeout: 15000, polling: 100 }).catch(() => {});
    c.check('glider pickup grants 60 s', (await page.evaluate(() => window.__skyDebug.glide().gliderTime)) > 55);

    // Bat pickup
    await page.waitForFunction(() => { const d = window.__skyDebug, g = d.batPickups[0]; d.body.position.set(g.pos.x, g.pos.y, g.pos.z); d.body.velocity.set(0, 0, 0); return d.bat() > 0; }, null, { timeout: 15000, polling: 100 }).catch(() => {});
    c.check('bat pickup grants time', (await page.evaluate(() => window.__skyDebug.bat())) > 25);

    // Input-aware UI: touching switches to the touch layout, keyboard play switches back
    const inp = await page.evaluate(() => { const d = window.__skyDebug, r = {};
      d.setInput(true); r.touch = document.body.classList.contains('in-touch') && !document.getElementById('keysTouch').hidden && getComputedStyle(document.querySelector('#resetBtn .kb')).display === 'none';
      d.setInput(false); r.kbm = document.body.classList.contains('kbm') && !document.getElementById('keysDesk').hidden;
      return r; });
    c.check('the layout follows the input method (touch hides keyboard hints)', inp.touch && inp.kbm, JSON.stringify(inp));

    // Aim assist: a direction that just misses a floating rock still finds it; simple controls hook where you tap
    const aim = await page.evaluate(() => {
      const d = window.__skyDebug, T = d.camTarget.clone(), cam = d.camera, THREE_V = T.constructor;
      const rock = d.rocks.map(r => ({ r, dist: Math.hypot(r.x - T.x, r.y - T.y, r.z - T.z) })).filter(o => o.dist > 8 && o.dist < 55).sort((a, b) => a.dist - b.dist)[0];
      if (!rock) return { skip: 'no rock in range' };
      cam.position.copy(T); cam.updateMatrixWorld();
      const dir = new THREE_V(rock.r.x - T.x, rock.r.y - T.y, rock.r.z - T.z).normalize();
      const direct = !!d.castAim(dir);
      const right = new THREE_V().crossVectors(dir, new THREE_V(0, 1, 0)).normalize(), up = new THREE_V().crossVectors(right, dir).normalize();
      let missDir = null;
      for (let a = 1; a <= 5 && !missDir; a += .5) for (let k = 0; k < 16; k++) { const th = k / 16 * Math.PI * 2, t = Math.tan(a * Math.PI / 180); const m = dir.clone().addScaledVector(right, Math.cos(th) * t).addScaledVector(up, Math.sin(th) * t).normalize(); if (!d.castAim(m)) { missDir = m; break; } }
      const assisted = missDir ? !!d.assistAim(missDir, 2) : null;
      // tap to hook, aimed through the screen centre at the rock
      d.settings.controls = 'simple'; cam.lookAt(rock.r.x, rock.r.y, rock.r.z); cam.updateMatrixWorld();
      d.tapHook(innerWidth / 2, innerHeight / 2); const tapped = d.hook(); d.hookUp(); d.settings.controls = 'classic';
      return { direct, missFound: !!missDir, assisted, tapped };
    });
    c.check('aim assist catches a near miss, and tap-to-hook fires', aim.skip || (aim.direct && aim.assisted !== false && aim.tapped === 'fly'), JSON.stringify(aim));

    // Final spark: spawns 25-55 m from whoever finished, grabbing it scores a bonus and ends a race
    const fin = await page.evaluate(() => {
      const d = window.__skyDebug, b = d.body.position, spot = d.finaleSpot({ x: b.x, y: b.y, z: b.z });
      d.spawnFinale(spot.x, spot.y, spot.z, 'Tester');
      const r = { dist: Math.hypot(spot.x - b.x, spot.z - b.z), active: d.finale.active };
      d.body.position.set(spot.x, spot.y, spot.z); d.body.velocity.set(0, 0, 0);
      return r;
    });
    await page.waitForFunction(() => window.__skyDebug.finale.got && window.__fake.mine().fg, null, { timeout: 30000, polling: 50 }).catch(() => {});
    const fin2 = await page.evaluate(() => { const d = window.__skyDebug, me = d.standings().find(r => r.me); return { got: d.finale.got, by: d.finale.grabbedBy, score: me.score, s: me.s, fg: window.__fake.mine().fg }; });
    c.check('the final spark spawns nearby and grabbing it scores a bonus', fin.active && fin.dist > 15 && fin.dist < 70 && fin2.got && fin2.score === fin2.s + 5 && fin2.fg && fin2.fg.n >= 1, JSON.stringify([fin, fin2]));
    await page.evaluate(() => window.__skyDebug.resetFinale());

    // Throwing: a hooked prop flies where you look, and counts as a thrown missile
    const yt = await page.evaluate(() => { const d = window.__skyDebug, dyn = d.dynamics[0]; if (!dyn) return { skip: 'no props' }; d.yeet(dyn.body); const v = dyn.body.velocity; return { speed: Math.hypot(v.x, v.y, v.z), tracked: d.thrown.some(o => o.body === dyn.body) }; });
    c.check('hooked props can be thrown', yt.skip || (yt.speed > 15 && yt.tracked), JSON.stringify(yt));

    // Spin sniper: won't fire until you turn a full 360°, then fires once
    await page.evaluate(() => { const d = window.__skyDebug; d.giveItem('sniper'); d.useItem(); });
    const sn0 = await page.evaluate(() => window.__skyDebug.sniper());
    for (let i = 0; i < 10; i++) await page.evaluate((i) => new Promise(r => { window.__skyDebug.view(1 + i * 0.8, .2); requestAnimationFrame(() => requestAnimationFrame(r)); }), i);
    const sn1 = await page.evaluate(() => window.__skyDebug.sniper());
    await page.evaluate(() => window.__skyDebug.useItem());
    const sn2 = await page.evaluate(() => window.__skyDebug.sniper());
    c.check('the spin sniper needs a 360 to charge, then fires', sn0.held === 'sniper' && sn1.sniperCharge > 0 && sn2.held === null, JSON.stringify([sn0, sn1, sn2]));

    // French announcer: picks a French woman's voice from the device's list (fake list, like an iPad's)
    const fr = await page.evaluate(() => { const d = window.__skyDebug, L = [{ name: 'Samantha', lang: 'en-US' }, { name: 'Thomas', lang: 'fr-FR' }, { name: 'Amélie', lang: 'fr-CA' }, { name: 'Daniel', lang: 'en-GB' }];
      const v = d.pickFrenchVoice(L); return { pick: v && v.name, none: d.pickFrenchVoice([{ name: 'Alex', lang: 'en-US' }]), def: d.settings.announcer, opt: document.getElementById('optAnnouncer').value }; });
    c.check('the French announcer is the default and picks a French female voice', fr.pick === 'Amélie' && fr.none === null && fr.def === 'french' && fr.opt === 'french', JSON.stringify(fr));

    // Pull: hook a loose crate and pull it to you; you stay put
    const pl = await page.evaluate(() => { const d = window.__skyDebug, dyn = d.dynamics.find(x => x.body.mass > 0 && x.body.mass < 10); if (!dyn) return { skip: 1 };
      const me = d.body.position, b = dyn.body, V = b.position.constructor;
      d.calm(); b.position.set(me.x + 12, me.y + .5, me.z); b.velocity.set(0, 0, 0); b.wakeUp(); const me0 = me.clone();
      d.setHook({ phase: 'attached', tip: d.camera.position.clone(), body: b, local: new V(0, 0, 0), point: d.camera.position.clone(), len: 12, miss: false, remote: null, obj: null });
      d.setPull(true); const d0 = Math.hypot(b.position.x - me.x, b.position.z - me.z); d.tick(45); const d1 = Math.hypot(b.position.x - me.x, b.position.z - me.z);
      d.setPull(false); d.setHook(null); return { d0: +d0.toFixed(1), d1: +d1.toFixed(1), meMoved: +Math.hypot(me.x - me0.x, me.z - me0.z).toFixed(2) }; });
    c.check('pull drags a hooked crate to you (it travels; you mostly stay put, bar the bump when it arrives)', pl.skip || (pl.d0 - pl.d1 > 6 && pl.meMoved < (pl.d0 - pl.d1) / 2), JSON.stringify(pl));

    // The timer keeps a fixed width while its digits change (no jitter)
    const clockW = await page.evaluate(() => { const d = window.__skyDebug, el = document.getElementById('timer'), sp = document.getElementById('splits'), out = [];
      for (const hud of ['full', 'compact']) { d.settings.hud = hud; d.applyInputUI();
        for (const t of ['1:11.11', '8:08.08', '0:44.70']) { d.setClock(t); out.push([el.getBoundingClientRect().width, sp.getBoundingClientRect().width].map(n => +n.toFixed(2))); } }
      d.settings.hud = 'full'; d.applyInputUI(); return [out.slice(0, 3), out.slice(3)]; });
    c.check('the timer box keeps a fixed width as digits change', clockW.every(g => g.every(w => w[0] === g[0][0] && w[1] === g[0][1])), JSON.stringify(clockW));

    // Speed units: feet per second by default, metric as an option
    const u0 = await page.evaluate(() => ({ set: window.__skyDebug.settings.units, opt: document.getElementById('optUnits').value }));
    await page.waitForFunction(() => window.__skyDebug.speedText()[1] === 'ft/s', null, { timeout: 20000 }).catch(() => {});
    const u1 = await page.evaluate(() => window.__skyDebug.speedText()[1]);
    await page.evaluate(() => { const el = document.getElementById('optUnits'); el.value = 'metric'; el.dispatchEvent(new Event('change')); });
    const u2 = await page.waitForFunction(() => window.__skyDebug.speedText()[1] === 'm/s', null, { timeout: 20000 }).then(() => 'm/s', () => 'stuck');
    await page.evaluate(() => { const el = document.getElementById('optUnits'); el.value = 'imperial'; el.dispatchEvent(new Event('change')); });
    c.check('speedometer defaults to ft/s and can switch to m/s', u0.set === 'imperial' && u0.opt === 'imperial' && u1 === 'ft/s' && u2 === 'm/s', JSON.stringify([u0, u1, u2]));

    // Bot skill: four levels with different numbers (Normal is the benchmarked default)
    const df = await page.evaluate(() => { const d = window.__skyDebug, out = { def: d.settings.botDiff, opts: [...document.querySelectorAll('#optBotDiff option')].map(o => o.value) };
      for (const k of ['easy', 'normal', 'hard', 'brutal']) { d.settings.botDiff = k; out[k] = d.botDiff().speed; } d.settings.botDiff = 'normal'; return out; });
    // Character select: clicking a portrait picks them, shows their catchphrase and animates
    const cs = await page.evaluate(() => { const card = document.querySelector('.charcard[data-key="dylan"]'); if (!card) return { none: 1 }; const n = document.querySelectorAll('.charcard').length; card.click();
      return { n, chosen: document.getElementById('optChar').value, say: document.getElementById('charSay').textContent, shown: !document.getElementById('charSay').hidden, anim: [...card.classList].some(c => c.startsWith('anim-')), on: card.classList.contains('on') }; });
    await page.evaluate(() => { const c = document.querySelector('.charcard[data-key="classic"]'); if (c) c.click(); });
    c.check('character select: portraits, picking one shouts their catchphrase with an animation', !cs.none && cs.n === 8 && cs.chosen === 'dylan' && cs.shown && cs.say.length > 4 && cs.anim && cs.on, JSON.stringify(cs));
    c.check('four bot skill levels, Normal by default', df.def === 'normal' && df.opts.join() === 'easy,normal,hard,brutal' && df.easy < df.normal && df.normal < df.hard && df.hard < df.brutal, JSON.stringify(df));

    // Spin sniper is a one-shot KO: on you (death cam on the spot) and on a bot (KO credited)
    const ko = await page.evaluate(() => { const d = window.__skyDebug; d.calm(); d.killMe('Sniper'); const r = { dead: d.death().deadT > 0, title: document.getElementById('deathTitle').textContent, how: d.presence().lastSplash && d.presence().lastSplash.how, y: d.body.position.y };
      d.respawnNow(); const b = d.bots()[0]; if (b) { const k0 = d.presence().dunks; b.shieldT = 0; d.killBot('bot:' + b.id); r.botKO = d.presence().dunks === k0 + 1; } else r.botKO = 'no bots'; return r; });
    c.check('the spin sniper knocks out on hit (you and bots)', ko.dead && ko.title === 'SNIPED' && ko.how === 'snipe' && ko.y > -1 && (ko.botKO === true || ko.botKO === 'no bots'), JSON.stringify(ko));

    // Touch: pause button pauses; the face sits at the bottom middle
    const tp = await page.evaluate(() => { const d = window.__skyDebug; d.setInput(true); const f = document.getElementById('faceBox').getBoundingClientRect();
      const r = { faceMid: Math.round(f.left + f.width / 2), mid: Math.round(innerWidth / 2), faceBottom: Math.round(innerHeight - f.bottom), pauseShown: !document.getElementById('chatBtns').hidden };
      document.getElementById('tPause').click(); r.paused = !d.isRunning() && !document.getElementById('start').hidden; d.setInput(false); return r; });
    c.check('touch: pause button works and the face is bottom-centre', tp.pauseShown && tp.paused && Math.abs(tp.faceMid - tp.mid) < 4 && tp.faceBottom < 40, JSON.stringify(tp));
    await page.evaluate(() => { document.getElementById('go').click(); });
    await page.waitForFunction(() => window.__skyDebug.isRunning(), null, { timeout: 20000 }).catch(() => {});

    // Swing scheme: tap two rocks for two ropes, swipe down to reel in, swipe up to let go
    const sw0 = await page.evaluate(() => {
      const d = window.__skyDebug, T = d.camTarget.clone(), cam = d.camera; d.calm(); d.settings.controls = 'simple';
      const rs = d.rocks.map(r => ({ r, dist: Math.hypot(r.x - T.x, r.y - T.y, r.z - T.z) })).filter(o => o.dist > 8 && o.dist < 55).sort((a, b) => a.dist - b.dist).slice(0, 2);
      if (rs.length < 2) return { skip: 'need two rocks in range' };
      for (const o of rs) { cam.position.copy(T); cam.lookAt(o.r.x, o.r.y, o.r.z); cam.updateMatrixWorld(); d.tapHook(innerWidth / 2, innerHeight / 2); }
      return { hooks: d.hooks() }; });
    let swing = { skip: sw0.skip };
    if (!sw0.skip) {
      await page.waitForFunction(() => { const h = window.__skyDebug.hooks(); return h[0] === 'attached' && h[1] === 'attached'; }, null, { timeout: 20000 }).catch(() => {});
      swing = await page.evaluate(() => { const d = window.__skyDebug, h0 = d.hooks(); d.swipe(0, 40); const h1 = d.hooks(); d.swipe(0, -90); const h2 = d.hooks(); d.endSwipe(); d.settings.controls = 'classic'; return { h0, h1, h2 }; });
    }
    c.check('swing scheme: two ropes from two taps, swipe down reels in, swipe up lets go', swing.skip || (swing.h0[0] === 'attached' && swing.h0[1] === 'attached' && swing.h1[2] < swing.h0[2] && swing.h1[3] < swing.h0[3] && swing.h2[0] === 'retract' && swing.h2[1] === 'retract'), JSON.stringify([sw0, swing]));

    // Touch: a quick tap on the left half is a tap (hook), not the joystick; dragging there starts the joystick
    const js = await page.evaluate(() => { const d = window.__skyDebug; d.settings.controls = 'simple';
      d.touchSim('down', 100, 300, 11); const tap = d.touchSim('up', 100, 300, 11);
      d.touchSim('down', 100, 300, 12); const drag = d.touchSim('move', 140, 300, 12); d.touchSim('up', 140, 300, 12);
      d.settings.joystick = false; d.touchSim('down', 100, 300, 13); const off = d.touchSim('move', 140, 300, 13); d.touchSim('up', 140, 300, 13);
      d.settings.joystick = true; d.settings.controls = 'classic'; return { tap, drag, off }; });
    c.check('touch: taps on the left hook, drags there move, and the joystick can be turned off', !js.tap.joy && !js.tap.pending && js.drag.joy && !js.off.joy, JSON.stringify(js));

    // Volume slider drives the master volume
    const vol = await page.evaluate(() => { const el = document.getElementById('optVolume'); el.value = '0.3'; el.dispatchEvent(new Event('input')); const r = { set: window.__skyDebug.settings.volume, master: window.__skyDebug.masterVol(), label: document.getElementById('volVal').textContent }; el.value = '0.8'; el.dispatchEvent(new Event('input')); return r; });
    c.check('volume slider sets the master volume', vol.set === 0.3 && Math.abs(vol.master - 0.3) < 1e-6 && vol.label === '30%', JSON.stringify(vol));

    // Glider dive: straight down by default, movement tilts it, letting go swoops you out and up
    const gd = await page.evaluate(() => { const d = window.__skyDebug, b = d.body; d.calm(); d.setGlider(30); b.position.set(0, 240, 0); b.velocity.set(10, -2, 0); d.view(-Math.PI / 2, .3);
      d.keys.add(' '); d.tick(3); const g0 = d.glider(); d.setTouchDive(true); d.tick(70);
      const straight = { vy: +b.velocity.y.toFixed(1), hs: +Math.hypot(b.velocity.x, b.velocity.z).toFixed(1) };
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { straight.tilt = +d.heroTilt().toFixed(2); res(); }))).then(() => {
      d.keys.add('w'); d.tick(50); const tilted = { vy: +b.velocity.y.toFixed(1), hs: +Math.hypot(b.velocity.x, b.velocity.z).toFixed(1) }; d.keys.delete('w');
      d.setTouchDive(false); d.tick(2); const out = { vy: +b.velocity.y.toFixed(1), hs: +Math.hypot(b.velocity.x, b.velocity.z).toFixed(1) };
      d.keys.delete(' '); d.setGlider(0); return { g0, straight, tilted, out }; }); });
    c.check('glider dive: straight down by default, movement tilts it, letting go swoops you out and up', gd.g0.gliding && gd.straight.vy < -35 && gd.straight.hs < 6 && gd.straight.tilt < -2.6 && gd.tilted.hs > 15 && gd.out.vy > 8 && gd.out.hs > 15, JSON.stringify(gd));

    // Look range: further up and down than before
    const pr = await page.evaluate(() => { const d = window.__skyDebug; d.view(Math.PI, 0); for (let i = 0; i < 20; i++) d.lookBy(0, 200); const hi = d.pitch(); for (let i = 0; i < 40; i++) d.lookBy(0, -200); const lo = d.pitch(); d.view(Math.PI * .75, .28); return { hi: +hi.toFixed(2), lo: +lo.toFixed(2) }; });
    c.check('look further up and down (pitch -1.1 to 1.45)', pr.hi === 1.45 && pr.lo === -1.1, JSON.stringify(pr));

    // Tightrope: a merged rope is walkable; two straight reeled-in ropes merge; it vanishes after 10 s with nobody on it
    const tr = await page.evaluate(() => { const d = window.__skyDebug, b = d.body; d.calm();
      const x = b.position.x, z = b.position.z, g = d.probe({ x, y: 400, z })[0], y = g + 14;
      d.makeRope([x - 10, y, z], [x + 10, y, z]); b.position.set(x, y + 1.5, z); b.velocity.set(0, 0, 0); d.tick(60);
      const stand = { standing: d.ground().standing, dy: +(b.position.y - y).toFixed(2) };
      // merge: two hooks attached either side, you hanging between, reeling
      const V = b.position.constructor; const A = d.camera.position.clone().set(x - 12, y + 6, z), B = d.camera.position.clone().set(x + 12, y + 6, z);
      d.setHook({ phase: 'attached', tip: A.clone(), body: null, point: A.clone(), len: 12, miss: false, remote: null, obj: null }); d.setHook2({ phase: 'attached', tip: B.clone(), body: null, point: B.clone(), len: 12, miss: false, obj: null });
      b.position.set(x, y + 5.5, z); d.setReel(true); const merged = d.tryMerge(); d.setReel(false);
      return { stand, merged, rope: d.ropes.has('me') }; });
    await page.evaluate(() => { const d = window.__skyDebug; d.body.position.set(d.body.position.x + 60, d.body.position.y + 40, d.body.position.z); d.tick(660); });
    const gone = await page.waitForFunction(() => !window.__skyDebug.ropes.has('me'), null, { timeout: 20000 }).then(() => true, () => false);
    c.check('tightrope: walkable, two straight reeled ropes merge into one, and it vanishes when left empty', tr.stand.standing && tr.stand.dy > .3 && tr.stand.dy < 1.2 && tr.merged && tr.rope && gone, JSON.stringify({ tr, gone }));
    await page.evaluate(() => window.__skyDebug.respawnNow());

    // Pinch to zoom: spreading two fingers brings the camera in
    const pz = await page.evaluate(() => { const d = window.__skyDebug, c0 = d.camDist();
      d.touchSim('down', 500, 300, 21); d.touchSim('down', 600, 300, 22); d.touchSim('move', 700, 300, 22); const c1 = d.camDist(); d.touchSim('up', 700, 300, 22); d.touchSim('up', 500, 300, 21);
      return { c0: +c0.toFixed(2), c1: +c1.toFixed(2) }; });
    c.check('pinch to zoom the camera', pz.c1 < pz.c0 - 1, JSON.stringify(pz));

    // Gates: big rings you only have to pass near (4 m), not tiny sparks
    const gt = await page.evaluate(() => { const d = window.__skyDebug, s = d.sparks.find(x => !x.got); if (!s) return { none: 1 }; d.body.position.set(s.pos.x + 3.4, s.pos.y, s.pos.z); d.body.velocity.set(0, 0, 0); return { got0: s.got }; });
    const gotIt = await page.waitForFunction(() => window.__skyDebug.sparks.some(x => x.got), null, { timeout: 20000 }).then(() => true, () => false);
    c.check('race gates count when you pass within 4 m', !gt.none && gotIt, JSON.stringify(gt));

    // Speed limits: a fling far over the cap is bled off by air drag and the cap
    const sl = await page.evaluate(() => { const d = window.__skyDebug, b = d.body; d.calm(); b.position.set(0, 160, 0); b.velocity.set(0, 0, 0); d.tick(12); b.velocity.set(60, 0, 0); d.tick(2); const v1 = Math.hypot(b.velocity.x, b.velocity.z); d.tick(120); const v2 = Math.hypot(b.velocity.x, b.velocity.z); return { v1: +v1.toFixed(1), v2: +v2.toFixed(1) }; });
    c.check('speed cap and air drag keep flings in check (34 m/s cap, drag toward 22)', sl.v1 <= 34.5 && sl.v1 > 30 && sl.v2 < 27 && sl.v2 > 20, JSON.stringify(sl));
    await page.evaluate(() => window.__skyDebug.respawnNow());

    // Tightrope: hook it from below to get hauled up and climb on; then pull a crate up without leaving the rope
    const tc = await page.evaluate(() => { const d = window.__skyDebug, b = d.body; d.calm(); d.respawnNow(); d.keys.clear(); d.setPull(false); d.setHook(null); d.setHook2(null);
      const x = -55, z = 45, g = d.probe({ x, y: 400, z })[0], y = g + 12;
      d.makeRope([x - 10, y, z], [x + 10, y, z]); const r = d.ropes.get('me');
      b.position.set(x + 1, y - 8, z); b.velocity.set(0, 0, 0);
      const A = d.camera.position.clone().set(x + 1, y, z);
      d.setHook({ phase: 'attached', tip: A.clone(), body: null, point: A.clone(), len: 8, miss: false, remote: null, obj: r.sleeve });
      let climbed = false; for (let i = 0; i < 150 && !climbed; i++) { d.tick(1); climbed = d.climb(); }
      d.tick(30); const on = { climbed, standing: d.ground().standing, dy: +(b.position.y - y).toFixed(2) };
      // pull a crate up from the rope
      const dyn = d.dynamics.find(o => o.body.mass > 0 && o.body.mass < 10); if (!dyn) return { on, skip: 'no crate' };
      const cb = dyn.body; cb.position.set(x + 4, g + 1, z); cb.velocity.set(0, 0, 0); cb.wakeUp(); const V = b.position.constructor;
      d.setHook({ phase: 'attached', tip: d.camera.position.clone().set(x + 4, g + 1, z), body: cb, local: new V(0, 0, 0), point: d.camera.position.clone(), len: 12, miss: false, remote: null, obj: null });
      d.setPull(true); const c0 = cb.position.distanceTo(b.position); let minDy = 9;
      for (let i = 0; i < 70; i++) { d.tick(1); minDy = Math.min(minDy, b.position.y - y); }
      const c1 = cb.position.distanceTo(b.position); d.setPull(false); d.setHook(null);
      return { on, pull: { c0: +c0.toFixed(1), c1: +c1.toFixed(1), stayed: minDy > .3 } }; });
    c.check('tightrope: grapple onto it and climb on; pull things up to you without leaving the rope', tc.on.climbed && tc.on.standing && tc.on.dy > .3 && tc.on.dy < 1.2 && (tc.skip || (tc.pull.c1 < tc.pull.c0 - 4 && tc.pull.stayed)), JSON.stringify(tc));
    await page.evaluate(() => window.__skyDebug.respawnNow());

    // PC: right mouse / X fires a second rope at the crosshair; releasing lets go
    const h2a = await page.evaluate(() => { const d = window.__skyDebug, b = d.body; d.respawnNow(); d.setHook(null); d.setHook2(null);
      const rk = d.rocks.map(r => ({ r, dist: Math.hypot(r.x - b.position.x, r.z - b.position.z) })).filter(o => o.dist > 10 && o.dist < 45).sort((a, b) => a.dist - b.dist)[0];
      if (!rk) return { skip: 1 }; const dx = rk.r.x - b.position.x, dz = rk.r.z - b.position.z, dy = rk.r.y - b.position.y - 1.5;
      d.view(Math.atan2(-dx, -dz), -Math.atan2(dy, Math.hypot(dx, dz)) * .9); return { ok: 1 }; });
    let h2 = { skip: h2a.skip };
    if (!h2a.skip) {
      await page.waitForFunction(() => window.__skyDebug.aim() != null, null, { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => window.__skyDebug.hook2Down());
      const att = await page.waitForFunction(() => window.__skyDebug.hooks()[1] === 'attached', null, { timeout: 20000 }).then(() => true, () => false);
      await page.evaluate(() => window.__skyDebug.hook2Up());
      h2 = { att, after: await page.evaluate(() => window.__skyDebug.hooks()[1]) };
    }
    c.check('PC: a second rope on right mouse / X', h2.skip || (h2.att && (h2.after === 'retract' || h2.after === null)), JSON.stringify(h2));
    // PC: E throws the right grapple; right click reels it in, even pressed while left is held (a chorded press
    // arrives as pointermove); releasing the button only stops reeling, and Left Alt lets go
    let ch = { skip: h2a.skip };
    if (!h2a.skip) {
      await page.evaluate(() => { const d = window.__skyDebug; d.setHook2(null); });
      await page.waitForFunction(() => window.__skyDebug.aim() != null, null, { timeout: 20000 }).catch(() => {});
      await page.keyboard.press('e');
      const fired = await page.waitForFunction(() => window.__skyDebug.hook2State() === 'attached', null, { timeout: 20000 }).then(() => true, () => false);
      await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', button: 2, buttons: 3, bubbles: true })));
      const reeling = await page.evaluate(() => window.__skyDebug.reels()[1]);
      await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', button: 2, buttons: 1, bubbles: true })));
      const kept = await page.evaluate(() => ({ h: window.__skyDebug.hook2State(), reel: window.__skyDebug.reels()[1] }));
      await page.keyboard.press('Alt');
      ch = { fired, reeling, kept, afterAlt: await page.evaluate(() => window.__skyDebug.hook2State()) };
    }
    c.check('PC: E throws the right grapple; right click (even while left is held) reels it; releasing keeps it; Left Alt lets go', ch.skip || (ch.fired && ch.reeling === true && ch.kept.h === 'attached' && ch.kept.reel === false && (ch.afterAlt === 'retract' || ch.afterAlt === null)), JSON.stringify(ch));

    // PC: L and R markers track the nearest things to grab; Q fires at the L marker; Shift lets go
    const mk = await page.evaluate(() => { const d = window.__skyDebug; d.respawnNow(); d.setHook(null); d.setHook2(null); d.body.position.set(-55, 8, 45); d.view(Math.PI * .75, -.35); return true; });
    await page.waitForFunction(() => { const a = window.__skyDebug.auto(); return a.L || a.R; }, null, { timeout: 20000 }).catch(() => {});
    const mk2 = await page.evaluate(() => ({ auto: window.__skyDebug.auto(), gL: !document.getElementById('gL').hidden, gR: !document.getElementById('gR').hidden }));
    let lf = { skip: !mk2.auto.L };
    if (mk2.auto.L) {
      await page.keyboard.press('q');
      const lfired = await page.waitForFunction(() => { const h = window.__skyDebug.hooks(); return h[0] === 'fly' || h[0] === 'attached'; }, null, { timeout: 20000 }).then(() => true, () => false);
      await page.keyboard.press('Shift');
      lf = { lfired, afterShift: await page.evaluate(() => window.__skyDebug.hooks()[0]) };
    }
    c.check('PC: L/R markers track different things to grab; Q throws the left grapple at the L marker; Shift lets go', (mk2.gL || mk2.gR) && !(mk2.auto.L && mk2.auto.R && mk2.auto.L.join() === mk2.auto.R.join()) && (lf.skip || (lf.lfired && (lf.afterShift === 'retract' || lf.afterShift === null))), JSON.stringify({ mk2, lf }));

    // PC: with no rope out, left click throws the left grapple; with a rope out it only reels
    let lc = { skip: !mk2.auto.L };
    if (mk2.auto.L) {
      await page.evaluate(() => { const d = window.__skyDebug; d.setHook(null); d.setHook2(null); d.leftReel(false); d.leftClick(); });
      const thrown = await page.waitForFunction(() => { const h = window.__skyDebug.hooks(); return h[0] === 'fly' || h[0] === 'attached'; }, null, { timeout: 20000 }).then(() => true, () => false);
      const again = await page.evaluate(() => { const d = window.__skyDebug, p = d.body.position, A = d.camera.position.clone().set(p.x, p.y + 12, p.z + 6); d.setHook(null);
        d.setHook2({ phase: 'attached', tip: A.clone(), body: null, point: A.clone(), len: 13, miss: false, obj: null }); d.leftReel(false); d.leftClick(); const r = { left: d.hooks()[0], reel: d.reels()[0] }; d.leftReel(false); d.setHook2(null); return r; });
      lc = { thrown, again };
    }
    c.check('PC: left click throws the left grapple when no rope is out, and only reels when one is', lc.skip || (lc.thrown && lc.again.left == null && lc.again.reel === true), JSON.stringify(lc));

    // PC: Z pulls what the left rope caught, C what the right rope caught (each tested on its own); Space lets go of both
    const setupPull = (side) => page.evaluate((side) => { const d = window.__skyDebug, b = d.body; d.clearBombs(); d.calm(); d.keys.clear(); d.setHook(null); d.setHook2(null);
      const x = -55, z = 45, g = d.probe({ x, y: 400, z })[0]; b.position.set(x, g + .7, z); b.velocity.set(0, 0, 0); d.tick(10);
      const cr = d.dynamics.find(o => o.body.mass > 0 && o.body.mass < 10); if (!cr) return { skip: 1 };
      const A = cr.body, V = b.position.constructor, gx = d.probe({ x: x + 10, y: 400, z })[0]; A.position.set(x + 10, gx + 1, z); A.velocity.set(0, 0, 0); A.angularVelocity.set(0, 0, 0); A.wakeUp();
      const h = { phase: 'attached', tip: d.camera.position.clone(), body: A, local: new V(0, 0, 0), point: d.camera.position.clone(), len: 10, miss: false, remote: null, obj: null };
      if (side === 'z') d.setHook(h); else d.setHook2(h);
      return { d0: +A.position.distanceTo(b.position).toFixed(1) }; }, side);
    const pullWith = async (key) => { const s0 = await setupPull(key); if (s0.skip) return s0;
      await page.keyboard.down(key); await page.waitForFunction((k) => window.__skyDebug.pullKeys()[k], key, { timeout: 10000 }).catch(() => {});
      const d1 = await page.evaluate(() => { const d = window.__skyDebug; d.tick(45); const A = d.dynamics.find(o => o.body.mass > 0 && o.body.mass < 10).body; return +A.position.distanceTo(d.body.position).toFixed(1); });
      await page.keyboard.up(key); return { d0: s0.d0, d1 }; };
    const qP = await pullWith('z'), eP = await pullWith('c');
    // Space lets go of both ropes
    await page.evaluate(() => { const d = window.__skyDebug, p = d.body.position, A = d.camera.position.clone().set(p.x + 8, p.y + 12, p.z), B = d.camera.position.clone().set(p.x - 8, p.y + 12, p.z); d.setHook(null); d.setHook2(null);
      d.setHook({ phase: 'attached', tip: A.clone(), body: null, point: A.clone(), len: 15, miss: false, remote: null, obj: null }); d.setHook2({ phase: 'attached', tip: B.clone(), body: null, point: B.clone(), len: 15, miss: false, obj: null }); });
    await page.keyboard.press(' '); await page.evaluate(() => window.__skyDebug.tick(2));
    const afterSpace = await page.evaluate(() => window.__skyDebug.hooks().slice(0, 2));
    c.check('PC: Z pulls the left catch, C the right catch, Space lets go of both', (qP.skip || qP.d1 < qP.d0 - 4) && (eP.skip || eP.d1 < eP.d0 - 4) && afterSpace.every(h => h !== 'attached'), JSON.stringify({ qP, eP, afterSpace }));
    await page.evaluate(() => { const d = window.__skyDebug; d.setHook(null); d.setHook2(null); d.respawnNow(); });

    // Bombs: 4 s fuse with a green -> red countdown; throwing one back makes it yours
    const bm0 = await page.evaluate(() => { const d = window.__skyDebug, p = d.body.position; d.makeBomb(p.x + 8, p.y + 2, p.z); return d.bombs().slice(-1)[0]; });
    const bmBody = await page.evaluate(() => true);
    await page.evaluate(() => { const d = window.__skyDebug, pr = d.projectiles.filter(p => p.kind === 'bomb').slice(-1)[0]; d.yeet(pr.body); });
    const bm1 = await page.evaluate(() => window.__skyDebug.bombs().slice(-1)[0]);
    const red = await page.waitForFunction(() => { const b = window.__skyDebug.bombs().slice(-1)[0]; return b && b.t < .9 && parseInt(b.col.slice(3, 5), 16) < 140 && parseInt(b.col.slice(1, 3), 16) > 200; }, null, { timeout: 30000, polling: 50 }).then(() => true, () => false);
    c.check('bombs: 4 s fuse, green to red countdown, and throwing one back makes it yours', bm0.t > 3.5 && parseInt(bm0.col.slice(3, 5), 16) > 200 && bm1.by === 'Tester' && red, JSON.stringify({ bm0, bm1, red }));

    // Live leaderboard: hold Tab to see it
    await page.keyboard.down('Tab');
    const lb1 = await page.waitForFunction(() => !document.getElementById('liveBoard').hidden && document.querySelectorAll('#lbTable div').length >= 2, null, { timeout: 20000 }).then(() => true, () => false);
    await page.keyboard.up('Tab');
    const lb2 = await page.waitForFunction(() => document.getElementById('liveBoard').hidden, null, { timeout: 20000 }).then(() => true, () => false);
    c.check('hold Tab to see the standings mid-game', lb1 && lb2);

    // Mega power-up: a cruise missile crate drops, you grab it, and fire it
    const mg = await page.evaluate(() => { const d = window.__skyDebug; d.spawnMega(0); const r = { active: d.mega.active }; d.takeMega(); r.held = d.item().heldItem; d.useItem(); r.flying = d.projectiles.some(p => p.kind === 'missile'); r.after = d.item().heldItem; return r; });
    c.check('cruise missile: drops, can be grabbed, and fires', mg.active && mg.held === 'missile' && mg.flying && mg.after === null, JSON.stringify(mg));

    // Explosions: a big effect, and a ragdoll launch
    const bx = await page.evaluate(() => { const d = window.__skyDebug, p = d.body.position; d.calm(); const v0 = Math.hypot(d.body.velocity.x, d.body.velocity.z); d.explodeAt(p.x + 2, p.y, p.z); return { rag: d.ragdoll(), fx: d.boomFx(), dv: +(Math.hypot(d.body.velocity.x, d.body.velocity.z) - v0).toFixed(1) }; });
    c.check('explosions throw you into a ragdoll tumble with a big blast effect', bx.rag && bx.fx > 20 && bx.dv > 8, JSON.stringify(bx));

    // Ground punch: swinging at the ground while falling bounces you up; the bat bounces higher
    const punch = await page.evaluate(() => {
      const d = window.__skyDebug, b = d.body, out = {};
      for (const bat of [false, true]) {
        const x = b.position.x, z = b.position.z, g = d.probe({ x, y: b.position.y + 3, z })[0];
        b.position.set(x, g + 2.2, z); b.velocity.set(0, -12, 0); d.setOnGround(false);
        out[bat ? 'bat' : 'shove'] = d.groundPunch(bat) ? b.velocity.y : null;
      }
      b.velocity.set(0, 0, 0);
      return out;
    });
    c.check('ground punch bounces you, and the bat bounces higher', punch.shove > 8 && punch.bat > punch.shove, JSON.stringify(punch));

    // Bots (solo: this game runs them)
    await page.evaluate(() => { const el = document.getElementById('optBots'); el.value = '2'; el.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => window.__skyDebug.bots().length === 2 && window.__skyDebug.intro().seen.length >= 2, null, { timeout: 30000 }).catch(() => {});
    const bots0 = await page.evaluate(() => { const d = window.__skyDebug; return { n: d.bots().length, ctrl: d.ctrl(), names: d.bots().map(b => b.name), avatars: d.botAvatars.size }; });
    c.check('bots spawn as characters', bots0.n === 2 && bots0.ctrl && bots0.avatars === 2 && bots0.names.join() === 'Matteo,Yuki', JSON.stringify(bots0));
    const intro = await page.evaluate(() => window.__skyDebug.intro());
    c.check('entrance cards play for each character', intro.seen.includes('matteo') && intro.seen.includes('yuki') && (await page.textContent('#introName')).length > 0, JSON.stringify(intro));
    const chase = await page.evaluate(() => { window.__skyDebug.clearBombs(); const d = window.__skyDebug, m = d.bots().find(b => b.C.key === 'matteo') || d.bots()[0], me = d.body.position;
      m.body.position.set(me.x + 20, me.y + 1, me.z); m.body.velocity.set(0, 0, 0); m.introT = 0; m.eng = null; m.bait = null; m.avoid && m.avoid.clear(); m.knockUntil = -9; m.ragdollUntil = -9; m.daze = 0; m.item = null; m.grudge = null; m.hook = null; const batCd = d.batPickups.map(g => g.cd); d.batPickups.forEach(g => { g.cd = 99; }); d.tick(10);
      const d0 = Math.hypot(m.body.position.x - me.x, m.body.position.z - me.z); d.tick(180);   // 3 s: room for a random hop or dodge (bats out of play, so it can't detour for one)
      d.batPickups.forEach((g, i) => { g.cd = batCd[i]; });
      return { d0, d1: Math.hypot(m.body.position.x - me.x, m.body.position.z - me.z) }; });
    c.check('aggressive bot chases you', chase.d1 < chase.d0 - 5, `${chase.d0.toFixed(1)} m -> ${chase.d1.toFixed(1)} m`);
    const hitB = await page.evaluate(() => { const d = window.__skyDebug, m = d.bots()[0]; m.body.velocity.set(0, 0, 0); d.hitBot('bot:' + m.id, [1, 0], true, 'me', 'Tester'); return m.body.velocity.x; });
    c.check('hitting a bot knocks it back', hitB > 15, `vx ${hitB.toFixed(1)}`);
    const dodges = await page.evaluate(() => { const d = window.__skyDebug, k = d.CHARACTERS.find(c => c.key === 'kofi'); return k.dodge; });
    c.check('characters have distinct personalities', dodges > .3);

    // Race items and destructible towers
    await page.waitForFunction(() => { const d = window.__skyDebug, b = d.itemBoxes[0]; if (!d.item().heldItem) b.cd = 0; d.body.position.set(b.pos.x, b.pos.y, b.pos.z); d.body.velocity.set(0, 0, 0); return !!d.item().heldItem; }, null, { timeout: 30000, polling: 100 }).catch(() => {});
    c.check('a ? box gives you an item', !!(await page.evaluate(() => window.__skyDebug.item().heldItem)));
    await page.evaluate(() => { const d = window.__skyDebug; d.giveItem('shield'); d.useItem(); d.takeHit([1, 0], true, { peer: 'x', name: 'X' }); });
    c.check('a shield blocks a hit', (await page.evaluate(() => Math.abs(window.__skyDebug.body.velocity.x))) < 5);
    const tw = await page.evaluate(() => { const d = window.__skyDebug, before = d.towers(); const t = d.towerSpots ? null : null; return before; });
    const blast = await page.evaluate(() => { const d = window.__skyDebug, before = d.towers().reduce((a, b) => a + b, 0); const t0 = d.towersAt(0); d.explodeAt(t0.x, t0.y + 3, t0.z); return { before, after: d.towers().reduce((a, b) => a + b, 0) }; });
    c.check('an explosion blows a hole and the tower collapses', blast.after < blast.before - 6, `${blast.before} -> ${blast.after} blocks`);
    await page.evaluate(() => { const d = window.__skyDebug; d.body.position.set(-55, 8, 45); d.body.velocity.set(0, 0, 0); d.tick(30); d.giveItem('bomb'); d.view(0, .3); d.useItem(); });
    await page.waitForFunction(() => { const b = window.__skyDebug.item().lastBoom; return b && b.n >= 2; }, null, { timeout: 40000 }).catch(() => {});
    c.check('a thrown bomb explodes and is shared', !!(await page.evaluate(() => window.__skyDebug.item().lastBoom && window.__skyDebug.item().lastBoom.n >= 2)), JSON.stringify(await page.evaluate(() => window.__skyDebug.item().lastBoom)));
    const comet = await page.evaluate(() => { const d = window.__skyDebug, bs = d.bots(); if (!bs.length) return 'no bots'; bs[0].sparkCount = 9; d.giveItem('comet'); d.useItem(); return document.getElementById('toast').textContent; });
    c.check('a homing comet targets the leader', /hunting Matteo|hunting Yuki/.test(comet), comet);
    await page.evaluate(() => { const d = window.__skyDebug; d.calm(); d.body.position.set(-55, 8, 45); d.body.velocity.set(0, 0, 0); d.tick(30); });

    // Bots use items: give one a bomb with the player close by, and it throws it
    const botBomb = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[0]; if (!b) return 'no bots'; const me = d.body.position;
      b.body.position.set(me.x + 6, me.y, me.z); b.body.velocity.set(0, 0, 0); b.item = 'bomb'; b.itemT = 1; b.introT = 0; d.botItems(b, .1); return b.item; });
    c.check('bots throw bombs at nearby players', botBomb === null, String(botBomb));
    const botGlide = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[0]; if (!b) return 'no bots';
      b.gliderT = 30; b.hook = null; b.introT = 0; b.knockUntil = -9; b.body.position.set(0, 90, 0); b.body.velocity.set(0, -6, 0); b.target = 0; d.tick(30);
      return { gliding: !!b.gliding, vy: +b.body.velocity.y.toFixed(1) }; });
    c.check('bots glide when they have a glider (falling far slower than free fall, about -19 m/s here)', botGlide.gliding && botGlide.vy > -9, JSON.stringify(botGlide));
    await page.evaluate(() => { const d = window.__skyDebug; d.calm(); d.body.position.set(-55, 8, 45); d.body.velocity.set(0, 0, 0); d.tick(30); });

    // Character select and the reacting face
    await page.evaluate(() => { const el = document.getElementById('optChar'); el.value = 'matteo'; el.dispatchEvent(new Event('change')); window.__skyDebug.tick(3); });
    await page.waitForTimeout(300);
    const picked = await page.evaluate(() => window.__skyDebug.bots().map(b => b.C.key));
    c.check('bots skip the character you play as', picked.length === 2 && !picked.includes('matteo'), picked.join(','));
    await page.evaluate(() => window.__skyDebug.hurt());
    await page.waitForFunction(() => window.__skyDebug.face().mood === 'ow', null, { timeout: 15000, polling: 50 }).catch(() => {});
    c.check('face winces when you get hit', (await page.evaluate(() => window.__skyDebug.face().mood)) === 'ow');
    await page.evaluate(() => { const d = window.__skyDebug; d.calm(); d.body.position.set(0, 120, 0); d.body.velocity.set(0, -30, 0); }); await page.waitForFunction(() => window.__skyDebug.face().mood === 'panic', null, { timeout: 15000, polling: 50 }).catch(() => {});
    c.check('face panics when falling fast', (await page.evaluate(() => window.__skyDebug.face().mood)) === 'panic');
    await page.evaluate(() => { const el = document.getElementById('optChar'); el.value = 'classic'; el.dispatchEvent(new Event('change')); });
    await page.evaluate(() => { const d = window.__skyDebug; d.calm(); d.body.position.set(-55, 8, 45); d.body.velocity.set(0, 0, 0); d.tick(60); });

    // Multiplayer with a scripted friend (bots off so they don't shove us out of position)
    await page.evaluate(() => { const el = document.getElementById('optBots'); el.value = '0'; el.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const d = window.__skyDebug; d.body.velocity.set(0, 0, 0); d.tick(30); });
    const me = await page.evaluate(() => { const p = window.__skyDebug.body.position; return [p.x, p.y, p.z]; });
    const friendAt = (extra = {}) => page.evaluate(([me, extra]) => window.__fake.setFriend({ n: 'Friend', p: [me[0], me[1], me[2] - 2], v: [0, 0, 0], yw: 0, g: 0, h: 0, s: 0, t: 0, rs: 'running', ps: 0, race: 1, sw: 0, bt: 0, hit: 0, sp: 0, dk: 0, ...extra }), [me, extra]);
    await friendAt();
    await page.waitForTimeout(1000);
    c.check('friend avatar appears', (await page.evaluate(() => window.__skyDebug.avatars.size)) === 1);

    // I swing at the friend (facing -z, friend is 2 m in front)
    const preSwing = await page.evaluate(() => { const d = window.__skyDebug, b = d.body.position, a = [...d.avatars.values()][0]; return { me: [b.x, b.z].map(n => +n.toFixed(1)), friend: a ? [a.disp.x, a.disp.z].map(n => +n.toFixed(1)) : null, bat: +d.bat().toFixed(1), bots: d.bots().length, botAv: d.botAvatars.size }; });
    await page.evaluate(() => { window.__skyDebug.view(0, .3); window.__skyDebug.attack(); });
    await page.waitForTimeout(200);
    const sentHit = await page.evaluate(() => window.__skyDebug.presence().lastHit);
    c.check('bat swing sends a hit to the friend', sentHit && sentHit.to === 'fr1end00peer0000' && sentHit.f === 1, JSON.stringify(sentHit) + ' ' + JSON.stringify(preSwing));

    // The friend hits me: first set a baseline counter, then bump it
    await friendAt({ hit: { n: 1, to: 'x', d: [1, 0], f: 0 } });
    await page.waitForTimeout(1000);
    const vx0 = await page.evaluate(() => window.__skyDebug.body.velocity.x);
    await friendAt({ hit: { n: 2, to: 'me000000peer0000', d: [1, 0], f: 1 } });
    await page.waitForFunction((vx0) => window.__skyDebug.body.velocity.x - vx0 > 5, vx0, { timeout: 20000, polling: 50 }).catch(() => {});
    const vx1 = await page.evaluate(() => window.__skyDebug.body.velocity.x);
    c.check('being hit by a bat knocks me back', vx1 - vx0 > 5, `vx ${vx0.toFixed(1)} -> ${vx1.toFixed(1)}`);

    // A friend who hooks me and holds Pull drags me toward them
    const pv = await page.evaluate(() => window.__skyDebug.body.position.clone());
    const fp = await page.evaluate(() => { const a = [...window.__skyDebug.avatars.values()][0]; return a ? [a.disp.x, a.disp.y, a.disp.z] : null; });
    if (fp) {
      await page.evaluate((fp) => { const d = window.__skyDebug; d.calm(); d.body.position.set(fp[0] + 8, fp[1] + .5, fp[2]); d.body.velocity.set(0, 0, 0); }, fp);
      await friendAt({ h: [2, pv.x, pv.y, pv.z, 4, 'me000000peer0000', 1] });
      await page.waitForFunction((fp) => { const v = window.__skyDebug.body.velocity, p = window.__skyDebug.body.position, dx = fp[0] - p.x, dz = fp[2] - p.z, l = Math.hypot(dx, dz) || 1; return (v.x * dx + v.z * dz) / l > 5; }, fp, { timeout: 20000, polling: 50 }).then(() => c.check('a friend pulling me drags me toward them', true), () => c.check('a friend pulling me drags me toward them', false));
      await friendAt({ h: 0 });
    }

    // Pop-ups only for actions that involve you: a friend grabbing a bat or hitting a bot stays quiet
    const quiet = await page.evaluate(() => { const t = document.getElementById('toast'); t.hidden = true; t.textContent = ''; return true; });
    await friendAt({ bt: 0 }); await page.waitForTimeout(300); await friendAt({ bt: 1 });
    await page.waitForTimeout(1500);
    const bk = await page.evaluate(() => { const d = window.__skyDebug, b = d.bots()[0]; if (b) { b.C = { ...b.C, dodge: 1 }; d.hitBot('bot:' + b.id, [1, 0], false, 'fr1end00peer0000', 'Friend'); } const t = document.getElementById('toast'); return { hidden: t.hidden, text: t.textContent }; });
    c.check('no pop-up when other players act on each other', quiet && (bk.hidden || !/grabbed a bat|dodged/.test(bk.text)), JSON.stringify(bk));
    await friendAt({ bt: 0 });

    // A friend's tightrope shows up in my world (and goes when they drop it)
    await friendAt({ tr: { n: 1, a: [me[0] - 8, me[1] + 6, me[2]], b: [me[0] + 8, me[1] + 6, me[2]] } });
    const trF = await page.waitForFunction(() => window.__skyDebug.ropes.has('fr1end00peer0000'), null, { timeout: 20000 }).then(() => true, () => false);
    await friendAt({ tr: 0 });
    const trG = await page.waitForFunction(() => !window.__skyDebug.ropes.has('fr1end00peer0000'), null, { timeout: 20000 }).then(() => true, () => false);
    c.check("a friend's tightrope is shared (appears and disappears)", trF && trG);

    // Bombs in multiplayer: a friend's bomb shows up, hooking it claims it (it becomes mine and I tell them), and
    // when they claim one of mine it leaves my world
    await friendAt({ bm: [['fr:1', me[0] + 5, me[1] + 1, me[2], 0, 0, 0, 3.5, 'Friend']] });
    const rbSeen = await page.waitForFunction(() => window.__skyDebug.remoteBombs.has('fr:1'), null, { timeout: 20000 }).then(() => true, () => false);
    const cl = await page.evaluate(() => { const d = window.__skyDebug, ok = d.claimRemoteBomb('fr:1'); return { ok, mine: d.myBombs().map(b => b[0]), bcl: d.bcl(), remote: d.remoteBombs.has('fr:1') }; });
    await page.waitForTimeout(600);
    const stillMine = await page.evaluate(() => ({ remote: window.__skyDebug.remoteBombs.has('fr:1'), mine: window.__skyDebug.myBombs().some(b => b[0] === 'fr:1') }));
    // now the friend claims a bomb of mine
    const myId = await page.evaluate(() => { const d = window.__skyDebug, p = d.body.position; d.makeBomb(p.x + 3, p.y + 1, p.z); return d.myBombs().slice(-1)[0][0]; });
    // the friend keeps re-sending numbered claims until one lands (the first number seen is only a baseline)
    let bGone = false;
    for (let n = 1; n <= 8 && !bGone; n++) { await friendAt({ bm: 0, bcl: { n, id: myId } }); bGone = await page.waitForFunction((id) => !window.__skyDebug.myBombs().some(b => b[0] === id), myId, { timeout: 2500 }).then(() => true, () => false); }
    c.check('bombs sync: see a friend\'s bomb, hook it to take it over, and lose yours when they take it', rbSeen && cl.ok && cl.mine.includes('fr:1') && cl.bcl.id === 'fr:1' && !cl.remote && !stillMine.remote && stillMine.mine && bGone, JSON.stringify({ rbSeen, cl, stillMine, bGone }));
    await friendAt({ bm: 0 });

    // A friend's streak is called on my screen, and their nuke falls on me: I'm out and the KO is theirs
    await friendAt({ bm: 0, ks: [0, 0], nk: { n: 0 } }); await page.waitForFunction(() => window.__skyDebug.avatars.size > 0, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(500);
    await friendAt({ bm: 0, ks: [3, 0], nk: { n: 1, by: 'fr1end00peer0000', name: 'Friend' } });
    const fNuke = await page.waitForFunction(() => window.__skyDebug.streak().phase != null, null, { timeout: 20000 }).then(() => true, () => false);
    const fStk = await page.waitForFunction(() => window.__skyDebug.streak().log.includes('Friend: ON A ROLL'), null, { timeout: 20000 }).then(() => true, () => false);
    await page.evaluate(() => window.__skyDebug.tick(60 * 4));
    const fOut = await page.waitForFunction(() => { const sp = window.__fake.mine().sp; return sp && sp.how === 'nuke'; }, null, { timeout: 20000 }).catch(() => {}).then(() => page.evaluate(() => window.__fake.mine().sp));
    c.check('multiplayer: a friend\'s streak is announced, and their nuke takes me out (KO to them)', fNuke && fStk && fOut && fOut.by === 'fr1end00peer0000', JSON.stringify({ fNuke, fStk, fOut }));
    await page.evaluate(() => window.__skyDebug.respawnNow());

    // Falling in the sea after being hit credits the friend
    const sp0 = await page.evaluate(() => { const sp = window.__fake.mine().sp; return sp ? sp.n : 0; });
    await page.evaluate(() => { const d = window.__skyDebug; d.takeHit([0, 0], false, { peer: 'fr1end00peer0000', name: 'Friend' }); const b = d.body; b.position.set(0, -4, -116); b.velocity.set(0, 0, 0); }); // the friend shoved me, and I'm out over the sea
    await page.waitForFunction((sp0) => { const sp = window.__fake.mine().sp; return sp && sp.n > sp0; }, sp0, { timeout: 20000 }).catch(() => {});
    const sp = await page.evaluate(() => window.__fake.mine().sp);
    c.check('splash is broadcast with who knocked me in', sp && sp.by === 'fr1end00peer0000', JSON.stringify(sp));
    const dc = await page.evaluate(() => ({ ...window.__skyDebug.death(), drops: window.__skyDebug.drops(), card: !document.getElementById('death').hidden, y: window.__skyDebug.body.position.y }));
    c.check('falling in starts the death cam with a splash', dc.deadT > 5 && dc.card && dc.drops > 10 && dc.y < -1.5, JSON.stringify(dc));
    await page.evaluate(() => window.__skyDebug.respawnNow());
    c.check('respawning early leaves the death cam', await page.evaluate(() => window.__skyDebug.death().deadT === 0 && document.getElementById('death').hidden && window.__skyDebug.body.position.y > 0));

    // Friend splashes because of me -> my dunk count goes up
    const dunks0 = await page.evaluate(() => window.__skyDebug.presence().dunks);
    await friendAt({ sp: { n: 1, by: 'nobody' } }); await page.waitForTimeout(1000);
    await friendAt({ sp: { n: 2, by: 'me000000peer0000' } }); await page.waitForTimeout(1000);
    c.check('dunking the friend scores', (await page.evaluate(() => window.__skyDebug.presence().dunks)) === dunks0 + 1);

    // The friend (lower peer id, not paused) now runs the bots: ours despawn, theirs are drawn
    await friendAt({ bots: [[7, 'Lars', me[0] + 6, me[1], me[2], 0, 0, 0, 0, 0, 0, 0, 0, 2]] });
    await page.waitForTimeout(1000);
    const rb = await page.evaluate(() => { const d = window.__skyDebug; return { local: d.bots().length, ctrl: d.ctrl(), shown: [...d.botAvatars.keys()] }; });
    c.check('friend-run bots replace ours', rb.local === 0 && !rb.ctrl && rb.shown.join() === 'bot:7', JSON.stringify(rb));

    // Chat: my message goes out, a friend's message shows up, and a bot answers via (fake) Claude
    await page.evaluate(() => { window.__skyDebug.setSample(async (prompt) => ({ text: 'Fjord-strong and ready to smash, little friend.' })); window.__skyDebug.sendChatText('hey Lars you are going down'); });
    await page.waitForTimeout(1000);
    const chat = await page.evaluate(() => window.__skyDebug.chat());
    c.check('chat message is sent', chat.lastChat && chat.lastChat.t === 'hey Lars you are going down', JSON.stringify(chat.lastChat));
    c.check('named bot replies in character', chat.lastBchat && chat.lastBchat.who === 'Lars' && chat.log.some(l => l.startsWith('Lars')), JSON.stringify(chat.lastBchat));
    await page.waitForTimeout(2000); // replies are rate-limited to one every 2.5 s
    await page.evaluate(() => window.__skyDebug.sendChatText('you wish, big guy'));
    await page.waitForTimeout(1000);
    const chat2 = await page.evaluate(() => window.__skyDebug.chat());
    c.check('a follow-up goes to whoever just spoke', chat2.lastBchat && chat2.lastBchat.n === 2 && chat2.lastBchat.who === 'Lars', JSON.stringify(chat2.lastBchat));
    c.check('chat history is saved for next time', await page.evaluate(() => (JSON.parse(localStorage.getItem('skyhook.chat.v1') || '[]')).length >= 4));
    await friendAt({ chat: { n: 1, t: 'first' } }); await page.waitForTimeout(1000);
    await friendAt({ chat: { n: 2, t: 'nice swing' } });
    c.check('friend chat shows up', await page.waitForFunction(() => window.__skyDebug.chat().log.some(l => l.includes('nice swing')), null, { timeout: 30000 }).then(() => true, () => false));
    c.check('the surfer joined the cast', await page.evaluate(() => window.__skyDebug.CHARACTERS.some(c => c.key === 'dylan' && c.from.includes('California'))));

    // Synced cups: a friend hosting a cup on another map pulls us into it
    await page.evaluate(() => localStorage.removeItem('skyhook.cup.v1'));
    const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
    await friendAt({ cupS: { id: 777, key: 'pack1', idx: 1, pts: { Friend: 10, Tester: 8 }, done: 0 } });
    await nav;
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 60000 });
    const followed = await page.evaluate(() => ({ hash: location.hash, cup: JSON.parse(localStorage.getItem('skyhook.cup.v1') || 'null') }));
    c.check('a friend\'s cup pulls you onto its map', followed.hash === '#map-neon' && followed.cup && followed.cup.follow && followed.cup.idx === 1 && followed.cup.points.Friend === 10, JSON.stringify(followed));
    await page.evaluate(() => { localStorage.removeItem('skyhook.cup.v1'); location.hash = ''; });
    await page.goto(page.url().split('#')[0]); await page.waitForFunction(() => window.__skyDebug, null, { timeout: 60000 });
    await page.evaluate(() => { const el = document.getElementById('optBots'); el.value = '0'; el.dispatchEvent(new Event('change')); document.getElementById('go').click(); });
    await page.waitForTimeout(800);
    await friendAt({ race: 1 }); await page.waitForTimeout(1000);

    // Race
    await friendAt({ race: 2 }); await page.waitForTimeout(1000);
    const race = await page.evaluate(() => window.__skyDebug.race());
    c.check('friend starting a race triggers my countdown', race.raceId === 2 && (race.raceCount > 0 || race.raceLive), JSON.stringify(race) + ' toast=' + await page.textContent('#toast'));

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
