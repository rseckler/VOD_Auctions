# 7 — Design-Prompt: UX/UI-Konzepte für tape-mag & VOD Records

**Stand:** 2026-05-16
**Zweck:** Fertiger Prompt, der an ein Design-Tool / einen Design-Agenten (Claude Design / frontend-design / Stitch) übergeben wird, um zwei UX/UI-Konzepte erstellen zu lassen — eines für die tape-mag-Erlebnisplattform, eines für VOD Records (Commerce).

**Festlegungen:** Beide Plattformen nutzen **dieselbe Designsprache** — das bestehende „Vinyl Culture"-Designsystem, gemeinsam weiterentwickelt. tape-mag und VOD Records unterscheiden sich **nicht** in der visuellen Identität, sondern nur in Tonfall, Layout-Dichte und Schwerpunkt. Produkt-UI-Sprache ist **Englisch** (Projektregel).

---

## ⬇️ Ab hier: der Prompt (kopieren & übergeben)

---

**Rolle:** Du bist Senior Product Designer mit Schwerpunkt Marktplätze, Kultur-/Archiv-Plattformen und Community-Produkte. Erstelle **zwei eigenständige, aber verwandte UX/UI-Konzepte** für die zwei Plattformen eines Industrial-Music-Unternehmens.

### Gesamtkontext

Es gibt ein gemeinsames technisches Fundament (Medusa.js-Backend + Supabase + Next.js) und eine **geteilte Katalog-Datenbank von ~41.500 Tonträgern und Literatur** aus dem Industrial-/Experimental-/Noise-Music-Bereich (Vinyl, Kassetten, Reels, Bücher, Zines) — eines der größten Archive dieser Nische weltweit, aufgebaut von Sammler Frank Bull. Auf diesem Fundament laufen **zwei Plattformen**, die sich die Katalogdaten teilen, aber bewusst **unterschiedlich anfühlen** sollen:

- **tape-mag** — die **Erlebnis-/Archivplattform**. Hier wird das Archiv *erlebt*: entdecken, stöbern, recherchieren, eintauchen, diskutieren. Nicht-kommerziell im Charakter — eher Museum / kuratiertes Online-Archiv als Shop.
- **VOD Records** — die **Commerce-Plattform**. Hier wird *gekauft und verkauft*: der offene Label-Store mit VOD Records' eigenen Editionen (das Label besteht seit 20+ Jahren) sowie der Marktplatz „VOD Auctions" mit Auktionen und Direktverkauf, auch für Dritt-Verkäufer.

**Geschäftsmodell-Kontext, der das UX prägt:**
- VOD Auctions (der Marktplatz) ist **membership-gegated** — Basis-Membership (~€2–3/Monat) zum Bieten/Kaufen, Seller-Membership zum Verkaufen. Der **VOD-Records-Label-Store ist membership-frei** (jeder kauft normal).
- tape-mag soll als „**Freemium**" funktionieren: eine öffentliche, voll sichtbare Preview-Ebene (für jeden + für Suchmaschinen crawlbar) plus eine tiefere Erlebnis-/Community-Ebene, die ggf. Mitgliedern vorbehalten ist.
- **SEO ist geschäftskritisch:** öffentliche Seiten müssen für anonyme Besucher und Crawler vollwertig funktionieren — Inhalt sichtbar, nur Transaktion/Tiefe ggf. gegated.

**Zielgruppen:** Plattensammler und Szene-Insider (Kennerschaft, Detailtiefe erwartet), Forschende/Musikjournalismus, sowie Neugierige, die über eine Google-Suche nach einem obskuren Release hereinkommen. Erfahrene wie Erstbesucher müssen sich zurechtfinden.

### Gemeinsame Leitplanken (für beide Plattformen)

