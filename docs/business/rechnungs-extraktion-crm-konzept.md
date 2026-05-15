# Konzept: Rechnungs-Extraktion, E-Mail-Matching und CRM-Import

## 1. Ziel

Aus den vorhandenen PDF-Rechnungen sollen Kunden-, Adress-, Rechnungs- und Transaktionsdaten strukturiert extrahiert werden. Die Daten sollen anschliessend in ein eigenes CRM-System ueberfuehrt werden.

Zusaetzlich sollen zu den erkannten Kontakten passende E-Mail-Adressen aus einem grossen IMAP-Postfach gesucht und mit einem nachvollziehbaren Confidence Score gespeichert werden.

Das Ziel ist keine einmalige manuelle Datenkonvertierung, sondern eine robuste, wiederholbare Datenpipeline:

- PDF-Rechnungen einlesen
- relevante Daten extrahieren
- Namen in Vorname und Nachname normalisieren
- Adressen und Laender strukturieren
- Transaktionen und Positionen speichern
- E-Mail-Adressen aus IMAP finden
- Treffer pruefen und bewerten
- Daten in das CRM uebergeben

## 2. Ausgangslage

Die vorhandenen Rechnungen liegen im Projektverzeichnis unter:

```text
Monkey Office/Rechnungen/<Jahr>/*.pdf
```

Analysierter Bestand:

| Jahr | Anzahl PDFs |
| --- | ---: |
| 2019 | 1.839 |
| 2020 | 1.784 |
| 2021 | 1.638 |
| 2022 | 1.098 |
| 2023 | 1.564 |
| 2024 | 1.090 |
| 2025 | 1.307 |
| 2026 | 255 |
| **Gesamt** | **10.575** |

Dokumenttypen:

| Prefix | Dokumenttyp | Anzahl |
| --- | --- | ---: |
| RG | Rechnung | 10.525 |
| KR | Korrekturrechnung | 37 |
| PR | Proformarechnung | 12 |
| AR | Abschlagsrechnung | 1 |

Die PDFs stammen aus MonKey Office und besitzen ein relativ stabiles Layout. Ein Test mit `pdftotext` war fuer alle Dateien erfolgreich. Damit ist eine textbasierte Extraktion moeglich; OCR ist nach aktuellem Stand nicht als Standardverfahren erforderlich.

## 3. Zu extrahierende Informationen

### 3.1 Kundendaten

- Kundennummer, z. B. `ADR-015786`
- Name als Rohwert
- Vorname
- Nachname
- Firmenname, falls erkennbar
- Adressblock als Rohwert
- Strasse und Hausnummer
- Zusatzzeilen, z. B. `c/o`, Firmenzusatz, Apartment, Unit
- Postleitzahl
- Ort
- Region/Bundesland, falls vorhanden
- Land oder ISO-Laendercode
- externe Referenz, falls vorhanden
- spaeter: primaere E-Mail-Adresse
- spaeter: E-Mail-Matching-Quelle und Confidence Score

### 3.2 Rechnungsdaten

- Rechnungsnummer
- Dokumenttyp: Rechnung, Korrekturrechnung, Proformarechnung, Abschlagsrechnung
- Rechnungsdatum
- Lieferdatum
- Kundennummer
- externe Referenz
- Ansprechpartner, z. B. `Frank`
- Waehrung, voraussichtlich `EUR`
- Gesamt Brutto
- Gesamt Steuer
- Gesamt Netto
- Zahlungsbedingungen
- Steuerhinweis, z. B. steuerfreie Ausfuhrlieferung
- bei Korrekturrechnungen: Ursprungsrechnung und Ursprungsdatum
- Pfad zur PDF-Datei
- Datei-Hash
- Rohtext der PDF
- Extraktionsstatus und Warnungen

### 3.3 Positionsdaten

- Rechnungsnummer
- Positionsnummer
- Artikelnummer
- Artikelname
- Menge
- Einheit, falls vorhanden
- Umsatzsteuersatz
- Einzelpreis
- Gesamtpreis
- Kennzeichen fuer Versand/Porto
- Rohzeile
- Warnungen bei unvollstaendigen oder mehrdeutigen Positionen

