#!/bin/bash
# Double-click to publish this plugin to GitHub.
# Safe to run more than once. Opens Terminal; may ask for your GitHub login the first time.

set -e
cd "$(dirname "$0")"

REPO="https://github.com/kotyzap/Stream-Deck-Axis-Cam-CamStreamer-Plugin.git"

echo "==> Working in: $(pwd)"

# 1. Initialise git if needed
if [ ! -d .git ]; then
  echo "==> git init"
  git init
fi
git branch -M main

# 2. Point 'origin' at the GitHub repo
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi

# 3. Stage and commit local changes (skip if nothing changed)
git add .
git commit -m "Axis Cam + CamStreamer Stream Deck plugin v1.0.0.1" || echo "==> nothing new to commit"

# 4. Merge whatever is already on GitHub (README/license), preferring our files on conflicts
echo "==> syncing with GitHub (rebase)"
git fetch origin main || true
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  git rebase origin/main --allow-unrelated-histories || {
    echo "==> resolving conflicts in favour of local files"
    git checkout --ours . 2>/dev/null || true
    git add -A
    GIT_EDITOR=true git rebase --continue || true
  }
fi

# 5. Push
echo "==> pushing to GitHub"
git push -u origin main

echo ""
echo "============================================================"
echo " Done. Your code is on GitHub."
echo " Next, in the browser:"
echo "  - Releases: upload com.4xsdev.axis-gateway.streamDeckPlugin (tag v1.0.0.1)"
echo "  - Settings > Pages: deploy from branch 'main', folder /docs"
echo "============================================================"
echo "Press Enter to close."
read _
