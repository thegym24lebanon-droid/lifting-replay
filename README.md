# Lifting Replay VR

A browser camera and replay app for a phone mirrored to a TV. No account, backend, microphone capture, or footage uploads.

## Use

Open https://thegym24lebanon-droid.github.io/lifting-replay/?v=ci-vr4 in Chrome.

- **Running Camera:** choose a 5–30 second delay and Start camera. Capture continues until Stop, except a browser/camera interruption. Live framing fills the viewer while buffering; then a labeled live inset accompanies the large delayed replay. Pause, scrub, or slow down for review; Return to delay resumes following the selected delay. Stop retains the rolling footage.
- **Record & Review:** manually start and stop. The full viewer shows live framing during recording. The selected 5–30 second countdown starts at Stop, then plays from the beginning. Playback, scrub, ±5 seconds, and speed are immediately available after Stop; using any of them cancels auto-replay. Record next clears the previous clip only after the new camera session starts successfully. Changing mode also cancels a pending countdown while retaining the stopped footage.
- **Connect to TV:** use Galaxy Smart View with a compatible ScreenCast/Miracast receiver. Ordinary mirroring shows the same output on the phone and TV. Receiver latency is additional and outside this app’s control. The fullscreen viewer includes a Stop button. Exit fullscreen for review controls.
- **Home screen:** remove the old Lifting Replay shortcut, open the revised URL in Chrome, then ⋮ → Add to home screen → Install / Create shortcut. If it is an installed app, uninstall only Lifting Replay VR before reinstalling. Do not remove the separate CI program.

## Footage and limits

The app stores compressed JPEG frames at a target 15 fps, up to 960 pixels wide. It does not store raw image frames or interpret MediaRecorder chunks as standalone clips. Slow motion is 0.5× or 0.25×; it does not create extra frames. Footage is silent, session-only, and disappears on reload/close; no video-file export is provided.

Running Camera retains up to 90 seconds within 96 MiB of compressed footage. Older frames expire during continued capture, including paused frames. At the byte cap, intermediate frames are thinned and the UI reports a reduced replay frame rate. Capture keeps running; it never stops because the rolling buffer fills. The retained timeline endpoints are preserved for delayed playback. Extreme pressure can make replay choppy; a single frame larger than the entire cap is skipped.

Record & Review retains every accepted frame from the beginning, capped at 128 MiB. It has no time-based auto-stop. Reaching the byte limit stops capture, preserves the accepted footage, and shows a clear message with review available immediately; it does not start auto-replay. The small in-flight sample at Stop may be omitted (normally under one sampling interval). Decoded display frames and browser overhead require memory in addition to these compressed-byte caps.

Keep the app foregrounded. A screen wake lock is requested when supported. Backgrounding, camera loss, or leaving the page stops capture and cancels automatic replay; retained footage remains available if the page survives. Camera permissions pending when leaving are safely cancelled when the browser resolves them. Browser scheduling, camera cadence, and mirroring can affect timing; this is not an exact end-to-end TV latency guarantee.

## Branding and caching

The v3 icons are resized crops of the existing public CI/VR artwork; the metallic mark and cyan badge are preserved. Versioned manifest, favicon, Apple touch icon, header icon, and launch URL avoid stale v2 asset URLs. A separate Android `maskable` icon avoids the extra inset applied to standard icons. Its artwork is tuned for rounded-square launchers; simulated rounded-square and full-circle masks preserve the badge. Other aggressive masks may crop outside the standard safe zone. Actual shortcut rendering varies by launcher. The manifest identity stays `./ci-vr`; the separate CI program is untouched. There is no service worker or offline cache; internet is required at launch.

The private reference screenshot is not a repository asset and must not be committed or published.

## Develop and validate

Requires Node 20.19+ or 22.12+; deployment uses Node 24.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
npm test
node scripts/verify-browser.mjs
node scripts/verify-pressure.mjs
npm run build
```

`npm test` covers historical selection, both delay bounds, rolling memory/time limits, complete-clip memory limits, and reset. The browser script uses Chromium with a fake camera and verifies real visible pixels during buffering/recording, delayed canvas rendering, timing, slowmo, all manual countdown cancellations, retained footage, repeated sessions, mode changes, fullscreen Stop, permission denial, pending permission cancellation, camera loss, backgrounding, storage-limit handling, responsive layouts, and manifest/icon availability. Set `CHROMIUM_PATH` or `APP_URL` as needed. Screenshots go to `/tmp/lifting-*.png`, outside the repository.

Physical Galaxy S26 Ultra camera behavior, thermal/memory behavior during long sessions, Android shortcut rendering, and ScreenCast/TV latency still require on-device validation.

## Deployment

The existing `.github/workflows/pages.yml` runs unit tests and a production build and deploys GitHub Pages on pushes to `main`. No sharing/access or paid services need changing. Build output uses Vite content-hashed JS/CSS and a `version.json` containing the exact Git commit for deployment verification.
