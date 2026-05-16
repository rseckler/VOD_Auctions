# VOD Community — Platform Build Plan

**Status:** Draft 2026-05-15
**Owner:** Robin Seckler
**Bezug:** [`Community Concept.md`](./Community%20Concept.md) (insb. §4 Must-Haves, §17 Build-Strategie) · [`Community Design Brief.md`](./Community%20Design%20Brief.md)
**Design-Referenz (verbindlich):** [`VOD Community Mockups.html`](./VOD%20Community%20Mockups.html) bzw. die Quell-Komponenten in [`community/`](./community/) (`community.css`, `components.jsx`, `screens.jsx`). Vinyl-Culture-Tonalität, 4 Key-Screens. Increment 1 hat CSS + Komponenten-Sprache daraus portiert; jeder weitere Increment baut visuell darauf auf.
**Zweck:** Der verbindliche, increment-basierte Bauplan von der heutigen Increment-1-Foundation zu einer vollwertigen Community-Plattform. Ersetzt das ad-hoc „design-treu minimal"-Framing.

---

## 0. Wo wir stehen

**Increment 1 (rc55.0, live hinter Flag `COMMUNITY`=ON):** Foundation steht und funktioniert end-to-end — Member-Profile, Posts (Text), Comments, Reactions, Reviews, Hub-Feed, Catalog-Anchored Discussion. Backend (11 Routes) + Storefront + DB-Schema + Rating-Trigger + Replikation.

**Ehrliche Bewertung:** Increment 1 ist *Infrastruktur*, kein erlebbares Produkt. Es fehlen drei Dinge, ohne die es sich nicht wie eine Community anfühlt:
1. **Posts sind text-only** — Konzept §4.1 M3 verlangt Bilder/Videos/Embeds. Lücke.
2. **Kein Backend** — keine Admin-Oberfläche zum Verwalten/Moderieren.
3. **Kein sozialer Loop** — kein Following, kein personalisierter Feed, keine Notifications.

Dieser Plan schließt diese Lücken in drei Increments.

---

## 1. Zielbild

Eine Plattform, auf der:
- Member **reichhaltige Posts** schreiben (Bilder, Embeds, Releases verlinkt),
- Frank/Robin alles über ein **eigenes Backend** steuern und moderieren,
- ein **sozialer Loop** (Following, Feed, Notifications, Tags) für Wiederkehr sorgt,
- Frank als **Curator** mit eigener Editorial-Spur sichtbar ist,
- die Plattform **sicher** für echte User geöffnet werden kann (Moderation, Trust-Levels),
- und 9 Jahre Facebook-Content über die Migration eingespielt sind.

---

## 2. Increments

### Increment 2 — Echte Posts + Backend-Steuerung

**Ziel:** Posts werden reichhaltig; Frank/Robin bekommen ein Backend.

**A — Medien in Posts**
- Bild-Upload nach Cloudflare R2 (Helper `backend/src/lib/image-upload.ts` wiederverwenden) — neuer Endpoint `POST /store/community/upload`, Auth + Größen-/Typ-Limit, optimiert via `sharp`.
- Tiptap-Image-Extension im Composer — Bild hochladen + inline einfügen.
- Embed-Node für YouTube / Vimeo / Bandcamp / SoundCloud / Spotify (URL einfügen → Player). iframe-Allowlist im Sanitizer ist bereits vorbereitet.
- Post-Cover-Bild (separat vom Body, für Feed-Cards + Hero).
- **Bewusst nicht jetzt:** Roh-Video-Upload (große Files, eigener Storage-/Transcoding-Aufwand) — Video läuft über Embeds. Später eigener Punkt.

**B — Community-Admin** (`backend/src/admin/routes/community/`, 9. Sidebar-Eintrag)
- **Dashboard** `/app/community` — Kennzahlen (Posts/Comments/Members/Reviews), jüngste Beiträge, jüngste Member, Flag-Status.
- **Posts** `/app/community/posts` — Liste aller Status, Filter, Hide/Pin/Remove (Backend-Routes existieren).
- **Members** `/app/community/members` — Profil-Liste, Tier/Curator/Ban setzen — braucht zusätzlich eine `GET`-Listen-Route.
- Admin-Design-System verbindlich (`admin-tokens.ts`, `admin-layout.tsx`, `admin-ui.tsx`).

**Deliverable:** Posts mit Bildern + Embeds. Backend zum Moderieren + Member-Verwalten.
**Aufwand:** ~6–8 Tage.

### Increment 3 — Es wird eine Community

**Ziel:** der soziale Loop, der Wiederkehr erzeugt.

