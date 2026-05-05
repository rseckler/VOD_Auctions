# VOD Community — Konzept

**Status:** Draft v1 (2026-05-05)
**Owner:** Robin Seckler
**Stakeholder:** Frank Maier (Inhalt + Curation), Robin Seckler (Tech + Plattform)
**Version:** 0.1 — initialer Konzept-Wurf, noch nicht abgesegnet
**Verwandte Docs:** [`CRM_SYSTEM_STATE_2026-05-04.md`](../architecture/CRM_SYSTEM_STATE_2026-05-04.md), [`POST_AUCTION_MARKETING_FUNNEL.md`](../optimizing/POST_AUCTION_MARKETING_FUNNEL.md), [`NEWSLETTER_CRM_HYBRID_PLAN.md`](../optimizing/NEWSLETTER_CRM_HYBRID_PLAN.md)

---

## 0. Briefing (Original-Text)

> Wir möchten die Plattform VOD auctions erweitern um Community-Funktionen. Wir denken dabei daran dass wir bisher die Facebook-Gruppe „Vinyl on Demand" oder „VOD Records" auf unsere eigene Plattform überführen. Warum? Zunehmend nervt das, dass Meta eigene Posts unsere eigenen Posts reglementiert und nur in sehr eingeschränktem Umfang überhaupt den Community-Members zuführt.
>
> Deshalb möchten wir auf der Plattform einen Bereich bilden, in dem die Community für Music, VOD Records etc. einen Raum gibt. Dort sollen primär alle Leute posten können, insbesondere natürlich Frank und mit seinem Wissen über die Szene. Es soll natürlich eine richtige Community entstehen mit tatsächlich Posts, Comments, Likes, was heute auf so einer Plattform dazu gehört.
>
> Ich geh mal davon aus, es gibt bereits umfangreiche Bibliotheken, GitHub-Projekte etc., die wir einbeziehen können ohne dass wir alles neu entwickeln müssen. Wir können auf bestehende Tool-Setups, die es frei gibt, aufsetzen, um diesen VOD oder VOD Options Community-Bereich aufzubauen.
>
> Die Frage wird auch sein wie wir die gesamte Plattform VOD Auctions erweitern können mit diesen Community-Funktionen so dass das ein genereller Bestandteil wird und wir die Mitglieder dieser Community an vielen Stellen einbinden können. […] Das gute VOD-Kunden, also VOD-Records-Kunden, einen besseren Status haben und dieser darf ruhig auch gezeigt werden.
>
> Die Members sollen sich auch ausdrücken können, ihre eigene Profil-Seite bestücken können und zelebrieren können, sich beschreiben können. Zudem sollte natürlich auch Videos, Bilder und so weiter hochgeladen werden können.
>
> Mache einen deep research über andere Nischen-Communities, die es im Internet so gibt. Was da Best Practice ist, was da Benchmark ist, wie man solche Communities heute am besten betreibt. Baue da einen Vergleich auf. Schau was ist da Must-haves, was ist nice to have. Baue da ein umfangreiches Konzept auf. Sowohl technisch konzeptionell/grafisch/visuell/UX/UI als auch rein marketing-mäßig konzeptionell.
>
> Und zwar auch so im Konzept einen Abschnitt machen für Frank, damit Frank, der wenig Technikverständnis hat, das auch verstehen kann.

---

## 1. Executive Summary

Die VOD-Community wird ein integraler Plattform-Bereich neben Auctions / Catalog / CRM — kein „Forum-Bolt-On". Das ist die strategische Hauptentscheidung dieses Konzepts.

**Empfehlung:** **Build native auf vorhandenem Stack** (Medusa + Next.js + Supabase + Tiptap + R2). Keine Discourse-/NodeBB-/Lemmy-Integration via SSO. Begründung: die zwei wichtigsten Hebel — **(a) Inline-Engagement an Releases/Bands/Auctions** und **(b) Status-Vererbung aus dem CRM-Tier-System (Platinum/Gold/Silver/Bronze)** — gehen mit eingebetteten Forum-Engines nur unter Schmerzen.

**Vorbild-Community im Konzept:** **Letterboxd** (Film) ist das Gold-Standard-Modell für Nischen-Enthusiasten-Communities. Tieferes Studium auch von **Discogs Forums** (direkter Genre-Nachbar), **Rate Your Music** (Listen-Kultur), **Resident Advisor Editorial+Comments** (elektronische Musik), **BoardGameGeek** (Long-Term-Stickiness in Nische), **Are.na** (Slow-Social/Sammlung als Statement) und **Bandcamp Fan-Profile** (Identität-als-Sammler).

**Kernidee:** Die Community ist nicht eine separate „Wand" — jedes **Release**, jeder **Auction Block**, jede **Band**, jedes **Label** und jede **Press** ist ein eigener Community-Anker mit eigenem Diskussions-Thread. Member-Profile aggregieren über alles hinweg — Käufe, Posts, Kommentare, Lists, Wantlist, Bestätigtes-Eigentum, Reviews. Frank's Stimme wird als kuratierte „Dispatch from the Vault"-Spur prominent geführt.

**Zeit/Aufwand-Schätzung (grob, bis Beta):** 8-12 Wochen Vollzeit-Dev (Robin) für MVP, danach iterativ. Vergleichbar mit dem CRM-Master-v1-Buildout (rc53.0, 6 Sprints, ~10k LOC) plus Frontend-Aufwand.

