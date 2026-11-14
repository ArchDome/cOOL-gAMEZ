// Regenerate design-log screenshots of Skyhook Isles. Run: node tools/screenshots.js
const path = require('path');
const { openGame, ROOT } = require('./harness');
const OUT = path.join(ROOT, 'docs', 'img');

(async () => {
  const { browser, page, errors } = await openGame('skyhook-isles', { viewport: { width: 1280, height: 760 }, gfx: 'high' });
  await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
  await page.fill('#nick', 'JakeyBoy');
  await page.screenshot({ path: path.join(OUT, 'skyhook-start.png'), timeout: 120000 });
  await page.selectOption('#optBots', '0');
  await page.click('#go'); await page.waitForTimeout(800);

  // the back side: outer islets and the ring of catch-rocks
  await page.evaluate(() => { const d = window.__skyDebug; d.body.position.set(40, 60, -10); d.body.velocity.set(0, 0, 0); d.view(-Math.PI / 4, .42); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'skyhook-islets.png'), timeout: 120000 });

  // the cast, lined up
  await page.evaluate(() => { const el = document.getElementById('optBots'); el.value = '7'; el.dispatchEvent(new Event('change')); });
  await page.evaluate(() => { const d = window.__skyDebug, sp = d.body; sp.position.set(-55, 8, 45); sp.velocity.set(0, 0, 0); d.view(0, .12); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const d = window.__skyDebug, me = d.body.position; d.bots().forEach((b, i) => { b.body.position.set(me.x - 7 + i * 2.3, me.y + .5, me.z - 8); b.body.velocity.set(0, 0, 0); b.introT = 99; }); d.tick(4); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'skyhook-cast.png'), timeout: 120000 });

  // chat with a bot reply (fake reply so the shot is repeatable)
  await page.evaluate(() => { const d = window.__skyDebug; d.setSample(async () => ({ text: 'Duuude, chill. I will catch you on the next swell.' })); d.sendChatText('Dylan you are going in the water'); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'skyhook-chat.png'), timeout: 120000 });

  // every other map: a street-level shot and a high overview
  const VIEWS = { neon: [[-60, 70, 60, 2.36, .42]], volcano: [[-30, 70, -25, 3.9, .5]], glacier: [[40, 75, 50, .75, .48]], junkyard: [[-10, 75, 75, 0, .75]] };
  for (const [key, views] of Object.entries(VIEWS)) {
    await page.goto(page.url().split('#')[0] + '#map-' + key); await page.reload();
    await page.waitForFunction(() => window.__skyDebug, null, { timeout: 30000 });
    await page.selectOption('#optBots', '0'); await page.click('#go'); await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${key}-ground.png`), timeout: 90000 });
    for (const [x, y, z, yaw, pitch] of views) {
      await page.evaluate(([x, y, z, yaw, pitch]) => { const d = window.__skyDebug; d.body.position.set(x, y, z); d.body.velocity.set(0, 0, 0); d.view(yaw, pitch); }, [x, y, z, yaw, pitch]);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `${key}-overview.png`), timeout: 90000 });
    }
  }
  console.log(errors.length ? errors : 'screenshots written to docs/img');
  await browser.close();
})();
