# RSE-291: Multi-Seller Marketplace — Vollständiges Konzept

**Erstellt:** 2026-04-03
**Status:** Konzeptphase — Entscheidungsvorlage für Robin Seckler / Frank Bull
**Betreiber:** VOD Records, Friedrichshafen, Deutschland (Frank Bull)
**Entwicklung:** digital spread UG, Eriskirch (Robin Seckler)

---

## 1. Executive Summary

VOD Auctions soll von einer Single-Seller-Plattform (Frank Bull verkauft eigene Bestände) zu einem kuratierten Multi-Seller-Marketplace ausgebaut werden. Andere Sammler und Händler können eigene Vinyl-Bestände über die Plattform versteigern oder direkt verkaufen.

**Kernfragen dieses Konzepts:**
- Wie strukturieren wir das rechtlich und steuerlich?
- Welche Regulierungen greifen für einen Marketplace-Betreiber in Deutschland?
- Wie handhaben eBay, Discogs, Catawiki das?
- Welches Fee-Modell ist marktgerecht?
- Wie setzen wir Payment/Payout technisch um?

---

## 2. Marktvergleich — Wie machen es die Großen?

### Fee-Modelle im Überblick

| Plattform | Verkäufer-Fee | Käufer-Fee | Gesamt | Modell |
|-----------|-------------|-----------|--------|--------|
| **eBay DE (gewerbl.)** | 6,5–12% + €0,45 | 0% | 6,5–12% | Auktion + Festpreis |
| **eBay DE (privat)** | 0% | 0% | 0% (Werbeeinnahmen) | C2C |
| **Discogs** | 9% (inkl. Versand) | 0% | 9% | Festpreis-Marktplatz |
| **Catawiki** | 12,5% | 9% + €3 | ~21,5% | Kuratierte Auktionen |
| **Heritage Auctions** | 0–25% (Staffel) | 20% (erste $400K) | 20–45% | Premium-Auktionshaus |
| **Etsy** | ~11–13% gesamt | 0% | 11–13% | Handwerks-Marktplatz |
| **Reverb (Musik)** | 5% + Payment | 0% | ~7,7% | Musik-Equipment |
| **Vinted** | 0% | ~5% + fix | ~5% | C2C Fashion |

### Positionierung VOD Auctions

VOD Auctions ist am ehesten mit **Catawiki** vergleichbar:
- Kuratierte Themen-Auktionen (nicht jeder kann alles listen)
- Nischen-Expertise (Industrial/Experimental Vinyl vs. Catawikis breites Sammlerspektrum)
- Premium-Positionierung (Qualität > Quantität)

**Empfohlenes Fee-Modell für VOD Auctions:**

| Fee-Typ | Betrag | Begründung |
|---------|--------|-----------|
| **Verkäufer-Provision** | 10% | Unter Catawiki (12,5%), über Discogs (9%), fair für kuratierten Service |
| **Käufer-Aufschlag** | 0% | Niedrige Einstiegshürde, differenziert von Catawiki/Heritage |
| **Listing-Gebühr** | €0 | Keine Hürde für Seller-Onboarding |
| **Gesamt Platform Take** | **10%** | Wettbewerbsfähig, nachhaltiges Geschäftsmodell |

**Staffel-Option (Phase 2):**
- 0–50 Verkäufe/Jahr: 10%
- 51–200 Verkäufe/Jahr: 8%
- 200+ Verkäufe/Jahr: 6%

---

## 3. Rechtliche & Steuerliche Rahmenbedingungen

### 3.1 Unternehmensstruktur

**Empfehlung: Separate GmbH für den Marketplace**

| Aspekt | Empfehlung | Begründung |
|--------|-----------|-----------|
| **Rechtsform** | GmbH (€25.000 Stammkapital) | Seriösität gegenüber Sellern + Payment-Providern. UG (€1) kann bei Mangopay/Stripe Connect Probleme machen |
| **Separierung** | Eigene GmbH, getrennt von VOD Records | Haftungsisolierung (§25e UStG Mithaftung), saubere Finanzen, Exit-Option |
| **Geschäftsführer** | Frank Bull (ggf. + Robin Seckler) | Betreiber muss natürliche Person sein |
| **Sitz** | Deutschland (Friedrichshafen) | Ware liegt in DE, Hauptmarkt DE/EU |

**Warum separate GmbH statt bestehende Struktur?**
1. **§25e UStG Mithaftung:** Als Marketplace-Betreiber haftet man gesamtschuldnerisch für nicht abgeführte USt der Seller. Diese Haftung soll nicht auf VOD Records durchschlagen.
2. **Saubere Buchhaltung:** Eigenverkäufe (VOD Records) vs. Provisionseinnahmen (Marketplace) klar getrennt.
3. **Exit-Optionalität:** Marketplace kann separat verkauft/skaliert werden.
4. **Regulatorik:** DAC7-Meldepflichten, ZAG-Konformität sauber einer Entität zugeordnet.