**Marketing-Kernhebel:** Facebook-Migration mit personalisiertem Invite-Strom (existing rc52-Invite-System), CRM-Tier als sichtbares Statussymbol, Frank-as-Curator-Posts als Lead-Magnet, Cross-Posting in den ersten 6 Monaten zurück nach Facebook (mit Link „weiterlesen auf vod-auctions.com").

---

## 2. Strategischer Kontext

### 2.1 Warum jetzt — und warum eigene Plattform

Drei zusammenfallende Treiber:

1. **Meta-Drosselung** ist real. Facebook-Gruppen-Reichweite liegt 2025/26 bei typischerweise 5-15% der Gruppen-Member-Zahl pro Post. Frank's Posts, die früher organisch 30-50% gesehen haben, schrumpfen seit Algorithmus-Shifts (Pivot zu Reels, Suppress-Outbound-Links) systematisch.
2. **CRM-Master ist gerade fertig (rc53.0).** 14.450 Master-Contacts, 76,7% Email-Coverage, Tier-System (Platinum/Gold/Silver/Bronze), Audit-Log, Newsletter-Sync — das ist die Identitäts-Infrastruktur, auf der eine Community überhaupt erst sinnvoll wird. Ohne CRM-Tier wäre „guter Kunde sichtbar" nur ein Bauchgefühl. Mit CRM-Tier ist es eine berechnete Aussage.
3. **Auction-Plattform braucht zweite Engagement-Schleife.** Auctions sind transaktional und burst-haft (alle paar Wochen ein Block). Dazwischen muss die Plattform „leben". Community-Posts sind das einzige skalierbare Mittel, Daily-Active-Use zu erzeugen, ohne dass Frank täglich content-pushen muss (Member-Generated-Content trägt).

### 2.2 Wer ist die Community

Aus den CRM-Daten ableitbar:

- **27 Platinum** + **419 Gold** + **1.683 Silver** = ~2.130 high-engagement-Sammler (Lifetime Revenue jeweils >X Schwelle)
- **4.327 Bronze** = aktive Käufer ohne Premium-Volumen
- **3.167 Standard** + **3.000+ Newsletter-only** = wartender Long-Tail
- **Profil:** Industrial / Power Electronics / Noise / Experimental / Tape-Underground-Sammler. International (Deutschland-Schwerpunkt, starkes US/UK/JP-Tail). Älteres Median-Alter (40+), männerdominiert (~85%), hohe Ausgabebereitschaft, hohe Loyalität, niedrige Anonymitäts-Toleranz (echte Namen / Klar-Adressen).
- **Facebook-Gruppe** „Vinyl on Demand": ~Anzahl Mitglieder TBD durch Frank — vermutlich 2-5k. Aktive Poster: Frank + ~10-30 Power-User. Diese ~10-30 sind die ersten, die geholt werden müssen.

### 2.3 Was die Community NICHT sein soll

Wichtig für Scope-Klarheit:

- **Kein generisches Forum** mit unzähligen Sub-Foren. Themen-Sub-Räume entstehen organisch über Tags, nicht über einen Sub-Forum-Baum.
- **Keine Mini-Mastodon-Fediverse-Instanz** in Phase 1. ActivityPub-Bridge ist Phase-3-Optional, kein MVP-Feature.
- **Kein Discord-Ersatz.** Kein Real-Time-Chat als zentrales Feature. Punktuell „Live during Auction" ist OK, aber die Community-Spine ist asynchron.
- **Kein Marketplace** im engeren Sinne (User-zu-User-Verkauf). Marketplace ist RSE-291 und ein eigenes Projekt.

---

## 3. Benchmark-Analyse: Wie machen es andere Nischen-Communities

Die folgende Analyse ist eine Synthese aus öffentlich beobachtbarem Verhalten und etablierten Community-Design-Patterns. Quellen: eigene Beobachtung dieser Plattformen + Standardliteratur (Kim's „Community Building on the Web", Spinks „People Powered", FeverBee-Posts, Jay Baer „Hug Your Haters").

### 3.1 Letterboxd (Film) — Das engste Vorbild

**Was sie richtig machen:**

- **Identität durch Konsum.** Das Profil = was du gesehen hast, was du bewertest, was deine Top-4 sind. Nicht „Selbstvorstellung".
- **Lists als Hauptfeature.** „Top 100 Slasher-Filme der 80er", „Bei Regen guckbar", „Filme mit Streichquartetten in der Eröffnungsszene". Lists werden geliked, kommentiert, gefolgt.
- **Reviews mit Nuancen-Skala.** ★ bis ★★★★★ in halben Schritten + freier Text, keine binäre Liked/Disliked.
- **Activity Feed = Default-Landing.** Wenn ich einlogge, sehe ich was die Leute gucken denen ich folge, nicht Algorithmus-Soup.
- **Year-in-Review.** Jahresende automatisch generiertes „Dein 2025 in Filmen" — viral-tauglicher Shareable.
- **Tags niedriggewichtig, Lists hochgewichtig.** Das umgekehrte Modell von Twitter/X.
- **Pro-Tier (Pro/Patron) freischaltet Cosmetic-Features** (Header-Bild, advanced Filter), nicht Core-Funktionen. Daher freiwillig statt aufgezwungen.

**Was wir übernehmen:**
- Lists als First-Class-Citizen
- Activity Feed als Default-Landing für eingeloggte Member
- ½-Sterne-Bewertungs-Skala für Releases (4-Sterne-Schema, nicht 10-Punkt-RYM-Pedanterie)
- Year-in-Review-Generator (Phase 2)
- Customer-Tier als sichtbarer Pin am Avatar (wir haben es, Letterboxd hat „Patron"-Sterne)

**Was wir nicht übernehmen:**
- Watched/Watchlist-Trennung — bei uns ist es Owned/Wantlist, das gibt's schon via Discogs-Integration

### 3.2 Discogs Forums — Direkter Nachbar, Warnung

**Was sie haben:** Klassisches phpBB-artiges Forum, organisiert nach Sub-Foren (Buy/Sell, Marketplace Help, Genre-Foren, …).

**Probleme, die wir nicht reproduzieren:**
- **Sub-Forum-Sprawl.** 40+ Sub-Foren, schlechte Discoverability. Die meiste Aktivität konzentriert in 4-5.
- **Threads sind vom Catalog losgekoppelt.** Wenn du über ein Release diskutieren willst, machst du einen neuen Thread, der nicht am Release hängt. Wir wollen das umgekehrt: jedes Release IST ein Thread-Anker.
- **Schlechte Mobile-Experience.** Rein-Desktop-Mindset.
- **Profilseiten sind Sammlungs-Stats-only.** Keine Selbstdarstellung.

**Was wir übernehmen:**
- **Marketplace-Forum-Trennung** als mentales Modell (Diskussion ≠ Verkauf, sehr klar abgegrenzt — wichtig wegen DSGVO + AGB)
- Catalog-Crosslinks in Posts (`@release:1234` rendert als Release-Card)

### 3.3 Rate Your Music (RYM) — Listen-Kultur extrem

**Stark:**
- Höchste Listen-Dichte aller Musik-Communities. „Top 100 Industrial 1980-89" ist da Sport.
- Genre-Tagging mit sehr feiner Taxonomie (Power Electronics ≠ Death Industrial ≠ Martial Industrial). Wertvoll für unsere Nische.
- Bewertungs-Verteilungen pro Release (Histogramm) zeigen Konsens vs. Polarisierung.

**Schwach:**
- Brutalistisches UI, Anti-Mobile.
- Tone is famously toxic / pedantic.
- Kein Rich-Media (keine Embeds).

**Übernehmen:** Listen-Kultur, Rating-Histogramm pro Release, sehr feine Genre-Tags (wir haben das halb über `tags` und Stammdaten).
**Nicht übernehmen:** Brutalismus, Karma-Wars, Listen-Ranking-Nerdery.

### 3.4 Resident Advisor (RA) — Editorial + Community-Stimme

**Stark:**
- **Editorial first.** Nicht User-Generated-Content-only. RA selber publiziert hochwertige Reviews + Features. Community-Diskussion hängt darunter.
- **Event-Listings + Aftermovies + Mixes** als Multi-Format-Content.
- Klare Tonalität, niedrige Toxicity weil moderiertes Editorial-Layer.

**Übernehmen:** **Frank's Editorial-Spur ist der Anker.** Frank publiziert wöchentlich/zweiwöchentlich Long-Form-Posts (Vault-Stories, Re-Discoveries, Interviews mit Künstlern). Community kommentiert/diskutiert darunter. Das gibt Editorial-Quality + Community-Engagement. **Das ist der wichtigste Punkt aus dieser Analyse.**

**Nicht übernehmen:** Event-Listings (wir machen keine Events) — außer Auction-Blocks als „Events".

### 3.5 BoardGameGeek (BGG) — Niche-Community Marathon-Champion

**Stark:**
- **Seit 25 Jahren stabil**, eine der ältesten überlebenden Nischen-Communities.
- **Der „Hotness"-Algorithmus** — Trending-Items, nicht Top-of-All-Time. Schafft konstante Bewegung.
- **Crowd-sourced Stammdaten** — User editieren Spiel-Metadaten. Wikipedia-style Vertrauen.
- **GeekLists** = User-curated „Beste Spiele für 2 Spieler unter 30 Min".
- **Bring-and-Buy / Want-Lists / Trade-Lists** verzahnt mit Marketplace.

**Übernehmen:**
- **Hotness/Trending-Algo** statt Chronologie auf der Community-Landing
- **GeekLists-Pattern**, bei uns „VOD Lists" (Frank: „10 essential ZKO/Tape-Cassettes"; Member: „Mein erstes Industrial-Jahr")
- Wantlists/Owned-Markers (existing Wantlist Discogs-Integration anbinden)

**Nicht übernehmen:** Wiki-Style-Editierbarkeit der Stammdaten durch beliebige User — wir haben Catalog-Edit + Sync-Locks (rc51), Crowd-Editing wäre zu viel Risiko gegen Discogs-Sync-Konflikte.

### 3.6 Bandcamp Fan-Profile — Identity-as-Collector

**Stark:**
- **„Wishlist"-Feed** zeigt was Fans speichern → Discovery via Following.
- **Fan-Notes** zu jedem gekauften Album = Mini-Reviews.
- **Followed-Fans-Activity** = was die Leute kaufen denen du folgst. Sehr motivierend / FOMO-treibend.
- **Direkter Crosslink Catalog ↔ Profil ↔ Aktivität.**

**Übernehmen:**
- **Acquired-Feed** (opt-in): „X hat gerade Y aus Block Z erworben"
- **Fan-Notes** an Käufen (private oder public)
- **Following-System** mit Acquired-Activity im eigenen Feed

**Nicht übernehmen:** Bandcamps Diskussions-Schwäche — Bandcamp hat im Grunde keine echte Diskussions-Schicht, nur Ein-Weg-Fan-Notes.

### 3.7 Are.na — Slow Social, Collection-as-Statement

**Stark:**
- **Channels = Collections.** Du kuratierst Bilder/Links/Texte zu Themen. Andere folgen Channels.
- **Sehr niedrige Toxicity** weil keine Likes, keine Follower-Counts prominent, keine Streaks.
- **Algorithmus-frei.** Chronologie + Discovery durch Channel-Browsing.
- **Bezahlmodell.** $4/Monat für unlimited Channels. Eliminiert Spam.

**Lehre:** **Es ist OK, nicht jeden Twitter-Mechanismus zu kopieren.** Wir können bewusst weglassen: öffentliche Follower-Counts, Streaks, Trending-Hashtags. Das ist eine Design-Disziplin-Entscheidung gegen Cheap-Engagement.

### 3.8 Tildes & Lobsters — Invite-Only Quality-First

**Stark:**
- **Invite-System** als Quality-Gate. Jedes neue Mitglied wird von einem bestehenden eingeladen, dessen Reputation auf dem Spiel steht, wenn der Eingeladene sich danebenbenimmt.
- **Tag-basierte Filterung** statt Sub-Communities.
- **Sehr niedrige Population, sehr hohe Qualität.**

**Übernehmen:** Wir haben bereits ein Invite-System (rc52, `invite_tokens`-Tabelle). Während der ersten 12 Monate kann der Community-Bereich Invite-Only laufen. Erst Pre-Launch → Invite-Only-Community → Open. Das schafft Knappheit, Status, niedrige Mod-Last.

### 3.9 Mighty Networks / Circle / Geneva — SaaS-Community-Plattformen

**Was sie zeigen:** Modern-feeling Community-Software ist möglich (im Gegensatz zu Discourse, das immer wie 2013 aussieht).

**Lehren für UI:**
- **Threads Mobile-first.**
- **Reactions ≠ Likes** (Discord-style Multi-Emoji statt nur 👍).
- **Inline-Media-Embeds** (YouTube, Spotify, Bandcamp, SoundCloud, Tweet-Embed).
- **Polls** für Engagement-Spikes.

**Nicht übernehmen:** SaaS-Lock-in. Das sind Mietsysteme, wir bauen In-House.

### 3.10 Subreddits (z.B. r/Vinyl, r/IndustrialMusic, r/Cassetteculture) — Was wir VERHINDERN müssen

**Beobachtungen:**
- Reddit-Karma → Race-to-the-Bottom + Reposts + Memes.
- Anonymität → Toxicity.
- Algorithmus → Boost-Outrage.

**Anti-Patterns für uns:**
- **Keine globale Karma-Score** als Member-Stat.
- **Keine Anonyme Accounts.** Auch wenn nicht-Käufer rein dürfen — Klarname / Pseudonym OK, aber Account ist verifiziert (E-Mail) und nicht throwaway-fähig.
- **Keine Downvotes** sichtbar. (Optional Upvotes, aber „Hide" statt „Downvote".)
- **Algorithmus opt-in** statt forciert.

### 3.11 Vergleichs-Matrix

| Feature | Letterboxd | Discogs Fora | RYM | RA | BGG | Bandcamp | Are.na | Subreddit | **VOD-Plan** |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Activity Feed (Following)** | ✅ Default | ❌ | ⚪ Partial | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ MVP |
| **Editorial-Spur (curator)** | ⚪ | ❌ | ❌ | ✅ Strong | ⚪ | ❌ | ❌ | ❌ | ✅ MVP (Frank) |
| **Lists / Curated Sets** | ✅ Core | ⚪ | ✅ Core | ❌ | ✅ Core | ⚪ | ✅ Core | ❌ | ✅ MVP |
| **Catalog-Anchored Threads** | ✅ | ❌ | ⚪ | ❌ | ✅ | ⚪ | ❌ | ❌ | ✅ MVP |
| **Reactions (multi-emoji)** | ❌ Like only | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ⚪ | ✅ MVP |
| **Profile w/ Custom Header** | ✅ Pro-only | ⚪ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ MVP |
| **Customer-Tier visible** | ✅ Patron-Stars | ❌ | ❌ | ❌ | ❌ | ❌ | ⚪ Premium | ❌ | ✅ MVP |
| **Wantlist/Owned-Toggles** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ Wishlist | ❌ | ❌ | ✅ MVP (Discogs-Brücke) |
| **Reviews (Star + Text)** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚪ Notes | ❌ | ⚪ Comments | ✅ Phase 2 |
| **Year-in-Review** | ✅ | ❌ | ❌ | ❌ | ⚪ | ⚪ | ❌ | ❌ | ✅ Phase 2 |
| **Polls** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ Phase 2 |
| **Inline-Embeds** | ⚪ | ⚪ | ❌ | ✅ | ✅ | ❌ | ✅ Strong | ✅ | ✅ MVP |
| **Live-Chat** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚪ | ❌ kein MVP |
| **Algorithmic Feed** | ⚪ | ❌ | ❌ | ⚪ | ✅ Hotness | ❌ | ❌ | ✅ | ⚪ Opt-in |
| **Public Karma Score** | ❌ | ❌ | ⚪ | ❌ | ⚪ | ❌ | ❌ | ✅ | ❌ bewusst nicht |
| **Federation (ActivityPub)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚪ Lemmy | ⚪ Phase 3 |
| **Invite-Only Phase** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ erst Pre-Launch+Beta |

---

## 4. Must-Haves vs. Nice-to-Haves

### 4.1 MVP / Must-Haves (Phase 1, ~8-12 Wochen)

| # | Feature | Begründung |
|---|---|---|
| M1 | **Member-Profile** mit Avatar, Header, Bio, Location, Pronomen, „Sammler seit", Custom-Display-Name (≠ Klarname) | Foundation. Ohne Profil keine Community. |
| M2 | **Customer-Tier-Badge** am Avatar (opt-in via Profile-Setting; Default ON für Gold+, OFF für Bronze/Standard) | Status-Element, leitet sich aus CRM ab |
| M3 | **Posts** (Thread-Start) — Tiptap-Editor, Bilder, Videos (R2-Upload), YouTube/SoundCloud/Bandcamp/Spotify-Embeds, Discogs/Release-Mention `@release:1234` | Kerninhalt-Typ |
| M4 | **Comments** (eine Ebene Threading, Reddit-light) | Diskussion |
| M5 | **Reactions** (5-7 Emojis: 🔥 ❤️ 🤘 👀 💯 🙏 — nicht Discord-frei, kuratierte Set) | Engagement-Schwelle senken |
| M6 | **Activity Feed** für eingeloggte Member: Posts der Followed-Members + Catalog-Anchored-Posts zu Items im Wantlist + Frank's Editorial-Posts (Force-Pinned für alle) | Daily-Active-Driver |
| M7 | **Catalog-Anchored Discussions** — jede Release / Band / Label / Press / Auction-Block-Page hat einen Diskussions-Tab | Verzahnung statt Bolt-On |
| M8 | **Following / Follower** | Folgen-Pattern für Feed |
| M9 | **Tags** (Frei-Form mit Auto-Complete aus existing-tag-pool) — keine Sub-Foren, Tag-basierte Filter | Discoverability |
| M10 | **Frank's Editorial-Spur** — Bereich „Aus dem Vault" mit Long-Form-Posts. UI-prominent, eigene Permission-Class, eigenes Visual-Treatment | strategischer Eckpfeiler |
| M11 | **Notification Center** (in-app + Email-Digest opt-in) für: Reply auf eigenen Post, Mention `@user`, neuer Post von Followed-Member, Frank-Editorial | Retention |
| M12 | **Moderation Queue** (Admin-Panel) — Reports, Auto-Flagged-Spam, Trust-Level-Gating | Hygiene |
| M13 | **Trust Levels** (Discourse-Pattern, 0-3): TL0=neu (rate-limited, kein Embed), TL1=verified (kann embedden, kann kommentieren), TL2=trusted (kann posten ohne Mod-Queue), TL3=community-vet (kann reporten gewichtet) | Spam/Quality-Schutz |
| M14 | **Search** — Full-Text auf Posts/Comments/Profile-Bios via Postgres-FTS oder Meilisearch (existing Meili-Stack erweitern) | Findability |
| M15 | **Profile-Privacy-Toggles** — „Acquired-Feed öffentlich", „Wantlist öffentlich", „Tier-Badge anzeigen" | DSGVO + Komfort |
| M16 | **DSGVO-Tooling** — Profil-Export (existing GDPR-Export erweitern), Profil-Löschen (Posts werden anonymisiert auf „[deleted user]"), Right-to-be-Forgotten | Pflicht |
| M17 | **AGB-Erweiterung** für Community (Verhaltenscodex, Inhalte-Lizenz, Moderation-Rechte) | Launch-Blocker |
| M18 | **Mobile-Web-First** — alle Community-Views responsive. Keine PWA in MVP. | 80% Traffic |

### 4.2 Phase 2 / Should-Haves (~4-8 Wochen nach MVP)

| # | Feature | Begründung |
|---|---|---|
| S1 | **Lists** — User-curated Release-Sammlungen mit Title/Description, Cover, Public/Private | Letterboxd-Pattern, höchster Engagement-Multiplier |
| S2 | **Reviews** an Releases — ½-Sterne + Freitext, Reviews wie Posts behandelt (likeable, kommentierbar) | Catalog-Anreicherung |
| S3 | **Acquired-Feed** (opt-in) — automatischer „X hat in Block Y erworben"-Post nach Auction-Win/Direct-Buy | Bandcamp-Pattern, FOMO-Engine |
| S4 | **Polls** im Post-Editor | Engagement-Spike, gut für Frank („Welcher Re-Issue als nächstes?") |
| S5 | **Trending / Hotness** — algorithmischer Feed (opt-in, niemals Default) | BGG-Pattern |
| S6 | **Year-in-Review-Generator** | Letterboxd-Pattern, viral-tauglich, einmal pro Jahr großer Push |
| S7 | **Brevo-Newsletter-Integration** — wöchentlicher „Best of Community"-Digest | Cross-Channel |
| S8 | **In-Auction Live-Discussion** — Real-Time-Chat-Layer NUR während aktiver Blocks (Supabase Realtime), schließt automatisch bei Block-Ende | Auction-Engagement-Boost ohne Discord-Pflege |
| S9 | **Member-Map** (opt-in) — Mitglieder weltweit auf Karte | Identity / Belonging |
| S10 | **Spotlight / Member-of-the-Month** — manuelle Auswahl durch Frank | Community-Beziehung |
| S11 | **Image-Galerie** auf Profil — Mehrere Bilder (Setup, Sammlung, Live-Shots) | Self-Expression |
| S12 | **Verified-Acquired-Badge** auf Reviews (Mitglied hat Item nachweislich gekauft) | Trust-Signal |
| S13 | **„LP of the Day" / Hot List** — tägliches und wöchentliches Member-Voting auf Releases. Frank kann eine Shortlist von 5-10 Kandidaten vorgeben („LP des Tages auswählen"), oder es läuft global auf Catalog-Items. Top-Voted-Release wird auf Hub-Page + Newsletter prominent featured. Voting via 1-Click-Tap, Ergebnis transparent (Histogramm). | **Direkt aus User-Voice (FB-Gruppe, 2026-05).** BGG-Hotness-Pattern + Letterboxd-Year-in-Review-Mechanik. Engagement-Spike, Cross-Promotion zu Catalog. Niedriger Build-Aufwand (~3-4 Tage). |
| S14 | **Realtime-Chat „Listening Room"** — themenbezogene Chat-Räume, die nicht permanent offen sind, sondern zeitgesteuert laufen: (a) während aktiver Auction-Blocks (=S8), (b) bei Frank-Editorial-Veröffentlichung +60 min „Live Discussion", (c) wöchentliches „Listening Hour" Donnerstag 20:00 Uhr (begleitend zum Editorial-Drop). Supabase-Realtime-Layer, Posts persist als Comments im zugehörigen Editorial. **Bewusst KEIN immer-offener Discord-Ersatz** — Chat ist Event, nicht Default-State. | **Direkt aus User-Voice.** Spannung statt 24/7-Betreuungslast. Modus „permanente Chat-Lobby" wird begründet abgelehnt (siehe §16.2). |

### 4.3 Phase 3 / Nice-to-Haves (Post-Launch, optional)

| # | Feature |
|---|---|
| N1 | ActivityPub-Bridge (Föderation mit Mastodon/Lemmy/Bonfire) — sehr niche, hoher Build-Aufwand |
| N2 | Native Apps (iOS/Android) — wenn Mobile-Web-Engagement gut, vermutlich nicht nötig |
| N3 | Live-Audio-Räume (Twitter-Spaces-Style) für AMA mit Künstlern |
| N4 | Marketplace-Integration (User-zu-User-Verkauf) — RSE-291 |
| N5 | Bandcamp/Discogs-Auto-Import von Sammlungen |
| N6 | Achievements/Badges-System (gamification — bewusst zurückhaltend) |
| N7 | Private Messages / DMs |
| N8 | Frank-Live-Streams aus dem Lager (RA-Style Mix-Premiere) |

### 4.4 Anti-Patterns / Bewusst NICHT

- **Keine Karma-Punkte / Reputation-Score** sichtbar
- **Keine Downvote-Buttons**
- **Keine Streaks / Daily-Login-Rewards**
- **Keine Algorithmus-only-Feeds als Default**
- **Keine Real-Time-Chat als zentrales Feature**
- **Kein anonymes Posting**
- **Kein DM-System in Phase 1+2** (zu viel Mod-Last bei zu wenig Mehrwert; Notifications + öffentliche Replies reichen)
- **Keine Sub-Foren-Hierarchie**

---

## 5. Tech-Stack-Entscheidung

### 5.1 Build vs. Buy — vergleichende Analyse

| Option | Stack | Pro | Contra | Bewertung |
|---|---|---|---|---|
| **A) Discourse mit SSO** | Ruby/Rails, eigener Service | Ausgereift, Plug-in-Ökosystem, Mod-Tools state-of-the-art | Eigener Tech-Stack zusätzlich (Ruby), Themable aber niemals nativ-fühlend, Catalog-Anchored-Threads sehr schwierig, Tier-Sichtbarkeit über SSO-Sync möglich aber fragil, separater Hosting-Aufwand | ❌ Nicht empfohlen |
| **B) NodeBB embedded** | Node.js | Selber Stack-Familie, REST-API gut, Embedded-Mode existiert | Mod-Tools schwächer als Discourse, Plug-in-Ökosystem dünner, gleiche Catalog-Anchor-Schwierigkeit | ⚪ Backup-Option |
| **C) Lemmy/Bonfire** | Rust/Elixir | Föderation gratis | Anti-VOD-Use-Case (keine Kontrolle, niedrige UX) | ❌ |
| **D) HumHub / Forem / Flarum** | PHP/Ruby | Alle benutzbar | Stack-Fragmentierung, gleiche Anchor-Probleme | ❌ |
| **E) Stream.io (SaaS Activity Feeds + Chat)** | API-as-a-Service | Top-Tech, schnell live | Vendor-Lock-in, monatliche Kosten ab MAU-Schwelle, sensitive Daten extern | ⚪ Phase-3-Option für Chat-only |
| **F) ✅ Build native auf existing Stack** | Medusa+Next.js+Supabase+Tiptap+R2 | Native-fühlend, volle Catalog-Verzahnung, CRM-Tier 1:1 verfügbar, kein Stack-Sprawl, R2 schon da, Tiptap schon da, Supabase Realtime schon da | Build-Aufwand 8-12 Wochen, Mod-Tools von 0 | ✅ **EMPFOHLEN** |

