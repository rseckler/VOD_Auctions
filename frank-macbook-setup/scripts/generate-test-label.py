#!/usr/bin/env python3
"""
Generiert ein Test-Label-PDF (29mm x 90mm portrait) mit Ruler + Pseudo-Barcode.
Pure stdlib — funktioniert mit /usr/bin/python3 ohne weitere Deps.

Usage: python3 generate-test-label.py /tmp/out.pdf
"""
import sys
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: generate-test-label.py <out.pdf>", file=sys.stderr)
    sys.exit(1)

out_path = Path(sys.argv[1]).resolve()

# PDF-Koordinaten: 1mm = 2.835 pt
MM = 2.835
LABEL_W = 29 * MM      # 82.215 pt
LABEL_H = 90 * MM      # 255.15 pt
MARGIN = 2 * MM

# Content-Stream bauen.
# Der Content wird -90° rotiert, damit wir in einem virtuellen 90mm-breiten
# × 29mm-hohen "Landscape-Frame" zeichnen können. Das ist die gleiche Strategie
# wie in backend/src/lib/barcode-label.ts.
WIDTH_LS = LABEL_H   # 90mm nach Rotation
HEIGHT_LS = LABEL_W  # 29mm nach Rotation

cmds = []
cmds.append("q")  # save graphics state

# Hintergrund weiß (eigentlich Default, aber explizit)
cmds.append(f"1 1 1 rg")
cmds.append(f"0 0 {LABEL_W:.3f} {LABEL_H:.3f} re f")

# Rotation -90° + Translation (affine-Matrix)
# [cos(-90) sin(-90) -sin(-90) cos(-90) tx ty] = [0 -1 1 0 tx ty]
# Mit tx=0, ty=LABEL_H werden wir vom Original-Origin "(0,0)" so transformiert,
# dass der neue Origin in der linken-unteren Ecke des Landscape-Frames landet.
cmds.append(f"0 -1 1 0 0 {LABEL_H:.3f} cm")
# Jetzt: x-Achse nach rechts (alte y-Achse), y-Achse nach oben (alte -x-Achse)
# Frame: (0,0) bis (WIDTH_LS, HEIGHT_LS) = (90mm, 29mm)

# Rahmen innen (hellgrau)
cmds.append("0.4 0.4 0.4 RG")
cmds.append("0.5 w")
cmds.append(f"{MARGIN:.3f} {MARGIN:.3f} {WIDTH_LS - 2*MARGIN:.3f} {HEIGHT_LS - 2*MARGIN:.3f} re S")

# Pseudo-Barcode: 24 Balken alternierend dick/dünn, 70% Breite zentriert, 9mm hoch
cmds.append("0 0 0 rg")
bar_total_w = 0.70 * WIDTH_LS
bar_x_start = (WIDTH_LS - bar_total_w) / 2
bar_y = HEIGHT_LS - 3*MM - 9*MM
bar_h = 9 * MM
num_bars = 24
unit = bar_total_w / (num_bars * 2)
for i in range(num_bars):
    is_thick = (i % 3) == 0
    w = unit * (2 if is_thick else 1)
    x = bar_x_start + i * unit * 2
    cmds.append(f"{x:.3f} {bar_y:.3f} {w:.3f} {bar_h:.3f} re f")

# Text: "VOD-TESTLABEL" unter Barcode
cmds.append("BT")
cmds.append("/F1 8 Tf")
cmds.append(f"{bar_x_start:.3f} {bar_y - 2.5*MM:.3f} Td")
cmds.append("(VOD-TESTLABEL) Tj")
cmds.append("ET")

# Haupttitel
cmds.append("BT")
cmds.append("/F2 11 Tf")  # F2 = Bold
main_y = bar_y - 8*MM
cmds.append(f"{MARGIN + 1*MM:.3f} {main_y:.3f} Td")
cmds.append("(VOD TEST LABEL) Tj")
cmds.append("ET")

# Sub-Info
cmds.append("BT")
cmds.append("/F1 7 Tf")
cmds.append(f"{MARGIN + 1*MM:.3f} {main_y - 3.5*MM:.3f} Td")
cmds.append("(Brother QL-820NWB Pipeline Check) Tj")
cmds.append("0 -3.5 Td")  # relative move (in text-space, 1pt = 1pt)
cmds.append("(DK-22210  29 x 90 mm  Raster Mode) Tj")
cmds.append("ET")

# Ruler (Linie + Ticks von 0..90mm)
cmds.append("0 0 0 RG")
cmds.append("0.3 w")
ruler_y = MARGIN + 0.5*MM
cmds.append(f"{MARGIN:.3f} {ruler_y:.3f} m {WIDTH_LS - MARGIN:.3f} {ruler_y:.3f} l S")
for mm in range(0, 91, 5):
    x = MARGIN + mm * MM
    if x > WIDTH_LS - MARGIN:
        break
    tick_h = (2.0 if mm % 10 == 0 else 1.0) * MM
    cmds.append(f"{x:.3f} {ruler_y:.3f} m {x:.3f} {ruler_y + tick_h:.3f} l S")

# Ruler-Beschriftung
for mm in (0, 30, 60, 90):
    x = MARGIN + mm * MM
    if x > WIDTH_LS - MARGIN:
        continue
    cmds.append("BT")
    cmds.append("/F1 5 Tf")
    cmds.append(f"{x + 0.3*MM:.3f} {ruler_y + 2.5*MM:.3f} Td")
    cmds.append(f"({mm}) Tj")
    cmds.append("ET")

cmds.append("Q")  # restore

content_stream = "\n".join(cmds).encode("latin-1")

# PDF-Struktur bauen
def pdf_object(n, body):
    return f"{n} 0 obj\n{body}\nendobj\n".encode("latin-1")

def pdf_string(s):
    return s.encode("latin-1") if isinstance(s, str) else s

objects = []

# 1: Catalog
objects.append(pdf_object(1, "<< /Type /Catalog /Pages 2 0 R >>"))

# 2: Pages
objects.append(pdf_object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"))

# 3: Page
page_body = (
    f"<< /Type /Page /Parent 2 0 R "
    f"/MediaBox [0 0 {LABEL_W:.3f} {LABEL_H:.3f}] "
    f"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> "
    f"/Contents 6 0 R >>"
)
objects.append(pdf_object(3, page_body))

# 4: Font Helvetica (Type1, built-in)
objects.append(pdf_object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"))

# 5: Font Helvetica-Bold
objects.append(pdf_object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"))

# 6: Content Stream
stream_header = f"<< /Length {len(content_stream)} >>\nstream\n".encode("latin-1")
stream_footer = b"\nendstream"
obj6 = b"6 0 obj\n" + stream_header + content_stream + stream_footer + b"\nendobj\n"
objects.append(obj6)

# Zusammenbauen mit Xref
header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
body = bytearray(header)
offsets = []
for obj in objects:
    offsets.append(len(body))
    body.extend(obj)

xref_offset = len(body)
body.extend(f"xref\n0 {len(objects)+1}\n".encode("latin-1"))
body.extend(b"0000000000 65535 f \n")
for off in offsets:
    body.extend(f"{off:010d} 00000 n \n".encode("latin-1"))

trailer = f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("latin-1")
body.extend(trailer)

out_path.write_bytes(bytes(body))
print(f"PDF geschrieben: {out_path} ({len(body)} Bytes)")
