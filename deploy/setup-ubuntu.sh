#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run using sudo or root' >&2; exit 1; }
key=${1:?path to deployment public key required}
ssh-keygen -lf "$key" >/dev/null
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx curl
id sleepast-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash sleepast-deploy
install -d -m 700 -o sleepast-deploy -g sleepast-deploy /home/sleepast-deploy/.ssh
touch /home/sleepast-deploy/.ssh/authorized_keys
public_key=$(cat "$key")
grep -qxF "$public_key" /home/sleepast-deploy/.ssh/authorized_keys || printf '%s\n' "$public_key" >> /home/sleepast-deploy/.ssh/authorized_keys
chown sleepast-deploy:sleepast-deploy /home/sleepast-deploy/.ssh/authorized_keys
chmod 600 /home/sleepast-deploy/.ssh/authorized_keys
install -d -m 755 -o sleepast-deploy -g sleepast-deploy /var/www/sleepast-core /var/www/sleepast-core/incoming
configuration=/etc/nginx/sites-available/sleepast-core
if [[ -e "$configuration" ]]; then
    echo "Existing $configuration preserved. Review it before replacing it." >&2
else
    install -m 644 "$(dirname "$0")/nginx.conf" "$configuration"
fi
ln -sfn "$configuration" /etc/nginx/sites-enabled/sleepast-core
nginx -t
systemctl reload nginx
echo 'After DNS points to this ECS and ports 80/443 are open, enable HTTPS:'
echo 'sudo certbot --nginx -d pokepokeshock.cn'
