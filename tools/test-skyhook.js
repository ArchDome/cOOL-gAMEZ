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
    c.check('glider pickup grants time', (await page.evaluate(() => window.__skyDebug.glide().gliderTime)) > 25);

    // Bat pickup
    await page.waitForFunction(() => { const d = window.__skyDebug, g = d.batPickups[0]; d.body.position.set(g.pos.x, g.pos.y, g.pos.z); d.body.velocity.set(0, 0, 0); return d.bat() > 0; }, null, { timeout: 15000, polling: 100 }).catch(() => {});
    c.check('bat pickup grants time', (await page.evaluate(() => window.__skyDebug.bat())) > 25);

    // Bots (solo: this game runs them)
    await page.evaluate(() => { const el = document.getElementById('optBots'); el.value = '2'; el.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => window.__skyDebug.bots().length === 2 && window.__skyDebug.intro().seen.length >= 2, null, { timeout: 30000 }).catch(() => {});
    const bots0 = await page.evaluate(() => { const d = window.__skyDebug; return { n: d.bots().length, ctrl: d.ctrl(), names: d.bots().map(b => b.name), avatars: d.botAvatars.size }; });
    c.check('bots spawn as characters', bots0.n === 2 && bots0.ctrl && bots0.avatars === 2 && bots0.names.join() === 'Matteo,Yuki', JSON.stringify(bots0));
    const intro = await page.evaluate(() => window.__skyDebug.intro());
    c.check('entrance cards play for each character', intro.seen.includes('matteo') && intro.seen.includes('yuki') && (await page.textContent('#introName')).length > 0, JSON.stringify(intro));
    const chase = await page.evaluate(() => { const d = window.__skyDebug, m = d.bots()[0], me = d.body.position;
      m.body.position.set(me.x + 20, me.y + 1, me.z); m.body.velocity.set(0, 0, 0); m.introT = 0; d.tick(10);
      const d0 = Math.hypot(m.body.position.x - me.x, m.body.position.z - me.z); d.tick(120);
      return { d0, d1: Math.hypot(m.body.position.x - me.x, m.body.position.z - me.z) }; });
    c.check('aggressive bot chases you', chase.d1 < chase.d0 - 5, `${chase.d0.toFixed(1)} m -> ${chase.d1.toFixed(1)} m`);
    const hitB = await page.evaluate(() => { const d = window.__skyDebug, m = d.bots()[0]; m.body.velocity.set(0, 0, 0); d.hitBot('bot:' + m.id, [1, 0], true, 'me', 'Tester'); return m.body.velocity.x; });
    c.check('hitting a bot knocks it back', hitB > 15, `vx ${hitB.toFixed(1)}`);
    const dodges = await page.evaluate(() => { const d = window.__skyDebug, k = d.CHARACTERS.find(c => c.key === 'kofi'); return k.dodge; });
    c.check('characters have distinct personalities', dodges > .3);

    // Race items and destructible towers
    await page.waitForFunction(() => { const d = window.__skyDebug, b = d.itemBoxes[0]; d.body.position.set(b.pos.x, b.pos.y, b.pos.z); d.body.velocity.set(0, 0, 0); return !!d.item().heldItem; }, null, { timeout: 15000, polling: 100 }).catch(() => {});
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
      b.gliderT = 30; b.hook = null; b.introT = 0; b.body.position.set(0, 90, 0); b.body.velocity.set(0, -6, 0); b.target = 0; d.tick(30);
      return { gliding: !!b.gliding, vy: +b.body.velocity.y.toFixed(1) }; });
    c.check('bots glide when they have a glider', botGlide.gliding && botGlide.vy > -6, JSON.stringify(botGlide));
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

    // Falling in the sea after being hit credits the friend
    await page.evaluate(() => { const b = window.__skyDebug.body; b.position.set(0, -4, -116); b.velocity.set(0, 0, 0); }); // out over the sea
    await page.waitForFunction(() => { const sp = window.__fake.mine().sp; return sp && sp.n >= 1; }, null, { timeout: 20000 }).catch(() => {});
    const sp = await page.evaluate(() => window.__fake.mine().sp);
    c.check('splash is broadcast with who knocked me in', sp && sp.by === 'fr1end00peer0000', JSON.stringify(sp));

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
    await friendAt({ chat: { n: 2, t: 'nice swing' } }); await page.waitForTimeout(1000);
    c.check('friend chat shows up', (await page.evaluate(() => window.__skyDebug.chat().log)).some(l => l.includes('nice swing')));
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
