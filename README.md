# Video Replay

A browser camera and replay app for a phone mirrored to a TV. No account, backend, microphone capture, or footage uploads.

## Use

Open https://thegym24lebanon-droid.github.io/lifting-replay/?v=frames-tv10 in Chrome.

- **Running Camera:** choose a 5–30 second delay and Start camera. Capture continues until Stop, except a browser/camera interruption. Live framing fills the viewer while buffering; then a labeled live inset accompanies the large delayed replay. Pause, scrub, or slow down for review; Return to delay resumes following the selected delay. Stop retains the rolling footage.
- **Record & Review:** manually start and stop. The full viewer shows live framing during recording. The selected 5–30 second countdown starts at Stop, then plays from the beginning. Playback, scrub, ±5 seconds, and speed are immediately available after Stop; using any of them cancels auto-replay. Record next clears the previous clip only after the new camera session starts successfully. Changing mode also cancels a pending countdown while retaining the stopped footage.
- **Frame review:** **Fine scrub** is enabled by default. Drag either timeline: each 3 CSS pixels selects the next/previous actual frame, relative to where you started the drag. Tapping the timeline in this mode keeps the current frame. Use **‹ Frame / Frame ›** for individual steps, or Left/Right on a keyboard; Home/End select the first/last frame. Tap **Fine scrub** to switch to **Overview** for jumps across the whole clip, still snapped to frames. Scrubbing pauses review and cancels any countdown; Running Camera keeps capturing. The setting is remembered between visits.
- **Connect to TV:** use Galaxy Smart View with a compatible ScreenCast/Miracast receiver, then tap **TV view**. The app requests fullscreen and landscape when the browser allows them; otherwise rotate the phone manually. The entire video fits without stretching or cropping. **Hide controls** removes the overlays, and tapping the picture or **Show controls** restores them. Controls also hide after four seconds of playing, and return when playback pauses or tracking needs attention. Fullscreen entry/exit preserves review state. Ordinary mirroring shows the same output on the phone and TV. Receiver latency is additional and outside this app’s control.
- **Full-screen camera:** tap **Turn camera on** without exiting fullscreen. In Record & Review mode the button says **Start recording**. Stop remains inside fullscreen; after Stop the start button returns. Permission errors are displayed inside the viewer. A successful camera start replaces the previous camera clip or gallery selection; a failed start preserves footage for review.
- **Gallery video:** tap **Analyze gallery video**, or **Gallery video** inside fullscreen, and choose a local video. Selecting a file stops camera capture. The video opens paused, with Play/Pause, scrubbing, ±5-second jumps outside fullscreen, and 0.5×/0.25× playback. Pause near the beginning of a lift, tap **Track bar**, select the visible bar end, then play or scrub forward to compute its movement line. Return to the camera with **Turn camera on**. Cancelling the picker or selecting an unsupported file keeps the previous footage. A phone's file picker may temporarily leave fullscreen; tap Full screen again if needed.
- **Home screen:** remove the old Lifting Replay shortcut, open the revised URL in Chrome, then ⋮ → Add to home screen → Install / Create shortcut. If it is an installed app, uninstall only Video Replay before reinstalling. Do not remove the separate CI program.

## Footage and limits

The app stores compressed JPEG frames at a target 15 fps, up to 960 pixels wide. It does not store raw image frames or interpret MediaRecorder chunks as standalone clips. Slow motion is 0.5× or 0.25×; it does not create extra frames. Footage is silent, session-only, and disappears on reload/close; no video-file export is provided.

Running Camera retains up to 90 seconds within 96 MiB of compressed footage. Older frames expire during continued capture, including paused frames. At the byte cap, intermediate frames are thinned and the UI reports a reduced replay frame rate. Capture keeps running; it never stops because the rolling buffer fills. The retained timeline endpoints are preserved for delayed playback. Extreme pressure can make replay choppy; a single frame larger than the entire cap is skipped.

Record & Review retains every accepted frame from the beginning, capped at 128 MiB. It has no time-based auto-stop. Reaching the byte limit stops capture, preserves the accepted footage, and shows a clear message with review available immediately; it does not start auto-replay. The small in-flight sample at Stop may be omitted (normally under one sampling interval). Decoded display frames and browser overhead require memory in addition to these compressed-byte caps.

Keep the app foregrounded. A screen wake lock is requested when supported. Backgrounding, camera loss, or leaving the page stops capture and cancels automatic replay; retained footage remains available if the page survives. Camera permissions pending when leaving are safely cancelled when the browser resolves them. Browser scheduling, camera cadence, and mirroring can affect timing; this is not an exact end-to-end TV latency guarantee.

Gallery files stay on the device and are decoded on demand through a local blob URL. They are not uploaded, copied into local storage, or expanded into the camera frame buffer. Review uses the file's full duration, including videos longer than 90 seconds. Audio stays muted. Format, resolution, HDR/HEVC decoding, and seeking performance depend on the phone and browser; H.264 MP4 is recommended when a file cannot be opened. The original video is unchanged. Only the current selected file and temporary path remain available while the page is open; choose the file again after reloading. Tracking samples sequential video frames at approximately 15 fps with a separate decoder so it does not move the playback cursor. It remains experimental movement-line analysis, without calibrated measurements or automated coaching.

Gallery frame stepping uses actual presentation timestamps extracted locally from MP4, MOV, or WebM metadata with bundled Mediabunny, including variable frame rates and reordered encoded frames. The index is bounded at two million frames. Unsupported/unindexable containers still allow native time scrubbing and playback if the browser can decode them; the UI says **Frame steps unavailable** and disables exact-frame buttons. Slow native seeking can skip intermediate requests during a fast drag, then settles on the requested frame. Camera review steps through the app's retained JPEG captures (target 15 fps, fewer if the rolling buffer has been thinned), rather than the phone camera's full native frame rate. No missing frames are generated.

