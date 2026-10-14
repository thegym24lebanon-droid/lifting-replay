"""Verify exact deployed commit and public install assets after Pages publishes."""
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.request import urlopen

BASE = 'https://thegym24lebanon-droid.github.io/lifting-replay/'
COMMIT = os.environ['GITHUB_SHA']
ROOT = Path(__file__).resolve().parents[1]

def fetch(path):
    with urlopen(BASE + path + ('&' if '?' in path else '?') + 'verify=' + COMMIT, timeout=20) as response:
        assert response.status == 200
        return response.read()

for attempt in range(18):
    try:
        version = json.loads(fetch('version.json'))
        assert version['commit'] == COMMIT, version
        assert version['release'] == 'civr14', version
        html = fetch('').decode()
        assert './video-replay-v8.webmanifest' in html
        assert '<title>Video Replay</title>' in html
        assert 'content="Video Replay"' in html
        assert html.count('./icons/civr-full-v7-192.png') == 2, 'favicon and Apple touch icon'
        assert fetch('branding/civr-logo-v2.png') == (ROOT/'public/branding/civr-logo-v2.png').read_bytes(), 'current CIVR artwork'
        for name in ['video-replay-v8.webmanifest', 'video-replay-v7.webmanifest', 'video-replay-v6.webmanifest', 'video-replay-v5.webmanifest', 'replay-vr-v4.webmanifest', 'replay-vr-v3.webmanifest', 'replay-vr.webmanifest', 'manifest.webmanifest']:
            manifest = json.loads(fetch(name))
            assert manifest == json.loads((ROOT / 'public' / name).read_text())
            assert manifest['start_url'] == './?v=civr14'
            assert manifest['id'] == './ci-vr'
            assert manifest['name'] == manifest['short_name'] == 'Video Replay'
            for icon in manifest['icons']:
                data = fetch(icon['src'])
                assert data == (ROOT / 'public' / icon['src']).read_bytes(), icon['src']
        scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
        assert scripts
        js = fetch(scripts[0].removeprefix('./')).decode()
        assert all(text in js for text in ['Running Camera', 'Record &amp; Review', 'livePreview', 'civr-full-v7-192.png', 'civr-logo-v2.png', 'Add to home screen', 'emptyMessage', 'fsScrub', 'trackBar', 'Clear path', 'screenStart', 'Turn camera on', 'Analyze gallery video', 'galleryFile', 'replayViewport', 'zoomIn', 'zoomReset', 'last confirmed dot', 'prevFrame', 'nextFrame', 'Fine scrub', 'tvView', 'Whole video preserved', 'trackingFrames', 'pendingSeek', 'Pull down while dragging'])
        # Also verify the lazy local frame-indexing bundle and CSS, not just the
        # entry bundle referenced by the HTML.
        chunks = set(re.findall(r'import\("\./([^"/]+\.js)"\)', js))
        assert chunks, 'local frame-indexing bundle referenced'
        for chunk in chunks:
            data = fetch('assets/' + chunk)
            assert b'metadataOnly' in data and b'getPrimaryVideoTrack' in data, chunk
        for stylesheet in re.findall(r'<link[^>]*href="(\./assets/[^"/]+\.css)"', html):
            assert fetch(stylesheet.removeprefix('./')), stylesheet
        print('PASS: live Pages commit', COMMIT)
        print('PASS: live HTML, all application bundles/CSS, manifests, launch URL, favicon, Apple touch icon, and full CIVR icons with the tagline match this commit.')
        for icon in manifest['icons']:
            print(icon['src'], hashlib.sha256((ROOT/'public'/icon['src']).read_bytes()).hexdigest())
        break
    except Exception as exc:
        if attempt == 17:
            raise
        print('Waiting for Pages/CDN:', str(exc), flush=True)
        time.sleep(10)
