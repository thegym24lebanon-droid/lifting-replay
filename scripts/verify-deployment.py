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
        html = fetch('').decode()
        assert './video-replay-v5.webmanifest' in html
        assert '<title>Video Replay</title>' in html
        assert 'content="Video Replay"' in html
        assert html.count('./icons/ci-vr-v4-192.png') == 2, 'favicon and Apple touch icon'
        for name in ['video-replay-v5.webmanifest', 'replay-vr-v4.webmanifest', 'replay-vr.webmanifest', 'manifest.webmanifest']:
            manifest = json.loads(fetch(name))
            assert manifest == json.loads((ROOT / 'public' / name).read_text())
            assert manifest['start_url'] == './?v=video-replay5'
            assert manifest['name'] == manifest['short_name'] == 'Video Replay'
            for icon in manifest['icons']:
                data = fetch(icon['src'])
                assert data == (ROOT / 'public' / icon['src']).read_bytes(), icon['src']
        scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
        assert scripts
        js = fetch(scripts[0].removeprefix('./')).decode()
        assert all(text in js for text in ['Running Camera', 'Record &amp; Review', 'livePreview', 'ci-vr-v4-192.png', 'fsScrub'])
        print('PASS: live Pages commit', COMMIT)
        print('PASS: live HTML, application bundle, three manifests, launch URL, favicon, Apple touch icon, and both CI/VR icon sizes match this commit.')
        for icon in manifest['icons']:
            print(icon['src'], hashlib.sha256((ROOT/'public'/icon['src']).read_bytes()).hexdigest())
        break
    except Exception as exc:
        if attempt == 17:
            raise
        print('Waiting for Pages/CDN:', str(exc), flush=True)
        time.sleep(10)
