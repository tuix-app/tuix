#!/usr/bin/env bash
# Runs Plugin Check, the tool the wordpress.org plugin review uses, against
# apps/wordpress/tuix-feedback in throwaway Docker containers on their own network,
# so it needs no free ports. Every error and warning fails the run.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
plugin="$root/apps/wordpress/tuix-feedback"
image=${WORDPRESS_IMAGE:-wordpress:7.1-php8.3-apache}
cli_image=wordpress:cli-php8.3
plugin_check_version=2.1.0
name=tuix-plugin-check-$$
net=$name db=$name-db wp=$name-wp vol=$name-html
cleanup() {
  docker rm -f "$db" "$wp" > /dev/null 2>&1 || true
  docker volume rm -f "$vol" > /dev/null 2>&1 || true
  docker network rm "$net" > /dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$net" > /dev/null
docker volume create "$vol" > /dev/null
docker run -d --name "$db" --network "$net" -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=wp \
  -e MARIADB_USER=wp -e MARIADB_PASSWORD=wp mariadb:11 > /dev/null
env=(-e "WORDPRESS_DB_HOST=$db" -e WORDPRESS_DB_USER=wp -e WORDPRESS_DB_PASSWORD=wp -e WORDPRESS_DB_NAME=wp)
docker run -d --name "$wp" --network "$net" -v "$vol:/var/www/html" \
  -v "$plugin:/var/www/html/wp-content/plugins/tuix-feedback:ro" "${env[@]}" "$image" > /dev/null
cli() {
  docker run --rm --network "$net" --user 33:33 -e WP_CLI_CACHE_DIR=/tmp/wp-cli-cache \
    -v "$vol:/var/www/html" -v "$plugin:/var/www/html/wp-content/plugins/tuix-feedback:ro" \
    "${env[@]}" "$cli_image" wp "$@"
}
ready=false
for _ in $(seq 1 90); do
  if docker exec "$wp" test -f /var/www/html/wp-includes/version.php 2> /dev/null && cli db check > /dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
if [ "$ready" != true ]; then
  echo 'WordPress did not start.' >&2
  docker logs "$wp" 2>&1 | tail -20 >&2
  exit 1
fi
echo "WordPress $(cli core version)"
cli core install --url=http://localhost --title=Check --admin_user=admin --admin_password=admin \
  --admin_email=admin@example.test --skip-email > /dev/null
cli plugin install plugin-check --version="$plugin_check_version" --activate > /dev/null
cli plugin activate tuix-feedback > /dev/null
results=$(cli plugin check tuix-feedback --format=csv --fields=file,line,type,code,message --include-experimental 2>&1 || true)
printf '%s\n' "$results"
# Records look like: file,line,TYPE,code,"message".
unexpected=$(printf '%s\n' "$results" | awk -F, '$3 == "ERROR" || $3 == "WARNING" { count++ } END { print count + 0 }')
if ! printf '%s\n' "$results" | grep -q -e 'Checks complete' -e '^file,line' -e 'No errors found'; then
  echo 'Plugin Check did not report. See the output above.' >&2
  exit 1
fi
if [ "$unexpected" -ne 0 ]; then
  echo "Plugin Check: $unexpected finding(s) to fix." >&2
  exit 1
fi
echo 'Plugin Check: no findings.'