- **Ästhetik:** Industrial-Music-Kultur — dunkel, roh aber kultiviert, hoher Respekt vor der Cover-Kunst (Artwork ist der Held). Kein generisches „AI-SaaS"-Look, kein steriles Marktplatz-Grid. Charakter, Haltung, Kuratorenblick.
- **Verhältnis der beiden:** geteilte Daten **und eine gemeinsame Designsprache** — beide leiten sich aus *demselben* System ab. tape-mag wendet es editorialer/archivierender an (mehr Raum, mehr Bild, mehr Verweilen), VOD Records transaktionaler/dichter — aber es ist sichtbar dieselbe Marken-Familie. Beschreibe die sichtbaren **Querverweise** zwischen ihnen („Im Archiv ansehen" ↔ „Bei VOD verfügbar/ersteigern").
- **Tech-Rahmen:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion. Server-gerendert (SSR/SSG) — Designs müssen ohne Client-JS-Abhängigkeit als statische Seite Sinn ergeben.
- **Eine gemeinsame Designsprache (verbindlich):** Beide Plattformen nutzen *dasselbe* Designsystem — das bestehende „Vinyl Culture"-Theme, gemeinsam weiterentwickelt: Schriften DM Serif Display (Headlines) + DM Sans (Body), Gold-Akzent `#d4a54a`, Dunkelbraun `#1c1915`. **Keine getrennten Identitäten** — tape-mag und VOD Records sind erkennbar dieselbe Marken-Familie. Unterschiede entstehen ausschließlich über Tonfall, Layout-Dichte, Schwerpunkt-Komponenten und Bildanteil — nicht über Farbe, Typografie oder Identität.
- **UI-Sprache:** alle Screen-Texte/Labels in **Englisch**.
- **Pflicht:** WCAG 2.1 AA, Mobile-first/responsive, gute Core Web Vitals, klare Fokus-/Tastatur-Bedienung.

---

### Plattform 1 — tape-mag (Erlebnisplattform)

**Zweck:** Frank's Archiv erlebbar machen. Discovery-first statt Suchmaske-first; Serendipität, Eintauchen, Verweilen. Tonalität: kulturell, kuratorisch, ehrfürchtig, editorial — wie ein gut gemachtes Zine trifft Museumsarchiv.

