#!/usr/bin/env python3
"""Verify a resource deployment using Ubuntu's bundled Python runtime."""
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve()
context = sys.argv[2] if len(sys.argv) > 2 else ''
assert context in ('', 'prod', 'test')
manifest = json.loads((root / context / 'resources/v1/manifest.json').read_text(encoding='utf-8'))
assert manifest['schemaVersion'] == 1
assert manifest['contract'] == 'sleepast-data-v1' and manifest['clientMajor'] == 2
assert re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?', manifest['version'])
prefix = ('/' + context if context else '') + '/resources/v1/releases/' + manifest['version'] + '/'
for item in [manifest['data'], *manifest['assets'].values()]:
    assert item['path'].startswith(prefix)
    assert '\\' not in item['path'] and '..' not in item['path'].split('/')
    file = (root / item['path'].lstrip('/')).resolve()
    assert root in file.parents
    value = file.read_bytes()
    assert len(value) == item['bytes'], item['path']
    assert hashlib.sha256(value).hexdigest() == item['sha256'], item['path']
data = json.loads((root / manifest['data']['path'].lstrip('/')).read_text(encoding='utf-8'))
assert len(manifest['files']) == 43 and sorted(manifest['files']) == sorted(data)
print('Verified', manifest['version'], ':', len(data), 'JSON files,', len(manifest['assets']), 'images')
