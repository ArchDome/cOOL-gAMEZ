// Shared Playwright harness for testing the games headlessly.
// - Serves CDN libraries from local npm copies (the cloud sandbox blocks cdn.jsdelivr.net).
// - Optionally injects a fake claude.ai `room` capability with a scripted friend.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(__dirname, '.libs');
const LIBS = {
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js': ['three@0.160.0', 'package/build/three.module.js'],
  'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js': ['cannon-es@0.20.0', 'package/dist/cannon-es.js'],
};

function ensureLibs() {
  fs.mkdirSync(LIB_DIR, { recursive: true });
  for (const [, [spec, file]] of Object.entries(LIBS)) {
    const dir = path.join(LIB_DIR, spec);
    if (fs.existsSync(path.join(dir, file))) continue;
    fs.mkdirSync(dir, { recursive: true });
    const tgz = execSync(`npm pack ${spec} --silent`, { cwd: dir }).toString().trim().split('\n').pop();
    execSync(`tar xzf ${tgz}`, { cwd: dir });
  }
}

// Runs in the page before any game script: a minimal stand-in for window.claude.use("room").
function fakeRoomInit() {
  const me = { peer: 'me000000peer0000', by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: {}, updatedAt: 0 };
  const friend = { peer: 'fr1end00peer0000', by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: {}, updatedAt: 0 };
  window.__fake = { me, friend, sent: [], setFriend(pr) { friend.presence = Object.freeze({ ...pr }); }, mine: () => me.presence };
  const room = {
    presence(patch) { window.__fake.sent.push(JSON.stringify(patch).length); me.presence = { ...me.presence, ...patch }; return Promise.resolve(); },
    peers() { return friend.presence && Object.keys(friend.presence).length ? [me, friend] : [me]; },
    onPeers(fn) { setTimeout(() => fn({ peers: [me], joined: [me], left: [], updated: [] }), 0); return () => {}; },
    onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
    connected() { return true; },
  };
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(n === 'room' ? room : null), 10)) };
}

// Static file server for the repo: games load their code as ES modules, which browsers refuse from file:// URLs.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.css': 'text/css' };
let server = null, serverPort = 0;
function startServer() {
  if (server) return Promise.resolve(serverPort);
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { serverPort = server.address().port; server.unref(); resolve(serverPort); }));
}

async function openGame(game, { fakeRoom = false, viewport = { width: 1000, height: 620 }, hash = '', gfx = 'low' } = {}) {
  ensureLibs();
  const port = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [url, [spec, file]] of Object.entries(LIBS)) {
    await page.route(url, (r) => r.fulfill({ path: path.join(LIB_DIR, spec, file), contentType: 'text/javascript' }));
  }
  // three.js add-ons (post-processing etc.) live under examples/jsm in the same package
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/**', (r) => {
    const rel = r.request().url().split('/examples/jsm/')[1];
    r.fulfill({ path: path.join(LIB_DIR, 'three@0.160.0', 'package', 'examples', 'jsm', rel), contentType: 'text/javascript' });
  });
  await page.route('https://fonts.**', (r) => r.abort());
  // tests run at low graphics: the software renderer is far too slow for bloom (real devices are fine)
  await page.addInitScript((g) => { try { if (!localStorage.getItem('skyhook.gfx.pinned')) localStorage.setItem('skyhook.gfx', g); } catch (e) {} }, gfx);
  if (fakeRoom) await page.addInitScript(fakeRoomInit);
  await page.goto(`http://127.0.0.1:${port}/${game}/index.html${hash}`);
  return { browser, page, errors };
}

// Tiny assertion helper: collects results and prints a pass/fail table.
function checker() {
  const results = [];
  return {
    check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); },
    report() {
      for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
      const failed = results.filter((r) => !r.ok).length;
      console.log(`\n${results.length - failed}/${results.length} checks passed`);
      return failed;
    },
  };
}

module.exports = { openGame, checker, ROOT };
