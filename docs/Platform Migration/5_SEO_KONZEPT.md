# 5 — SEO-Konzept: maximale SEO-Power trotz Paywall

**Stand:** 2026-05-16
**Autor:** Robin Seckler
**Zweck:** Konzept, wie VOD die volle SEO-Power des Katalogs nutzen kann, obwohl VOD Auctions ein Membership-Gate hat. Was muss konzeptionell gebaut werden?
**Voraussetzung:** [`2_STRATEGIE_KONZEPT.md`](2_STRATEGIE_KONZEPT.md) §6 (Membership), [`3_TECHNISCHES_KONZEPT.md`](3_TECHNISCHES_KONZEPT.md) §4 (Redirects).

---

## 1. Das Problem, das Kernprinzip — und die offene Entscheidung

Eine Paywall und SEO scheinen sich auszuschließen: Suchmaschinen indexieren nur, was sie crawlen dürfen. Liegt Inhalt hinter einer Membership, sieht Google leere Login-Seiten — und die 9 Jahre SEO-Equity von `tape-mag.com` und `vod-records.com` sind verloren.

**Kernprinzip:** Der Konflikt ist auflösbar, aber nur über eine harte Regel:

> **Es muss eine öffentliche, crawlbare Ebene geben — SEO lebt ausschließlich von ihr.**
> Die Paywall gehört auf die *Tiefe* und die *Handlung*, nicht auf die *Auffindbarkeit*.

### Die offene Entscheidung: wie tief reicht die öffentliche Ebene?

