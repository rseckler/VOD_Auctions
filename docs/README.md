# VOD Auctions - Projekt Übersicht

> Auktionsplattform für 80.000 Tonträger - Von Konzept bis Umsetzung

## 📋 Dokumentation

- **[KONZEPT.md](KONZEPT.md)** - Vollständiges Konzeptdokument (11 Kapitel, 50+ Seiten)

## 🎯 Kernfrage

**Ist eine eigene Auktionsplattform profitabler als Discogs/eBay?**

## ⚡ Quick Summary

### Option 1: eBay/Discogs (Status Quo)
- ✅ Sofort verfügbar
- ❌ 27,8% Gebühren
- 📊 Nettogewinn: ~36.000€/Monat bei 50k Umsatz

### Option 2: White-Label Plattform (Empfohlen)
- ⏱️ 1 Monat Setup
- ✅ 10,8% Kosten
- 📊 Nettogewinn: ~67.000€/Monat bei 75k Umsatz
- 💰 **+85% Gewinn vs. eBay/Discogs**

### Option 3: Custom-Entwicklung
- ⏱️ 6 Monate Entwicklung
- 💰 50.000€ Investition
- 📊 Nettogewinn: ~90.000€/Monat bei 100k Umsatz
- 🎯 ROI: 2.979% über 3 Jahre

## 🚀 Empfohlener Start: 4-Phasen-Plan

### Phase 1: Validierung (Monat 1-2)
**Aktion:** 100 Items auf eBay als Auktion testen
**Kosten:** 1.000€
**Ziel:** Beweisen, dass Auktionen höhere Preise erzielen

**Next Steps:**
```bash
1. eBay Seller Account erstellen
2. 100 Items fotografieren
3. Auktionen starten
4. Ergebnisse tracken (siehe Template unten)
```

### Phase 2: White-Label Setup (Monat 3-4)
**Aktion:** Eigene Plattform mit AuctionWorx aufsetzen
**Kosten:** 10.000€ Setup + 300€/Monat
**Ziel:** 500 Items online, 1.000 registrierte Nutzer

### Phase 3: Skalierung (Monat 5-8)
**Aktion:** 5.000 Items online, Marketing-Offensive
**Kosten:** 2.000€/Monat Marketing
**Ziel:** 50.000€ Umsatz/Monat

### Phase 4: Entscheidung (Monat 9-12)
**Aktion:** Evaluierung - Weitermachen oder Custom-Entwicklung?
**Entscheidung basierend auf:**
- >100k Umsatz/Monat → Custom-Plattform entwickeln
- <50k Umsatz/Monat → Zurück zu Discogs/Shopify

## 📊 Tracking Template

Erstelle ein Spreadsheet mit folgenden Spalten:

```
Item ID | Künstler | Titel | Format | Schätzwert | Startpreis | Endpreis | Anzahl Gebote | Verkauft? | Plattform | Datum
```

**Beispiel:**
```
001 | Throbbing Gristle | 20 Jazz Funk Greats | Vinyl | 80€ | 40€ | 125€ | 23 | Ja | eBay | 2026-02-15
002 | Coil | Horse Rotorvator | CD | 30€ | 15€ | 28€ | 7 | Ja | eBay | 2026-02-15
```

## 💰 Break-Even-Rechnung

**Mindestumsatz für Profitabilität (White-Label):**
```
Fixed Costs: 2.300€/Monat (Software + Marketing)
Variable Costs: 10,8%
Break-Even: 2.578€/Monat

→ Nur 100 Verkäufe à 25€ nötig!
```

## 🛠️ Technische Umsetzung (Phase 5 - Custom)

Falls Custom-Entwicklung gewählt wird:

**Stack:**
- Frontend: Next.js 15 + React 19 + TypeScript
- Backend: Supabase (PostgreSQL + Realtime)
- Cache: Upstash Redis (für Echtzeit-Bidding)
- Payment: Stripe
- Hosting: Vercel

**Entwicklungszeit:** 6 Monate

**Features:**
- ✅ Echtzeit-Bidding (Server-Sent Events)
- ✅ Proxy-Bidding (Autobid)
- ✅ Auto-Extension (Auktion verlängert sich bei späten Geboten)
- ✅ Thematische Auktionen
- ✅ Community-Features (Profile, Watchlists)
- ✅ Admin-Panel mit Bulk-Upload

## 📁 Projektstruktur (geplant)

```
VOD_Auctions/
├── KONZEPT.md              # Dieses Dokument
├── README.md               # Quick Start Guide
├── docs/
│   ├── legal/              # AGB, Datenschutz, Impressum
│   ├── marketing/          # Marketing-Strategie
│   └── technical/          # Tech-Specs
├── data/
│   ├── items.csv           # Item-Katalog
│   ├── tracking.csv        # Phase 1 Tracking
│   └── migration/          # Migration von tape-mag.com
└── platform/               # Custom-Plattform (später)
    ├── frontend/
    ├── backend/
    └── database/
```

## 🎬 Sofort-Start (diese Woche)

### To-Do Week 1:
- [ ] eBay Seller Account erstellen
- [ ] 100 Items auswählen (50 Raritäten + 50 Mittelklasse)
- [ ] Foto-Setup vorbereiten (Lightbox, Kamera)
- [ ] Tracking-Spreadsheet erstellen
- [ ] Erste 10 Auktionen erstellen (Test)

### Checkliste pro Item:
- [ ] Zustand prüfen (Media + Sleeve)
- [ ] 3-5 Fotos machen (Cover, Label, Rückseite)
- [ ] Discogs-Recherche (Preis-Historie)
- [ ] Beschreibung schreiben
- [ ] Listing erstellen (7 Tage Laufzeit)

## 📈 Erfolgs-Metriken

**Phase 1 (eBay-Test):**
- ✅ Auktionspreis >20% höher als Festpreis
- ✅ >5 Gebote pro Item im Schnitt
- ✅ <10% Retourenquote

**Phase 2 (White-Label):**
- ✅ 1.000 registrierte Nutzer
- ✅ 50 aktive Auktionen/Woche
- ✅ 10.000€ Umsatz/Monat

**Phase 3 (Skalierung):**
- ✅ 5.000 Items online
- ✅ 50.000€ Umsatz/Monat
- ✅ <5% Transaktionskosten

## 🔗 Links

- tape-mag.com - Bestehende Website
- tape-mag-migration - Bestehende Migration zu Shopify
- Omega Auctions - Referenz High-End Auktionshaus
- Bonhams - Referenz Traditionelles Auktionshaus

## 💡 Nächste Schritte

1. **Review KONZEPT.md** - Vollständiges Konzept lesen
2. **Entscheidung treffen** - Phase 1 starten?
3. **Team-Meeting** - Diskussion & Planung
4. **Start Phase 1** - Erste 10 Items auf eBay

---

**Status:** 📝 Konzept erstellt, bereit für Phase 1
**Erstellt:** 2026-02-10
**Autor:** Robin Seckler
