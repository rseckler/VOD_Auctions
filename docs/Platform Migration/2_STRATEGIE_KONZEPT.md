# 2 — Strategie & inhaltliches Konzept

**Stand:** 2026-05-16 (v2)
**Autor:** Robin Seckler
**Zweck:** Ziel-Architektur, Marken-/Domain-Strategie, inhaltliches Konzept beider Apps, offene Entscheidungen für Frank.
**Voraussetzung:** [`1_ANALYSE.md`](1_ANALYSE.md) gelesen.

---

## 1. Ziel-Architektur

```
                    ┌─────────────────────────────────────────────┐
                    │        GEMEINSAMES FUNDAMENT                 │
                    │  Medusa.js Backend · Supabase Katalog-DB ·   │
                    │  R2 Bilder · Meilisearch · Auth · Stripe     │
                    └───────────────┬─────────────────┬───────────┘
                                    │                 │
              ┌─────────────────────▼──────┐   ┌──────▼────────────────────┐
              │  App B — tape-mag           │   │  App A — Commerce         │
              │  ERLEBNISPLATTFORM (neu)    │   │  (existiert, beta)        │
              │  tape-mag.com               │   │  vod-auctions.com /       │
              │  Archiv erleben, entdecken  │   │  vod-records.com /        │
              │  stöbern, Community         │   │  vinyl-on-demand.com      │
              │                             │   │  Auktion + Festpreis-Shop │
              └─────────────────────────────┘   └───────────────────────────┘
                         beide lesen dieselbe Katalog-DB (~41.529 Releases)
```

**Drei Festlegungen (von Frank bestätigt 2026-05-16):**
1. tape-mag wird eine **eigenständige neue App** mit **geteilter Katalog-DB**.
2. Commerce: Auktion und vod-records-Festpreis-Shop sind **eine Plattform, mehrere Domains**.
3. Alle Properties bauen auf dem **gemeinsamen VOD_Auctions-Stack** auf.

---

## 2. Die zwei Apps — Rollen-Abgrenzung

| | App B — tape-mag (Erlebnis) | App A — Commerce |
|---|---|---|
| **Zweck** | Archiv *erleben* — entdecken, recherchieren, stöbern | *Verkaufen* — Auktion + Festpreis; Label-Katalog + Marktplatz |
| **Domain** | `tape-mag.com` | `vod-auctions.com` (Marktplatz) · `vod-records.com` / `vinyl-on-demand.com` (Label) |
| **Gegenüber Katalog** | liest **alle** Releases, auch nicht-käufliche | zeigt **käufliche** Releases (Preis, Bestand) |
| **Kern-Features** | reiche Entity-Seiten, Stöber-/Discovery-UX, Storytelling, Community | Warenkorb, Checkout, Bidding, ERP, §25a-Rechnung |
| **Tonalität** | nicht-kommerziell, kuratorisch, „Museum" | kommerziell, transaktional |
| **Status** | Neuaufbau | existiert (beta) |

**Verbindung:** Ein Release ist in App B ein *Erlebnis-Eintrag* und — wenn käuflich — mit einem „Bei VOD kaufen/bieten"-Verweis auf App A verlinkt. Eine Datenbasis, zwei Linsen. Der Nutzer erlebt in tape-mag und kauft im Commerce — bewusst getrennt, damit der Archiv-Charakter nicht kommerziell „verschmutzt" wird.

---

## 3. Marken-Strategie: drei Rollen, drei Domains

Es gibt nicht *eine* Commerce-Leitmarke, sondern drei bewusst getrennte Rollen — jede mit eigener Domain und eigenem Zweck.

### 3.1 tape-mag.com — die Erlebnismarke
Marke der Erlebnis-/Archiv-App (App B). 9 Jahre SEO-Equity, etablierter Szene-Name, nicht-kommerziell. Bleibt unverändert.

