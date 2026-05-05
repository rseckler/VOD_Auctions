#!/usr/bin/env bash
# diagnose-drive-for-mails.sh
# Inventur einer einzelnen Drive (Default: /Volumes/VOD BIGRAID/) — sucht ALLE
# Mail-Indizien (Files, Folder, Archives, mbox-Bundles, ZIPs).
# KEIN Body-Export, KEIN Import, nur Diagnose.
#
# Nutzung (One-Liner auf Frank's Mac Studio):
#
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/diagnose-drive-for-mails.sh | bash
#
# Mit anderem Drive:
#
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/diagnose-drive-for-mails.sh | bash -s -- "/Volumes/Anderer Drive"
#
# Output:
#   ~/Documents/VOD Mail-Inventory/<drive>_findings.tsv  — alle gefundenen Files
#   ~/Documents/VOD Mail-Inventory/<drive>_summary.txt   — Top-Suspects + Stats

set -eo pipefail

PY_URL="https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/find_mail_stores.py"
TARGET="$HOME/Documents/VOD Mail-Inventory"
CACHE_DIR="$HOME/.cache/vod-mail-scan"
PY_LOCAL="$CACHE_DIR/find_mail_stores.py"

# Default Drive — überschreibbar via $1
DRIVE_TO_SCAN="${1:-/Volumes/VOD BIGRAID}"

# ─── Helpers ─────────────────────────────────────────────────────────────────

bold()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
info()  { printf "→ %s\n" "$*"; }
warn()  { printf "\033[33m⚠ %s\033[0m\n" "$*" >&2; }
die()   { printf "\033[31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ─── Banner ──────────────────────────────────────────────────────────────────

cat <<'EOF'

╔════════════════════════════════════════════════════════════════════╗
║  VOD-Mail-Inventory                                                ║
║                                                                    ║
║  Reine Diagnose: WO sind Mail-Daten auf dieser Drive?              ║
║  Findet: alle Mail-Files, Apple-Mail-Bundles, Outlook-Archives,    ║
║  naked-mbox, verdächtige ZIPs/Folder                               ║
║                                                                    ║
║  KEIN Body-Export — nur Inventur                                   ║
╚════════════════════════════════════════════════════════════════════╝

EOF

# ─── Vorbereitung ────────────────────────────────────────────────────────────

mkdir -p "$CACHE_DIR" "$TARGET"

bold "1) Python-Scanner laden"
if curl -fsSL "${PY_URL}?$(date +%s)" -o "$PY_LOCAL"; then
  info "Scanner geladen: $PY_LOCAL ($(wc -l < "$PY_LOCAL") Zeilen)"
else
  die "Konnte Scanner nicht laden (Internet?)"
fi

# Python-Version-Check
PY_VER=$(/usr/bin/python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
info "Python: /usr/bin/python3 ($PY_VER)"
if [ "$(printf '%s\n3.9' "$PY_VER" | sort -V | head -1)" != "3.9" ]; then
  die "Python 3.9+ benötigt (gefunden: $PY_VER)"
fi

# ─── Drive-Check ────────────────────────────────────────────────────────────

bold "2) Ziel-Drive prüfen"
echo "  Ziel: $DRIVE_TO_SCAN"
if [ ! -d "$DRIVE_TO_SCAN" ]; then
  echo
  warn "Drive existiert nicht oder ist nicht gemountet."
  echo
  echo "  Verfügbare Volumes:"
  ls -la /Volumes/ 2>/dev/null | sed 's/^/    /'
  echo
  die "Mount die richtige Drive und versuch erneut."
fi

# Disk-Stats für Drive
USED=$(df -h "$DRIVE_TO_SCAN" 2>/dev/null | tail -1 | awk '{print $3}')
SIZE=$(df -h "$DRIVE_TO_SCAN" 2>/dev/null | tail -1 | awk '{print $2}')
info "Drive belegt: $USED von $SIZE"

# ─── Scanner starten ─────────────────────────────────────────────────────────

bold "3) Inventur starten"
echo

# Python macht alles selbst: Confirm-Prompt, Walk, Live-UI, TSV+Summary.
# < /dev/tty damit der Confirm-Prompt vom User-Terminal liest.
/usr/bin/python3 "$PY_LOCAL" \
  --root "$DRIVE_TO_SCAN" \
  --output-dir "$TARGET" \
  --deep \
  < /dev/tty || {
  EXIT=$?
  if [ $EXIT -eq 130 ]; then
    info "Vom User abgebrochen (Strg-C). Partial-Inventory gespeichert."
  else
    warn "Scanner exited mit Code $EXIT"
  fi
  exit $EXIT
}

# ─── Done ────────────────────────────────────────────────────────────────────

bold "4) Output im Finder öffnen"
if [ -d "$TARGET" ]; then
  open "$TARGET" 2>/dev/null || info "Output: $TARGET"
fi

cat <<EOF

══════════════════════════════════════════════════════════════════
  Was tun mit dem Output?
══════════════════════════════════════════════════════════════════

  Schick die Summary-Datei an Robin (kleine TXT-Datei):

    ~/Documents/VOD Mail-Inventory/*_summary.txt

  Diese enthält:
    • Liste aller gefundenen Mail-Files / Archives / Bundles
    • Top-Folder mit den meisten Mails
    • Verdächtige ZIPs / Folder die manuell geprüft werden sollten

  Robin kann dann entscheiden ob noch ein Tiefen-Scan oder eine
  manuelle Extraktion (für .olm/.pst-Archive) nötig ist.

══════════════════════════════════════════════════════════════════

EOF
