#!/bin/bash
# ============================================================
# VOD Auctions — GitHub Release Helper
# ============================================================
# Usage:
#   ./scripts/create-release.sh                  # Interactive mode
#   ./scripts/create-release.sh v0.9.1 "Title"   # Quick mode (opens editor for notes)
#   ./scripts/create-release.sh --today           # Show today's commits (no release created)
#   ./scripts/create-release.sh --list            # List existing releases
#
# Requires: gh (GitHub CLI), git
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Colors
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# --- Helper functions ---

get_latest_tag() {
  git tag -l 'v*' --sort=-version:refname | head -1
}

suggest_next_version() {
  local latest
  latest=$(get_latest_tag)
  if [[ -z "$latest" ]]; then
    echo "v0.1.0"
    return
  fi
  # Strip 'v' prefix, split into parts
  local version="${latest#v}"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$version"
  patch=$((patch + 1))
  echo "v${major}.${minor}.${patch}"
}

show_commits_for_date() {
  local date="$1"
  echo -e "${CYAN}Commits on ${date}:${NC}"
  git log --format="  %C(yellow)%h%C(reset) %s" --after="${date}T00:00:00" --before="${date}T23:59:59" --reverse 2>/dev/null || true
  echo ""
  local count
  count=$(git log --oneline --after="${date}T00:00:00" --before="${date}T23:59:59" 2>/dev/null | wc -l | tr -d ' ')
  local files
  files=$(git log --after="${date}T00:00:00" --before="${date}T23:59:59" --pretty=format: --name-only 2>/dev/null | sort -u | grep -v '^$' | wc -l | tr -d ' ')
  echo -e "${DIM}${count} commits, ${files} files changed${NC}"
}

show_today() {
  local today
  today=$(date +%Y-%m-%d)
  echo -e "${BOLD}Git activity for today (${today}):${NC}"
  echo ""
  show_commits_for_date "$today"
}

list_releases() {
  echo -e "${BOLD}Existing GitHub Releases:${NC}"
  echo ""
  gh release list --limit 20 || echo "No releases found."
}

generate_commit_list() {
  local date="$1"
  git log --format="- %s (\`%h\`)" --after="${date}T00:00:00" --before="${date}T23:59:59" --reverse 2>/dev/null
}

# --- Commands ---

if [[ "${1:-}" == "--today" ]]; then
  show_today
  exit 0
fi

if [[ "${1:-}" == "--list" ]]; then
  list_releases
  exit 0
fi

# --- Interactive / Quick release creation ---

echo -e "${BOLD}🏷️  VOD Auctions — Create GitHub Release${NC}"
echo ""

# Version
SUGGESTED=$(suggest_next_version)
if [[ -n "${1:-}" && "$1" == v* ]]; then
  VERSION="$1"
  shift
else
  echo -e "Latest tag: ${YELLOW}$(get_latest_tag || echo 'none')${NC}"
  echo -e "Suggested:  ${GREEN}${SUGGESTED}${NC}"
  echo ""
  read -rp "Version [$SUGGESTED]: " VERSION
  VERSION="${VERSION:-$SUGGESTED}"
fi

# Title
if [[ -n "${1:-}" ]]; then
  TITLE="$1"
  shift
else
  read -rp "Release title: " TITLE
fi

if [[ -z "$TITLE" ]]; then
  echo "Error: Title is required."
  exit 1
fi

# Show today's commits as reference
echo ""
show_today
echo ""

# Generate draft notes
DRAFT_NOTES=$(cat <<EOF
## What's Changed

$(generate_commit_list "$(date +%Y-%m-%d)")

**Full Changelog**: $(get_latest_tag)...${VERSION}
EOF
)

echo -e "${CYAN}Draft release notes:${NC}"
echo "$DRAFT_NOTES"
echo ""

read -rp "Create release ${VERSION} — \"${TITLE}\"? [y/N/e(dit)] " CONFIRM

case "$CONFIRM" in
  y|Y)
    gh release create "$VERSION" \
      --title "$TITLE" \
      --notes "$DRAFT_NOTES" \
      --latest
    echo -e "${GREEN}✓ Release ${VERSION} created!${NC}"
    ;;
  e|E)
    # Open editor for custom notes
    TMPFILE=$(mktemp /tmp/release-notes-XXXXXX.md)
    echo "$DRAFT_NOTES" > "$TMPFILE"
    ${EDITOR:-nano} "$TMPFILE"
    gh release create "$VERSION" \
      --title "$TITLE" \
      --notes-file "$TMPFILE" \
      --latest
    rm -f "$TMPFILE"
    echo -e "${GREEN}✓ Release ${VERSION} created!${NC}"
    ;;
  *)
    echo "Aborted."
    exit 0
    ;;
esac