### 3.2 Steuerliche Pflichten als Marketplace-Betreiber

#### §22f UStG — Aufzeichnungspflichten

Ab dem ersten Drittanbieter-Verkauf muss der Marketplace-Betreiber **pro Seller** aufzeichnen:
- Vollständiger Name, Anschrift
- Steuernummer oder USt-IdNr.
- Gültige Erfassungsbescheinigung (F22-Zertifikat)
- Transaktionsdetails (Ort, Zeitpunkt, Betrag)

**Aufbewahrungsfrist:** 10 Jahre

#### §25e UStG — Gesamtschuldnerische Haftung

Der Marketplace-Betreiber haftet **gesamtschuldnerisch** für nicht abgeführte USt der Seller.

**Safe Harbor:** Haftung entfällt wenn:
- §22f-Aufzeichnungspflichten erfüllt sind, UND
- F22-Bescheinigung oder BZSt-Bestätigung des Sellers vorliegt, UND
- Betreiber keine Kenntnis von Steuerhinterziehung hatte

**Konsequenz:** Vor dem Onboarding jedes gewerblichen Sellers **zwingend F22-Bescheinigung einholen**. Ohne F22 = persönliche Haftung für deren USt-Schulden.

#### DAC7 — Meldepflichten (seit Jan 2023)

Jährliche Meldung an das Bundeszentralamt für Steuern (BZSt) bis **31. Januar** des Folgejahres.

**Pro Seller melden:**
- Name, Geburtsdatum, Anschrift
- Steuer-ID (TIN) + Ausstellungsland
- USt-IdNr. oder Handelsregisternummer (bei Firmen)
- IBAN
- Gesamte Vergütungen des Jahres
- Einbehaltene Provisionen/Gebühren

**Ausnahme:** Gelegenheitsverkäufer mit < 30 Verkäufen UND < €2.000 Gesamtumsatz im Meldezeitraum sind ausgenommen.

#### USt-Situation für den Marketplace selbst

**Kernfrage: Ist VOD Auctions "deemed supplier" (fiktiver Lieferer)?**

**Antwort: NEIN** — unter den aktuellen EU-Regeln und dem verabschiedeten ViDA-Paket (März 2025) wird ein Marketplace nur dann zum fiktiven Lieferer wenn:
1. Importierte Waren ≤ €150 von Nicht-EU-Sellern, oder
2. Intra-EU B2C-Lieferungen von Nicht-EU-Sellern

**Da alle Seller EU-basiert sind (deutsche Sammler/Händler), greift die Deemed-Supplier-Regel NICHT.** Jeder Seller ist selbst für seine USt verantwortlich.

**Die Plattform versteuert nur ihre eigenen Provisionseinnahmen** (10% Provision = Dienstleistung, USt-pflichtig).

#### Kleinunternehmerregelung (§19 UStG) für Seller

Seit 01.01.2025 aktualisierte Grenzen:
- Vorjahr: bis €25.000 (netto)
- Laufendes Jahr: bis €100.000 (netto)

Seller die Kleinunternehmer sind, weisen **keine USt** auf ihren Rechnungen aus. Die Plattform muss:
- Seller-Status (gewerblich/privat/Kleinunternehmer) korrekt erfassen
- Listing-Anzeige entsprechend anpassen (keine separate USt-Ausweisung)

### 3.3 Verbraucherschutz

Die Plattform muss **pro Listing** klar kennzeichnen:

| Seller-Typ | Widerrufsrecht | Gewährleistung | Impressum |
|------------|---------------|----------------|-----------|
| **Gewerblich** | 14 Tage | 2 Jahre | Pflicht |
| **Privat** | Keins | "Wie besehen" | Nicht nötig |
| **Kleinunternehmer** | 14 Tage | 2 Jahre | Pflicht |

**Plattform-Pflicht:** Käufer muss VOR dem Kauf sehen, ob der Seller privat oder gewerblich ist.

### 3.4 Produktsicherheit (GPSR seit Dez 2024)

Seit 13.12.2024 gelten unter der General Product Safety Regulation erweiterte Pflichten für Marketplace-Betreiber:
- Interne Compliance-Prozesse für Produktsicherheit
- Kontaktstelle für Marktüberwachungsbehörden benennen
- Kooperation bei Produktrückrufen

**Für Vinyl-Records:** Geringes Risiko, aber formale Compliance nötig.

---

## 4. Payment & Payout — Technische Umsetzung