### 5.2 Begründung für Option F (Build native)

1. **Catalog-Verzahnung ist der USP.** Jede Release-Page = Diskussions-Anker. Das ist mit Discourse/NodeBB/Lemmy nicht ohne Custom-Glue lösbar, der dann teurer wird als Native-Build.
2. **CRM-Tier 1:1.** `customer_stats.tier` ist eine SQL-JOIN-Query weit weg. Mit externer Forum-Engine müsste das via Webhook synchronisiert werden — ein zusätzlicher Failure-Mode.
3. **Existing Tooling deckt 80% ab:**
   - **Tiptap** — Rich-Text-Editor (haben wir für Notes seit rc24)
   - **Supabase Realtime** — Live-Counters für Likes/Comments (haben wir für Anti-Sniping)
   - **Cloudflare R2** — Media-Upload (haben wir für Catalog-Bilder, mit `image-upload.ts` Helper)
   - **Meilisearch** — Full-Text-Search (rc40, könnte Community-Index bekommen)
   - **Brevo** — Email-Notifications (haben wir, neue Templates)
   - **Postgres-FTS, ltree, jsonb** — Postgres ist mehr als ausreichend
4. **Stack-Konsolidierung-Doktrin** (Robins Präferenz aus Memory): Single TS-Codebase, nicht ein zweiter Ruby-Service auf dem VPS.
5. **Mobile-Web reicht.** Wenn wir an existing Storefront / Admin-Routes (Next.js 16 App Router) hängen, ist Mobile-Responsive geschenkt.

