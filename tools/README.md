# Tools

Scripts that let you, or Claude, check and build the games from a terminal. Everything exits with a pass/fail code, so it can run in a loop.

## Headless game tests

```bash
npm test
```

`tools/test-skyhook.js` boots Skyhook Isles in headless Chromium and checks:
- walking smoothness, measured with exact physics steps
- pickups
- multiplayer against a scripted fake friend: hits both ways, knockback, sea dunks, races
- the music engine
- presence size

It prints PASS/FAIL per check and exits non-zero on any failure.

- `harness.js` is shared: it serves Three.js and cannon-es from local npm copies (cached in `tools/.libs/`), and can inject a fake claude.ai `room` capability. Use it for new game tests.
- Real two-person play still needs two real devices. The fake friend only proves the logic.

## Announcer voice clips

```bash
# put recordings in tools/voice/raw/ named by line key (see tools/voice/LINES.md)
npm run voice          # normal bass boost
npm run voice:heavy    # more boom plus soft clipping
```

`process.sh` uses ffmpeg to:
1. trim silence
2. cut rumble
3. boost bass
4. compress like a stadium PA
5. add a short arena echo
6. normalize loudness

It writes `skyhook-isles/voice/<key>.mp3` plus `index.json`. The game loads whatever clips exist and uses the synthetic voice for the rest. Publish the clips alongside the page.

## Setting this up on your own PC (all open source)

- **Node.js** (LTS) from nodejs.org, then `npm install` and `npx playwright install chromium` in the repo.
- **ffmpeg**: Windows `winget install Gyan.FFmpeg`; macOS `brew install ffmpeg`.
- **Audacity**, if you want to record or trim clips by hand before processing.

## Loop ideas

- Ask Claude: "run `npm test` and fix failures until it passes."
- `/loop 30m npm test` re-runs the tests every 30 minutes while you work.
- Drop new recordings in `tools/voice/raw/` and ask Claude to run `npm run voice`, then republish.