## 4. Empfohlene Speicherung

Fuer den CRM-Import sollte nicht direkt eine flache CSV als Hauptquelle verwendet werden. Rechnungen besitzen relationale Strukturen:

- ein Kunde kann viele Rechnungen haben
- eine Rechnung hat viele Positionen
- ein Kontakt kann mehrere moegliche E-Mail-Adressen haben
- ein CRM-Sync kann erfolgreich, unvollstaendig oder fehlerhaft sein

Empfohlen wird deshalb ein relationales Staging-Modell. Fuer lokale Entwicklung ist SQLite ausreichend. Fuer den produktiven Service auf einem VPS sollte PostgreSQL verwendet werden.

## 5. Datenmodell

### 5.1 `contacts`

```text
id
customer_no
first_name
last_name
display_name
company_name
raw_name
raw_address
address_line_1
address_line_2
postal_code
city
region
country
country_code
email_primary
email_confidence
email_source
crm_contact_id
created_from_invoice_no
created_at
updated_at
```

Hinweis: `raw_name` und `raw_address` sollten immer gespeichert werden. Auch wenn Normalisierung fehlschlaegt, bleibt dadurch die Originalinformation erhalten.

### 5.2 `transactions`

```text
id
invoice_no
document_type
customer_no
invoice_date
delivery_date
external_reference
contact_person
currency
total_net
total_tax
total_gross
payment_terms
tax_note
correction_for_invoice_no
correction_for_invoice_date
source_pdf_path
source_pdf_hash
raw_text
extraction_status
extraction_warnings
crm_transaction_id
created_at
updated_at
```

### 5.3 `transaction_items`

```text
id
invoice_no
position_no
article_no
article_name
quantity
unit
vat_rate
unit_price
line_total
is_shipping
raw_line
extraction_warning
created_at
updated_at
```

### 5.4 `email_candidates`

```text
id
contact_id
customer_no
email
name_seen
source_folder
source_message_id
matched_by
confidence
accepted
rejected
created_at
updated_at
```

### 5.5 `extraction_runs`

```text
id
started_at
finished_at
parser_version
files_total
files_ok
files_warning
files_failed
notes
```

### 5.6 `crm_export_log`

```text
id
contact_id
invoice_no
target_crm
exported_at
crm_record_id
status
error_message
payload_hash
```

## 6. Service-Architektur

Es ist sinnvoll, einen kleinen Service zu schreiben und auf einem VPS zu betreiben. Der Service sollte als ETL- und Matching-System aufgebaut werden.

### 6.1 Komponenten

```text
PDF Importer
  -> findet neue oder geaenderte PDFs
  -> berechnet Datei-Hash
  -> extrahiert Text

Invoice Parser
  -> liest MonKey-Office-Layout
  -> extrahiert Header, Adresse, Positionen und Summen
  -> erzeugt Validierungswarnungen

Name Normalizer
  -> trennt Vorname und Nachname
  -> erkennt moegliche Firmenkunden
  -> bewahrt Rohwerte

IMAP Indexer
  -> durchsucht grosses Postfach
  -> indexiert From, To, Cc, Reply-To, Betreff, Datum und Textauszuege
  -> optional: durchsucht Mailtexte nach Rechnungsnummern, Kundennummern und Namen

Contact Matcher
  -> verknuepft Kontakte mit moeglichen E-Mail-Adressen
  -> berechnet Confidence Scores
  -> speichert mehrere Kandidaten

Review Queue
  -> zeigt unsichere Treffer zur manuellen Pruefung
  -> erlaubt Akzeptieren/Ablehnen von E-Mail-Kandidaten

CRM Sync
  -> uebergibt Kontakte und Transaktionen an das eigene CRM
  -> speichert CRM-IDs
  -> verhindert Dubletten und Mehrfachexporte
```

### 6.2 Technologievorschlag

Fuer den VPS:

- Docker Compose
- PostgreSQL
- Python mit FastAPI fuer API und Admin-Endpunkte
- separater Worker-Prozess fuer PDF- und IMAP-Jobs
- SQLAlchemy oder ein vergleichbarer ORM/Query-Layer
- Alembic fuer Datenbankmigrationen
- `.env` fuer Zugangsdaten
- strukturierte Logs

