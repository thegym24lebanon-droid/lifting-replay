# Lifting Replay

A mobile-first, private delayed camera replay for a lifter and a mirrored TV. Built with vanilla JavaScript and Vite; no account, backend, or video uploads.

## Run

Requires Node 20.19+ or 22.12+ (tested on Node 24).

```sh
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
npm test
npm run build
```

Phone camera access requires **trusted HTTPS**. A development server at an HTTP LAN IP will load the UI but cannot access the phone camera. For phone use, serve the built `dist/` directory on a trusted HTTPS static host, or use a trusted HTTPS development reverse proxy. This repository does not provision hosting or certificates. No secrets are needed.

## Galaxy + j5create + TV

1. Confirm your j5create receiver model supports Miracast / Samsung Smart View, and select its Android/Miracast mode using its manual.
2. Open the HTTPS app in current Chrome on the Galaxy. Choose the camera, mount the phone, select a 5–30 second delay, and tap Start camera.
3. In Galaxy Quick Settings, use **Smart View** to connect to the receiver; accept pairing on the TV. Return to the app and use Full screen. This mirrors the phone display, including controls and any notifications; enable Do Not Disturb for a clean TV screen.
4. After the delay fills, the display follows historical frames. Pause, scrub, jump ±5 seconds, replay the most recent 15 seconds, or select 0.5× / 0.25×. Return to delay resumes delayed live viewing. Stop camera retains the current buffer for review; Start new session clears it.

The user identified a Galaxy Ultra 26 and a j5create 4K receiver, but the exact receiver model and Smart View compatibility are unconfirmed. Vizio SmartCast, Google Cast, and Miracast are different technologies. This app **does not implement direct Google Cast** or claim all SmartCast TVs/j5create receivers support Smart View. If the receiver is Cast-only, use a compatible Miracast receiver or a supported USB-C-to-HDMI connection instead. Physical device testing is still required.

## Technical limits

- Silent replay; camera only, no microphone permission.
- Captures compressed frames at a target 15 fps, up to 640 pixels wide. This is not 4K recording, and quarter-speed playback is visibly less smooth than dedicated high-frame-rate recording.
- Rolling retention is up to 90 seconds, capped at 64 MiB of compressed frames; complex scenes can shorten retention. Paused footage eventually expires while recording continues. The cursor clamps to available footage.
- Delay is measured on the phone; TV mirroring and browser scheduling add latency. It is not an exact end-to-end TV latency guarantee.
- Keep the page foregrounded and the screen awake. A screen wake lock is requested when available, but OS/browser behavior can interrupt capture. No background recording guarantee.
- Only delay and camera choice persist locally. Footage is temporary, is not saved as a video file, and disappears on page close/reload. No server receives frames.
- Full screen targets the replay; use phone controls before entering it, or leave full screen to change playback.

## Validation

`npm test` exercises historical frame selection, delay boundaries, memory/time retention, and clear/reset. `npm run build` produces the static app.

With system Chromium installed, start the development server and run:

```sh
node scripts/verify-browser.mjs
```

Set `CHROMIUM_PATH` if Chromium is elsewhere. The browser check uses a synthetic camera and mobile viewport to exercise camera startup, delayed rendered frames, pause, seeking, slow playback, replay, stop/restart, settings persistence, permission-denial handling, and horizontal layout. It cannot validate a physical Galaxy or the receiver/TV.

## Sources checked

- [W3C Media Capture specification](https://github.com/w3c/mediacapture-main/blob/gh-pages/getusermedia.html): secure-context camera access.
- [W3C MediaStream Recording specification](https://github.com/w3c/mediacapture-record/blob/main/MediaRecorder.bs): individual recording chunks need not be playable; use a frame buffer rather than assuming independent playable chunks.
- [Google Cast Chrome sender sample](https://github.com/googlecast/CastVideos-chrome): Cast loads media by receiver-accessible URL, not a phone-local blob URL.
- [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/tree/main/api): browser camera and recording support.

Official documentation websites were blocked by the environment network policy; their official GitHub specifications/sample and compatibility data were accessible. Receiver-specific compatibility remains pending the exact model and its manual.

## GitHub Pages deployment

The included `.github/workflows/pages.yml` builds and deploys the static app after pushes to `main`. In the repository’s Settings → Pages, select **GitHub Actions** as the source. GitHub Pages must be available for the repository/account (private repository availability depends on the plan). Use the HTTPS URL shown by the successful deployment. The intended project URL is `https://thegym24lebanon-droid.github.io/lifting-replay/`; it is not live until Pages is enabled and deployment succeeds. Relative asset paths support the repository subdirectory.

## Home screen

Open the HTTPS app in Chrome on a Galaxy. Tap Add to home screen in the app, or use Chrome’s three-dot menu → Add to home screen → Install / Create shortcut. The manifest supports a standalone home-screen launch and contains 192px/512px maskable icons. Installation is a user action; a website cannot silently add a home-screen icon. Internet is required at launch; offline mode is not implemented. The current icon is a replay/barbell symbol, pending the user-provided CI logo.
