#!/usr/bin/env bash
# diagnose-drive-deep.sh
# Tiefen-Inventur einer Drive — findet WIRKLICH alles:
#   - Mail-Files (.emlx/.eml/.mbox)
#   - Apple-Mail-Bundles + Identities
#   - Thunderbird-Profile + Outlook-Identities
#   - Mail-Archive (.olm/.pst/.ost)
#   - ZIP/TAR-Inhalte werden GELISTET (Mails INNERHALB von ZIPs!)
#   - DOCX/XLSX/CSV/TXT mit Mail-Adressen werden gefunden (Frank's Mail-Listen)
#   - Magic-Byte-Universal für naked-mbox + .pst ohne Extension
#   - Permission-Denied-Pfade explizit reportet
#
# Nutzung (One-Liner auf Mac Studio):
#
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/diagnose-drive-deep.sh | bash
#
# Mit anderem Drive:
#
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/diagnose-drive-deep.sh | bash -s -- "/Volumes/Andere"
#
# Realistisch: 30-60 Min für 16 TB beim ersten Lauf, viel schneller bei
# warmem Filesystem-Cache.

set -eo pipefail

PY_URL="https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/find_mail_stores_v3.py"
TARGET="$HOME/Documents/VOD Mail-Inventory"
CACHE_DIR="$HOME/.cache/vod-mail-scan"
PY_LOCAL="$CACHE_DIR/find_mail_stores_v3.py"

DRIVE_TO_SCAN="${1:-/Volumes/VOD BIGRAID}"

bold()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
info()  { printf "→ %s\n" "$*"; }
warn()  { printf "\033[33m⚠ %s\033[0m\n" "$*" >&2; }
die()   { printf "\033[31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

cat <<'EOF'

╔════════════════════════════════════════════════════════════════════╗
║  VOD-Mail-Inventory v3 — Tiefen-Diagnose                           ║
║                                                                    ║
║  v3 vs. v2:                                                        ║
║    + ZIP/TAR-Inhalte werden gelistet (Mails IN ZIPs gefunden!)     ║
║    + DOCX/XLSX/CSV: Mail-Adressen werden extrahiert                ║
║    + Magic-Byte-Universal (auch ohne suggestiven Filename)         ║
║    + Permission-Denied-Liste explizit                              ║
║    + Thunderbird/Outlook-Identity-Detection                        ║
║                                                                    ║
║  Realistisch 30-60 Min für 16 TB                                   ║
╚════════════════════════════════════════════════════════════════════╝

EOF

mkdir -p "$CACHE_DIR" "$TARGET"

bold "1) Python-Scanner laden"
if curl -fsSL "${PY_URL}?$(date +%s)" -o "$PY_LOCAL"; then
  info "Scanner geladen: $PY_LOCAL ($(wc -l < "$PY_LOCAL") Zeilen)"
else
  die "Konnte Scanner nicht laden (Internet?)"
fi

# Python check
PY_VER=$(/usr/bin/python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
info "Python: /usr/bin/python3 ($PY_VER)"
if [ "$(printf '%s\n3.9' "$PY_VER" | sort -V | head -1)" != "3.9" ]; then
  die "Python 3.9+ benötigt"
fi

bold "2) Optionale Tools (für spätere PST-Extraction)"
if command -v brew >/dev/null 2>&1; then
  if brew list libpst >/dev/null 2>&1; then
    info "✓ libpst bereits installiert"
  else
    info "○ libpst nicht installiert (brauchst du nur falls .pst-Files gefunden werden)"
    info "  Falls nötig später: brew install libpst"
  fi
else
  info "○ Homebrew nicht da — falls .pst-Files gefunden, manuell extrahieren"
fi

bold "3) Ziel-Drive prüfen"
echo "  Ziel: $DRIVE_TO_SCAN"
if [ ! -d "$DRIVE_TO_SCAN" ]; then
  warn "Drive existiert nicht oder ist nicht gemountet."
  echo
  echo "  Verfügbare Volumes:"
  ls -la /Volumes/ 2>/dev/null | sed 's/^/    /'
  die "Mount die richtige Drive und versuch erneut."
fi
USED=$(df -h "$DRIVE_TO_SCAN" 2>/dev/null | tail -1 | awk '{print $3}')
SIZE=$(df -h "$DRIVE_TO_SCAN" 2>/dev/null | tail -1 | awk '{print $2}')
info "Drive belegt: $USED von $SIZE"

bold "4) Tiefen-Scan starten"
echo

/usr/bin/python3 "$PY_LOCAL" \
  --root "$DRIVE_TO_SCAN" \
  --output-dir "$TARGET" \
  < /dev/tty || {
  EXIT=$?
  if [ $EXIT -eq 130 ]; then
    info "Vom User abgebrochen (Strg-C). Partial-Inventory gespeichert."
  else
    warn "Scanner exited mit Code $EXIT"
  fi
  exit $EXIT
}

bold "5) Output im Finder"
[ -d "$TARGET" ] && open "$TARGET" 2>/dev/null

cat <<EOF

══════════════════════════════════════════════════════════════════
  Was an Robin schicken?
══════════════════════════════════════════════════════════════════

  Die _v3_summary.txt — kleine Datei, enthält die Top-Findings.

    Pfad: ~/Documents/VOD Mail-Inventory/

  Robin schaut auf:
    • ZIPs mit Mail-Inhalten (NEU in v3)
    • Mail-Listen in DOCX/XLSX (manuelle Adress-Tabellen)
    • Thunderbird-/Outlook-Profile
    • Permission-Denied-Liste (vielleicht muss FDA neu erteilt werden)

══════════════════════════════════════════════════════════════════

EOF