[Mediabunny 1.61.4](https://www.npmjs.com/package/mediabunny/v/1.61.4) is bundled unmodified under [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/). Its original source is included in the [versioned package archive](https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.4.tgz); copyright and license notices are retained in the generated bundle.

TV view maximizes the phone viewport, but a web app cannot set the Miracast receiver's resolution or change Smart View's output aspect ratio independently. If available, use Smart View's **Full screen on connected device** aspect ratio setting, and the TV's normal/original picture setting. A portrait clip will keep side borders on a landscape TV because the whole picture is preserved. Phone/TV shape differences may also leave borders; filling every TV pixel would require cropping or stretching. Actual Galaxy/j5create behavior still needs a physical-device check.

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

## Optional bar path (experimental)

Pause at a clear frame and pinch the picture to zoom up to 6×; use one finger to pan while zoomed. **+**, **−**, and **Reset** also control zoom, including in fullscreen. Zoom changes only the view: the movement line and dot stay anchored to original video coordinates. Zoom carries through playback, orientation and fullscreen changes, and resets for a new video/camera session.

Tap **Track bar**, then touch the visible bar end or plate center. You can slide your finger to adjust the preview crosshair, then release to set the point precisely. While placing it, two fingers can zoom or pan without accidentally selecting a point. The selected fractional position is preserved rather than snapped to the reduced-resolution tracking grid. Play or scrub forward to compute the path. The entire computed cyan trajectory stays visible when scrubbing in either direction; the yellow marker shows the last confirmed position. **Reselect bar** corrects from the chosen frame without connecting across the correction; **Clear path** removes it. New recordings clear the tracker. Running Camera continues capturing during review and tracking.

In fullscreen and TV view, the timeline and camera controls temporarily hide while you place a bar point so they do not cover the target. **Clear path** cancels placement, or release the selected point to bring the controls back.

During playback the tracker computes a short distance ahead. If decoding/tracking falls behind, review briefly holds at the last confirmed position and resumes when it catches up; the dot stays visible. Pausing manually cancels automatic resume. Genuine tracking loss pauses review, retains the last confirmed dot, and requests reselection. If you deliberately scrub beyond a lost point, the retained dot is the old confirmed position, not a new match. No positions are invented across occlusion or missing footage.

Use a fixed, side-on camera with the bar end visible and reasonably detailed. Tracking is approximate visual patch matching, not calibrated distance, velocity, or biomechanics. Blur, occlusion, uniform surfaces, similar nearby objects, lighting/rotation changes, fast motion, or gaps in retained frames can cause loss. Low-confidence/ambiguous matches pause review at the last reliable point and request reselection. Real gym footage and Galaxy/ScreenCast performance remain unverified.

The implementation uses local zero-mean normalized cross-correlation ([method reference](https://docs.opencv.org/4.x/de/da9/tutorial_template_matching.html)), a grayscale patch that expands from 15×15 to 31×31 pixels when a smooth end needs its outline included, a bounded search region guided by recent motion, and transient images at up to 640px width. Strong, unambiguous matches update an adaptive template while the original selection remains a fallback. Weak or ambiguous matches do not update it. No library download, backend, accounts, footage upload, or new permission is needed. Forward seeks process intervening retained frames in order, asynchronously; video review remains responsive while the path catches up. Rewinding keeps the computed trajectory. Points expire with rolling footage to bound memory. All trajectory data is temporary.

Additional validation:

```sh
node scripts/verify-fullscreen.mjs
node scripts/verify-tracker.mjs
node scripts/verify-gallery.mjs
node scripts/verify-zoom.mjs
node scripts/verify-frames-tv.mjs
```

Tracker unit tests cover known trajectories, distractors, occlusion, ambiguity, skipped frames, cancellation, reselection, and letterbox coordinates. Browser tests capture a synthetic moving textured target, then test fullscreen touch selection, forward/backward seeks with persistent path, slow motion, orientation/entry/exit, loss/reselection, clear, and continued Running Camera capture. These are synthetic tests, not physical-device or gym accuracy claims.

The gallery browser check requires system `ffmpeg` (test-fixture generation only) and Chromium. It generates real temporary H.264 MP4 files, including a portrait video and a 95-second video, and verifies fullscreen camera start/restart, gallery file selection, actual decoded pixels, measured quarter-speed playback, touch scrubbing, movement-line tracking, file errors/cancellation/replacement, permission errors, and switching back to the camera. Fixtures and screenshots stay under `/tmp`; no gallery fixture or personal video is committed. No non-GET upload requests or browser errors are expected.

Zoom tests cover real two-finger gestures, no accidental selection during a pinch, dragging the dot into exact source coordinates, panning/reset/button zoom, orientation changes, and a deliberately slow decoder that reproduces tracking lag. They verify the dot stays visible and manual pause cancels a pending resume. Tracker tests include gradual appearance changes, diagonal motion, precise fractional placement, and retention of the dot after a real synthetic occlusion. These checks do not establish accuracy on arbitrary gym footage; blur, occlusion, and repeated objects can still require reselection.

Frame/TV checks generate MP4 with reordered frames, variable-rate MP4, and WebM fixtures, compare their metadata to ffprobe, and verify decoded pixel identities during forward/backward button, keyboard, and fine touch scrubbing. They also check boundaries, Overview, actual camera captures, whole-picture TV fit, and hiding/restoring controls. These require Chromium and ffmpeg/ffprobe; fixtures remain under `/tmp`.
