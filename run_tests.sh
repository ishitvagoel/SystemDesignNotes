#!/bin/bash
# run_tests.sh

set -e

# Ensure dependencies are available
if [ ! -d "node_modules/jsdom" ] || [ ! -d "node_modules/d3" ]; then
  echo "Installing project dependencies..."
  npm install --silent
fi

echo "🚀 Running System Design Vault - Canvas Tests..."
node tests/run_harness.js
node tests/link-fixer.test.js
echo "✅ Regression check passed!"