Alternativ ist Node.js moeglich, falls das bestehende CRM-Projekt bereits stark auf Node/TypeScript basiert. Die finale Entscheidung sollte sich am bestehenden Projekt orientieren.

## 7. Name-Splitting

Der Name muss fuer das CRM als Vorname und Nachname vorliegen. Gleichzeitig duerfen internationale Namen, Firmen und Sonderfaelle nicht kaputt normalisiert werden.

Empfohlene Felder:

```text
raw_name      = "Andrew Kessler"
display_name  = "Andrew Kessler"
first_name    = "Andrew"
last_name     = "Kessler"
company_name  = null
```

Bei Firmenkunden:

```text
raw_name      = "HHV Handels GmbH"
display_name  = "HHV Handels GmbH"
first_name    = null
last_name     = null
company_name  = "HHV Handels GmbH"
```

Bei unsicheren Faellen sollte das System keine aggressive Korrektur erzwingen. Besser ist:

- Rohwert speichern
- bestmoegliche Vermutung speichern
- Confidence oder Warnung setzen
- spaetere manuelle Korrektur erlauben

## 8. E-Mail-Matching aus IMAP

Das grosse IMAP-Postfach sollte nicht fuer jeden Kontakt immer wieder komplett durchsucht werden. Sinnvoll ist ein lokaler Suchindex oder mindestens eine Metadaten-Tabelle.

### 8.1 Zu indexierende Mailfelder

- Message-ID
- Ordner
- Datum
- From
- Reply-To
- To
- Cc
- Betreff
- Textauszug
- erkannte E-Mail-Adressen
- erkannte Namen
- erkannte Kundennummern, z. B. `ADR-...`
- erkannte Rechnungsnummern, z. B. `RG-...`, `KR-...`

### 8.2 Matching-Signale

Sehr starke Signale:

- Kundennummer in E-Mail gefunden
- Rechnungsnummer in E-Mail gefunden
- exakte E-Mail aus bekannter Kundenhistorie

Starke Signale:

- voller Name im Mailheader
- voller Name im Mailtext oder in der Signatur
- Kombination aus Name und Ort/Land

Mittlere Signale:

- Nachname plus Land
- Vorname plus Nachname fuzzy
- Firmenname plus Domain

Schwache Signale:

- nur Vorname
- nur Nachname
- generische Adressen wie `info@`, `sales@`, `office@`

### 8.3 Confidence Score

Jeder Kandidat sollte einen Score erhalten:

```text
0.90 - 1.00   sehr sicher, kann automatisch uebernommen werden
0.70 - 0.89   wahrscheinlich, aber Review empfohlen
0.40 - 0.69   unsicher, nur als Kandidat anzeigen
0.00 - 0.39   nicht automatisch verwenden
```

Beispiel:

```text
Kontakt: Andrew Kessler

Kandidaten:
- andrew.kessler@example.com    confidence 0.94
- akessler@example.net          confidence 0.77
- info@example.com              confidence 0.41
```

## 9. Validierung und Qualitaetssicherung

Jeder Import sollte validiert werden.

Pflichtfelder fuer Rechnungen:

- Rechnungsnummer
- Dokumenttyp
- Rechnungsdatum
- Kundennummer
- Kundenname
- mindestens eine Position
- Gesamtbetrag

Plausibilitaetspruefungen:

- Stimmen Positionssummen und Rechnungssumme ungefaehr ueberein?
- Sind negative Betraege nur bei Korrekturrechnungen vorhanden?
- Fehlen Einzelpreise oder Positionssummen?
- Gibt es doppelte Rechnungsnummern?
- Ist das Rechnungsjahr im Dateipfad plausibel zum Rechnungsdatum?

Bekannter Sonderfall:

- Die Abschlagsrechnung `AR-2025-000001` enthaelt eine Porto-Position ohne sichtbaren Einzelpreis/Gesamtpreis. Solche Faelle sollten als Warnung gespeichert und nicht stillschweigend verworfen werden.

## 10. CRM-Integration

Die CRM-Integration sollte erst nach dem Staging erfolgen. Dadurch bleibt die Extraktion unabhaengig vom Zielsystem.

