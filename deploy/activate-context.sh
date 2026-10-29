#!/usr/bin/env bash
set -euo pipefail
version=${1:?release version required}
context=${2:?prod or test required}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || exit 2
[[ "$context" == prod || "$context" == test ]] || exit 2
root="/var/www/sleepast-core/$context"
stage="$root/incoming/$version"
test -f "$stage/resources/v1/manifest.json"
# Validate the uploaded bytes before touching the active manifest.
python3 - "$stage" "$context" "$version" <<'PYVERIFY'
import hashlib, json, pathlib, sys
stage = pathlib.Path(sys.argv[1]).resolve()
context, version = sys.argv[2:]
m = json.loads((stage / 'resources/v1/manifest.json').read_text())
assert m['contract'] == 'sleepast-data-v1' and m['clientMajor'] == 2 and m['version'] == version
prefix = '/' + context + '/resources/v1/releases/' + version + '/'
for item in [m['data'], *m['assets'].values()]:
    assert item['path'].startswith(prefix) and '..' not in item['path'].split('/') and chr(92) not in item['path']
    file = (stage / item['path'][len(context) + 2:]).resolve()
    assert stage in file.parents
    content = file.read_bytes()
    assert len(content) == item['bytes'] and hashlib.sha256(content).hexdigest() == item['sha256']
PYVERIFY
exec 9>"$root/.deploy.lock"
flock -x 9
old=$(readlink "$root/current" || true)
destination="$root/resources/v1/releases/$version"
mkdir -p "$root/resources/v1/releases" "$root/deployments"
if [ -d "$destination" ]; then
    diff -qr "$stage/resources/v1/releases/$version" "$destination" || {
        echo 'Published context versions cannot be overwritten' >&2
        exit 1
    }
else
    mv "$stage/resources/v1/releases/$version" "$destination"
fi
deployment=$(mktemp -d "$root/deployments/$version.XXXXXXXX")
# mktemp defaults to 0700; Nginx must be able to traverse this public directory.
chmod 755 "$deployment"
mkdir -p "$deployment/resources/v1"
cp "$stage/resources/v1/manifest.json" "$deployment/resources/v1/manifest.json"
ln -s "$deployment" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
if ! curl --fail --silent --show-error --max-time 20 "https://pokepokeshock.cn/$context/resources/v1/manifest.json" > "$stage/live-manifest.json" || ! cmp -s "$stage/live-manifest.json" "$stage/resources/v1/manifest.json"; then
    if [ -n "$old" ]; then
        ln -s "$old" "$root/current.rollback"
        mv -Tf "$root/current.rollback" "$root/current"
    else
        unlink "$root/current"
    fi
    echo 'Health check failed; previous context manifest restored' >&2
    exit 1
fi
echo "Activated $context $version"
