#!/usr/bin/env bash
# Test-Label drucken (29x90mm mit Ruler + Test-Barcode)
# Generiert das PDF on-the-fly via Python+Quartz (PyObjC), das auf macOS vorinstalliert ist.

set -u
set -o pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PDF_OUT="/tmp/vod-test-label.pdf"
PRINTER_QUEUE=$(LC_ALL=C lpstat -p 2>/dev/null | awk '/[Bb]rother/ && /820/ {print $2; exit}' | tr -d '„"“”')
PRINTER_QUEUE=${PRINTER_QUEUE:-Brother_QL_820NWB}

echo "=== Test-Label wird generiert ==="
/usr/bin/python3 "$KIT_DIR/scripts/generate-test-label.py" "$PDF_OUT" || {
  echo "Python-PDF-Generator fehlgeschlagen. Fallback: vorgefertigtes PDF aus assets/"
  if [[ -f "$KIT_DIR/assets/test-label.pdf" ]]; then
    cp "$KIT_DIR/assets/test-label.pdf" "$PDF_OUT"
  else
    echo "Kein Fallback-PDF vorhanden. Exit."
    exit 1
  fi
}

if [[ ! -s "$PDF_OUT" ]]; then
  echo "PDF leer oder fehlt: $PDF_OUT"
  exit 1
fi

echo "PDF generiert: $PDF_OUT ($(stat -f%z "$PDF_OUT") Bytes)"
echo
echo "=== Sende an Drucker: $PRINTER_QUEUE ==="
lp -d "$PRINTER_QUEUE" -o PageSize=Custom.29x90mm "$PDF_OUT"
echo
echo "Drucke gerade… Label sollte in 2-3 Sekunden kommen."
echo
echo "Prüfkriterien:"
echo "  ✓ Label ist ~29mm x 90mm (nicht quadratisch!)"
echo "  ✓ Barcode ist oben, klar lesbar"
echo "  ✓ Text 'VOD TEST LABEL' deutlich sichtbar"
echo "  ✓ Ruler-Markierungen 0..90mm sichtbar"
echo
echo "Wenn das Label WINZIG ist (~29x30mm quadratisch):"
echo "  → Drucker ist noch im P-touch Template Mode."
echo "  → Siehe docs/PRINTER_WEB_CONFIG.md und stelle Command Mode auf Raster."
echo
echo "Wenn das Label die KORREKTE Größe hat:"
echo "  → Print-Pipeline ist OK. Weiter mit scanner/SCANNER_SETUP.md"
