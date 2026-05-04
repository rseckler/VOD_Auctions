#!/usr/bin/env bash
# scan-old-emails.sh
# One-shot Bootstrap: alte Mails auf Franks Mac Studio + VOD BIGRAID finden
# und ein TSV mit allen Treffern in ~/Documents/VOD Mails Suche/ ablegen.
#
# Nutzung (eine Zeile auf dem Mac Studio Terminal):
#
#   curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/scan-old-emails.sh | bash
#
# Was das Skript macht:
#   1) Lädt das Python-Such-Skript (pure stdlib, keine Dependencies)
#   2) Listet alle gemounteten Volumes und lässt Frank zusätzlich auswählen
#   3) Scannt automatisch beide Apple-Mail-Locations (klassisch + sandboxed)
#   4) Walkt rekursiv durch + parst Mail-Header (Date/From/To/Subject)
#   5) Markiert VOD-relevante Mails (vinyl-on-demand.com / vod-records.com)
#   6) Schreibt TSV nach ~/Documents/VOD Mails Suche/_scan-results.tsv
#
# Output kannst Du Robin schicken — er importiert die VOD-relevanten Mails
# in die crm_imap_message-Tabelle.
#
# WICHTIG: Das Skript LIEST nur, schreibt nichts auf der RAID. Die Mails
# bleiben wo sie sind.

set -eo pipefail

PY_URL="https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/find_old_emails.py"
TARGET="$HOME/Documents/VOD Mails Suche"
TSV="$TARGET/_scan-results.tsv"
JSONL="$TARGET/vod-mails-export.jsonl.gz"
CACHE_DIR="$HOME/.cache/vod-mail-scan"
PY_LOCAL="$CACHE_DIR/find_old_emails.py"

