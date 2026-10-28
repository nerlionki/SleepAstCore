#!/usr/bin/env bash
set -euo pipefail
version=${1:?release version required}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || exit 2
root=/var/www/sleepast-core
stage="$root/incoming/$version"
test -f "$stage/resources/v1/manifest.json"
exec 9>"$root/.deploy.lock"
flock -x 9
old=$(readlink "$root/current" || true)
if [ -f "$root/current/resources/v1/manifest.json" ]; then
    cp "$root/current/resources/v1/manifest.json" "$stage/previous-manifest.json"
fi
# Version directories are immutable: a changed release must use a new version.
# The user authorized replacing the known initial manual 1.0.0 data once.
bootstrap_backup=''
destination="$root/resources/v1/releases/$version"
mkdir -p "$root/resources/v1/releases" "$root/deployments"
if [ -d "$destination" ]; then
    if ! diff -qr "$stage/resources/v1/releases/$version" "$destination"; then
        bootstrap_hash=a116485a46769984746e869ae4190f9179ee56551e80da2849fa791d803de2df
        [[ "$version" == 1.0.0 && $(sha256sum "$destination/data.json" | cut -d' ' -f1) == "$bootstrap_hash" ]] || {
            echo 'Published resource versions cannot be overwritten' >&2
            exit 1
        }
        # Only the JSON changed in the audited bootstrap. Never bypass image checks.
        diff -qr --exclude=data.json "$stage/resources/v1/releases/$version" "$destination"
        bootstrap_backup="$root/bootstrap-backups/1.0.0-$bootstrap_hash"
        mkdir -p "$bootstrap_backup"
        cp "$destination/data.json" "$bootstrap_backup/data.json"
        cp "$stage/previous-manifest.json" "$bootstrap_backup/manifest.json"
        cp "$stage/resources/v1/releases/$version/data.json" "$destination/data.json.next"
        mv -Tf "$destination/data.json.next" "$destination/data.json"
    fi
else
    mv "$stage/resources/v1/releases/$version" "$destination"
fi
mkdir -p "$root/deployments/$version/resources/v1"
cp "$stage/resources/v1/manifest.json" "$root/deployments/$version/resources/v1/manifest.json.next"
mv -Tf "$root/deployments/$version/resources/v1/manifest.json.next" "$root/deployments/$version/resources/v1/manifest.json"
ln -s "$root/deployments/$version" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
if ! curl --fail --silent --show-error --max-time 20 https://pokepokeshock.cn/resources/v1/manifest.json > "$stage/live-manifest.json" || ! cmp -s "$stage/live-manifest.json" "$stage/resources/v1/manifest.json"; then
    if [ -n "$bootstrap_backup" ]; then
        cp "$bootstrap_backup/data.json" "$destination/data.json.next"
        mv -Tf "$destination/data.json.next" "$destination/data.json"
    fi
    if [ -n "$old" ]; then
        if [[ "$old" == "$root/deployments/$version" ]]; then
            cp "$stage/previous-manifest.json" "$root/deployments/$version/resources/v1/manifest.json.next"
            mv -Tf "$root/deployments/$version/resources/v1/manifest.json.next" "$root/deployments/$version/resources/v1/manifest.json"
        fi
        ln -s "$old" "$root/current.rollback"
        mv -Tf "$root/current.rollback" "$root/current"
    else
        unlink "$root/current"
    fi
    echo 'Deployment health check failed; previous manifest restored' >&2
    exit 1
fi
echo "Activated $version"
