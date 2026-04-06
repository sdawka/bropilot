#!/bin/bash
set -e

cd /Users/sdawka/Code/bropilot

# Install Elixir dependencies
mix deps.get

# Install web dependencies
cd web
npm install

# Install Vitest if not present
if ! npx vitest --version >/dev/null 2>&1; then
  npm install -D vitest @testing-library/dom happy-dom
fi

cd ..

# Compile Elixir
mix compile

echo "Bropilot environment ready."
