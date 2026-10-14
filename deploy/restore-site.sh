#!/usr/bin/env bash
# Undo --replace-site: give the domain back to the site that served it before (e.g. builder on
# merchantbuild.in) and switch the checkout's nginx site off. The checkout app keeps running on
# its internal ports; nothing is deleted.   sudo bash /srv/checkout/app/deploy/restore-site.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run it with sudo"; exit 1; }
NAME=$(cat /etc/checkout/replaced-site.txt 2>/dev/null || true)
[ -n "$NAME" ] && [ -f "/etc/nginx/sites-available/$NAME" ] || { echo "nothing to restore"; exit 1; }
rm -f /etc/nginx/sites-enabled/checkout.conf
ln -sf "/etc/nginx/sites-available/$NAME" "/etc/nginx/sites-enabled/$NAME"
nginx -t && { systemctl reload nginx 2>/dev/null || nginx -s reload; }
rm -f /etc/checkout/replaced-site.txt
echo "$NAME is back on its domain; the checkout site is off."