### 3.2 VOD Records — das Plattenlabel
`vod-records.com` / `vinyl-on-demand.com` sind die Identität von **VOD Records, dem Plattenlabel**, das seit über 20 Jahren **eigene Editionen/Pressungen** herausbringt. Diese Domains präsentieren den **First-Party-Katalog** — die eigenen Veröffentlichungen des Labels. (`vinyl-on-demand.com` und `vod-records.com` sind dieselbe Label-Marke; eine davon wird 301 auf die andere — Detail-Entscheidung, kein Strukturthema.)

### 3.3 VOD Auctions — die Marktplatz-Plattform
`vod-auctions.com` ist die **Plattform**, auf der Platten verkauft werden — per **Auktion und per Direktverkauf** — und zwar nicht nur von VOD Records selbst, sondern perspektivisch auch von **Dritt-Verkäufern**. VOD Records ist auf dieser Plattform der Flagship-/First-Party-Seller; fremde Verkäufer kommen als weitere Anbieter hinzu.

### 3.4 Wie das zusammenhängt
- **Technisch:** VOD Records (Label-Storefront) und VOD Auctions (Marktplatz) sind **eine Plattform** — dieselbe Commerce-App (App A), dieselbe Katalog-DB. Zwei Domains, zwei Zweck-Gesichter.
- **Geschäftlich:** zwei Dinge — das *Label* (eigene Ware) und der *Marktplatz* (auch fremde Ware).
- **Rechtlich:** genau hier liegt der Knackpunkt. Verkäufe von Dritt-Verkäufern über VOD Auctions *sind* der Kommissions-/Vermittlungsfall aus Befund C / Dok. 1. Die Entscheidung „echte Verkaufskommission vs. reine Vermittlung" (Entscheidung #4) bestimmt, wie der Marktplatz überhaupt funktionieren darf.

> **ENTSCHEIDUNG FÜR FRANK #1:** `vinyl-on-demand.com` vs. `vod-records.com` als primäre Label-Domain (die andere → 301). Die Rollenverteilung tape-mag / Label / Marktplatz selbst ist geklärt.

> **HINWEIS:** Der Dritt-Verkäufer-Marktplatz ist der Ziel-Zustand (vgl. Linear RSE-291, Multi-Seller Marketplace). Der unmittelbare Migrations-Scope bringt VOD Records (Label) + den bestehenden vod-records-Shop auf die Plattform; das Onboarding fremder Verkäufer ist die nächste Ausbaustufe — aber Datenmodell und Rechtsmodell müssen sie **von Anfang an** mitdenken.

---

## 4. Inhaltliches Konzept App B — die neue tape-mag-Erlebnisplattform

Die alte PHP-Seite wird nicht „portiert", sondern als moderne App **neu gedacht**. Leitidee: *Frank's Archiv soll erlebbar werden, nicht nur abfragbar.*

