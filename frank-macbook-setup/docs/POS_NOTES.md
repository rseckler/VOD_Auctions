# POS Kasse — Notizen für Franks MacBook

**Status:** Phase P0 Dry-Run (Flag ON, TSE = DRY_RUN).
**URL:** https://admin.vod-auctions.com/app/pos
**Konzept-Doku:** [`../../docs/optimizing/POS_WALK_IN_KONZEPT.md`](../../docs/optimizing/POS_WALK_IN_KONZEPT.md)

---

## Was Frank auf dem MacBook braucht

| Komponente | Zustand nach `install.sh` |
|---|---|
| Web-Browser (Safari) | ✅ Vorinstalliert |
| Admin-Login | ✅ via Safari-Web-App im Dock |
| Barcode-Scanner (BCST-70) | ✅ nach `scanner/SCANNER_SETUP.md` |
| A4/Bon-Drucker für Quittung | ⚠️ NICHT Teil dieses Kits |
| TSE-Hardware | ⏸️ Phase P0 = Dry-Run, nicht real. Kommt mit StB-Freigabe (P1+). |
| SumUp Card-Terminal | ⏸️ Externes Gerät, nicht via MacBook |

---

## A4-Drucker anbinden

POS-Quittungen sind A6-PDFs (halbe A4-Seite, pdfkit-generiert, `/admin/pos/transactions/:id/receipt`). Der Brother QL-820NWB kann das **nicht** drucken (nur 29mm-Labels).

**Optionen:**
1. **Franks vorhandener Büro-A4-Drucker** (wenn via AirPrint oder USB angeschlossen)
   - Systemeinstellungen → Drucker & Scanner → + → auswählen
   - Sollte als „Standard" gesetzt sein (gilt dann für POS-Quittungen via Browser-Print)
2. **Bondrucker (Epson/Star TM-Serie)** — nicht Teil dieses Kits, aber vorgesehen für Phase P1
3. **Kein Druck** — im POS die "Quittung per E-Mail" Option nutzen (wenn Kunde vorhanden und angelegt)

---

## POS-Ablauf im Shop

1. Admin-Web-App starten (Dock-Icon)
2. Sidebar → **POS** → **Terminal**
3. Session startet automatisch (UUID-ID bleibt im Hintergrund)
4. **Scannen:** Barcode-Scanner → Artikel landet in Cart
5. **Kunden-Panel (rechts):**
   - Default: Anonym (Laufkundschaft)
   - Bei Stammkunde: Suche (top-10 Live-Search)
   - Neu: Minimal (E-Mail + Name) oder vollständig (mit Rechnungsadresse)
6. **Zahlungsart:**
   - Bar (mit Quick-Amount-Grid + Wechselgeld-Anzeige)
   - SumUp (Karte) — extern verarbeitet, nur Betrag eingeben
   - PayPal (Link schicken oder QR)
   - Überweisung (für Rechnungs-Kunden)
7. **Rabatt (optional):** EUR oder Prozent
8. **Checkout:**
   - Transaction wird angelegt (item_type='walk_in_sale')
   - Inventory-Exemplar wird als sold markiert (Status change + movement)
   - Quittung-PDF wird generiert
   - Autoprint via `window.print()` (Browser-Dialog) — wenn QZ Tray eingerichtet ist, direkt silent auf Standard-Drucker

---

## TSE-Banner (gelb) ignorieren

In Phase P0 läuft **kein echter TSE** (Technische Sicherheitseinrichtung nach §146a AO). Banner oben: „⚠ Dry-Run — keine fiskale Signatur. Nicht für echte Verkäufe!"

Phase P1 (nach StB-Freigabe und fiskaly-Integration):
- Banner verschwindet
- Jede Transaction bekommt `tse_signature` aus fiskaly-API
- QR-Code auf Quittung mit Signatur

Für Dry-Run-Tests: Banner einfach ignorieren. Robin wird den Dry-Run-Modus entfernen sobald es Grünes Licht gibt.

---

## Scanner-Hinweise im POS

Der Scanner reagiert genauso wie im Inventur-Modus:
- **VOD-XXXXXX** (eigene Labels) → Exemplar-Lookup, direkter Add-to-Cart
- **Fremde Barcodes** (EAN/UPC auf Platten-Cover) → Fallback-Suche über `catalogNumber`; wenn nix gefunden → Toast "Nicht erkannt"

Wenn der gleiche Artikel 2× gescannt wird (z.B. Cover + Label desselben Stücks) → POS erkennt das, erhöht **nicht** die Menge, zeigt Toast "Dieses Exemplar ist schon im Warenkorb".

---

## Customer-Anlage im POS

Für Rechnungen mit DSGVO-konformen Daten: **Neu + Adresse**. Legt parallel einen Medusa-Customer an (ohne Login-Account) — erscheint später im CRM (`/app/crm`).

Minimal (anonymisiert): nur E-Mail (für digitale Quittung) — kein CRM-Eintrag.

Anonym: gar nichts — Transaction hat `customer_id=NULL`. Keine Rechnung möglich, nur Kassenbon (Pflicht bei > €15 nach §146a AO).

---

## Troubleshooting POS

Siehe [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) → Sektion POS-Kasse.
