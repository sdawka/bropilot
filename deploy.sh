#!/bin/bash
# Builds and deploys the Bropilot web UI to Cloudflare Pages
set -euo pipefail

cd "$(dirname "$0")/web"
npm run build
npx wrangler pages deploy dist --project-name bropilot