### 4.1 Regulatorische Anforderung (ZAG / BaFin)

**Kernfrage: Brauchen wir eine BaFin-Lizenz als Zahlungsinstitut?**

**Antwort: NEIN** — wenn wir einen regulierten Payment-Provider nutzen.

Unter PSD2 und dem deutschen ZAG:
- BaFin-Lizenz nötig wenn die Plattform **Kundengelder in Besitz nimmt**
- **Stripe Connect / Mangopay:** Provider hält Gelder auf eigenem regulierten Treuhandkonto → Plattform berührt das Geld nie → keine BaFin-Lizenz nötig
- **Eigenes Payout-System:** Plattform empfängt Zahlung → verteilt an Seller = **illegal ohne BaFin-Lizenz** (Kosten: ~€100K+ für Compliance, 6–12 Monate Verfahren)

### 4.2 Payment-Provider-Vergleich

| Provider | Gebühren | Escrow | KYC built-in | Empfehlung |
|----------|---------|--------|-------------|-----------|
| **Stripe Connect** | 1,5% + €0,25 (EU) + 0,25% Connect | Manuell | Ja | Schnellster Weg (bereits integriert) |
| **Mangopay** | ab 1,4% + €0,25 | Nativ | Ja | Ideal für Auktionen (Escrow bis Wareneingang) |
| **PayPal Commerce** | ~2,49% + €0,35 | Begrenzt | Ja | Bereits integriert, weniger flexibel |
| **Lemonway** | Individuell | Nativ | Ja | Weniger verbreitet in DACH |

### 4.3 Empfehlung: Stripe Connect (Phase 1) → Mangopay (Phase 2)

**Phase 1 — Stripe Connect Express:**
- Bereits in VOD Auctions integriert → minimaler Entwicklungsaufwand
- Seller erstellen Express-Account (KYC via Stripe-Flow)
- Bei Auktionsende: Stripe splittet Payment automatisch (90% Seller, 10% Plattform)
- Payout an Seller nach Versandbestätigung (manueller Release)
- **Einschränkung:** Kein nativer Escrow — Payout-Hold muss manuell implementiert werden

**Phase 2 — Mangopay (wenn Volumen wächst):**
- Nativer Escrow: Geld wird gehalten bis Käufer Wareneingang bestätigt (oder 14-Tage Auto-Confirm)
- E-Wallet pro Seller: Seller kann Guthaben sammeln und periodisch auszahlen
- Besserer Käuferschutz → mehr Vertrauen
- Nötig bei > €100K Transaktionsvolumen/Monat

### 4.4 Payout-Flow

```
Käufer zahlt €100
    ↓
Stripe/Mangopay hält Zahlung (Escrow)
    ↓
Seller versendet → Tracking-Nr. eingetragen
    ↓
Käufer bestätigt Erhalt (oder 14-Tage Auto-Confirm)
    ↓
Payout an Seller: €90 (€100 - 10% Provision)
Provision an Plattform: €10
```

---

## 5. Seller-Onboarding & Compliance

### 5.1 KYC-Anforderungen (Minimum)

**Für alle Seller:**
- Ausweis (Personalausweis/Reisepass) — via Stripe Connect/Mangopay KYC
- Adressnachweis
- IBAN-Verifizierung
- Steuer-ID (Steuer-Identifikationsnummer)

**Zusätzlich für gewerbliche Seller:**
- Gewerbeanmeldung oder Handelsregisterauszug
- USt-IdNr. (wenn USt-pflichtig)
- **F22-Bescheinigung** (zwingend für §25e Safe Harbor!)
- Impressum-Daten

### 5.2 Seller-Typen

| Typ | Beschreibung | Anforderungen |
|-----|-------------|--------------|
| **Privat-Seller** | Privatperson verkauft eigene Sammlung | Ausweis, Steuer-ID, IBAN. DAC7-Ausnahme wenn < 30 Verkäufe + < €2.000/Jahr |
| **Kleinunternehmer** | Gewerblich, aber unter Schwelle | Gewerbeanmeldung, Steuer-ID, IBAN. Keine USt auf Rechnungen |
| **Business-Seller** | Vollständig USt-pflichtig | Alles oben + USt-IdNr. + F22-Bescheinigung |

### 5.3 Onboarding-Flow

