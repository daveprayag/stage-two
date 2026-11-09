#!/usr/bin/env bash
# Upload every file under a local folder (default .r2) to the stage-two-data R2 bucket, keeping relative paths as keys.
set -euo pipefail
dir="${1:-.r2}"
cd "$(dirname "$0")/../worker"
find "../$dir" -type f | while read -r f; do
  key="${f#../$dir/}"
  npx -y wrangler@4.158.0 r2 object put "stage-two-data/$key" --file "$f" --remote >/dev/null 2>&1 && echo "put $key" || echo "FAILED $key"
done
