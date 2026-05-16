# Erweiterung 02 — Design-Handoff für Claude Design

**Zweck:** Paste-fertiger Brief für Claude Design. Erzeugt ein visuelles Mockup der verdichteten VOD Community.
**Stand:** 2026-05-16 · Bezug: [`ERWEITERUNG_02_KONZEPT.md`](./ERWEITERUNG_02_KONZEPT.md)

---

## So übergibst du das (Robin, kurz)

1. Neue Claude-Design-Session öffnen.
2. **Datei anhängen:** `docs/Community/VOD Community Mockups.html` — das ist der **Vorher**-Zustand (aktuelles Aussehen, rc68).
3. **Alles ab der Linie unten** in den Prompt kopieren.
4. Claude Design liefert ein interaktives HTML-Artifact mit den 4 verdichteten Screens.

---
--- AB HIER KOPIEREN ---

# Auftrag: Density-Revision der VOD Community

Du gestaltest eine **visuelle Verdichtungs-Revision** einer bestehenden Social-Plattform. Im Anhang findest du `VOD Community Mockups.html` — das ist der **aktuelle Zustand**. Deine Aufgabe ist **nicht**, neu zu erfinden, sondern dasselbe Produkt **kompakter** zu zeigen.

## Das Produkt

VOD Community ist der soziale Layer einer Auktions-/Shop-Plattform für Industrial-Music-Tonträger (Vinyl, Kassetten, Literatur). Mitglieder posten Diskussionen, schreiben Reviews, kuratieren Listen, folgen sich. Posts sind oft an einen Katalog-Artikel (eine Platte/Kassette) verknüpft. Ein Kurator („Frank") schreibt redaktionelle Editorial-Beiträge.

## Design-Sprache — verbindlich, nicht ändern

„Vinyl Culture", dunkel und ruhig:
- **Schriften:** DM Serif Display (Headlines/Editorial-Titel), DM Sans (alles andere)
- **Farben:** Gold-Akzent `#d4a54a`, Hintergrund dunkel `#1c1915`, gedämpfte Töne dazwischen
- **Tonalität:** Letterboxd, nicht Facebook — dicht, ruhig, bildbetont, erwachsen
- **Alle UI-Texte bleiben Englisch.**

Farben, Schriften und die generelle Ästhetik aus dem Anhang **übernimmst du 1:1**. Es geht ausschließlich um **Dichte**.

## Das Problem

Der aktuelle Zustand (Anhang) ist zu großzügig: Post-Boxen zu groß, Abstände zu groß, Schrift zu groß. Pro Bildschirm ist nur ~1,5 Feed-Eintrag sichtbar. Das fühlt sich nach „Plakatwand" an, nicht nach „Feed".

## Das Ziel

**Ein Feed-Eintrag ist eine Gesprächszeile, kein Plakat.** Branchen-Benchmark (Instagram, X/Twitter, Reddit, Letterboxd):
- Desktop: **3–4 Feed-Einträge** gleichzeitig sichtbar
- Mobile: **2–3 Feed-Einträge** gleichzeitig sichtbar

Verdichtungs-Regeln (als visuelle Richtwerte, nicht als Pixel-Diktat):
- **Card-Padding** klein: ~14px statt großzügiger 24px+
- **Abstand zwischen Cards:** schmal — ~8–12px Lücke *oder* eine 1px-Trennlinie. Keine 30px-Luftpolster.
- **Feed-Avatar:** 32–40px (nicht 48px)
- **Post-Fließtext:** 14–15px, Zeilenhöhe ~1.45 (nicht 1.6+). Nach 3–4 Zeilen abschneiden mit „… more".
- **Meta-Zeile** (Name · Handle · Zeit): 12px, leiser
- **Action-Zeile** (Reactions, Kommentare, Bookmark): eine flache Reihe, ~32–36px hoch
- **Editorial-Card im Feed:** darf sich durch eine Goldlinie + etwas größeren Serif-Titel (~18px) abheben — bleibt aber im selben Dichteraster
- **Media in der Card:** randlos (edge-to-edge), einheitliches quadratisches 1:1-Verhältnis (Cover sind quadratisch)
- **Inline-Release-Verknüpfung:** kleines Cover (~52px) + Titel/Artist + Link — eine kompakte Zeile, kein großer Block

## Die 4 Screens

Zeige für jeden Screen idealerweise **Vorher (großzügig) ↔ Nachher (verdichtet)** nebeneinander oder per Toggle.

1. **Hub-Feed Desktop** — zweispaltig: links der Feed (gemischt aus Discussion-Posts + einer Editorial-Card), rechts eine schmale Discovery-Sidebar (~300–320px). Der wichtigste Screen — hier muss man den Density-Sprung sofort sehen (vorher ~1,5 → nachher 3–4 Einträge).

2. **Hub-Feed Mobile** — einspaltig. **Neu:** eine fixe **Bottom-Tab-Bar** am unteren Rand (5 Slots: Feed · Explore · Compose · Members · Notifications; Compose ist der hervorgehobene goldene `+` in der Mitte, wie bei TikTok/Instagram). Höhe ~52px. Die Seite darf sich nicht horizontal bewegen. Sekundär-Navigation (Feed/Explore/Lists/Dispatch/Members) als schlanke horizontal scrollbare Leiste oben.

3. **Post-Detail** — die **Leseansicht** eines einzelnen Posts. **Wichtig: dieser Screen bleibt großzügig** — große DM-Serif-Headline, komfortabler 17px-Fließtext, Drop-Cap. Er dient als bewusster Kontrast: im Feed dicht, im Detail luftig. Zeig ihn, damit der Unterschied „Feed-Skala vs. Lese-Skala" klar wird.

4. **Member-Profil** — Banner, Avatar, 4 Featured-Release-Cover, eine kompakte Stats-Zeile (Posts/Reviews/Followers), darunter Tabs (Posts/Comments/Reviews/Acquired/Lists) und ein verdichteter Eintrags-Feed im selben Dichteraster wie Screen 1.

## Was NICHT verändert wird

- Keine neuen Features, keine neuen Seiten — nur Dichte + die Mobile-Bottom-Nav.
- Post-Detail-Leseansicht bleibt großzügig (s. o.).
- Design-Sprache, Farben, Schriften: 1:1 aus dem Anhang.

## Output

Ein interaktives HTML-Artifact. Pro Screen Vorher/Nachher vergleichbar (Toggle oder side-by-side). Desktop-Screens in Desktop-Breite, Mobile-Screens in einem Phone-Frame (~390px breit). Echte Beispiel-Inhalte (Plattennamen, Diskussionen) statt Lorem Ipsum — gern Industrial/Post-Punk-Tonalität.

--- BIS HIER KOPIEREN ---

---

## Nach dem Mockup (Robin → Claude Code)

Wenn dir das Visual gefällt: Mockup-HTML oder Screenshots zurück in diese Session geben. Ich gleiche das verdichtete Ergebnis mit `ERWEITERUNG_02_KONZEPT.md` §3–§5 ab, ziehe konkrete Werte nach und setze es in `community.css` um (geplant rc69.0 Density + rc69.1 Mobile-Nav).
