# Anleitung — Alte VOD-Rechnungen finden (Mac Studio)

**Ziel:** Auf der externen RAID nach alten Rechnungen (vor 2019) suchen und sie nach `~/Documents/VOD Rechnungen` kopieren.

---

## So geht's

1. **RAID anstecken.**
2. **Terminal öffnen** (⌘+Leertaste → „Terminal" tippen → Enter).
3. **Diese eine Zeile reinkopieren und Enter drücken:**

```bash
curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/scan-old-invoices.sh | bash
```

4. Beim ersten Mal installiert sich Homebrew + ein PDF-Tool selber (~1 Min, einmalig).
5. Du bekommst eine Liste der Laufwerke. **Nummer der RAID eintippen + Enter.**
6. Skript scannt alle PDFs durch (~17 PDFs/Sek). Fertig signalisiert „**Fertig!**" und Finder öffnet automatisch den Ziel-Ordner.

Das war's. Bescheid geben wieviele PDFs am Ende drin sind.

---

## Falls was schiefgeht

| Problem | Lösung |
|---|---|
| „Keine Laufwerke unter /Volumes gefunden" | RAID nicht erkannt. Im Finder prüfen ob sie in der Sidebar auftaucht. Aus-/Anstecken hilft oft. |
| Scan läuft sehr langsam | Normal bei riesigen Platten. Ctrl+C bricht ab, beim nächsten Aufruf wird automatisch weitergemacht (resume). |
| Nichts gefunden | Sag Robin Bescheid — alte Rechnungen haben evtl. ein anderes Layout, dann erweitere ich die Erkennungs-Patterns. |
| Sonst irgendwas | Screenshot machen + Robin schicken. |

---

**Was passiert technisch?** Das Skript installiert Homebrew + `poppler` (PDF-Text-Reader), lädt das Such-Skript aus dem Repo, scannt jedes PDF auf der Platte nach „VOD-Records" / „Alpenstrasse 25" / „Rechnung Nr.", und kopiert alle starken Treffer (sortiert nach Jahr) nach `~/Documents/VOD Rechnungen`. Die Originale auf der RAID bleiben unangetastet — nur kopiert, nicht verschoben. Eine Trefferliste landet als TSV im selben Ordner (`_scan-results.tsv`) für Robin zum Nachreviewen.