```
1. Seller-Bewerbung
   → Name, E-Mail, Seller-Typ (privat/gewerblich)
   → Beschreibung der Sammlung (Genres, geschätzte Menge, Wertbereich)
   → Referenzen (Discogs-Profil, eBay-Account, etc.)

2. Admin-Review
   → Frank/Robin prüft Bewerbung
   → Qualitäts-Check: Passt der Seller zum kuratierten Ansatz?
   → Approve / Reject mit Begründung

3. KYC-Verifizierung
   → Stripe Connect Express Onboarding (Ausweis, Adresse, Bank)
   → Für gewerbliche: F22-Bescheinigung hochladen
   → Automatische Verifizierung durch Stripe

4. Seller-Agreement
   → Digitale Unterschrift der Seller-AGB
   → Provisionsmodell, Auszahlungsbedingungen, Haftung
   → Verhaltensregeln (Artikelbeschreibung, Fotos, Versand)

5. Seller-Dashboard freigeschaltet
   → Artikel einreichen (Fotos, Beschreibung, Startpreis)
   → Admin reviewed Einreichungen vor Aufnahme in Auktionsblock
```

### 5.4 Kuratiertes Modell — Differenzierung

**VOD Auctions bleibt kuratiert** — nicht jeder kann alles listen:

- Seller reichen Artikel ein → Admin entscheidet über Aufnahme in Themen-Block
- Qualitätskontrolle: Fotos müssen Standard erfüllen, Condition-Beschreibung muss korrekt sein
- Themen-Blöcke bleiben von VOD kuratiert (Titel, Beschreibung, Zeitraum)
- **Seller können KEINE eigenen Auktionen erstellen** — nur Artikel für bestehende/geplante Blöcke einreichen

---

## 6. Logistik & Versand

### 6.1 Versandmodelle

| Modell | Beschreibung | Für VOD Auctions |
|--------|-------------|-----------------|
| **Seller-Versand (Dropshipping)** | Seller versendet direkt an Käufer | Einfachste Variante, kein Lagerrisiko für Plattform |
| **Zentrallager (FBA-Style)** | Seller sendet an VOD-Lager, VOD versendet | Qualitätskontrolle möglich, höhere Kosten |
| **Hybrid** | VOD-eigene Ware aus Lager, Seller-Ware direkt | Flexibel, aber komplex |

**Empfehlung Phase 1: Seller-Versand**
- Seller versendet direkt an Käufer
- Tracking-Nummer Pflicht (wird in Plattform eingetragen)
- Versandkosten trägt Käufer (Seller definiert Versandkosten bei Einreichung)
- VOD gibt Verpackungsrichtlinien vor (Vinyl-sichere Verpackung)

**Empfehlung Phase 2: Hybrid**
- Option für Seller: Ware vorab an VOD-Lager senden
- VOD prüft Condition und versendet gebündelt
- Ermöglicht Combined Shipping über mehrere Seller hinweg

### 6.2 Problematik: Internationaler Versand + Steuern

**Innerhalb DE:** Keine Besonderheiten — Seller versendet, Käufer zahlt.

**Innerhalb EU (B2C):**
- Seller unter €10.000 Fernverkaufsschwelle: Heimat-USt (DE 19%)
- Seller über €10.000: USt des Empfängerlandes (OSS-Registrierung nötig)
- **Plattform-Pflicht:** Seller auf OSS-Pflicht hinweisen

**Außerhalb EU:**
- Exportlieferung = umsatzsteuerfrei (Ausfuhrnachweis nötig)
- Zoll/Einfuhrumsatzsteuer zahlt Käufer im Empfängerland
- **Plattform-Pflicht:** Käufer vor Kauf auf mögliche Zollkosten hinweisen

---

## 7. Technische Umsetzung — Architektur

### 7.1 Datenbank-Erweiterungen

```sql
-- Seller-Profil
CREATE TABLE seller_profile (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL UNIQUE,
    seller_type TEXT NOT NULL CHECK (seller_type IN ('private', 'small_business', 'business')),
    company_name TEXT,
    tax_id TEXT,                         -- Steuer-ID
    vat_id TEXT,                         -- USt-IdNr
    f22_certificate_url TEXT,            -- Upload
    f22_verified BOOLEAN DEFAULT false,
    stripe_connect_account_id TEXT,      -- Stripe Express Account
    payout_iban TEXT,
    is_approved BOOLEAN DEFAULT false,
    is_suspended BOOLEAN DEFAULT false,
    approval_date TIMESTAMPTZ,
    approved_by TEXT,
    commission_rate NUMERIC DEFAULT 10.0, -- individuell anpassbar
    total_sales NUMERIC DEFAULT 0,
    total_items_sold INTEGER DEFAULT 0,
    rating_avg NUMERIC,
    rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seller-Einreichungen für Auktionsblöcke
CREATE TABLE seller_submission (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL REFERENCES seller_profile(id),
    release_id TEXT,                     -- wenn existierender Release
    title TEXT NOT NULL,
    artist_name TEXT,
    description TEXT,
    condition TEXT,
    start_price NUMERIC NOT NULL,
    images TEXT[],                       -- URLs
    target_block_id TEXT,               -- gewünschter Block (optional)
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'listed')),
    admin_notes TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seller-Bewertungen
CREATE TABLE seller_rating (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL REFERENCES seller_profile(id),
    buyer_customer_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DAC7 Meldedaten (jährlich)
CREATE TABLE dac7_report (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL REFERENCES seller_profile(id),
    reporting_year INTEGER NOT NULL,
    total_consideration NUMERIC NOT NULL,
    total_fees NUMERIC NOT NULL,
    transaction_count INTEGER NOT NULL,
    reported_at TIMESTAMPTZ,
    report_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 API-Erweiterungen

```
# Seller Portal (auth required)
POST   /store/seller/apply          — Bewerbung einreichen
GET    /store/seller/profile        — Eigenes Seller-Profil
PATCH  /store/seller/profile        — Profil aktualisieren
POST   /store/seller/submissions    — Artikel einreichen
GET    /store/seller/submissions    — Eigene Einreichungen
GET    /store/seller/sales          — Verkaufshistorie
GET    /store/seller/payouts        — Auszahlungshistorie
GET    /store/seller/dashboard      — Stats (Umsatz, Provision, Rating)

