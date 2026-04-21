#!/bin/bash
# run_tests.sh

# Ensure dependencies are available (temporarily)
if [ ! -d "node_modules/jsdom" ] || [ ! -d "node_modules/d3" ]; then
  echo "Installing test dependencies (jsdom, d3)..."
  npm install jsdom d3 --no-save --silent
fi

echo "🚀 Running System Design Vault - Canvas Tests..."
node tests/run_harness.js

if [ $? -eq 0 ]; then
  echo "✅ Regression check passed!"
  exit 0
else
  echo "❌ Regression check failed!"
  exit 1
fi