Ursprünglich war tape-mag als komplett freie Erlebnisplattform gedacht. Frank und Robin prüfen aktuell, **ob auch tape-mag membership-gegated wird** („Nur mit Membership kommst du in Zukunft auf tape-mag"). Das ist noch nicht entschieden — und es ist *die* SEO-kritische Entscheidung. Zwei Szenarien:

| | Szenario A — tape-mag bleibt frei | Szenario B — tape-mag wird gegated |
|---|---|---|
| **Öffentliche Ebene** | die *gesamte* tape-mag-Erlebnisplattform | eine *schlanke Preview-Seite* pro Katalog-Entität |
| **SEO-Power** | maximal — 41k volle Inhaltsseiten ranken | reduziert, aber erhalten — der Long-Tail bleibt indexierbar |
| **Cold-Start / Discovery** | optimal | funktioniert, schwächer |
| **Membership-Upsell** | nur Marktplatz + Community-Tiefe | zusätzlich die tape-mag-Erlebnistiefe |

**Die rote Linie:** Unter „eine öffentliche, crawlbare Preview-Seite pro Entität" darf man **nicht** gehen. Ohne sie ist der gesamte 41k-Long-Tail für Google unsichtbar, und neue Sammler — die VOD über eine Google-Suche nach einem obskuren Release finden — kommen nie an. Eine vollständig gegatete Plattform kann nicht entdeckt werden (Cold-Start-Tod).

**Empfehlung — der Mittelweg „Freemium-tape-mag":** öffentliche, crawlbare Preview pro Entität (Cover, Eckdaten, Teaser-Text, Sold-Preis) + die *volle Erlebnistiefe* (Galerien, Editorial, Community, Deep-Discovery) hinter der Membership. Das erlaubt das Membership-Upselling auch auf tape-mag **und** erhält SEO + Cold-Start-Discovery. Es ist Googles sanktioniertes Vorgehen für gegateten Inhalt (Preview + Paywall-Markup, §6) — **kein Cloaking**, solange Crawler und anonyme Besucher dieselbe Preview sehen.

Das restliche Konzept gilt für **beide** Szenarien — in Szenario B ist „Zone 1" eben die Preview-Schicht statt der vollen tape-mag-Seiten.

---

## 2. Das Drei-Zonen-Modell

Jede Seite der Plattform-Landschaft fällt in genau eine Zone:

| Zone | Inhalt | Crawlbar? | Beispiel |
|---|---|---|---|
| **Zone 1 — Offen & indexiert** | Katalog, Entity-Seiten, Editorial, Sold-Archive, Community-*lesen* | ✅ voll, `index,follow`, SSR | Release-/Band-/Label-Seite, Genre-Hub, „Was ist X wert" |
| **Zone 2 — Sichtbar, Handlung gegated** | Commerce-Listings: alles sichtbar (Bild, Beschreibung, Preis, Zustand), nur der Aktions-Button löst Membership-Prompt aus | ✅ indexiert, Handlung gegated | Auktions-Los, Festpreis-Artikel |
| **Zone 3 — Privat, `noindex`** | Account, Checkout, Verkäufer-Dashboard, Posten, Nachrichten | ❌ `noindex`, hinter Login | `/account`, `/checkout`, `/sell` |

**Zone 1 ist die SEO-tragende Schicht.** In Szenario A ist das die *gesamte* tape-mag-Erlebnisplattform; in Szenario B die *öffentliche Preview-Seite* pro Entität (§1). In beiden Fällen gilt: Zone 1 ist crawlbar und server-gerendert, Zone 2 ist sichtbar mit gegateter Tiefe/Handlung, Zone 3 ist privat. Die Commerce-App ist Zone 2 + Zone 3; der VOD-Records-Label-Store ist Zone 1 (offen, membership-frei).

**Grundregel:** Gegated wird über die *UI/Interaktion*, **niemals** über `noindex` oder `robots.txt`-`Disallow` auf Discovery-Seiten. `noindex` bekommen nur echte Zone-3-Seiten.

---

## 3. Die SEO-Assets, die VOD einzigartig hat

„Maximale SEO-Power" heißt: vorhandene, schwer kopierbare Inhalte konsequent indexierbar machen. VOD sitzt auf außergewöhnlich starken Assets:

1. **~41.529 Release-Seiten + 12.451 Artists + 3.077 Labels + Press-Seiten** — ein riesiger Long-Tail-Footprint in einer Nische mit geringem Wettbewerb. Jede Seite ist eine potenzielle Ranking-Seite für hochspezifische Suchanfragen.
2. **Realisierte Auktionspreise (Sold-Archive)** — echte Verkaufsdaten sind das wertvollste, am wenigsten kopierbare SEO-Asset überhaupt. Sammler suchen „X record value/wert/price". Discogs rankt massiv darüber. VOD *erzeugt* diese Daten selbst.
3. **Redaktioneller Entity-Content** (Entity-Overhaul RSE-227) — Band-/Label-Geschichten, einzigartige Texte.
4. **Community-Inhalte** — Reviews, Diskussionen, Franks „Dispatch", die 5.461 migrierten Facebook-Posts. Frischer, einzigartiger User-/Editorial-Content = laufender Content-Motor.
5. **9 Jahre Domain-Equity** auf `tape-mag.com` und `vod-records.com` — wird per 301-Matrix übertragen, nicht verschenkt.

Kein Wettbewerber in dieser Nische hat alle fünf. Das Konzept besteht darin, sie alle in Zone 1 sichtbar zu machen.

---

## 4. Was konzeptionell zu bauen ist

### A. Offene, server-gerenderte Inhaltsebene
- tape-mag.com vollständig **SSR/SSG** (Next.js ISR) — jede Release-/Artist-/Label-/Press-Seite ohne Login öffentlich, schnell, crawlbar.
- Commerce-Listing-Seiten (Zone 2) ebenfalls server-gerendert und öffentlich sichtbar; nur der Aktions-Button ist gegated.
- **Kein Inhalt im client-only-JS versteckt**, das Crawler nicht zuverlässig ausführen.

### B. Crawl-Infrastruktur
- **Segmentierte XML-Sitemaps** (Sitemap-Index, ≤50k URLs/Datei) für Releases, Artists, Labels, Press, Hub-Seiten, Sold-Archive — automatisch regenerierend, in GSC eingereicht.
- **robots.txt-Disziplin:** Discovery offen; nur `/account`, `/checkout`, `/sell`, `/messages` etc. `Disallow`.
- **301-Redirect-Matrix** (Dok. 3 §4) als Equity-Transfer — 1:1 auf URL-Ebene, kein Blanket-Redirect auf die Startseite.
- Stabile, sprechende, dauerhafte URLs (`/release/{slug}`); URLs nie ohne Redirect ändern.

### C. Content-Assets aktiv bauen (die „Power")
- **Sold-Archive / Preisführer:** realisierte Auktionspreise als eigene indexierbare Seiten pro Release („Verkauft für €X am …", Preisverlauf). Größter neuer SEO-Hebel.
- **Hub-/Landing-Seiten:** kuratierte Einstiege nach Genre / Ära / Format / Land / Label („Japanese Noise Vinyl", „Industrial-Kassetten der 80er") — sie ranken für Head-/Mid-Keywords und verteilen Traffic in den Long Tail.
- **Entity-Seiten** mit redaktionellem Content sichtbar machen.
- **Community öffentlich lesbar:** Reviews/Diskussionen sind Zone 1 (lesen frei, posten gegated). Fortlaufender Frische-Content.

### D. Technisches On-Page-SEO
- **Strukturierte Daten** (schema.org JSON-LD): `MusicAlbum`/`MusicRelease`, `Product`+`Offer`, `AggregateRating` (aus `community_review`), `BreadcrumbList`, für Auktionen `Offer` mit `availability`/`priceValidUntil`.
- **Title/Meta/OpenGraph** pro Seitentyp templatisiert.
- **Core Web Vitals:** öffentliche Seiten leicht halten — Auth-/Membership-JS lazy nachladen, nicht in den kritischen Pfad der Zone-1/2-Seiten.

### E. Interne Verlinkung
- Release ↔ Artist ↔ Label ↔ verwandte Releases ↔ Hub-Seiten engmaschig verlinken. Das verteilt Domain-Authority in den 41k-Long-Tail und ist bei dieser Katalog-Größe der wichtigste Authority-Verteiler.

### F. Conversion-Brücke
- Jede öffentliche Seite hat einen klaren CTA „Mitglied werden, um zu bieten/kaufen". **SEO bringt den Besucher auf die freie Seite — die Seite muss dann die Membership verkaufen.** Der Funnel ist: Suche → freie Release-Seite → Membership-Prompt bei der Aktion.

---

## 5. Das Duplicate-Content-Problem: tape-mag ↔ Commerce

Dasselbe Release wird auf **zwei Domains** gerendert (tape-mag erlebt es, Commerce verkauft es). Ohne Steuerung kannibalisieren sich die Domains und Google rankt keine zuverlässig.

**Lösung — Canonical-Hoheit klar zuweisen:**
- Die **tape-mag-Release-Seite ist die kanonische Seite** für die immergültige Katalog-/Release-Identität (stabil, inhaltsreich, offen). Sie sammelt die SEO-Equity.
- Eine **Auktions-Los-Seite** ist legitim eine *eigene* Seite (zeitgebundenes, konkretes Angebot, eigene Suchintention „… auction") — canonical-self; nach Auktionsende entweder ins Sold-Archive überführt oder `noindex`.
- Eine **Festpreis-Commerce-Seite**, die inhaltlich der Katalog-Seite gleicht, setzt `rel=canonical` auf die tape-mag-Release-Seite und ist von dort als „Kaufen"-Ziel verlinkt.

> **OFFENE ENTSCHEIDUNG (SEO-1):** Canonical-Hoheit final bestätigen — tape-mag als kanonische Heimat des Katalog-Contents, Commerce-Seiten als transaktionale Sekundärseiten. Steuert die gesamte interne Verlinkung und das Sitemap-Design.

---

## 6. Strukturierte Daten & Paywall-Markup — sauber, nicht trickreich

- Für **Zone 1 + 2** (Inhalt ist frei sichtbar): normales `Product`/`MusicRelease`-Markup, **kein** Paywall-Flag — denn der Inhalt *ist* frei.
- Echtes Paywall-Markup (`isAccessibleForFree: false` + `hasPart`/`cssSelector` nach schema.org) nur dort, wo ein Inhalt *tatsächlich* member-only ist (z. B. falls die vollständige Preishistorie Mitgliedern vorbehalten bleibt). Dann signalisiert es Google sauber „bewusst gegated", kein Cloaking.
- **Szenario A** (tape-mag frei, „Inhalt offen, nur Transaktion gegated"): VOD braucht Paywall-Markup fast nirgends — der Vorteil dieses Modells.
- **Szenario B** (tape-mag gegated): Für die Member-Tiefe ist das Paywall-Markup **Pflicht** — es ist genau der Mechanismus, der Google die crawlbare Preview-Schicht sauber von der gegateten Tiefe trennt und so Cloaking ausschließt.

---

## 7. Cloaking-Verbot — die eine harte Regel

Das größte Risiko ist **Cloaking**: dem Googlebot vollen Inhalt zeigen, menschlichen Besuchern aber eine Wand. Das ist ein Google-Richtlinienverstoß und führt zu Abstrafung/Deindexierung.

**Regel:** Crawler und anonymer menschlicher Besucher sehen **exakt dasselbe**. Googlebot wird nicht per IP/User-Agent bevorzugt behandelt. Da unser Modell ohnehin „Inhalt für alle frei, nur Transaktion gegated" lautet, ist Cloaking gar kein Thema — vorausgesetzt, niemand baut später eine Sonderbehandlung für Bots ein. Das ist die Disziplin, die das ganze Konzept trägt.

⚠️ **Konsequenz für das Membership-Modell:** Ein striktes „ohne Membership *gar nichts* sehen" ist mit SEO **unvereinbar**. Das Konzept funktioniert nur, wenn Discovery/Inhalt offen bleibt. Genau deshalb ist Entscheidung #8 (Umfang Basis-Membership) und die Bestätigung „Inhalt offen" SEO-kritisch.

---

## 8. Messung & Betrieb

- **Google Search Console** für alle Domains; nach Cutover „Adressänderung" + Crawl-Stats, 404-/Soft-404-Monitoring.
- **Strukturierte-Daten-Validierung** (Rich Results Test) im Deploy-Check.
- **Index-Coverage-Monitoring:** Wie viele der 41k Seiten sind tatsächlich indexiert? Ziel ist hohe Abdeckung des Long Tails.
- **Logfile-Analyse:** Crawl-Budget — wohin geht Googlebot? Sitemaps + interne Verlinkung steuern.
- KPIs: indexierte Seiten, organische Sitzungen, Rankings für Sold-Archive-/Hub-Keywords, organisch→Membership-Conversion.

---

## 9. Risiken & offene Punkte

| Risiko / Punkt | Bewertung |
|---|---|
| Striktes „Membership zum Sehen" gewählt | ⛔ Killt SEO — Konzept setzt zwingend offenen Inhalt voraus |
| Cloaking (Bot ≠ Mensch) | ⛔ Abstrafung — niemals Sonderbehandlung für Crawler |
| Duplicate Content tape-mag ↔ Commerce | 🟡 Lösbar via Canonical-Hoheit (§5) — muss bewusst entschieden werden |
| tape-mag wird membership-gegated (aktuell in Prüfung) | 🟡 Verkraftbar **nur mit** öffentlicher Preview-Schicht pro Entität (Szenario B, §1) — ohne sie ⛔ SEO-Totalverlust des 41k-Long-Tails |
| Auktions-Seiten nach Ende → Index-Müll | 🟡 Sold-Archive-Überführung statt verwaister Seiten |
| Client-only-Rendering versteckt Inhalt | 🟡 SSR/SSG für alle Zone-1/2-Seiten Pflicht |

> **Zusammengefasst:** Maximale SEO-Power trotz Paywall ist erreichbar — der Schlüssel ist nicht ein Trick, sondern eine Architektur-Entscheidung: **es muss eine öffentliche, crawlbare Ebene geben.** Ob tape-mag ganz frei bleibt (Szenario A) oder gegated wird (Szenario B, dann mit Preview-Schicht pro Entität), SEO überlebt **nur**, solange diese öffentliche Ebene existiert, server-gerendert ist und Cloaking tabu bleibt. Das Sold-Archive ist der neue Content-Hebel, die Empfehlung lautet „Freemium-tape-mag". Wird das eingehalten, ist die Paywall für SEO beherrschbar.
