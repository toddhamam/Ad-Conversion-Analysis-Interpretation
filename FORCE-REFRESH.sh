#!/bin/bash

echo "🔧 FORCING COMPLETE REFRESH OF CONVERSION INTELLIGENCE APP"
echo "============================================================"

# Navigate to project (use script's directory)
cd "$(dirname "$0")"

echo ""
echo "Step 1: Killing all Node/Vite processes..."
pkill -f "vite" 2>/dev/null || true
pkill -f "node" 2>/dev/null || true
sleep 2

echo ""
echo "Step 2: Removing ALL cache directories..."
rm -rf node_modules/.vite
rm -rf node_modules/.cache
rm -rf dist
rm -rf .vite
rm -rf build

echo ""
echo "Step 3: Pulling latest changes from git..."
git pull

echo ""
echo "Step 4: Starting fresh dev server..."
echo "⚡ Dev server will start in a new process..."
echo "🌐 Open your browser to: http://localhost:5175"
echo ""
echo "IMPORTANT: When the browser opens:"
echo "1. Press Command + Shift + R (hard refresh)"
echo "2. Or press Command + Option + E to empty cache, then Command + R"
echo ""
echo "You should now see BRIGHT VIOLET glowing accents with pulsing animations!"
echo "============================================================"
echo ""

npm run dev