### 5.3 Bibliotheken / OSS-Komponenten, die wir trotzdem ziehen

**Schon im Projekt:**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/extension-link`, `@tiptap/extension-image` — Editor
- `@supabase/supabase-js` — Realtime
- `@aws-sdk/client-s3` + `sharp` — Media-Upload
- `meilisearch` — Search

**Neu zu ziehen (klein, fokussiert):**
- `@tiptap/extension-youtube`, `@tiptap/extension-iframe` (oder Custom-Node für Bandcamp/SoundCloud) — Embeds
- `framer-motion` (haben wir) — Animationen für Reactions, Likes, Notification-Drawer
- `react-virtual` oder `@tanstack/react-virtual` — Activity-Feed-Virtualisierung
- `oembed-parser` (Server-side) — Generische Embed-Resolution
- `dompurify` + `isomorphic-dompurify` — XSS-Schutz beim Render von Tiptap-HTML
- `react-markdown` — falls wir parallele Markdown-Eingabe wollen (optional)
- `linkify-react` — Auto-Linkify in Plain-Text-Bereichen (Bios)
- **Spam-/Toxicity-Detection** — Optional Claude Haiku 4.5 (haben wir bereits) als Auto-Mod-Layer für Posts > X Zeichen. DSGVO-OK, da Customer-PII bewusst ausschließbar (User-Content ist user-eigen-published). Kosten: ~€20-50/Monat bei moderater Throughput.
- **Captcha** — Cloudflare Turnstile (free, privacy-friendly, kein Re-Captcha)

**Bewusst NICHT:**
- Quill/Slate/Lexical-Alternativen zu Tiptap — Tiptap haben wir
- ProseMirror direkt — abstrahiert von Tiptap
- ActivityPub-Libs — kein MVP

### 5.4 Datenmodell (Entwurf)

Snake_case wegen Konsistenz mit Auction/CRM-Tabellen.

```sql
-- Core
community_profile (
  id text PK = customer.id,         -- 1:1 mit Medusa-Customer
  display_name text,                -- ≠ Klarname, frei wählbar, unique
  bio text,                         -- Tiptap-HTML, max 1000 Zeichen
  location text,
  pronouns text,
  collector_since int,              -- Jahr
  avatar_url text,                  -- R2
  header_url text,                  -- R2
  links jsonb,                      -- {bandcamp, discogs, soundcloud, website}
  show_tier boolean DEFAULT true,
  show_acquired_feed boolean DEFAULT false,
  show_wantlist boolean DEFAULT false,
  trust_level smallint DEFAULT 0,   -- 0..3
  is_curator boolean DEFAULT false, -- Frank-Flag, Editorial-Permission
  is_banned boolean DEFAULT false,
  banned_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

community_post (
  id text PK,
  author_id text FK → community_profile.id,
  kind text NOT NULL,               -- 'discussion' | 'editorial' | 'review' | 'list' | 'acquired' | 'poll'
  title text,                       -- nullable für Acquired/Reactions
  body_tiptap_json jsonb,           -- Tiptap-Doc
  body_html text,                   -- Server-rendered (DOMPurified) für Lese-Performance
  body_excerpt text,                -- Erste ~200 Zeichen für Feed
  cover_image_url text,             -- R2, optional
  -- Catalog-Anchor (max 1 von 5):
  release_id int FK → "Release".id,
  artist_id int FK → "Artist".id,
  label_id int FK → "Label".id,
  press_id int FK → "PressOrga".id,
  auction_block_id text FK → auction_block.id,
  -- State
  status text NOT NULL DEFAULT 'published', -- draft|published|hidden|removed
  is_pinned boolean DEFAULT false,
  is_locked boolean DEFAULT false,
  -- Mod
  moderation_state text DEFAULT 'clean',  -- clean|flagged|approved|rejected
  moderation_score numeric,                -- 0..1 from Haiku auto-mod
  -- Stats (denormalisiert, Trigger-aktualisiert)
  reaction_count int DEFAULT 0,
  comment_count int DEFAULT 0,
  view_count int DEFAULT 0,
  -- Time
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  search_indexed_at timestamptz NULL  -- Meili-Pattern wie Release
);

CREATE INDEX idx_post_author ON community_post(author_id);
CREATE INDEX idx_post_release ON community_post(release_id) WHERE release_id IS NOT NULL;
CREATE INDEX idx_post_kind_published ON community_post(kind, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_post_search_pending ON community_post(search_indexed_at) WHERE search_indexed_at IS NULL;

community_comment (
  id text PK,
  post_id text FK,
  author_id text FK,
  parent_id text FK → community_comment.id NULL,  -- one level threading
  body_tiptap_json jsonb,
  body_html text,
  reaction_count int DEFAULT 0,
  status text DEFAULT 'published',
  moderation_state text DEFAULT 'clean',
  created_at timestamptz,
  updated_at timestamptz
);

community_reaction (
  id text PK,
  user_id text FK → community_profile.id,
  target_kind text,                 -- 'post' | 'comment'
  target_id text,
  emoji text,                       -- '🔥', '❤️', etc.
  created_at timestamptz,
  UNIQUE(user_id, target_kind, target_id, emoji)
);

community_follow (
  follower_id text FK,
  followed_id text FK,
  created_at timestamptz,
  PRIMARY KEY(follower_id, followed_id)
);

community_tag (
  slug text PK,                     -- 'industrial', 'tape-culture'
  name text,
  description text,
  post_count int DEFAULT 0,
  is_curated boolean DEFAULT false  -- Frank kuratierte Tags vs. User-Frei-Tags
);

community_post_tag (
  post_id text FK,
  tag_slug text FK,
  PRIMARY KEY(post_id, tag_slug)
);

community_list (
  id text PK,
  author_id text FK,
  title text,
  description text,
  cover_image_url text,
  is_public boolean DEFAULT true,
  release_count int DEFAULT 0,
  created_at timestamptz,
  updated_at timestamptz
);

community_list_item (
  list_id text FK,
  release_id int FK,
  rank int,                         -- Sortierung
  note text,                        -- "Warum dieser Release in der Liste"
  PRIMARY KEY(list_id, release_id)
);

community_review (
  id text PK,
  release_id int FK,
  author_id text FK,
  rating numeric(2,1),              -- 0.5 .. 5.0
  body_tiptap_json jsonb,
  body_html text,
  is_verified_acquired boolean DEFAULT false,  -- aus customer_stats / transaction
  reaction_count int DEFAULT 0,
  comment_count int DEFAULT 0,
  status text DEFAULT 'published',
  created_at timestamptz,
  UNIQUE(release_id, author_id)     -- 1 Review pro User pro Release
);

community_notification (
  id text PK,
  recipient_id text FK,
  kind text,                        -- 'reply'|'mention'|'follow'|'new_post_from_following'|'editorial'
  actor_id text FK NULL,
  target_kind text,
  target_id text,
  is_read boolean DEFAULT false,
  is_emailed boolean DEFAULT false,
  created_at timestamptz
);

community_report (
  id text PK,
  reporter_id text FK,
  target_kind text,
  target_id text,
  reason text,                      -- 'spam'|'harassment'|'off_topic'|'illegal'|'other'
  notes text,
  status text DEFAULT 'open',       -- open|reviewed|actioned|dismissed
  reviewed_by text FK NULL,
  reviewed_at timestamptz,
  created_at timestamptz
);

community_audit_log (
  id text PK,
  actor_id text NULL,                -- null = system
  action text,                       -- 'post_hidden', 'user_banned', 'comment_edited_by_mod' …
  target_kind text,
  target_id text,
  meta jsonb,
  created_at timestamptz
);
```

**Migrations:** Pattern wie bei CRM-Master — additive-only, Supabase MCP `apply_migration`. Idempotent. Dump auf Replica gespiegelt (Tier-2 Logical Replication, rc51.12).

**Storage / Retention:**
- Images / Videos: R2 (`tape-mag/community/{userId}/{postId}/{filename}`)
- Soft-Delete für Posts (status='removed') statt Hard-Delete — Audit-Spur
- Hard-Delete bei DSGVO-Right-to-be-Forgotten: User-Anonymisierung (`author_id` → `system_anonymous`, `display_name` → `[deleted user]`), Post-Body bleibt aber als Diskussions-Kontext

**Realtime:**
- Supabase Realtime auf `community_post`, `community_comment`, `community_reaction`
- Live-Counter-Updates auf Post-Listen-Views
- Live „Frank schreibt gerade…"-Indicator (optional, im Frank-Editorial-Bereich)

**Search:**
- Meilisearch zweiter Index `community_posts` (parallel zu `releases-commerce`)
- Felder: title, body_excerpt, tags, author_display_name
- Filter: kind, has_release, tier-of-author, language
- Trigger `community_post`/`community_comment` → bump `search_indexed_at = NULL`
- Wiederverwendung des `meilisearch_sync.py`-Patterns aus rc40

---

## 6. UX/UI-Konzept (Vinyl Culture Design Language)

### 6.1 Globale Design-Prinzipien (consistent mit existing Storefront)

- **Typografie:** DM Serif Display (Headlines) + DM Sans (Body) — wie Storefront
- **Palette:** Gold #d4a54a Primary, Dark #1c1915 Background, sparsam mit Akzentfarben
- **Tonalität:** Analog-Musikalisch, kein „Tech". Subtle Vinyl-Texture als Hintergrund-Pattern (low opacity), Goldlinien als Trennelemente. Keine Emojis im UI-Chrome (nur in User-Reactions).
- **Mobile-First:** alle Layouts ab 375px aufwärts gestaltet, Desktop ist scaled-up

### 6.2 Information-Architecture / Sitemap

```
vod-auctions.com/
├── /community                       NEU — Community-Hub (Landing für eingeloggte = Activity Feed; Logged-out = Editorial+Featured)
│   ├── /community/feed              Activity Feed (Followed)
│   ├── /community/explore           Tag-Browser, Trending, Discovery
│   ├── /community/lists             Public Lists, sortierbar
│   ├── /community/dispatch          Frank's Editorial-Spur
│   ├── /community/post/[slug]       Post-Detail
│   ├── /community/list/[id]         List-Detail
│   ├── /community/tag/[slug]        Tag-Page
│   ├── /community/notifications     Notification Center
│   └── /community/compose           Post-Editor (Modal oder Page)
├── /members                         NEU
│   ├── /members                     Member-Directory (sortierbar Tier/Activity/Joined)
│   └── /members/[displayName]       Member-Profil
├── /catalog/[id]                    BESTEHEND, erweitert um Tab "Discussion"
├── /bands/[slug]                    BESTEHEND, erweitert um Tab "Wall"
├── /labels/[slug]                   BESTEHEND, erweitert um Tab "Wall"
├── /press/[slug]                    BESTEHEND, erweitert um Tab "Wall"
├── /auctions/[slug]                 BESTEHEND, erweitert um Tab "Live Discussion" (während Block aktiv) bzw "Discussion" (ended)
└── /account                         BESTEHEND
    ├── /account/community-profile   NEU — Profil-Edit
    ├── /account/community-privacy   NEU — Privacy-Toggles
    └── /account/community-blocked   NEU — Block-Liste
```

Nav-Bar bekommt einen neuen Top-Level-Eintrag „Community" zwischen „Auctions" und „Catalog".

### 6.3 Key-Screens (Wireframe-Beschreibungen)

#### 6.3.1 `/community` — Hub Landing (Logged-in)

```
┌─────────────────────────────────────────────────────────────┐
│ [Top-Nav]  Auctions | Community★ | Catalog | Bands | …      │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐ ┌──────────────────────────────┐│
│ │ Activity Feed (Default) │ │ Sidebar: Frank's Latest      ││
│ │                         │ │ ┌─────┐ "From the Vault #42" ││
│ │ ┌─────────────────────┐ │ │ │📷   │ 2 days ago           ││
│ │ │[Avatar] @username   │ │ │ └─────┘                      ││
│ │ │ ★Gold · 2h ago      │ │ │                              ││
│ │ │ "Just listened to…" │ │ │ Trending Tags:               ││
│ │ │ [Release Card]      │ │ │ #power-electronics 23        ││
│ │ │ 🔥 14 · 💬 3        │ │ │ #tape-culture 18             ││
│ │ └─────────────────────┘ │ │ #zko 12                      ││
│ │                         │ │                              ││
│ │ ┌─ Frank Featured ────┐ │ │ Active Discussions:          ││
│ │ │[Frank·VOD Curator]  │ │ │ • Block #42 closing tonight  ││
│ │ │"Dispatch: …"        │ │ │ • New ZKO discovery thread   ││
│ │ │ 🔥 87 · 💬 24       │ │ │                              ││
│ │ └─────────────────────┘ │ │ Suggested Members:           ││
│ │                         │ │ [tile][tile][tile]           ││
│ │ … infinite scroll …     │ │                              ││
│ └─────────────────────────┘ └──────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

- Frank's Editorial-Posts sind farblich abgesetzt (subtle Gold-Linie, „From the Vault"-Header, Frank's Avatar mit „VOD Curator"-Pin)
- Floating-FAB unten rechts: „Compose" → öffnet Post-Modal

#### 6.3.2 `/community` — Hub Landing (Logged-out)

- Hero: Frank's neuester Editorial-Post in voll
- Darunter: 6 kuratierte „Featured Discussions"
- Public Lists Carousel
- CTA: „Become a member to join the conversation" → Login/Register
- Keine Vollanzeige aller User-Posts (Privacy + Drive-to-Sign-up)

#### 6.3.3 `/community/post/[slug]` — Post Detail

- Author-Card oben (Avatar groß, Display-Name, Tier-Badge, „Sammler seit 2014", Follower-Count, Follow-Button)
- Title (DM Serif)
- Body (Tiptap-Render mit Embeds)
- Reactions-Bar unten
- Comments-Section (eine Threading-Ebene, Tiptap-Light-Editor für Reply)
- Sidebar: Related Releases (wenn `release_id` gesetzt), Related Tags, „More from this author"

#### 6.3.4 `/members/[displayName]` — Member-Profil

```
┌─────────────────────────────────────────────────────────────┐
│ [Header-Bild Banner, R2-uploaded, optional Vinyl-Texture]   │
│                                                             │
│  ┌────┐  Display Name             ★ Gold Member             │
│  │AVA │  @handle                  [Follow] [Message]*       │
│  └────┘  Berlin · Sammler seit 2009                         │
│                                                             │
│  Bio (TipTap-Render): "Industrial-Sammlung seit den 90ern…" │
│                                                             │
│  Links: [Bandcamp] [Discogs] [SoundCloud] [Website]         │
├─────────────────────────────────────────────────────────────┤
│ Tabs: Posts | Lists | Reviews | Acquired** | Wantlist*** |  │
│       Comments                                              │
├─────────────────────────────────────────────────────────────┤
│ [Tab-Inhalt]                                                │
└─────────────────────────────────────────────────────────────┘
```

\* Phase 3 (DMs)
\** Nur wenn `show_acquired_feed=true`
\*** Nur wenn `show_wantlist=true`

#### 6.3.5 Catalog-Anchored Discussion (auf Release-Page)

Tab „Discussion" neben „Details", „Tracklist", „Inventory":
- Composer oben („Start a discussion about this release…")
- Posts in Reverse-Chrono
- Reviews-Sektion separat (sortable: Newest / Highest-Rated / Verified-Acquired-First)
- „X members own this · Y members want this" (klickbar → Member-Liste)

#### 6.3.6 Mobile

- Bottom-Tab-Bar bekommt 5. Slot „Community" (zwischen Cart und Account)
- Compose-FAB
- Reactions-Tap-und-Halt Pattern (Long-press → Emoji-Picker)
- Comments collapsible

### 6.4 Komponenten-Inventar (Storybook/UI_UX-Erweiterung)

Neu zu bauen, alle in `storefront/src/components/community/`:
- `<PostCard>` (Compact / Full)
- `<EditorialPostCard>` (Frank-Special)
- `<CommentTree>`, `<CommentEditor>`
- `<ReactionsBar>` (mit Long-Press-Picker)
- `<TipTapPostEditor>` (Wrapper um existing Tiptap mit Community-spezifischen Extensions)
- `<MemberAvatar>` (mit Tier-Pin, Online-Indicator)
- `<MemberProfileHeader>`
- `<TierBadge>` (Gold/Silver/Bronze visual treatment)
- `<FollowButton>`
- `<ListCard>`, `<ListGrid>`
- `<ReviewCard>`, `<RatingStars>` (½-step interactive)
- `<NotificationDrawer>`
- `<MentionPicker>` (für `@user`, `@release:1234`)
- `<EmbedRenderer>` (YouTube / Bandcamp / SoundCloud / Spotify)
- `<TagBadge>`, `<TagBrowser>`

Bestehende Komponenten wiederverwenden: `Button`, `Input`, `Label`, `Card` (Shared aus rc36 UI/UX-Governance), Brevo-Forms, Auth-Layouts.

Admin-Seite (Mod-Tools) in `backend/src/admin/routes/community/`:
- `/app/community` Hub
- `/app/community/queue` Mod-Queue
- `/app/community/reports`
- `/app/community/users` (Trust-Level-Verwaltung, Banhammer)
- `/app/community/tags` (Curated Tags pflegen)
- `/app/community/editorial` (Frank's Drafts + Schedule)

### 6.5 Tier-Badge Visual Treatment

Siehe CRM-Tier-Werte (Platinum/Gold/Silver/Bronze/Standard):

| Tier | Badge | Avatar-Pin | Profile-Header |
|---|---|---|---|
| Platinum | 💎 mit Goldring | Klein, immer sichtbar | „VOD Platinum Member" Banner-Strip |
| Gold | ★ in Gold | Sichtbar | Gold-Linie unter Header |
| Silver | ★ in Silber | Sichtbar | Silver-Linie unter Header |
| Bronze | (kein Pin) | (verborgen) | (kein Strip) |
| Standard | (kein Pin) | (verborgen) | (kein Strip) |
| **Curator** (Frank) | 🎙 in Gold | Immer sichtbar mit „VOD Curator"-Label | Distinct Editorial-Treatment |

Default-`show_tier=true` ab Gold aufwärts. Bronze/Standard standardmäßig nicht sichtbar (vermeidet Status-Anxiety bei Newcomers; sie können es einschalten).

---

## 7. Plattform-Integration (Touchpoints)

Die Community ist nicht eine Insel — sie webt sich überall ein. Folgende Touchpoints im Detail:

### 7.1 Auction-Block-Page

- **Pre-Auction:** Tab „Discussion" — Members können vor Block-Start spekulieren, Items besprechen
- **Live-Auction:** Tab „Live Discussion" mit Realtime-Layer (Supabase Realtime) — schließt automatisch 5 min nach Block-Ende, Posts werden persistent
- **Post-Auction:** „Winner-Thread" automatisch erstellt mit allen Lots, Käufer können (opt-in) ihren Pickup celebrieren

### 7.2 Release-Page

- Tab „Discussion" mit Posts + Reviews kombiniert
- „X own this / Y want this"-Counter mit Member-Liste
- „Latest review by @user" Card prominent oben
- Post-Composer am Tab-Anfang („Share your thoughts on this release…")

### 7.3 Band-/Label-/Press-Page

- Tab „Wall" — alle Posts mit `band_id/label_id/press_id`-Anchor
- Featured Editorial: Frank-Posts zur Band/Label getagged
- „Members following this artist" (Following auf Entity-Level — Phase 2)

### 7.4 Member-Acquired-Feed

- Opt-in pro User
- Auto-Post bei Auction-Win / Direct-Buy: „[Member] acquired [Release] in [Block]"
- Member kann Post nachträglich um Note ergänzen („Finally found a copy after 5 years!")
- Sichtbar im Following-Activity-Feed der Followers

### 7.5 Newsletter (Brevo)

- Wöchentlicher „VOD Community Digest" — Top 5 Posts der Woche, Frank's Latest, neue Lists, Featured Member
- Eigene Brevo-List „Community Active" (auto-managed, alle die Community-Posts erstellt haben in 30 Tagen)

### 7.6 Storefront-Header / Footer

- Header: „Community"-Link mit subtiler Notification-Dot wenn Unread-Notifications
- Footer: „Latest from the Community" 3-Card-Strip auf Homepage

### 7.7 Email-Notifications

Templates (Resend, eigene Designsprache):
- Reply auf eigenen Post
- Mention `@username`
- Frank's New Editorial Post (broadcast, opt-in)
- Member-of-the-Month-Announcement
- Weekly Digest

### 7.8 Admin / CRM-Verzahnung

- Customer-Drawer (rc53.0) bekommt 11. Tab „Community" — zeigt Member-Posts, Comments, Reports gegen den Member, Trust Level, Last-Active
- CRM-Smart-Lists-Erweiterung: „Active Posters last 30d", „Top Curators", „Reported Users"
- Lifetime-Stats erweitert um `community_post_count`, `community_comment_count`, `community_reaction_count`

---

## 8. Profile-Konzept (Detail)

### 8.1 Display-Name vs. Klarname

- `customer.first_name`/`last_name` bleibt Klarname für Rechnungen / Versand
- `community_profile.display_name` = öffentlicher Handle, frei wählbar, Pflicht-unique, 3-30 Zeichen, alphanumerisch+`_`+`-`
- Default-Vorschlag: aus `email`-Local-Part + Disambiguator
- Member kann ändern (1×/30 Tage), Old-Display-Name wird redirect gehalten

### 8.2 Verifizierungsstufen

| Level | Voraussetzung | Capability |
|---|---|---|
| Anonymous | nicht eingeloggt | Read-only public, kann nicht reagieren |
| TL0 (Newcomer) | Email-Verified, Profile angelegt | Kann commenten, 5 Posts/Tag, keine Embeds, keine Mentions |
| TL1 (Member) | TL0 + 7 Tage Membership + 5 Comments + 0 Reports gegen sich | Voller Posting-Zugriff, Embeds OK, Mentions OK |
| TL2 (Trusted) | TL1 + 30 Tage + 25 Posts/Comments + Tier ≥ Bronze | Posts skip Mod-Queue, kann eigene Posts Edit > 30min, kann Spam-Reports gewichtet absetzen |
| TL3 (Veteran) | TL2 + 180 Tage + 100 Posts + Tier ≥ Silver + Frank/Robin Approval | Kann Tags vorschlagen, kann Polls erstellen, Bonus-Visibility in Trending |
| Curator | Manuell (Frank, evtl. später vereinzelte Sub-Curators) | Editorial-Permission, Pin-Posts, Featured-Recommendations |
| Admin | Robin | Volle Mod-Power |

Auto-Promote über Background-Job (täglich), Audit-Logged.

### 8.3 Profile-Felder (Übersicht)

Pflicht beim Setup:
- Display-Name
- Avatar (Default-Generated wenn keiner)
- Privacy-Toggle für Tier

Optional:
- Header-Bild (R2-Upload, max 2MB, recommended 1500×500)
- Bio (Tiptap, max 1000 Zeichen, basic Format-Set)
- Location (Frei-Text, kein Geocoding in MVP)
- Pronouns
- Collector-Since (Jahr-Picker)
- Links (max 5: Bandcamp, Discogs, SoundCloud, Website, andere)
- Galerie (Phase 2): bis zu 12 Bilder mit Captions
- Featured-Releases („My Top 4"): Bandcamp/Letterboxd-Style Pin von 4 Releases im Header

### 8.4 Auto-aggregierte Profil-Stats

Aus existing CRM/Auction:
- „Member since": `customer.created_at`
- „X auctions won"
- „Y direct purchases"
- „Tier: Gold" (auto, opt-in display)
- „Z owned releases" (aus `transaction` + Discogs-Brücke)
- „W on wantlist" (Discogs-Brücke)

Aus Community:
- „N posts, M comments, R reactions given"
- „Following K · Followers L"
- „J lists curated"

### 8.5 DSGVO

- Vollständiger Export per Self-Service in `/account/community-profile` → Button „Daten exportieren"
- Account-Löschen mit 30-Tage-Cooling-Off, danach: Profil-Daten gelöscht, Posts mit `[deleted user]` Author, R2-Media gelöscht
- Right-to-be-Forgotten als Admin-Tool falls Self-Service nicht möglich

---

## 9. Moderation, Trust & Safety

### 9.1 Layered Defense

| Layer | Mechanismus |
|---|---|
| **Layer 1: Identity** | Email-Verified, Klarname-DB im Hintergrund, Trust-Level-System |
| **Layer 2: Rate-Limit** | TL0: 5 Posts/Tag, 20 Comments/Tag, 3 Reports/Tag. TL1+: höher, aber gecapped |
| **Layer 3: Auto-Mod (Haiku)** | Optional, Posts > 200 Zeichen werden async geprüft. Kategorien: Spam / Harassment / Off-Topic / Illegal. Confidence > 0.8 → Mod-Queue. Confidence > 0.95 → Auto-Hide. |
| **Layer 4: Captcha** | Cloudflare Turnstile auf Post-Submit für TL0-User |
| **Layer 5: User-Reports** | „Report"-Button auf Post/Comment → `community_report` → Mod-Queue |
| **Layer 6: Mod-Queue** | Frank/Robin reviewen, Actions: Approve / Hide / Remove / Warn / Ban |
| **Layer 7: Block-Liste** | User können andere User blocken (eigene Posts/Comments unsichtbar, kein DM-Receive) |

### 9.2 Wer moderiert

- **Robin:** Admin-Power, Backstop
- **Frank:** Curator + Mod (kann Posts hiden/featuren, hat Review-Power für TL3-Promotion)
- **Optional Phase 2:** 2-3 ausgewählte TL3-User als Sub-Mods (mit klarem Mandat: nur Hide+Report, kein Ban)

Erwartete Mod-Last für Beta (200-500 active members): ~30 min/Tag aufgeteilt zwischen Frank+Robin.

### 9.3 Verhaltenscodex (zu finalisieren mit AGB-Anwalt, parallel zu RSE-78)

Kernpunkte:
- Respekt vor Menschen, harte Kritik an Werken OK
- Keine Hate-Speech (Defs aus AGB übernehmen)
- Kein NSFW (außer Album-Cover-Context, wo es zur Industrial-Tradition gehört → kuratierte Whitelist)
- Kein Spam, keine Werbung für Konkurrenz-Plattformen
- Kein Doxxing
- Frank's Wort = letzte Instanz im Zweifel

---

## 10. Marketing & Launch-Strategie

### 10.1 Positionierung

**Tagline-Kandidaten:**
- „Wo die Industrial-Sammler-Welt diskutiert."
- „Vinyl on Demand — die Community."
- „Tonband, Tape, Press. Diskurs ab hier."

**One-Liner für externe Verwendung:**
> Die VOD Community ist der spezialisierte Treffpunkt für Sammler von Industrial, Power Electronics, Noise und Tape-Underground — kuratiert von Frank Maier (Vinyl on Demand) und der etabliertesten Käufer-Basis des Genres weltweit.

### 10.2 Migrations-Plan Facebook-Gruppe → eigene Plattform

**Warum schwer:** Network-Effekt der Facebook-Gruppe ist real. Member kommen wegen Frank, aber bleiben wegen anderer Member. Wenn die anderen nicht migrieren, kollabiert es.

**Strategie: Pre-Pop-the-Stage** — Plattform mit Inhalt befüllen BEVOR Migration kommuniziert wird:
1. **Woche -8 bis -4 (Beta-Phase):** Frank schreibt 8-12 Editorial-Posts in der ruhigen Phase. 30-50 hand-ausgewählte Power-User per E-Mail eingeladen (existing Invite-System rc52 nutzen). Beta-Member commenten/posten. Bei Launch ist die Wand nicht leer.
2. **Woche -2:** „Public Tease" — Newsletter an alle 14k CRM-Master mit „Community Sneak Peek". 2-3 Frank-Posts public lesbar machen.
3. **Woche 0 (Launch):** Facebook-Post von Frank: „Wir ziehen um. Hier ist warum. Eingeladen sind alle." Link zu Sign-up. Erste 30 Tage großzügige Invite-Codes für Power-User.
4. **Woche 1-12 (Migration):** Frank crosspostet weiter auf Facebook, aber mit „Originalpost auf vod-auctions.com/community/dispatch/…"-Link. Bewusste Drosselung der Facebook-Content-Quality über Zeit.
5. **Monat 6:** Facebook-Gruppe wird Read-Only / Archiv. Pinned Post: „Wir sind umgezogen."
6. **Monat 12:** Facebook-Gruppe komplett aufgelöst.

### 10.3 Launch-Phasen (Member-seitig)

| Phase | Dauer | Ziel-Active-Members | Sichtbarkeit | Zugang |
|---|---|---|---|---|
| **Closed Alpha** | 2 Wochen | 5-10 | Nur Frank+Robin+ausgewählte | Hard-Invite |
| **Beta** | 4-6 Wochen | 30-50 | Login-Wall, Token-Gated | rc52-Invite-System |
| **Soft Launch** | 4 Wochen | 200-500 | Logged-out can read Editorial+Lists, sonst Wall | Free Sign-Up + CRM-Email-Bonus |
| **Public Launch** | open | 1000+ | Public Editorial, Logged-out kann lesen aber nicht reagieren | Open |

### 10.4 Engagement-Loops (post-Launch)

**Tägliche Loops:**
- Frank schreibt 3-5 Comments auf Member-Posts (Curator-Anwesenheit)
- Auto-Suggestion „Heard anything good lately?" Push-Prompt 1×/Tag

**Wöchentliche Loops:**
- Frank's „Dispatch from the Vault" Editorial-Post (jeden Donnerstag, fix)
- Wöchentliche Community-Newsletter (Brevo, jeden Sonntag)
- „Top of Week" Auto-Algorithm auf der Hub-Page

**Monatliche Loops:**
- „Member of the Month" — Frank wählt aus, 1 Profil-Spotlight + Interview-Q&A
- Themed Lists Challenge: „Diesen Monat: Die ersten Power-Electronics-Tapes"

**Quartalsweise:**
- Live-AMA mit einem Künstler / Label (Audio-Only, Phase 3)
- Year-in-Review im Dezember (Phase 2 Feature)

### 10.5 Cross-Promotion mit existing Kanälen

- **Auction-Mailings** bekommen Footer „Joined the conversation? vod-auctions.com/community"
- **Order-Bestätigungen** bekommen „Acquired Feed" Soft-Prompt
- **Newsletter (Brevo)** bekommt Community-Block
- **Storefront-Homepage** bekommt 3-Card „Latest from Community"
- **Frank-Instagram** (existing) crossposted nach Community

### 10.6 Off-Plattform-Marketing

- **Bandcamp Daily** Pitch — „How VOD built its own community"-Story (ein Outreach 6 Monate post-Launch)
- **Resident Advisor Feature** — Frank-Profile / Vault-Story
- **Quietus / The Wire / Forced Exposure Newsletter** — Industrial-Press-Coverage
- **Reddit r/IndustrialMusic, r/Cassetteculture, r/Vinyl** — Frank macht AMA, soft-mention Community
- **Discord-Server** anderer Niche-Communities — Sponsorship/Crosspost

### 10.7 Erfolgs-Metriken

**North-Star:** **Wöchentlich aktive Member (WAM)** — User die in 7 Tagen ≥ 1 Action (Post, Comment, Reaction, Like-Eingang ist nicht aktiv) hatten.

**Sub-Metriken:**
- DAU/MAU-Ratio (Stickiness, Ziel >0.2 nach 6 Monaten)
- Posts pro WAM (Ziel: 1+)
- Comments pro Post (Ziel: 5+ bei Frank-Posts, 1.5+ bei Member-Posts)
- Median Reactions per Post
- Time-from-Sign-up to First-Post (Ziel: <72h)
- Mod-Queue-Backlog (Ziel: <24h Resolution)
- Facebook-Migration-Rate (% der Facebook-Member, die im ersten Jahr Community-Account anlegen)

**Anti-Metriken (bewusst nicht jagen):**
- Nicht: Page-Views, Time-on-Site, Total-Signups, Sessions
- Nicht: Vanity-Likes ohne Engagement-Folge

---

## 11. Phasen-Roadmap (grob)

| Phase | Inhalt | Dauer | Voraussetzung |
|---|---|---|---|
| **Phase 0 — Pre-Work** | AGB-Erweiterung, Verhaltenscodex, DSGVO-Checks, Datenmodell-Migration, Mock-UI in Figma/Stitch | 1-2 Wochen | RSE-78 AGB-Anwalt am Laufen |
| **Phase 1 — MVP Build** | Profile, Posts, Comments, Reactions, Catalog-Anchored, Following, Tags, Activity Feed, Frank-Editorial, Mod-Queue, Trust-Levels, Notification-Center, AGB-Page | 8-12 Wochen | Phase 0 done |
| **Phase 1.5 — Closed Alpha** | Internal Test mit 5-10 Members | 2 Wochen | Phase 1 done |
| **Phase 1.6 — Beta** | 30-50 ausgewählte Power-User | 4-6 Wochen | Alpha-Findings adressiert |
| **Phase 2 — Engagement Loops** | Lists, Reviews, Acquired-Feed, Polls, Trending, Year-in-Review, Member-of-the-Month, Newsletter-Digest | 4-8 Wochen | Beta-Daten zeigen MVP-PMF |
| **Phase 2.5 — Soft Launch** | Open Sign-up, public Editorial | 4 Wochen | Phase 2 done |
| **Phase 3 — Public Launch** | Facebook-Migration formal | 12 Wochen Roll-Out | Phase 2.5 stabil |
| **Phase 3+ — Optional** | Live-Audio-AMA, ActivityPub-Bridge, Native-Apps, DMs, Marketplace | je 4-12 Wochen | Demand-driven |

**Kritischer Pfad:** AGB-Anwalt ist Launch-Blocker (gleicher Engpass wie Auction-Launch RSE-78). Sinnvollerweise gemeinsam beauftragen — der gleiche Anwalt kann beide AGB-Sets erweitern.

---

## 12. Budget-Schätzung

### 12.1 Build-Effort (Robin)

| Phase | Tage | Begründung |
|---|---|---|
| Datenmodell + Migrations + Backend-Routes | 10-15 | Schema groß aber Pattern bekannt (CRM-Master-Vergleich) |
| Storefront-UI (Hub, Feed, Profile, Post-Detail) | 15-20 | viele Screens, Mobile + Desktop |
| Catalog-Anchored-Tabs + Wall-Pages | 5-7 | Erweiterung existing Pages |
| Member-Profile + Edit-Flow | 5-7 | |
| Composer / Tiptap-Erweiterungen | 4-6 | |
| Notification-Center + Email-Templates | 4-5 | |
| Mod-Tools / Admin-Routes | 6-8 | |
| Search-Integration (Meili-Index) | 2-3 | Pattern wiederverwendbar |
| Auto-Mod (Haiku) Integration | 2-3 | |
| QA / Bugfix / Polish | 7-10 | |
| **Total Phase 1 MVP** | **60-84 Tage** | **~12-17 Wochen Solo bei 5 d/Woche** |

Hinweis: Robin ist sehr schnell (CRM-Master in 10h-Session — aber das war eng-fokussiert). Realistisch 8-12 Wochen mit anderen Verpflichtungen.

### 12.2 Laufende Kosten

| Posten | Kosten | Anmerkung |
|---|---|---|
| Hosting (existing VPS) | €0 zusätzlich | passt rein |
| Supabase (existing) | €0 zusätzlich | innerhalb Free-Tier-Limits initial |
| R2-Media (existing) | ~€2-5/Monat zusätzlich | bei moderater Upload-Last |
| Meilisearch (existing VPS) | €0 zusätzlich | |
| Brevo Email | existing | Templates nur add |
| Anthropic Auto-Mod (Haiku) | €20-50/Monat | optional |
| Cloudflare Turnstile | €0 | free |
| **Total laufend** | **€20-55/Monat** | |

### 12.3 Externe Kosten

- AGB-Anwalt (Erweiterung): geschätzt €500-1500 inkrementell zur Auction-AGB-Beauftragung
- Optional: Visual-Designer für Hero-Mockups (Stitch oder Freelancer): €500-2000

---

## 13. Risiken & offene Fragen

### 13.1 Risiken

| Risiko | Impact | Mitigation |
|---|---|---|
| **Migration scheitert, Facebook-Gruppe bleibt aktiv** | Hoch — Community-Bereich bleibt leer | Pre-Pop-Strategie, Frank-Buy-in komplett, Rückfall-Plan: Facebook-Gruppe nicht killen |
| **Mod-Last übersteigt Frank+Robin-Kapazität** | Mittel | TL3-Sub-Mods früh aktivieren, Auto-Mod-Layer (Haiku) ernsthaft tunen |
| **Toxicity-Spirale** | Hoch | Identity-Layer + Trust-Level + bewusste Anti-Pattern-Wahl (kein Karma, kein Downvote) |
| **DSGVO-Verstoß bei Profile-Daten** | Sehr hoch | Privacy-by-Default für sensitive Felder, Self-Service-Export+Löschen, AGB-Anwalt |
| **Performance bei Activity-Feed-Joins** | Mittel | Materialized View, denormalisierte Counter, Pagination, Postgres-Indices, ggf. Meili für Feed |
| **Frank-Time-Constraint** | Mittel-Hoch | Editorial-Schedule flexibel halten (1×/Woche statt täglich), Drafts-Funktion, Admin-Ghostwriting via Robin OK |
| **Build-Aufwand höher als geschätzt** | Mittel | Phasen klein halten, MVP knapp definieren, Phase 2 ist klar abgegrenzt |
| **Adoption-Lücke zwischen Beta und Soft-Launch** | Mittel | Pre-Pop-Stage, Newsletter-Push, Frank-Editorial-Cadence |

### 13.2 Offene Fragen (für nächste Session mit Frank)

1. Wie groß ist die Facebook-Gruppe aktuell? Wie viele Daily-Active-Poster hat sie?
2. Wer sind die 30-50 Power-User, die wir für die Beta einladen?
3. Wie häufig kann Frank realistisch Editorial-Posts schreiben? 1×/Woche fix? Oder unregelmäßig?
4. Soll die Facebook-Gruppe nach Migration archiviert oder gelöscht werden?
5. Ist Closed-Alpha-Termin Q3 2026 realistisch, oder muss es früher/später?
6. AGB-Anwalt: Auction + Community gemeinsam beauftragen?
7. Tier-Sichtbarkeit: Standard ON oder OFF für Bronze/Standard? Aktuell vorgeschlagen OFF, Frank-Meinung?
8. Soll es ein Pseudonym-Erstellungs-Limit geben (1 Display-Name-Change/30 Tage)?
9. Welche Mod-Aktion ist Frank zumutbar? Hide ja, Ban auch?
10. Internationalisierung: Community zunächst Deutsch+Englisch oder nur Englisch?
11. **„LP of the Day"-Voting (S13):** Frank-kurierte Shortlist (5-10 Kandidaten) oder globales Catalog-Voting? Cadence täglich oder wöchentlich? In MVP ziehen oder Phase 2 behalten?
12. **Chat (S14):** Reichen die drei Event-Modi (Auction-Live / Editorial-Drop / wöchentliches Listening Hour) — oder will Frank doch eine permanent offene „Lobby"? Permanente Lobby = signifikant mehr Mod-Last, deshalb Empfehlung: Event-Mode.

### 13.3 Abhängigkeiten zu anderen Projekten

- **CRM-Master v1 (rc53.0)** ✅ done — Tier-System, Master-Profile vorhanden
- **AGB-Erweiterung (RSE-78)** ⏳ in progress — Launch-Blocker, gemeinsame Anwalts-Beauftragung empfohlen
- **Discogs-Wantlist-Integration (RSE-291-vorgelagert)** — falls Wantlist-Profile-Tab gewünscht, vorher fertig stellen
- **Marketplace (RSE-291)** — kein Konflikt, aber synergetisch in Phase 3

---

## 14. Empfehlung & Nächste Schritte

### 14.1 Empfehlung

✅ **Konzept-Verabschiedung mit Frank in einem 60-min-Termin.** Diskussion der offenen Fragen aus §13.2 + Visual-Mockups. Output: signed-off MVP-Scope-Dokument (Subset von §4.1 verbindlich).

✅ **Parallele Anwalts-Beauftragung** für Auction-AGB (RSE-78) + Community-AGB-Erweiterung. Spart Mehrkosten.

✅ **Vor Build-Start:** 2-3 High-Fidelity-Mockups (Hub-Landing / Profil / Catalog-Anchored-Discussion) in Figma oder via Stitch MCP zur Tonality-Sicherung.

✅ **Build-Start frühestens parallel zu nächster Auction-Launch-Vorbereitung** — die Plattform sollte erst die ersten öffentlichen Auctions live haben (RSE-294), bevor sie Community-Capacity dazu bekommt.

### 14.2 Nächste konkrete Aktionen (in Reihenfolge)

1. **Frank-Termin** ansetzen (60 min) — diese Konzept-Datei vorab senden
2. **Offene Fragen** §13.2 klären
3. **AGB-Anwalt gemeinsam beauftragen** mit RSE-78
4. **3 Visual-Mockups** in Stitch / Figma erstellen (Hub, Profile, Anchored-Discussion)
5. **Phase 0 starten:** Datenmodell-Migration als idempotenter Supabase-MCP-`apply_migration` (additive) auf Tier-1-Tabellen
6. **Linear-Epic anlegen** „RSE-XXX VOD Community v1" — Sub-Issues für M1-M18

---

## 15. Nachtrag: User-Voice — Member-Wünsche aus der Facebook-Gruppe

**Quelle:** Direkt-Feedback eines Members in der bestehenden Facebook-Gruppe „Vinyl on Demand" / „VOD Records" (übermittelt 2026-05-05 via Screenshot). Wortlaut:

> *„Gibts bald auch nen Chat?"*
> *„Oder hot List wo man für die LP des Tages abstimmen kann?"*

Diese zwei Sätze von einem normalen Member (nicht Frank, nicht Robin) sind das wertvollste, was bisher als Konzept-Input vorliegt — sie zeigen, **was die Community ungeprompt erwartet**, wenn von „Community-Bereich" die Rede ist. Beide Wünsche werden ernst genommen, aber differenziert beantwortet:

### 16.1 „Hot List / LP des Tages-Voting" → ✅ Ja, in Phase 2 (S13)

**Antwort: kommt rein.** Voting ist eine der höchsten Engagement-Mechaniken bei minimalem User-Aufwand (1 Tap) und liefert dem Catalog konstantes Spotlighting. Vergleiche BoardGameGeek's „Hotness" (seit 25 Jahren der Hauptanker der BGG-Hub-Page) und Letterboxd's wöchentliche/jährliche „Highest Rated".

**Konkrete Umsetzung (S13):**

- **Modus A — Frank-kuratiert (empfohlener Default):** Frank wählt jeden Tag (oder pro Woche) eine **Shortlist von 5-10 Kandidaten** aus dem Catalog (Re-Issues, neue Drops, Re-Discoveries). Members voten via 1-Click. Top-Voted-Release wird auf Hub-Page + Newsletter prominent + bekommt 24h prominentes Spotlight im Catalog.
- **Modus B — Global (optional):** Voting läuft auf alle veröffentlichten Releases. Höhere Streuung, weniger Kuration.
- **Mechanik:** 1 Vote pro User pro Voting-Periode, Histogramm transparent. Voting-Period: 24h (täglich) oder 7d (wöchentlich) — Cadence-Frage offen, siehe §13.2 #11.
- **Build-Aufwand:** ~3-4 Tage (Datenmodell `community_vote` + 1 Voting-Widget + Hub-Page-Integration + Newsletter-Block).
- **Synergie:** Top-Voted-Release der Woche kann automatisch als „LP der Woche"-Auction-Block-Trigger oder als Newsletter-Lead dienen. Member-Voting-Patterns liefern uns als Bonus Catalog-Heat-Daten („welche Re-Issues haben Demand?").

### 16.2 „Chat" → ⚠️ Ja, aber als Event-Mode (S14), NICHT als permanente Lobby

**Antwort: ja, aber differenziert.** Spontaner User-Wunsch nach Chat ist nachvollziehbar — Discord-Server haben den Begriff geprägt. Aber:

**Warum kein permanent-offener Chat:**

- **Mod-Last:** Permanente Lobby braucht 24/7-Aufsicht. Frank+Robin können das nicht leisten. Innerhalb von 6 Monaten degenerieren unmoderierte Chats zuverlässig.
- **Diskussions-Qualität:** Persistente Posts (Threads) erzeugen archivierbare, durchsuchbare, über-die-Zeit-wertvolle Diskurse. Chat-Logs verbrennen nach 24h.
- **Anti-Pattern bei Vergleichs-Communities:** Letterboxd, BGG, Are.na haben **keinen** integrierten Live-Chat — bewusst. Diskurs läuft async. Die Community-Plattformen die Chat reingeworfen haben (alte Phorum-Forks, einige Mighty-Networks-Setups), haben es nach 12-18 Monaten wieder ausgebaut.
- **Auf Discord ausweichen** ist auch keine Lösung — dann tritt der Network-Split-Effekt ein, und ein Teil der Community lebt off-Plattform.

**Was wir stattdessen liefern (S14, „Listening Room"):**

Drei zeitgesteuerte Chat-Modi, die das Live-Gefühl bringen ohne Always-On-Last:

1. **Live Auction-Discussion** (=S8). Während ein Auction-Block aktiv ist, ist auf der Block-Page ein Realtime-Chat-Layer. Schließt automatisch 5 min nach Block-Ende. Posts werden persistent als Comments archiviert.
2. **Editorial-Drop-Live-Hour.** Wenn Frank Donnerstags 20:00 Uhr ein neues „Dispatch from the Vault" published, ist 60 min Live-Chat darunter freigeschaltet. Member können in Echtzeit fragen/diskutieren, Frank ist 30-45 min anwesend. Danach normale async Comments.
3. **Wöchentliches „Listening Hour"** (Phase 2.5+). Donnerstags 20:00 Uhr wird ein themenbezogener Listening-Room geöffnet (60 min). Ohne Frank-Zwang — manchmal nimmt er teil, manchmal nicht. Member-driven.

**Begründung für Member, falls Frage kommt: „Warum kein 24/7-Chat?"**

> Wir haben uns bewusst gegen einen Discord-Stil-Chat-Server entschieden. Die VOD-Community ist auf Diskurs gebaut, der über Wochen und Jahre wertvoll bleibt — nicht auf Live-Chatter, der am nächsten Tag verbrannt ist. Wenn du ein konkretes Item, einen Künstler, einen Vault-Drop besprechen willst: das ist hier ein Thread, der bleibt. Wenn du Live-Energie willst: bei aktiven Auctions, neuen Editorials und unserem wöchentlichen Listening Room ist Live-Chat freigeschaltet. So nutzen wir die Energie wo sie zählt, ohne dass die Plattform 24/7 betreut werden muss.

### 16.3 Lessons learned aus diesem Member-Feedback

1. **Member denken ungeprompt an Voting + Chat** — diese zwei Features sind also „erwartet" und müssen begründet werden, falls sie nicht / nicht so kommen.
2. **Wir sollten gezielt mehr Member-Voice einsammeln** vor dem Build-Start. Vorschlag: Frank macht in der Facebook-Gruppe einen einzelnen Post „Wir denken darüber nach, eine eigene Community-Plattform zu bauen — was würdet ihr euch wünschen?". Die Antworten landen in §13.2 als zusätzliche Konzept-Inputs. Dauer: 1 Post von Frank, ~7 Tage Sammeln, dann Konzept-Update.
3. **Wir kommunizieren transparent**, was kommt und was bewusst nicht — siehe Begründungs-Sätze oben für „warum kein 24/7-Chat". Member verstehen Trade-offs, wenn man sie ihnen erklärt.

---

## 16. Frank-Section — Plain Language

**Frank, das hier ist die Kurzversion. Wenn dich was im obigen Konzept überfordert hat, lies einfach diesen Abschnitt — der reicht für die wichtigen Entscheidungen.**

### 16.1 Was bauen wir

Wir bauen einen **eigenen Community-Bereich** auf vod-auctions.com. Stell dir das vor wie deine Facebook-Gruppe „Vinyl on Demand", aber:
- läuft auf **unserer eigenen Seite** — wir bestimmen die Regeln
- **Facebook drosselt nicht mehr deine Posts** — alle Mitglieder sehen, was du postest
- **eingebaut in den Shop** — die Sammler diskutieren direkt am jeweiligen Release/Block
- **deine Stammkunden bekommen sichtbar Status** (Gold/Silver-Sterne am Avatar) — die fühlen sich wertgeschätzt
- **deine Stimme** wird als „Frank — VOD Curator" prominent geführt

### 16.2 Wie das aussehen wird (für dich als Schreiber)

- Du loggst dich ein und siehst einen **Editor**, ähnlich wie bei einer Email
- Schreibst deinen Text — kannst Bilder, YouTube-Videos, Bandcamp-Player einfügen
- Klickst „Veröffentlichen"
- Alle Mitglieder sehen es. Manche reagieren mit 🔥 ❤️ 🤘. Manche kommentieren.
- Du kannst auf Kommentare antworten, oder sie ignorieren
- Wenn dir ein Kommentar nicht passt: „Verstecken" oder „Mod aufrufen" (Robin)

**Du musst kein Tech verstehen.** Es ist wie Facebook-Posten, nur dass die Reichweite tatsächlich da ist.

### 16.3 Was du dafür tun musst

**Vor Launch (zusammen mit Robin, ~4-6 Wochen):**
1. **Rede mit Robin** über die offenen Fragen oben (§13.2). Dauer: 60 min Telefonat.
2. **Schreib im Hintergrund 8-12 Posts** in den 4 Wochen vor Launch — die landen in der Beta-Phase, sind aber für die Public sichtbar wenn die Plattform aufmacht. Du musst nicht alles fertig haben — die werden über die ersten Monate ausgespielt.
3. **Wähl 30-50 deiner besten Stammkunden aus** — die bekommen die Beta-Einladung als erste. Diese Leute sind dein Anker für die Migration.
4. **Sag Robin Bescheid wenn der Anwalt für die Auction-AGB beauftragt wird** — der erweitert die AGB direkt für die Community mit, dann sparen wir.

**Nach Launch (laufend, ~30-60 min/Tag):**
1. **1 Editorial-Post pro Woche.** Kann „Aus dem Vault: Diese eine Tape-Compilation 1987"-Storie sein, kann Interview, kann Re-Discovery sein. **Donnerstag fix wäre gut**, dann gewöhnt sich die Community an den Rhythmus.
2. **3-5 Kommentare am Tag** auf Member-Posts. Wirkt wie nichts, ist aber der Klebstoff. Member fühlen sich gesehen, und du bist da.
3. **Mod-Queue 1× am Tag durchschauen** — Robin baut dafür ein Admin-Tool. Du klickst „OK" oder „Verstecken". Dauert 2-5 Min.

### 16.4 Was wir dafür NICHT machen

- **Wir schalten Facebook nicht sofort aus.** Die Gruppe läuft mindestens 6 Monate parallel weiter, du crosspostest. Erst wenn die Community auf vod-auctions.com läuft, machen wir Facebook auf Read-Only und 6 Monate später ganz zu.
- **Wir bauen kein Discord.** Kein Live-Chat-Stress.
- **Keine Werbung, keine Algorithmus-Beeinflussung.** Was du postest, sehen alle.
- **Keine Anonymen-Trolle.** Jeder Account braucht eine bestätigte E-Mail. Klarname ist im Hintergrund (für die Bezahlung), aber öffentlich darf jeder seinen Sammler-Handle haben.

### 16.5 Was du davon hast (jenseits Reichweite)

- **Keine Plattform-Abhängigkeit mehr.** Meta kann dich morgen sperren — bei vod-auctions.com nicht.
- **Direkter Verkaufs-Trichter.** Jemand liest deinen Editorial-Post über ZKO, sieht „Diese 3 Releases sind aktuell verfügbar" eingebettet, klickt, kauft.
- **Stammkunden-Bindung.** Sammler die dich seit 20 Jahren kennen, haben hier ein Profil mit Status, Sammlung, Wantlist — das bleibt nicht woanders.
- **Marketing zu Null-Kosten.** Wöchentliches Editorial = wöchentlicher Newsletter-Anlass = wöchentlicher SEO-Push = wöchentlicher Drive-to-Auction.

### 16.6 Was du jetzt entscheiden musst

Nichts dringend. Aber die nächsten Wochen wären wichtig:
1. **60-min-Termin mit Robin** für die Konzept-Durchsprache
2. **Anwalt-Termin gemeinsam mit Auction-AGB**

Den Rest treibt Robin technisch voran. Du wirst eingebunden, wenn es um Ton, Visual-Mockups oder Inhalte geht.

### 16.7 Was Member sich schon gewünscht haben (Stand 2026-05-05)

Ein Member hat in der Facebook-Gruppe gefragt:

> *„Gibts bald auch nen Chat?"*
> *„Oder hot List wo man für die LP des Tages abstimmen kann?"*

Beide Wünsche sind im Konzept berücksichtigt — hier die Plain-Language-Antwort:

**„LP des Tages"-Voting → ja, kommt.** Wir bauen es so, dass DU eine kleine Auswahl pro Tag oder pro Woche aussuchst (5-10 Releases), und die Member voten mit einem Klick. Der Sieger wird auf der Hub-Page + im Newsletter prominent featured. Das ist eines der wertvollsten Features, weil es Member täglich anlockt und gleichzeitig den Catalog pusht. Geplant für **Phase 2** (4-8 Wochen nach Launch).

**Chat → ja, aber nicht „immer offen".** Ein 24/7-Chat-Server (wie Discord) ist nicht das, was wir wollen — der wird auf Dauer toxic, niemand kann ihn 24/7 moderieren, und die Diskussionen sind am nächsten Tag vergessen. Stattdessen schalten wir Chat **gezielt frei**: (a) während laufenden Auctions als „Live Discussion", (b) eine Stunde nach jedem deiner Donnerstags-Editorials für Q&A, und (c) ein wöchentliches „Listening Hour" jeden Donnerstag 20:00. Das gibt das Live-Gefühl, ohne dass du oder Robin permanent dabei sitzen müsst.

**Empfehlung:** Mach in der Facebook-Gruppe nochmal einen einzelnen Post: *„Wir denken über eine eigene Community-Plattform nach — was würdet ihr euch wünschen?"* — die Antworten der nächsten 7 Tage helfen uns, das Konzept noch besser auf eure Member zu schneiden. Das ist 1 Post von dir, kostet 5 Min, bringt aber wertvollen Input vor dem Build-Start.

---

**Ende des Konzepts. Robin freut sich über Fragen, Korrekturen, Veto auf einzelne Punkte. Niemand ist hier in Stein gemeißelt.**