- **Discovery statt Suchmaske:** kuratierte Einstiege (Genres, Ären, Labels, „Frank's Picks"), visuelles Stöbern, Verknüpfungen Band ↔ Label ↔ Release.
- **Reiche Entity-Seiten:** Bands/Labels/Press mit redaktionellem Content (Entity-Overhaul RSE-227), Diskografien, Bildergalerien.
- **Erlebnis-Elemente:** Hörbeispiele/Embeds (Bandcamp/YouTube/SoundCloud), Hintergrundgeschichten, Cover-Kunst im Fokus.
- **Community als Herz der Erlebnisplattform:** Diskussion, Reviews, Listen, „erlebt/besessen"-Markierungen gehören inhaltlich hierher (siehe §6).
- **Kein Preis, kein Warenkorb** — aber dezenter Verweis „Verfügbar bei VOD" zur Commerce-App, wenn ein Release käuflich ist.
- **Mitglieder:** die 3.632 tape-mag-Altmitglieder sind das Community-Seed.

## 5. Inhaltliches Konzept App A — Commerce (vod-records einziehen lassen)

App A existiert. Die Strategie ist hier **Einzug**, nicht Neubau:
- Die **547 aktiv verkauften vod-records-Artikel** werden zum sichtbaren Festpreis-/Auktions-Bestand (ERP/`shop_price`).
- **VOD Records' eigene Label-Editionen** sind der First-Party-Katalog — sie erscheinen unter der Label-Domain *und* im Marktplatz.
- **§25a-Differenzbesteuerung** wird abgebildet — sobald rechtlich freigegeben (Befund C).
- **Bestandskunden** (~11.641) erhalten Zugang + ihre Bestellhistorie.
- `vod-records.com` wird eine Domain dieser App; der Alt-Shop wird abgeschaltet.
- **Ziel-Ausbau:** Dritt-Verkäufer-Onboarding (Seller-Accounts, Provisions-/Auszahlungslogik) — nach der Migration, abhängig vom Rechtsmodell (#4). Technik: Dok. 3 §3.9.

---

## 6. Monetarisierung — Membership statt Verkaufsprovision

Frank und Robin haben Mitte Mai 2026 entschieden: VOD Auctions monetarisiert **nicht über Verkaufsprovisionen**, sondern über ein **Membership-Modell**. Wer den Marktplatz nutzen will, braucht eine Mitgliedschaft.

> **Geltungsbereich — wichtig:** Das Membership-Modell betrifft sicher **VOD Auctions (den Marktplatz)** — Auktionen und Verkauf/Kauf bei Dritt-Verkäufern. **VOD Records, der eigene Label-Store mit Frank's eigenen Editionen, ist nicht betroffen: dort kauft jeder ganz normal und offen, ohne Membership.** Beim **tape-mag-Zugang** wird derzeit geprüft, ob auch er membership-gegated wird — das ist **offen** (Entscheidung #11) und SEO-kritisch (Dok. 5 §1).

### 6.1 Die Tiers
| Tier | Wer | Was | Preis (Richtwert) |
|---|---|---|---|
| **Basis-Membership** | Marktplatz-Käufer | auf dem VOD-Auctions-Marktplatz bieten + bei Dritt-Verkäufern kaufen — **kein** eigener Verkauf | ~€2–3 / Monat |
| **Seller-Membership** | „Ich bin auch Verkäufer" | zusätzlich verkaufen, mit einem Verkaufs-Kontingent (z.B. 10 Artikel) | Basis + Kontingent |
| **Seller-Upgrades** | Vielverkäufer | größeres Kontingent (mehr Artikel gleichzeitig einstellbar) | gestaffelte Upgrade-Stufen |

Grundregel: **Ohne Membership keine Nutzung des VOD-Auctions-Marktplatzes** (Auktionen, Dritt-Verkäufer). **Nicht** betroffen: Käufe im VOD-Records-Label-Store und das Stöbern im Katalog / auf tape-mag. Das Seller-Kontingent ist ein „Listing-Credit"-Modell — man erkauft das Recht, X Artikel einzustellen, und upgradet bei Bedarf.

### 6.2 Warum Membership statt Provision
- **Planbar:** wiederkehrende, vorhersagbare Einnahmen statt GMV-abhängiger Provision.
- **Rechtlich einfacher:** kein Provisionsabzug pro Verkauf → der Kommissions-/Vermittlungsfall (Entscheidung #4) tendiert klar Richtung **reine Vermittlung** — VOD stellt die Plattform gegen Gebühr, der Kaufvertrag entsteht zwischen Verkäufer und Käufer. (StB muss das bestätigen.)
- **Kein Gebühren-Image:** VOD positioniert sich bewusst gegen die 8–13 % von eBay/Discogs — eine flache Membership ist genau dieses Gegenargument.

### 6.3 Kritische Spannungen — vor dem Launch zu klären
Das Membership-Modell hat Zielkonflikte, die bewusst entschieden werden müssen:

1. **Paywall vs. Discovery/SEO.** Liegt indexierbarer Inhalt hinter der Membership, können Suchmaschinen ihn nicht crawlen — das zerstört die SEO-Equity von tape-mag.com und vod-records.com (Befund E). **Auflösung:** Es muss eine öffentliche, crawlbare Ebene geben. Ob tape-mag selbst frei bleibt (Szenario A) oder ebenfalls gegated wird (Szenario B — dann zwingend mit öffentlicher Preview-Schicht pro Entität), ist tragbar; ein striktes „gar nichts ohne Membership" ist es **nicht**. Die tape-mag-Zugangsfrage ist offen (Entscheidung #11). → Vollständiges SEO-Konzept inkl. beider Szenarien: [`5_SEO_KONZEPT.md`](5_SEO_KONZEPT.md).
2. **Bestandskunden-Friktion.** Die ~11.600 vod-records-Kunden und 3.632 tape-mag-Mitglieder treffen beim Umzug plötzlich auf eine Paywall. Ohne Übergangsregel droht ein massiver Abwanderungs-Effekt. Zu entscheiden: Grandfathering / kostenloses Start-Kontingent / Einführungs-Aktion (Entscheidung #9).
3. **Umfang der Basis-Membership.** „read-only" wörtlich hieße: nur ansehen. Aber **Kaufen/Bieten ist eine Schreib-Aktion** und der eigentliche Zweck. Festzulegen: Basis-Membership = stöbern **und kaufen**, nur kein Verkauf (Empfehlung) — oder strikt read-only mit separatem Kauf-Tier? (Entscheidung #8)
4. **Ökonomie-Check.** Bei seltenen, hochwertigen Transaktionen (Median €83, P95 €1.313) kann eine flache Membership pro aktivem Verkäufer deutlich *weniger* einbringen als eine Provision. Vor Festlegung der Preise eine grobe Deckungsrechnung gegen die ~419 Gold-/27 Platinum-Kunden.
5. **USt der Membership.** Membership-/Kontingent-Gebühren sind eine **reguläre Dienstleistung (19 % USt)** — getrennt von der §25a-Differenzbesteuerung der Warenverkäufe. Gehört in den StB-Testfall-Katalog (Dok. 4 P0.4).

*(Geklärt, daher keine offene Spannung mehr: VOD-Records-Label-Käufe sind membership-frei — siehe Geltungsbereich oben.)*

---

## 7. Audience-Strategie: drei Töpfe, eine Community

| Topf | Größe | Charakter | Rolle |
|---|---|---|---|
| tape-mag-Mitglieder | 3.632 | Archiv-Interessierte | Community-Seed der Erlebnis-App |
| vod-records-Kunden | ~11.600 (+3.100 vor-2013) | echte Käufer, €5,27 M Historie | Bestandskunden der Commerce-App |
| Facebook-Follower | 11.926 | Reichweite | Launch-Audience |

**Aktivierungsreihenfolge:** (1) vod-records-Bestandskunden — höchster Wert, brauchen Account-/Historie-Kontinuität. (2) tape-mag-Mitglieder — Community-Seed. (3) FB-Follower — breite Launch-Welle, sobald Community-Content (P6) drin ist. CRM-Tier (Platinum/Gold/Silver/Bronze) wird in `community_profile.tier` vererbt — Bestandskunden kommen mit Status an.

> **ENTSCHEIDUNG FÜR FRANK #2:** Kunden-Account-Migration — (a) Auto-Accounts mit Passwort-Reset-Mail oder (b) Invite-Flow mit Historie-Zuordnung nach Email-Verifikation? Empfehlung **(b)** — DSGVO-sauberer, kein Massen-Kaltmail, keine Account-Leichen.

> **ENTSCHEIDUNG FÜR FRANK #3 (Architektur):** Wo lebt die Community? Empfehlung: **primär in der tape-mag-Erlebnis-App** (Diskutieren/Bewerten = Erlebnis), technisch auf dem geteilten Fundament, sodass Reviews auch in der Commerce-App an Releases erscheinen können. Das verschiebt den Fokus des bestehenden `community_*`-Systems von Commerce nach Erlebnis.

---

## 8. Umgang mit den Altsystemen

| Altsystem | Schicksal | Begründung |
|---|---|---|
| tape-mag.com (alte PHP-Seite) | **Abschalten** nach Launch der neuen Erlebnis-App + Redirects | Marke bleibt, das PHP-5-CMS nicht — Sicherheits-/Pflegelast |
| vod-records.com-Shop (3wadmin) | **Abschalten** nach Parallel-Run + Cutover | Verkauf wandert in die Commerce-App |
| Hetzner Dedicated `213.133.106.99` | Kündigen, **nachdem** alle DBs + FTP-Bilder gesichert und migriert sind | laufende Kosten, „Alt-Wahrheit" |

**Pflicht:** Erst Volldump aller `vodtapes`/`maier_db*` + FTP-Bilder als Cold-Backup, *dann* abschalten.

---

## 9. Leitprinzipien

1. **Recht vor Code.** §25a-/Kommissions-Modell entscheiden, bevor der Shop-Cutover gebaut wird (Befund C).
2. **Kein Big-Bang bei vod-records.** Parallelbetrieb + kontrollierter Cutover (Befund B).
3. **SEO-Equity ist Vermögen.** Jede Alt-URL bekommt ein 301-Ziel, bevor eine Alt-Seite abgeschaltet wird.
4. **Erlebnis und Commerce sauber trennen** — gemeinsame Daten, getrennte Apps, getrennte Tonalität.
5. **Bestandskunden-Vertrauen first.** Lückenlose Historie + Email-Kontinuität.
6. **Frisch zählen, nicht Dokumente glauben** (Befund F).
7. **Wiederverwenden, nicht neu erfinden.** Die tape-mag-App nutzt das bestehende Fundament + Komponenten — sie ist ein neues Frontend, kein neuer Stack.

---

## 10. Offene Entscheidungen für Frank (Sammlung)

| # | Entscheidung | Empfehlung | Blockiert |
|---|---|---|---|
| 1 | Primäre Label-Domain: `vinyl-on-demand.com` vs. `vod-records.com` | eine wählen, andere → 301 | Redirect-Matrix |
| 2 | Kunden-Account-Migration: Auto vs. Invite | Invite-Flow mit Historie-Zuordnung | Account-Migrationsschritt |
| 3 | Wo lebt die Community (Erlebnis- vs. Commerce-App) | Primär Erlebnis-App, Daten auf Fundament | tape-mag-App-Scope |
| 4 | Kommissionsmodell: echte Verkaufskommission vs. Vermittlung | StB-Entscheid (Membership → tendenziell Vermittlung) | Shop-Datenmodell, Rechnungslogik |
| 5 | Bestellhistorie: Anzeige-Archiv vs. echte `transaction`-Rows | Read-only Legacy-Archiv pro Konto | Order-Migrations-Schema |
| 6 | Reihenfolge: zuerst tape-mag-App oder zuerst vod-records-Cutover? | Parallel — Daten-/Recht-Phase gemeinsam, dann beide Builds | Phasen-Priorisierung |
| 7 | Ladengeschäft/POS — vor oder nach Online-Cutover? | Nach Online-Cutover (POS ist Dry-Run) | POS-Priorisierung |
| 8 | Umfang Basis-Membership auf dem VOD-Auctions-Marktplatz: strikt read-only vs. inkl. Bieten/Kaufen | Inkl. Bieten/Kaufen, nur kein Verkauf | Membership-Tier-Design |
| 9 | Bestandskunden-Übergang ins Membership-Modell | Grandfathering / Gratis-Start-Kontingent / Einführungs-Aktion | Migrations-Kommunikation |
| 10 | SEO: Canonical-Hoheit (tape-mag vs. Commerce) | tape-mag kanonisch für Katalog-Content | SEO-Konzept, interne Verlinkung (Dok. 5) |
| 11 | tape-mag-Zugang: frei (Szenario A) vs. membership-gegated (Szenario B) | „Freemium-tape-mag" — öffentliche Preview-Schicht + Member-Tiefe | SEO-Modell, tape-mag-App-Scope |

Diese Entscheidungen gehören in eine gemeinsame Sitzung mit Frank **vor** Start des Umsetzungsplans (Dok. 4, Phase 0). Ausführliche Entscheidungsvorlage je Punkt (Kontext, Optionen, Empfehlung, Eintragefeld): [`6_FRANK_AGENDA.md`](6_FRANK_AGENDA.md).