bold()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
info()  { printf "→ %s\n" "$*"; }
warn()  { printf "\033[33m⚠ %s\033[0m\n" "$*" >&2; }
die()   { printf "\033[31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

cat <<'EOF'

╔════════════════════════════════════════════════════╗
║  VOD-Mail-Archiv-Scanner                           ║
║                                                    ║
║  Sucht alte Mails auf Mac Studio + Volumes         ║
║  TSV-Output: ~/Documents/VOD Mails Suche/          ║
╚════════════════════════════════════════════════════╝

EOF

# ─── Vorbereitung ────────────────────────────────────────────────────────────

mkdir -p "$CACHE_DIR" "$TARGET"

bold "1) Python-Scanner laden"
if curl -fsSL "$PY_URL" -o "$PY_LOCAL"; then
  info "Scanner geladen: $PY_LOCAL"
else
  die "Konnte Python-Scanner nicht laden. Internet-Connection?"
fi

# ─── Roots zusammenstellen ───────────────────────────────────────────────────

ROOTS=()

bold "2) Apple-Mail-Locations"
for p in \
  "$HOME/Library/Mail" \
  "$HOME/Library/Containers/com.apple.mail/Data/Library/Mail" \
  "$HOME/Library/Mobile Documents/com~apple~mail/Data" ; do
  if [ -d "$p" ]; then
    info "gefunden: $p"
    ROOTS+=("$p")
  fi
done

if [ ${#ROOTS[@]} -eq 0 ]; then
  warn "Keine Apple-Mail-Verzeichnisse gefunden. Mail.app vermutlich nie eingerichtet?"
fi

bold "3) Externe Volumes"
echo
echo "Verfügbare Laufwerke:"
echo
ls /Volumes 2>/dev/null | sed 's/^/  /'
echo
echo "Welches Volume zusätzlich scannen? (Name aus der Liste oben, oder Enter zum Überspringen):"
# WICHTIG: < /dev/tty — bei curl|bash würde read sonst aus dem Pipe-Stream
# lesen (= nächste Zeile dieses Skripts), nicht von Frank's Terminal.
read -r VOL < /dev/tty || VOL=""
VOL=$(echo "$VOL" | tr -d '"' | xargs)  # strip quotes + whitespace

if [ -n "$VOL" ]; then
  if [ -d "/Volumes/$VOL" ]; then
    info "wird gescannt: /Volumes/$VOL"
    ROOTS+=("/Volumes/$VOL")
  else
    warn "/Volumes/$VOL existiert nicht — überspringe"
  fi
fi

# ─── Full Disk Access Check ──────────────────────────────────────────────────

bold "3b) macOS-Berechtigung prüfen"
# Apple Mail-Verzeichnisse sind ohne Full Disk Access nicht lesbar — selbst
# wenn ~/Library/Mail/V* existiert, gibt os.walk() leeren Listing.
# Ein einzelner Test: schau ob V<N>/MailData/ etc lesbar ist.
PERM_OK=true
for p in "${ROOTS[@]}"; do
  case "$p" in
    *Library/Mail*|*Library/Containers/com.apple.mail*)
      # Probe: zähle Dateien rekursiv (limit 5)
      count=$(find "$p" -type f 2>/dev/null | head -5 | wc -l | tr -d ' ')
      if [ "$count" = "0" ]; then
        # Erstes Anzeichen: Verzeichnis existiert, aber 0 Files lesbar
        if [ -d "$p" ]; then
          warn "Kann '$p' nicht lesen (vermutlich macOS Full Disk Access fehlt)"
          PERM_OK=false
        fi
      fi
      ;;
  esac
done

if [ "$PERM_OK" = "false" ]; then
  cat <<'EOF'

  ⚠️  macOS blockiert Zugriff auf ~/Library/Mail/ ohne Full Disk Access.
      Das Terminal/iTerm braucht diese Permission um Mail-Daten zu lesen.

  Bitte einmalig erlauben:
    1. Apple-Menü → Systemeinstellungen → Datenschutz & Sicherheit
    2. → Festplattenvollzugriff (Full Disk Access)
    3. → "+" klicken → Programme → Terminal.app (oder iTerm.app) hinzufügen
    4. Terminal komplett schließen und neu öffnen
    5. Dieses Skript erneut starten:
       curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/scan-old-emails.sh | bash

EOF
  echo "Trotzdem fortfahren? (j = ja, alles andere = abbrechen):"
  read -r CONT < /dev/tty || CONT=""
  if [ "$CONT" != "j" ] && [ "$CONT" != "y" ] && [ "$CONT" != "yes" ]; then
    info "Abgebrochen. Erst Full Disk Access erteilen, dann erneut starten."
    exit 0
  fi
fi

if [ ${#ROOTS[@]} -eq 0 ]; then
  die "Keine Roots zum Scannen. Abbruch."
fi

# ─── Scan starten ────────────────────────────────────────────────────────────

bold "4) Scan startet"
echo "Roots:"
for r in "${ROOTS[@]}"; do
  echo "  - $r"
done
echo
info "Output: $TSV"
echo

# Build args array
ARGS=()
for r in "${ROOTS[@]}"; do
  ARGS+=(--root "$r")
done
ARGS+=(--output "$TSV")
ARGS+=(--jsonl "$JSONL")

# Run
/usr/bin/python3 "$PY_LOCAL" "${ARGS[@]}"

# ─── Done ────────────────────────────────────────────────────────────────────

bold "5) Fertig"
if [ -s "$TSV" ]; then
  LINES=$(wc -l < "$TSV" | tr -d ' ')
  RELEVANT=$(grep -c $'\tYES$' "$TSV" 2>/dev/null || echo 0)
  echo "  Catalog (TSV):      $TSV"
  echo "    Total mails:      $LINES"
  echo "    VOD-relevant:     $RELEVANT"
  if [ -s "$JSONL" ]; then
    JSONL_SIZE=$(du -h "$JSONL" | cut -f1)
    echo "  Export (JSONL.gz):  $JSONL"
    echo "    Größe:            $JSONL_SIZE"
  fi
  echo
  bold "6) Nächster Schritt"
  cat <<EOF
  Schick die JSONL.gz-Datei an Robin:

    Datei:  $JSONL

  Optionen (such Dir die einfachste aus):
    • iCloud Drive: Datei reinziehen, Sharing-Link an Robin
    • WeTransfer:   wetransfer.com → Datei hochladen → Link an Robin
    • Dropbox:      Datei reinziehen, Share-Link an Robin
    • AirDrop:      Wenn Robin nahe ist — direkt.

  Robin lädt die Datei runter, kopiert sie auf den VPS und startet
  das Import-Skript. Du musst nichts weiter tun.

EOF
  info "Im Finder öffnen…"
  open "$TARGET"
else
  warn "Keine TSV-Datei erzeugt — Scanner-Fehler?"
fi