# Admin
GET    /admin/sellers               — Seller-Liste (mit Filter/Sort)
GET    /admin/sellers/:id           — Seller-Detail
PATCH  /admin/sellers/:id           — Approve/Suspend/Edit
GET    /admin/sellers/:id/sales     — Verkäufe eines Sellers
GET    /admin/submissions           — Alle Einreichungen (pending first)
PATCH  /admin/submissions/:id       — Approve/Reject Einreichung
GET    /admin/dac7                  — DAC7 Reporting Dashboard
POST   /admin/dac7/generate         — DAC7 Bericht generieren

# Public
GET    /store/seller/:slug          — Öffentliches Seller-Profil
```

### 7.3 Frontend-Seiten

```
# Seller Portal
/seller/apply                 — Bewerbungsformular
/seller/dashboard             — Seller-Dashboard (Stats, Sales, Payouts)
/seller/submissions           — Artikel einreichen + Status
/seller/settings              — Profil, Bank, Steuer-Daten

# Public
/seller/:slug                 — Öffentliches Seller-Profil (Rating, Artikel)

# Admin
/admin/sellers                — Seller-Management (Liste, Approve, Suspend)
/admin/submissions            — Einreichungs-Queue
/admin/dac7                   — DAC7 Reporting
```

### 7.4 Stripe Connect Integration

```typescript
// Seller-Onboarding: Express Account erstellen
const account = await stripe.accounts.create({
    type: "express",
    country: "DE",
    email: seller.email,
    capabilities: { transfers: { requested: true } },
    business_type: seller.seller_type === "private" ? "individual" : "company",
});

// Bei Auktionsende: Payment Intent mit Transfer
const paymentIntent = await stripe.paymentIntents.create({
    amount: totalAmount, // in Cents
    currency: "eur",
    transfer_data: {
        destination: seller.stripe_connect_account_id,
        amount: sellerAmount, // totalAmount * 0.9 (90% an Seller)
    },
});

