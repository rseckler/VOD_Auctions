#!/usr/bin/env bash
# scan-old-invoices.sh
# One-shot Bootstrap für Franks Mac Studio: alte VOD-Rechnungen auf der RAID
# finden und nach ~/Documents/VOD Rechnungen kopieren.
#
# Nutzung (eine Zeile auf dem Mac Studio):
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/scan-old-invoices.sh | bash
#
# Was das Skript macht:
#   1) Installiert Homebrew + poppler, falls noch nicht da
#   2) Lädt das Python-Such-Skript aus dem Repo
#   3) Listet alle gemounteten Laufwerke und lässt Frank auswählen
#   4) Scannt jedes PDF auf dem Laufwerk auf VOD-Rechnungs-Marker
#   5) Kopiert alle Treffer nach ~/Documents/VOD Rechnungen/<jahr>/
#   6) Öffnet den Ziel-Ordner im Finder

set -eo pipefail

PY_URL="https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/Monkey%20Office/find_old_invoices.py"
TARGET="$HOME/Documents/VOD Rechnungen"
TSV="$TARGET/_scan-results.tsv"
CACHE_DIR="$HOME/.cache/vod-invoice-scan"
PY_LOCAL="$CACHE_DIR/find_old_invoices.py"

bold()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
info()  { printf "→ %s\n" "$*"; }
warn()  { printf "\033[33m⚠ %s\033[0m\n" "$*" >&2; }
die()   { printf "\033[31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

cat <<'EOF'

╔════════════════════════════════════════════════════╗
║  VOD-Rechnungs-Scanner                             ║
║                                                    ║
║  Sucht alte VOD-Rechnungs-PDFs auf einer Platte    ║
║  und kopiert sie nach ~/Documents/VOD Rechnungen   ║
╚════════════════════════════════════════════════════╝

EOF

# 1) Homebrew
if ! command -v brew >/dev/null 2>&1; then
  bold "Homebrew wird installiert (einmalig)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# 2) poppler (liefert pdftotext)
if ! command -v pdftotext >/dev/null 2>&1; then
  bold "Tool 'poppler' wird installiert (einmalig, ~30 sek)…"
  brew install poppler
fi

# 3) python3
command -v python3 >/dev/null 2>&1 \
  || die "python3 nicht gefunden — bitte einmal 'brew install python@3.12' ausführen."

# 4) Python-Skript laden
mkdir -p "$CACHE_DIR"
info "Lade Such-Skript…"
curl -fsSL -o "$PY_LOCAL" "$PY_URL" \
  || die "Konnte $PY_URL nicht laden. Internetverbindung?"

# 5) Laufwerke listen
bold "Welches Laufwerk durchsuchen?"
VOLS=()
i=0
for vol in /Volumes/*; do
  [ -d "$vol" ] || continue
  name=$(basename "$vol")
  size=$(df -h "$vol" 2>/dev/null | awk 'NR==2 {print $2}')
  used=$(df -h "$vol" 2>/dev/null | awk 'NR==2 {print $3}')
  i=$((i+1))
  VOLS+=("$vol")
  printf "  [%d] %-30s  %s von %s belegt\n" "$i" "$name" "${used:-?}" "${size:-?}"
done

[ "$i" -gt 0 ] || die "Keine Laufwerke unter /Volumes gefunden. RAID anstecken und nochmal starten."

echo
printf "Auswahl [1-%d]: " "$i"
read -r SEL </dev/tty
IDX=$((SEL - 1))
[ "$IDX" -ge 0 ] && [ "$IDX" -lt "$i" ] || die "Ungültige Auswahl."
RAID="${VOLS[$IDX]}"

bold "Durchsuche: $RAID"

mkdir -p "$TARGET"

# 6) Scan
echo
echo "Scan läuft. Kann je nach Größe der Platte einige Minuten dauern."
echo "Mit Ctrl+C kannst du jederzeit abbrechen — Wiederaufnahme erfolgt automatisch."
echo
python3 "$PY_LOCAL" scan "$RAID" --out "$TSV"

# 7) Collect
bold "Kopiere alle Treffer nach $TARGET…"
python3 "$PY_LOCAL" collect "$TSV" --target "$TARGET" --select matches

# 8) Finder öffnen
open "$TARGET" 2>/dev/null || true

bold "Fertig!"
echo "  Trefferliste: $TSV"
echo "  PDFs:         $TARGET"
echo
