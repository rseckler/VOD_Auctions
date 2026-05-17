# Session-Log — Platform Migration: Dokumenten-Bündel

**Datum:** 2026-05-16 → 2026-05-17
**Typ:** Konzeption / Dokumentation (kein Code, kein Deploy)
**Ergebnis:** Neuer Ordner `docs/Platform Migration/` mit README + 7 Dokumenten.

---

## Auftrag

Frank und Robin wollen tape-mag.com und vod-records.com auf die neue Plattform überführen bzw. darauf aufbauen. Die über ~15 Dokumente verstreuten Vorüberlegungen sollten kritisch geprüft, konsolidiert und sauber gebündelt werden — Analyse, Strategie/Konzept, Technik, Umsetzungsplan.

## Erstellt — `docs/Platform Migration/`

| Datei | Inhalt |
|---|---|
| `README.md` | Index, Zielbild, Quelldoku-Verweise |
| `1_ANALYSE.md` | Bestandsaufnahme + 8 kritische Befunde |
| `2_STRATEGIE_KONZEPT.md` | Ziel-Architektur, Marken-Strategie, Membership-Modell, 11 Entscheidungen |
| `3_TECHNISCHES_KONZEPT.md` | Quell-/Zielsysteme, Datenmapping, Shop-Cutover, Membership-System, SEO-Redirects, Decommissioning |
| `4_UMSETZUNGSPLAN.md` | 7-Phasen-Plan, Owner, Abhängigkeiten, Risiko-Register |
| `5_SEO_KONZEPT.md` | SEO-Power trotz Paywall — Drei-Zonen-Modell, zwei Szenarien |
| `6_FRANK_AGENDA.md` | Entscheidungsvorlage — alle 11 offenen Entscheidungen |
| `7_DESIGN_PROMPT.md` | Fertiger Prompt für UX/UI-Konzepte (tape-mag + VOD Records) |

## Im Verlauf geklärte Fakten (Korrekturen von Robin)

Mehrere Annahmen mussten während der Session korrigiert werden — die Endfassung der Dokumente ist korrekt:

1. **Kein Shopify.** Ein älteres Verzeichnis `VOD/tape-mag-migration/` erwähnt eine Shopify-Migration — irrelevant/abgehakt. Aus allen Dokumenten entfernt.
2. **Plattform-Landschaft:**
   - **tape-mag** = Erlebnis-/Archivplattform — bleibt erhalten, wird als neue App neu gebaut.
   - **VOD Records** = das Plattenlabel (eigene Editionen, 20+ Jahre) — offener Store, **membership-frei**.
   - **VOD Auctions** = Marktplatz-Plattform (Auktion + Direktverkauf, auch Dritt-Verkäufer) — **membership-gegated**.
3. **Architektur:** Ein gemeinsames Fundament (VOD_Auctions-Stack); tape-mag = eigene App mit geteilter Katalog-DB; VOD Records + VOD Auctions = eine Plattform, mehrere Domains.
4. **Monetarisierung:** Membership-Modell statt Verkaufsprovision (Basis ~€2-3/Mo, Seller-Tier mit Listing-Kontingent).
5. **tape-mag-Zugang:** offen — Frank/Robin prüfen, ob auch tape-mag membership-gegated wird (SEO-kritisch → Szenario-Konzept in Dok. 5).
6. **Design:** beide Plattformen teilen **dieselbe Designsprache** (weiterentwickeltes „Vinyl Culture"-System).

## Memory

`project_platform_landscape.md` angelegt/aktualisiert — Plattform-Landschaft, „nie Shopify", Membership-Modell, tape-mag-Gate offen.

## Nächste Aktion

**Frank-Sitzung** (Umsetzungsplan Phase 0.1): die 11 Entscheidungen aus `6_FRANK_AGENDA.md` durchgehen — allen voran #4 (Kommissionsmodell, kritischer Pfad, StB) und #11 (tape-mag-Zugang, SEO-kritisch). Danach Steuerberater-Termin für §25a/Kommission.

## Status

Dokumentation abgeschlossen. Kein Code geändert, kein Deploy. Dateien lokal, **nicht committet**.