// Payout nach Versandbestätigung
await stripe.transfers.create({
    amount: sellerAmount,
    currency: "eur",
    destination: seller.stripe_connect_account_id,
    transfer_group: orderGroupId,
});
```

---

## 8. Implementierungs-Phasen

### Phase 1: Grundlagen (Monat 1–2)
- [ ] GmbH gründen (Notar, Handelsregister, Geschäftskonto)
- [ ] Seller-AGB erstellen lassen (Anwalt)
- [ ] Stripe Connect Express einrichten
- [ ] Seller-Bewerbung + Admin-Approval Flow
- [ ] KYC via Stripe Connect
- [ ] Seller-Dashboard (Basis: Einreichungen, Sales)
- [ ] Admin: Seller-Management + Submissions-Queue
- [ ] §22f-konforme Datenerfassung

### Phase 2: Live mit 5–10 Test-Sellern (Monat 3)
- [ ] Onboarding erster Seller (persönlich, manuell)
- [ ] Test-Auktionsblock mit Seller-Ware
- [ ] Payout-Flow testen (Stripe Connect)
- [ ] Seller-Bewertungssystem
- [ ] F22-Bescheinigung Workflow

### Phase 3: Skalierung (Monat 4–6)
- [ ] Self-Service Seller-Onboarding
- [ ] DAC7 Reporting Automatisierung
- [ ] Seller-Analytics Dashboard
- [ ] Staffel-Provisionen
- [ ] Public Seller-Profile

### Phase 4: Erweiterungen (Monat 6+)
- [ ] Mangopay-Integration (Escrow)
- [ ] Hybrid-Versand (VOD-Lager Option)
- [ ] Seller-Tools: Bulk-Upload, Discogs-Import
- [ ] Cross-Seller Combined Shipping
- [ ] Internationaler Seller-Zugang (EU-weit)

---

## 9. Kostenabschätzung

### Einmalige Kosten

| Position | Geschätzt |
|----------|----------|
| GmbH-Gründung (Notar, HR, Geschäftskonto) | €2.000–3.000 |
| Stammkapital GmbH | €25.000 |
| Seller-AGB + Datenschutz (Anwalt) | €3.000–5.000 |
| Stripe Connect Setup | €0 (kostenlos) |
| Entwicklungsaufwand (Phase 1) | Intern |
| **Gesamt (ohne Stammkapital)** | **~€5.000–8.000** |

### Laufende Kosten

| Position | Monatlich |
|----------|----------|
| Steuerberater (Marketplace-Buchhaltung) | €300–500 |
| Stripe Connect Gebühren | 0,25% + €0,25 pro Payout |
| BZSt DAC7-Meldung | €0 (Eigenleistung) |
| Versicherungen (Haftpflicht, Cyber) | €100–200 |
| **Gesamt** | **~€400–700/Monat** |

### Break-Even Rechnung

Bei 10% Provision und €400/Monat Fixkosten:
- **€4.000/Monat Transaktionsvolumen** = Break-Even
- = ~80 Artikel à €50 Durchschnitt
- = ~3–4 Auktionsblöcke/Monat mit je 20–25 Seller-Artikeln

---

## 10. Risiken & Mitigierung

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigierung |
|--------|-------------------|------------|------------|
| Seller führt USt nicht ab → §25e Haftung | Mittel | Hoch | F22-Bescheinigung VOR Onboarding, Safe Harbor nutzen |
| Käufer erhält gefälschte/falsch beschriebene Ware | Niedrig | Hoch | Kuratiertes Modell, Seller-Rating, Escrow mit Bestätigungsfrist |
| DAC7-Meldung versäumt | Niedrig | Hoch | Automatisierung, Kalender-Reminder |
| Seller-Betrug (Nicht-Versand) | Niedrig | Mittel | Tracking-Pflicht, Payout erst nach Versandbestätigung |
| Zu wenig Seller für Vielfalt | Mittel | Mittel | Persönliches Onboarding, Discogs-Community ansprechen |
| BaFin-Probleme bei Payment | Niedrig | Sehr hoch | Nur Stripe Connect/Mangopay nutzen, NIE eigene Geldflüsse |

---

## 11. Internationale Steueroptimierung — Standortanalyse

### 11.1 EU-Jurisdiktionen im Vergleich

| Land | CIT-Rate | Effektive Rate | Eignung Marketplace | Wo domiziliert? |
|------|---------|---------------|---------------------|-----------------|
| **Deutschland** | ~30% (KSt+GewSt) | ~30% | Referenz (Ist-Zustand) | VOD Records aktuell |
| **Estland** | 0% retained / 20% distributed | 0–20% | Gut für Wachstumsphase | — |
| **Irland** | 12,5% (< €750M Revenue) | 12,5% | Sehr gut (Tech-Hub) | Etsy Ireland UC |
| **Niederlande** | 19% (≤ €200K) / 25,8% | 9% (Innovation Box) | Sehr gut | Catawiki BV, Vinted Ops |
| **Zypern** | 12,5% | 2,5% (IP Box) | Theoretisch gut | — |
| **Malta** | 35% headline | ~5% (Refund) | Komplex | — |
| **Ungarn** | 9% | 9% | Limitierte Infrastruktur | — |
| **Bulgarien** | 10% | 10% | Limitiert | — |

**Wo sitzen die großen Marktplätze?**
- **eBay EU:** eBay GmbH (Deutschland) + eBay International AG (Schweiz)
- **Etsy EU:** Etsy Ireland UC (Dublin)
- **Catawiki:** Catawiki BV (Amsterdam, Niederlande)
- **Vinted:** Vinted UAB (Vilnius, Litauen)
- **Discogs:** Zink Media Inc. / Discogs LLC (Portland, USA — keine separate EU-Entity)

### 11.2 Estland — 0% auf einbehaltene Gewinne

**Modell:** Unternehmen zahlt 0% CIT solange Gewinne reinvestiert werden. Erst bei Ausschüttung: 20% (regelmäßige Ausschüttungen: 14%).

**Vorteile:**
- Perfekt für Wachstumsphase (alle Gewinne reinvestieren)
- E-Residency ermöglicht Remote-Gründung (~€700 Gründungskosten)
- Geringe laufende Kosten (~€1.500–3.000/Jahr)
- Vollständig digitale Verwaltung

**Risiken:**
- **Betriebsstätten-Problem:** Wenn Robin von Deutschland aus arbeitet → Finanzamt argumentiert "Ort der tatsächlichen Geschäftsleitung" ist DE → Besteuerung in DE
- **CFC-Regeln (AStG §7-14):** Deutscher Steueransässiger kontrolliert Auslandsgesellschaft mit < 25% effektiver Steuer → Gewinne werden Robin in DE zugerechnet
- **Substanz-Anforderung:** Estnischer Direktor, echte Entscheidungen in Estland nötig

### 11.3 Niederlande — Innovation Box (9%)

**Modell:** Software-IP (Auktionsplattform) qualifiziert für Innovation Box → 9% statt 25,8% CIT auf IP-Einkünfte.

**Vorteile:**
- Glaubwürdiger EU-Standort (Catawiki, Booking.com, Adyen sitzen dort)
- Innovation Box auf selbst entwickelte Software anwendbar (WBSO-Zertifikat)
- BV-Gründung günstig (~€500–1.000 Notar)
- Laufende Kosten: ~€4.000–8.000/Jahr

**Risiken:**
- Nexus-Anforderung: R&D muss in NL stattfinden (oder an unverbundene Dritte ausgelagert)
- Wenn Robin allein aus DE entwickelt → Nexus-Fraktion ungünstig
- Braucht niederländischen Direktor + lokale Präsenz

### 11.4 Zypern — IP Box (2,5%)

**Modell:** 80% der IP-Einkünfte steuerfrei → effektiv 2,5% CIT. Plus Non-Dom-Status für Personen (keine Steuer auf ausländische Dividenden, 17 Jahre).

**Vorteile:** Sehr niedrige effektive Rate, Non-Dom für Gründer attraktiv.
**Nachteile:** Compliance-Kosten €5.000–13.000/Jahr, zyprische Entwickler/Substanz nötig, exotischerer Standort.

### 11.5 Die harte Realität: Das "German Founder Problem"

**Kernproblem:** Robin lebt in Deutschland. Das Lager ist in Deutschland. Die Entwicklung findet in Deutschland statt.

**Konsequenzen:**

1. **Betriebsstätte (PE) in Deutschland:** Lager in Friedrichshafen = deutsche Betriebsstätte unter fast jedem DBA. Die der PE zurechenbaren Gewinne werden in DE besteuert — egal wo die Firma sitzt.

2. **Ort der tatsächlichen Geschäftsleitung:** Wenn Robin allein alle Entscheidungen trifft → Geschäftsleitung in DE → volle DE-Besteuerung.

3. **CFC-Regeln (AStG §7-14):** Deutscher Gesellschafter kontrolliert ausländische Gesellschaft mit < 25% effektiver Steuer → Hinzurechnungsbesteuerung = Gewinne werden Robin persönlich zugerechnet.

4. **Transfer Pricing:** Wenn Firma im Ausland, aber Robin entwickelt aus DE → Verrechnungspreisdokumentation nötig. Großteil des Gewinns muss der deutschen Tätigkeit zugeordnet werden.

5. **USt:** Ware wird aus Deutschland versandt → deutsche USt-Pflicht, unabhängig vom Firmensitz.

### 11.6 Kosten-Nutzen-Analyse bei aktuellem Volumen

Bei €50K–500K Transaktionsvolumen (10% Provision = €5K–50K Revenue, ~50% Marge = **€2,5K–25K Gewinn**):

| Struktur | Steuerersparnis vs. DE | Compliance-Kosten/Jahr | Netto-Vorteil |
|----------|----------------------|----------------------|---------------|
| **Deutsche GmbH** | Referenz (€0) | ~€2.000–4.000 | Referenz |
| **Estnische OÜ** | €750–7.500 | €1.500–3.000 + PE-Risiko | Negativ (CFC) |
| **Irische Ltd** | €440–4.375 | €3.000–6.000 | Negativ bis marginal |
| **Niederländische BV** | €525–5.250 | €4.000–8.000 | Negativ bis marginal |
| **Zyprische Ltd** | €690–6.875 | €5.000–13.000 | Negativ |
| **Maltesische Dual** | €625–6.250 | €10.000–20.000 | Stark negativ |

### 11.7 Empfehlung: Phasenmodell

**Phase 1 (Jetzt, €50K–500K Transaktionen):**
→ **Deutsche GmbH oder UG.** Steueroptimierung lohnt sich nicht bei diesem Volumen. Die Compliance-Kosten einer ausländischen Struktur übersteigen die Ersparnis. Fokus auf Wachstum.

**Phase 2 (€500K–2M Transaktionen, €50K–200K Gewinn):**
→ **Niederländische BV erwägen** — wenn ein niederländischer Partner/Direktor gefunden wird. Innovation Box (9%) auf Plattform-IP sinnvoll. Oder: **Estnische OÜ** wenn alle Gewinne reinvestiert werden und estnische Geschäftsleitung organisiert werden kann.

**Phase 3 (€2M+ Transaktionen, €200K+ Gewinn):**
→ **Niederländische BV mit Innovation Box** oder **Irische Ltd** wird finanziell attraktiv. Holding-Struktur (NL Holding + Operating Entity) möglich. Transfer Pricing Dokumentation ohnehin Pflicht.

**Der eine Hebel, der jetzt schon funktioniert:**
Wenn Robin persönlich bereit wäre **umzuziehen** (z.B. Portugal NHR/IFICI-Status oder Zypern Non-Dom), sinkt die persönliche Steuer auf Dividenden drastisch. Aber das ist eine Lebensentscheidung, keine Unternehmensstruktur-Frage.

### 11.8 Referenzen

| Regelwerk | Relevanz |
|-----------|---------|
| AStG §7-14 (Hinzurechnungsbesteuerung) | CFC-Regeln für ausländische Gesellschaften |
| EU ATAD I (Richtlinie 2016/1164) | Anti-Steuervermeidung, GAAR |
| EU ATAD II (Richtlinie 2017/952) | Hybrid-Mismatches |
| OECD Pillar Two (EU-Richtlinie 2022/2523) | 15% Mindeststeuer — greift erst ab €750M Revenue |
| DAC7 (Richtlinie 2021/514) | Plattform-Meldepflichten |
| Estnisches Einkommensteuergesetz §50 | 0% retained / 20% distributed |
| NL Innovation Box (Art. 12b Wet Vpb 1969) | 9% auf qualifizierte IP-Einkünfte |
| Zyprische IP Box (Art. 9(1)(f) Income Tax Law) | 2,5% effektiv |

---

## 12. Entscheidungsmatrix

| Entscheidung | Empfehlung | Alternative | Risiko bei falscher Wahl |
|-------------|-----------|-------------|------------------------|
| Separate GmbH? | **Ja** | Bestehende Struktur | Unbegrenzte Haftung aus Marketplace-Betrieb |
| GmbH oder UG? | **GmbH (€25K)** | UG (€1) | UG schreckt Payment-Provider und Seller ab |
| Payment-Provider? | **Stripe Connect** | Mangopay | Eigenes System = illegal ohne BaFin-Lizenz |
| Deemed Supplier? | **Nein** (EU-Seller) | — | Zu viel USt einsammeln = Buchhaltungs-Chaos |
| DAC7-Meldung? | **Pflicht ab Tag 1** | — | Bußgelder, Plattform-Sperrung |
| §22f/§25e Compliance? | **F22 von jedem Business-Seller** | Ohne F22 listen | Gesamtschuldnerische Haftung |
| Provisionsmodell? | **10% Seller / 0% Käufer** | Catawiki-Modell (12,5%+9%) | Zu hoch = keine Seller, zu niedrig = nicht nachhaltig |
| Versand? | **Seller-Versand (Phase 1)** | Zentrallager | Zentrallager = hohe Fixkosten zu früh |
| Kuratiert vs. offen? | **Kuratiert** | Offener Marktplatz | Qualitätsverlust, Markenverwässerung |
| Firmensitz? | **Deutschland (Phase 1)** | NL/EE/IE (ab Phase 2) | Ausland bei < €200K Gewinn = mehr Kosten als Ersparnis |
| Steueroptimierung? | **Erst ab €200K+ Gewinn** | Sofort international | AStG CFC-Regeln + PE-Risiko negieren Vorteile |

---

## 12. Nächste Schritte

1. **Entscheidung:** Will Frank eine separate GmbH gründen? Budget für Stammkapital + Gründungskosten?
2. **Anwalt:** Seller-AGB + Datenschutzerklärung für Marketplace erstellen lassen
3. **Steuerberater:** Marketplace-Buchhaltung besprechen, DAC7-Setup
4. **Stripe Connect:** Express-Modus testen mit Frank als Test-Seller
5. **5 Pilot-Seller:** Persönlich ansprechen (bestehende Discogs/eBay-Seller aus der Industrial-Szene)
6. **Entwicklung Phase 1:** Seller-Bewerbung, Admin-Approval, Submissions, Dashboard

---

**Dieses Konzept dient als Entscheidungsgrundlage. Vor der technischen Umsetzung müssen die rechtlichen und steuerlichen Fragen mit Anwalt und Steuerberater geklärt werden.**