Empfohlene Reihenfolge:

1. Kontakte im Staging erzeugen
2. Dubletten pruefen
3. E-Mail-Kandidaten zuordnen
4. sichere E-Mails uebernehmen
5. unsichere Faelle manuell pruefen
6. Kontakte ins CRM exportieren
7. CRM-Kontakt-IDs zurueckspeichern
8. Transaktionen/Rechnungen exportieren
9. Positionsdaten exportieren oder als Detaildaten anhaengen

Wichtig ist eine klare Idempotenz:

- dieselbe Rechnung darf nicht mehrfach als neue Transaktion angelegt werden
- derselbe Kontakt darf nicht mehrfach angelegt werden
- jede CRM-Operation sollte im `crm_export_log` nachvollziehbar sein

## 11. Datenschutz und Betrieb

Da personenbezogene Daten und E-Mail-Inhalte verarbeitet werden, sollte der Service vorsichtig betrieben werden.

Empfehlungen:

- IMAP-Zugangsdaten nur ueber `.env` oder Secret Store
- Datenbank nicht oeffentlich erreichbar machen
- VPS-Firewall aktivieren
- Admin-UI nur per VPN, Basic Auth oder SSO schuetzen
- regelmaessige Backups
- Logs ohne vollstaendige Mailinhalte
- Rohdatenzugriff beschraenken
- Loesch- oder Anonymisierungsstrategie fuer nicht benoetigte Mailtextauszuege

## 12. Umsetzungsplan

### Phase 1: Lokaler Prototyp

- PDF-Inventar erstellen
- Texte mit `pdftotext -layout` extrahieren
- SQLite-Staging-Datenbank anlegen
- Tabellen fuer Kontakte, Transaktionen und Positionen erstellen
- Parser fuer RG/KR/PR/AR implementieren
- ersten Testlauf auf ca. 100 PDFs aus unterschiedlichen Jahren ausfuehren

### Phase 2: Vollstaendige PDF-Extraktion

- Parser gegen alle 10.575 PDFs laufen lassen
- Fehler- und Warnreport erzeugen
- Sonderfaelle nachschaerfen
- Summen- und Pflichtfeldvalidierung einbauen
- Export als CSV und/oder JSON bereitstellen

### Phase 3: Name- und Adressnormalisierung

- Vorname/Nachname-Regeln implementieren
- Firmenkunden erkennen
- Laender normalisieren
- manuelle Korrekturmoeglichkeit fuer unsichere Namen vorsehen

### Phase 4: IMAP-Indexer

- IMAP-Verbindung konfigurieren
- relevante Ordner auswaehlen
- Mail-Metadaten indexieren
- Textauszuege und erkannte IDs speichern
- inkrementelle Synchronisierung einbauen

### Phase 5: E-Mail-Matching

- Matching-Regeln definieren
- Confidence Score berechnen
- mehrere Kandidaten pro Kontakt speichern
- sichere Treffer automatisch setzen
- Review Queue fuer unsichere Treffer bauen

### Phase 6: CRM-Sync

- Schnittstelle zum eigenen CRM anbinden
- Kontakt-Import implementieren
- Transaktions-Import implementieren
- Positionsdaten uebergeben
- Export-Log und Wiederholbarkeit sicherstellen

### Phase 7: VPS-Betrieb

- Docker Compose Setup
- PostgreSQL verwenden
- Worker und API trennen
- Backups, Logs und Monitoring einrichten
- regelmaessige Jobs planen

## 13. Empfehlung

Ja, ein kleiner Service auf dem VPS ist fuer dieses Vorhaben sinnvoll. Die Datenmenge ist gross genug, die Anforderungen sind wiederkehrend, und durch IMAP-Matching sowie CRM-Sync entsteht ein Prozess, der nachvollziehbar, wiederholbar und kontrollierbar sein sollte.

Der wichtigste Architekturgrundsatz ist:

> Erst sauber in ein eigenes Staging-Modell extrahieren, validieren und anreichern. Danach erst ins CRM schreiben.

Damit bleibt das System flexibel, auditierbar und sicher gegen Dubletten oder fehlerhafte automatische Zuordnungen.
