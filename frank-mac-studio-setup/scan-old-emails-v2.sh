#!/usr/bin/env bash
# scan-old-emails-v2.sh
# Tiefen-Scan: alle Mail-Archive auf Mac Studio + ALLEN externen Drives.
#
# Nutzung (einzeilig auf dem Mac Studio):
#
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/scan-old-emails-v2.sh | bash
#
# Was das Skript macht:
#   1. Lädt das v2-Python-Such-Skript (pure stdlib, keine Dependencies)
#   2. Listet ALLE gemounteten Volumes + lokale SSD
#   3. Du bestätigst (oder wählst Teilmenge)
#   4. Live-Progress sichtbar während Scan läuft
#   5. Output in ~/Documents/VOD Mails Suche/
#
# Erkannt werden:
#   - Apple Mail (.emlx, .eml, .mbox)
#   - mbox-Files OHNE Extension (Magic-Byte-Detection)
#   - Outlook for Mac (.olm) — als Warning, manueller Export nötig
#   - Outlook Windows (.pst, .ost) — als Warning
#   - Eudora/Pegasus/Thunderbird (.mbx, .tbb) — als Warning
#
# VOD-relevant heißt Tier 1 (vinyl-on-demand.com / vod-records.com im
# Header oder Body) ODER Tier 2 (Sender ist PayPal/Stripe/Klarna/Discogs/
# Bandcamp/eBay/DHL/Sendcloud/Monkey-Office — diese Mails enthalten
# typisch Customer-Daten + Adressen + Bestellinhalte).

set -eo pipefail

PY_URL="https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/find_old_emails_v2.py"
TARGET="$HOME/Documents/VOD Mails Suche"
TSV="$TARGET/_scan-results.tsv"
JSONL="$TARGET/vod-mails-export.jsonl.gz"
WARN="$TARGET/_archive-warnings.tsv"
CACHE_DIR="$HOME/.cache/vod-mail-scan"
PY_LOCAL="$CACHE_DIR/find_old_emails_v2.py"

# ─── Helpers ─────────────────────────────────────────────────────────────────

bold()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
info()  { printf "→ %s\n" "$*"; }
warn()  { printf "\033[33m⚠ %s\033[0m\n" "$*" >&2; }
die()   { printf "\033[31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ─── Banner ──────────────────────────────────────────────────────────────────

cat <<'EOF'

╔════════════════════════════════════════════════════════════════════╗
║  VOD-Mail-Archiv-Scanner v2 (Deep-Scan)                            ║
║                                                                    ║
║  Sucht ALLE Volumes + lokale SSD nach Mail-Archiven                ║
║  Erkennt: .emlx .eml .mbox .olm .pst .ost .mbx + naked-mbox        ║
║  Tier 1: vinyl-on-demand.com / vod-records.com                     ║
║  Tier 2: PayPal/Stripe/Klarna/Discogs/Bandcamp/DHL/Sendcloud/...   ║
║                                                                    ║
║  Live-Progress sichtbar — Strg-C bricht ab (Output bleibt)         ║
╚════════════════════════════════════════════════════════════════════╝

EOF

# ─── Vorbereitung ────────────────────────────────────────────────────────────

mkdir -p "$CACHE_DIR" "$TARGET"

bold "1) Python-Scanner laden"
# GitHub-CDN-Cache umgehen: ?nocache=$(date +%s)
if curl -fsSL "${PY_URL}?$(date +%s)" -o "$PY_LOCAL"; then
  info "Scanner geladen: $PY_LOCAL ($(wc -l < "$PY_LOCAL") Zeilen)"
else
  die "Konnte Python-Scanner nicht laden. Internet-Connection prüfen."
fi

# Python-Version-Check (3.9+ nötig für from __future__ annotations + match-statement-fallback)
PY_VER=$(/usr/bin/python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
info "Python: /usr/bin/python3 ($PY_VER)"
if [ "$(printf '%s\n3.9' "$PY_VER" | sort -V | head -1)" != "3.9" ]; then
  die "Python 3.9+ benötigt (gefunden: $PY_VER). macOS-Update?"
fi

# ─── FDA-Check ──────────────────────────────────────────────────────────────

bold "2) macOS-Berechtigung prüfen"
# Probe: kann das Terminal ~/Library/Mail/V*/* lesen?
set +o pipefail
ANY_MAIL_READABLE=false
for v in "$HOME/Library/Mail/V"*; do
  if [ -d "$v" ]; then
    probe=$(/usr/bin/find "$v" -name '*.emlx' -print -quit 2>/dev/null || true)
    if [ -n "$probe" ]; then
      ANY_MAIL_READABLE=true
      break
    fi
  fi
done
set -o pipefail

if [ "$ANY_MAIL_READABLE" = "false" ] && [ -d "$HOME/Library/Mail" ]; then
  cat <<'EOF'

  ⚠️  Terminal kann ~/Library/Mail/ nicht lesen.
      Vermutlich fehlt Full Disk Access:

      Apple-Menü → Systemeinstellungen → Datenschutz & Sicherheit
        → Festplattenvollzugriff → "+" → Programme → Terminal.app
        → Schalter aktivieren → Terminal komplett schließen + neu öffnen

  Trotzdem fortfahren? Externe Volumes funktionieren auch ohne FDA.
  (j = ja fortfahren, alles andere = abbrechen)

EOF
  read -r CONT < /dev/tty || CONT=""
  if [ "$CONT" != "j" ] && [ "$CONT" != "y" ] && [ "$CONT" != "yes" ]; then
    info "Abgebrochen. Erst FDA setzen, dann erneut starten."
    exit 0
  fi
else
  info "FDA OK — ~/Library/Mail/ ist lesbar"
fi

# ─── Scanner starten ─────────────────────────────────────────────────────────

bold "3) Scan starten"
echo

# Python macht jetzt alles selbst: Volume-Discovery, Preview, Confirm, Live-UI.
# Wichtig: < /dev/tty damit der Confirm-Prompt vom User-Terminal liest und
# nicht von der curl-Pipe.
/usr/bin/python3 "$PY_LOCAL" \
  --output "$TSV" \
  --jsonl "$JSONL" \
  --warnings "$WARN" \
  < /dev/tty || {
  EXIT=$?
  if [ $EXIT -eq 130 ]; then
    info "Vom User abgebrochen (Strg-C). Partial-Output gespeichert."
  else
    warn "Scanner exited mit Code $EXIT"
  fi
  exit $EXIT
}

# ─── Done ────────────────────────────────────────────────────────────────────

bold "4) Output im Finder öffnen"
if [ -d "$TARGET" ]; then
  open "$TARGET" 2>/dev/null || info "Output-Folder: $TARGET"
fi

cat <<EOF

══════════════════════════════════════════════════════════════════
  Nächster Schritt
══════════════════════════════════════════════════════════════════

  Schick die JSONL.gz-Datei an Robin:

    Datei:  $JSONL

  Optionen:
    • iCloud Drive: Datei reinziehen → Sharing-Link an Robin
    • WeTransfer:   wetransfer.com → Upload → Link an Robin
    • Dropbox:      Datei reinziehen → Share-Link an Robin
    • AirDrop:      Wenn Robin nahe ist — direkt

  Robin importiert die Datei in die crm_imap_message-Tabelle.

══════════════════════════════════════════════════════════════════

EOF
