#!/usr/bin/env bash
# Install a pre-push git hook that auto-deploys to Cloudflare Pages
# whenever a push to main occurs from this machine. The hook itself
# lives in .git/hooks/ (not versioned), so this installer is shipped
# in scripts/ to recreate it on a fresh clone.
#
# Run once: ./scripts/install-pre-push-hook.sh
# Remove:   rm .git/hooks/pre-push
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_PATH="$REPO_ROOT/.git/hooks/pre-push"

cat > "$HOOK_PATH" <<'HOOK'
#!/usr/bin/env bash
# Auto-deploy to Cloudflare Pages on push to main.
# Built by scripts/install-pre-push-hook.sh — re-run that to refresh.
set -e

REMOTE="$1"
URL="$2"
DEPLOY=false
while read -r local_ref local_sha remote_ref remote_sha; do
  if [[ "$remote_ref" == "refs/heads/main" ]]; then
    DEPLOY=true
    break
  fi
done

if [[ "$DEPLOY" == "true" ]]; then
  printf "\n🚀 pre-push: deploying to Cloudflare Pages...\n"
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  cd "$REPO_ROOT"
  if npm run deploy; then
    printf "✅ Deploy succeeded — push proceeding.\n\n"
  else
    printf "\n⚠️  Deploy failed. Push will still proceed.\n"
    printf "    Run 'npm run deploy' manually after fixing the issue.\n\n"
  fi
fi
exit 0
HOOK
chmod +x "$HOOK_PATH"
echo "✅ Installed pre-push hook at $HOOK_PATH"
echo "   Every 'git push' to main will now build and deploy to Cloudflare Pages."
echo "   To uninstall: rm $HOOK_PATH"
