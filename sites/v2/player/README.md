# KPlayer — Keenable film player (sites/v2/player)

Demo: http://127.0.0.1:7950/v2/player/demo.html · API and keys: header of player.js.
Media: ../media/ — fintech.mp4 (v6 = 28.2 s intro + v5 film, 371.2 s; chapters shifted, INTRO at 0:00, unshifted list kept as base_chapters;
built by player-work/concat_intro.py + install_intro.py; no-intro master = remotion/out/fintech-v5-nointro.mp4), galactica.mp4 (v5b): full-quality Remotion renders with mastered audio (-16 LUFS, TP -1.5);
ad.mp4 (Rex ad v2, sound remaster, -14 LUFS); posters fintech.jpg / galactica.jpg / ad.jpg; hero-loop.mp4 (9.4 s muted);
chapters.json (chapter starts = the first paragraph's start in timing*.json; those already include the 3 s intro; "ad" has none).

## Cloud copies (Cloudflare Pages, 25 MB per file)
../media/hls/<film>/ (ad, fintech, galactica): master.m3u8 → 1080p/ + 720p/ (H.264, 6 s segments), poster.jpg, and a single-file
fallback under 24 MB (<film>-720.mp4; ad-1080.mp4). hls/chapters.json = media/chapters.json. Built by
`python3 ~/Genie/scratch/keenable-videos/player-work/hls.py <film> <src.mp4> [--fallback 720]`. The big media/*.mp4 stay local-only.
Progressive fallback (KPlayer 1.3; the cloud choice at 23:40Z): `window.MEDIA_BASE = "media/web/"; window.MEDIA_MODE = "mp4";` → media/web/<name>.mp4
(fintech/galactica 720p, ad 1080p, each under 24 MB, plus posters, hero-loop.mp4, chapters.json). The host must answer Range with 206.
KPlayer 1.5: Space/K play-pause, J/L ±10 s, F, M, C, Shift+> / Shift+< speed; ← → never taken (slides; in full screen they exit it first); opts.nav = {prev, next} renders ‹ › edge buttons.
Speed (1.5): the bar's control cycles 1× → 1.5× → 2×; one choice for every film, kept in localStorage (`kp.speed`, try/catch), re-applied on loadedmetadata / src swaps, pitch preserved. KPlayer.setSpeed(n), KPlayer.speed.
Hold (1.5): press and hold the picture 300 ms = 2× while held (chip at the top), release = back to the chosen speed; a quick tap still plays/pauses; the hold's touches never reach the deck's swipe.
iOS (1.5): playsinline + webkit-playsinline, full screen falls back to video.webkitEnterFullscreen, 44 px tap targets on touch screens, controls stay up after a tap (touch pointerleave ignored). Tests: player-work/t_kp15.mjs chrome | webkit (WebKit = iPhone 15 Pro profile).
KPlayer 1.2+ takes an .m3u8 src: native HLS where the browser has it, else hls.js 1.6.13 from cdnjs (SRI-pinned; hls.light.min.js next to
player.js if the CDN fails). Cloud build = one line in sites/v2/config.js: `window.MEDIA_BASE = "media/hls/";` (resolved against the site root).
KPlayer.media then points at media/hls/, a film's <name>.mp4 plays media/hls/<name>/master.m3u8, and posters, hero-loop.mp4 and chapters.json
resolve inside media/hls/ (copies live there). Tested on a static server serving only media/hls/: player-work/cloudtest-server.ts (:7951) + t_cloud.mjs.
HLS audio is re-encoded with aresample async=1: master.py's loudnorm left a 60-90 ms timestamp gap ~2.9 s before the end (fixed in master.py since).

## Local server (:7950)
- `sites/server.ts` serves every site and answers HTTP Range for .mp4/.webm/.mov/.m4a/.mp3 (206), so the player can seek.
- Since 1 Oct 22:05Z it runs under nohup (it used to run in a tmux pane). PID at handoff: **54415** (`lsof -tiTCP:7950 -sTCP:LISTEN` shows the live one).
- Restart from the repo root:
  `kill $(lsof -tiTCP:7950 -sTCP:LISTEN); cd ~/Projects/keenable-application && nohup bun sites/server.ts >> sites/server.log 2>&1 &`

## Swapping in new film renders
`python3 ~/Genie/scratch/keenable-videos/player-work/swap.py <v4|v5|v5b> [fintech|galactica]` copies remotion/out/<film>-<ver>.mp4 into ../media under the same name,
rebuilds that film's chapters from src/<film>/timing<N>.json (v5/v5b fall back to timing4) and re-cuts its poster.
Mastering: `player-work/master.py <raw.mp4> <out.mp4>` (HPF 30 Hz, 2:1 bus comp, two-pass loudnorm -16 LUFS / TP -1.5, video copied).
`player-work/watch_film.sh <film> <ver>` waits for remotion/out/<film>-<ver>-raw.mp4, masters it, then swaps it in (log watch_v5.log).