**Schlüssel-Screens / -Flows (Konzept ausarbeiten):**
1. **Home / Discovery** — kuratierte Einstiege (Genres, Ären, Labels, „Frank's Picks", Editorial), visuelles Stöbern. Keine reine Suchbox.
2. **Release-Detailseite** — Cover-Artwork als Held, Tracklist, Credits, Verknüpfung zu Band/Label/verwandten Releases, Bildergalerie, Audio-Embeds (Bandcamp/YouTube), Community-Diskussion + Reviews, dezenter Verweis „Bei VOD verfügbar". **Zeige zwei Zustände: die öffentliche Preview-Variante und die volle Member-Tiefe.**
3. **Artist/Band-Seite** und **Label-Seite** — redaktioneller Content, Diskografie, Galerie.
4. **Genre-/Ära-/Format-Hub-Seiten** — kuratierte Landing-Pages.
5. **Explore / Suche** — für gezielte Recherche.
6. **Community** — Mitglieder-Profil, Aktivitäts-Feed, Post-Detail, Listen, Reviews; Frank's Editorial-Track „Dispatch".
7. **Membership-Moment** — wie eine öffentliche Preview elegant zur Mitgliedschaft führt (ohne Hardwall-Frust).

**Besondere UX-Herausforderungen:** Discovery-/Serendipitäts-Gefühl bei 41k Einträgen; die Preview-vs-Member-Tiefe sauf derselben Seite ohne Bruch; Cover-Kunst-zentriertes Layout; Wirkung auch für den anonymen Erstbesucher aus der Google-Suche.

---

### Plattform 2 — VOD Records (Commerce)

**Zweck:** Verkaufen — vertrauenswürdig, premium, sammlergerecht, aber transaktional klar. Tonalität: selbstbewusste Commerce, „Vinyl Culture", collector-grade. Baut auf dem bestehenden Theme auf.

**Schlüssel-Screens / -Flows (Konzept ausarbeiten):**
1. **Home** — Commerce-Landing: laufende Auktionen, Label-Neuheiten, Highlights.
2. **VOD-Records-Label-Store** — die eigenen Label-Editionen, **offen ohne Membership** kaufbar; muss als „das eigene Label" erkennbar von Marktplatz-Ware abgesetzt sein.
3. **Auktions-Übersicht** (Themen-Blöcke) und **Auktions-Los-Detail** — Live-Bidding, Countdown, Gebotshistorie, Proxy-Gebot, Dringlichkeit ohne Reizüberflutung.
4. **Direktkauf-Listing-Detail** + **Warenkorb & Checkout** (Stripe/PayPal).
5. **Account** — Bestellungen, Gebote, gemerkte Artikel, read-only Archiv früherer Bestellungen (Altkunden-Historie).
6. **Membership** — Tier-Übersicht/Signup und vor allem **der Gate-Moment**: wie ein Nicht-Mitglied beim Bieten/Kaufen auf dem Marktplatz elegant zur Membership geführt wird und konvertiert.
7. **Seller-Flows** — Seller-Dashboard, Artikel einstellen, Verkaufs-Kontingent/Upgrade.
8. **Öffentliche Marktplatz-Preview** — wie ein Listing für anonyme Besucher/Crawler aussieht (Inhalt sichtbar, Aktion gegated).

**Besondere UX-Herausforderungen:** der Membership-Gate-Moment als Conversion-Chance statt Frust; die Lesbarkeit „offener Label-Store vs. gegateter Marktplatz"; Auktions-Dringlichkeit; Vertrauens-Signale (Zustand, Versand, §25a-Hinweis); Seller-Onboarding.

---

### Gewünschte Deliverables (je Plattform getrennt)

1. **Visual-Direction** — die *eine* gemeinsame, weiterentwickelte „Vinyl Culture"-Designsprache: Stimmung, Farbwelt, Typografie, Bildsprache, Motion-Haltung. Zeige, wie *dasselbe* System auf beiden Plattformen unterschiedlich *angewendet* wird (Dichte, Raum, Tonfall) — ohne getrennte Identitäten. Begründung dazu.
2. **Informationsarchitektur / Sitemap** je Plattform.
3. **Schlüssel-Screens** — pro oben gelistetem Screen ein Layout-Konzept auf Wireframe-Niveau (Aufbau, Hierarchie, Kern-Komponenten, Zustände inkl. anonym/Preview vs. Member).
4. **Komponenten-/Designsystem-Richtung** — wiederkehrende Bausteine, abgeleitet aus der gemeinsamen DNA.
5. **Responsive-/Mobile-Konzept** — die wichtigsten Screens mobil.
6. **Accessibility-Hinweise** — Kontrast, Fokus, Tastatur, semantische Struktur.
7. **Verhältnis der beiden** — wie tape-mag und VOD Records aus *einer* Designsprache erkennbar zusammengehören und sich nur über Anwendung/Schwerpunkt unterscheiden, inkl. der Übergangs-/Cross-Link-Punkte.

### Antwortformat

Strukturiert, pro Plattform ein eigener Abschnitt, plus ein einleitender Abschnitt zur gemeinsamen Design-DNA. Jede Designentscheidung kurz begründen. Wo sinnvoll, ASCII-/Layout-Skizzen für Schlüssel-Screens. Halte es konkret und umsetzbar für ein Next.js/Tailwind/shadcn-Team.

---

## ⬆️ Ende des Prompts

**Hinweis zur Nutzung:** Dieser Prompt erzeugt ein **Konzept** (IA, Layouts, Visual-Direction). Für die anschließende Generierung konkreter Screen-Designs eignet sich Stitch (siehe Memory `feedback_stitch_workflow` — Design-System via MCP, Screen-Generierung über die Web-UI). Bestehende Design-Referenzen im Repo: `docs/UI_UX/` (Style Guide), `docs/DESIGN_GUIDE_FRONTEND.md`, `docs/DESIGN_GUIDE_BACKEND.md`.