- **Following / Follower** — `community_follow`-Tabelle, Follow-Button auf Profil + Post.
- **Personalisierter Activity-Feed** — Hub zeigt eingeloggten Membern die Posts der Gefolgten + Frank-Editorials; Logged-out sieht kuratiert.
- **Tags-System** — Tag-Browser, Tag-Filter, Tag-Seiten, Trending-Tags (heute nur Anzeige).
- **CRM-Tier-Vererbung** — `community_profile.tier` automatisch aus `customer_stats.tier` statt manuell (Konzept §4.1 M2).
- **Notifications** — In-App-Center: Reply, Mention `@handle`, neuer Post von Gefolgten, Editorial. Email-Digest später.

**Deliverable:** echte Community-Mechanik.
**Aufwand:** ~8–10 Tage.

### Increment 4 — Kuration + Safety

**Ziel:** bereit für echte User.

- **Editorial-Spur „Dispatch"** — `/community/dispatch`, Franks Editorials prominent + eigenes Visual-Treatment, Editorial-Verwaltung im Admin.
- **Moderation** — „Report"-Button auf Post/Comment, `community_report`-Tabelle, Mod-Queue im Admin (`/app/community/queue`).
- **Trust-Levels** — TL0–TL3 (Konzept §8.2), Rate-Limits, Auto-Promotion-Job.
- **Auto-Mod (optional)** — Claude Haiku Spam-/Toxicity-Check für längere Posts.

**Deliverable:** moderierbare, sichere Plattform.
**Aufwand:** ~6–8 Tage.

### Schritt 2 — Facebook-Migration (separat, größere Überarbeitung)

Eigenständiger Strang, vom Robin bewusst geparkt: P6-Import der 5.819 Frank-Posts + Legacy-Review-Migration aus `3wadmin_tapes_comment` (500 Zeilen) + die Überarbeitung der fehlerhaften FB-Posts. Pipeline P1–P5 ist fertig (Annex). **Das ist die eigentliche Inhalts-Maschine** — füllt die Plattform mit 9 Jahren Content. Offen vorab: `typ`-Decode (§17.5).

---

## 3. Reihenfolge & Begründung

```
Increment 2 (Medien + Admin)  →  Increment 3 (Sozialer Loop)  →  Increment 4 (Kuration + Safety)
                                                                          │
Schritt 2 (FB-Migration) — parallel möglich ab Increment 2 ───────────────┘
```

- **2 zuerst:** ohne Medien sind Posts nicht ernst zu nehmen; ohne Backend kann niemand die Plattform betreiben. Beides blockiert jedes sinnvolle Testen.
- **3 danach:** der soziale Loop braucht Inhalte (aus 2 + Schritt 2), um zu wirken.
- **4 zuletzt:** Moderation/Trust-Levels werden erst kritisch, wenn echte User dazukommen.
- **Schritt 2** kann parallel laufen, sobald das Datenmodell aus Increment 1 steht (tut es).

---

## 4. Verbindliche Scoping-Entscheidungen

| # | Entscheidung |
|---|---|
| D1 | Storefront- + Admin-UI **ausschließlich Englisch**. |
| D2 | Medien: Bild-Upload (R2) + Embeds (YT/Vimeo/Bandcamp/SoundCloud/Spotify). **Kein** Roh-Video-Upload in Increment 2. |
| D3 | Increment 2 bekommt das Community-Admin als **9. Sidebar-Eintrag**. |
| D4 | Kein Fake-Seed-Content auf Prod. Echter Content kommt über Schritt 2 (FB-Migration). |
| D5 | Jede Phase: additive Migrationen, Flag bleibt `COMMUNITY`, Replica-DDL mitziehen, CHANGELOG + Release pro Deploy. |
| D6 | Jeder Increment endet mit Typecheck-sauberem Deploy hinter dem Flag + Smoke-Test. |

---

## 5. Status-Tracking

Increment-Fortschritt wird über die Session-Task-Liste geführt; nach jedem Increment: CHANGELOG-Eintrag + GitHub-Release, dieser Plan wird mit ✅ je Increment aktualisiert.

| Increment | Status |
|---|---|
| 1 — Foundation | ✅ rc55.0 |
| 2 — Medien + Admin | ✅ rc56.0 |
| 3 — Sozialer Loop | ✅ rc57.0 |
| 4 — Kuration + Safety | ✅ rc57.0 |
| Schritt 2 — FB-Migration | geparkt (separate Überarbeitung) |

**Increments 1–4 vollständig umgesetzt + deployed (Stand 2026-05-16).** Offen: Schritt 2 (FB-Migration) — separate Überarbeitung.
