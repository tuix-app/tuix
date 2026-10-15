#!/usr/bin/env bash
# Run with the repository toolchain; requires the phx_new 1.8 archive.
set -euo pipefail
package_root=$(cd "$(dirname "$0")/.." && pwd)
smoke_root=$(mktemp -d "${TMPDIR:-/tmp}/tuix-phoenix-smoke.XXXXXX")
trap 'rm -rf "$smoke_root"' EXIT
mix phx.new "$smoke_root/host" --app tuix_host --module TuixHost --no-ecto --no-mailer --no-dashboard --no-assets --no-install
cd "$smoke_root/host"
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync('mix.exs', 'utf8');
if (!source.includes('{:phoenix,')) throw Error('Unexpected generated Mix project');
writeFileSync('mix.exs', source.replace('{:phoenix,', '{:igniter, "~> 0.8", only: :dev},\n      {:phoenix,'));
JS
mix deps.get
mix igniter.install "tuix_phoenix@path:$package_root" --yes
mix compile --warnings-as-errors
# A repeat must leave generated integration files byte-for-byte unchanged.
find lib config -type f -exec shasum -a 256 {} \; | sort > "$smoke_root/before"
mix tuix_phoenix.install --yes
find lib config -type f -exec shasum -a 256 {} \; | sort > "$smoke_root/after"
diff -u "$smoke_root/before" "$smoke_root/after"
cp "$package_root/scripts/fixtures/host_integration.exs" test/host_integration_test.exs
mix test
