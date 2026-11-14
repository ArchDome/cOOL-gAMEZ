#!/usr/bin/env bash
# Turn raw announcer recordings into punchy, bass-boosted game clips with ffmpeg (open source).
#
#   1. Drop recordings into tools/voice/raw/, named after the line key, e.g. homerun.m4a, dunked.wav
#      (any format ffmpeg reads: wav, mp3, m4a, ogg, webm, flac).
#   2. Run:  bash tools/voice/process.sh            (or PRESET=heavy / PRESET=light)
#   3. Clips land in skyhook-isles/voice/<key>.mp3, where the game picks them up automatically.
#
# Line keys the game uses: see tools/voice/LINES.md
set -euo pipefail
cd "$(dirname "$0")"
OUT="../../skyhook-isles/voice"
mkdir -p "$OUT"
PRESET="${PRESET:-normal}"
case "$PRESET" in
  light)  BASS="bass=g=5:f=110:w=0.7";  ECHO="aecho=0.8:0.5:40:0.15" ;;
  heavy)  BASS="bass=g=12:f=90:w=0.6,asoftclip=type=tanh"; ECHO="aecho=0.8:0.6:60|130:0.3|0.18" ;;
  *)      BASS="bass=g=8:f=100:w=0.6";  ECHO="aecho=0.8:0.55:55|110:0.22|0.12" ;;
esac
# chain: trim silence, cut rumble, boost bass, compress like a stadium PA, add a short arena echo, normalize loudness
FILTER="silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB:stop_duration=0.25,highpass=f=60,${BASS},acompressor=threshold=-20dB:ratio=5:attack=4:release=150:makeup=4,${ECHO},loudnorm=I=-14:TP=-1.5:LRA=7"
shopt -s nullglob
n=0
for f in raw/*.{wav,mp3,m4a,ogg,webm,flac,aac}; do
  key="$(basename "${f%.*}" | tr '[:upper:]' '[:lower:]')"
  ffmpeg -hide_banner -loglevel error -y -i "$f" -af "$FILTER" -ac 1 -ar 44100 -b:a 128k "$OUT/$key.mp3"
  echo "processed $f -> $OUT/$key.mp3 ($(du -h "$OUT/$key.mp3" | cut -f1))"
  n=$((n+1))
done
[ "$n" -gt 0 ] || echo "No recordings found in tools/voice/raw/"
# manifest of available clips, so the game only fetches files that exist
keys=$(cd "$OUT" && ls *.mp3 2>/dev/null | sed 's/\.mp3$//' | sed 's/.*/"&"/' | paste -sd, -)
echo "[${keys}]" > "$OUT/index.json"
echo "wrote $OUT/index.json: [${keys}]"
