# Discogs-Wantlist automatisch erweitern — Idee & Entscheidungen

**An:** Frank
**Von:** Robin
**Stand:** 26. April 2026 (mit echten Zahlen aus Deinem Account)

---

Lieber Frank,

ich hab mir Deinen Discogs-Account `pripuzzi` heute live angeschaut, um diese ganze Idee mit echten Zahlen zu unterfüttern statt nur zu schätzen. Vorab eine kleine Korrektur: Du hattest gesagt „ungefähr 20.000 Einträge". Tatsächlich sind es **45.972 Items** — also mehr als das Doppelte. Macht aber nichts, ändert nur den Maßstab.

Da steckt enorme Kuratierungs-Arbeit drin, gepflegt seit 2003 — 22 Jahre. Jeder Eintrag heißt: „diese konkrete Platte will ich haben." Wenn jemand auf dem Discogs-Marketplace ein Item daraus listet, kriegst Du eine Notification.

Die Idee ist: aus dieser kuratierten Liste **automatisch deutlich mehr Releases** zu Deiner Wantlist hinzufügen — basierend auf den **Künstlern und Labels**, die Du eh schon drin hast. Sprich: Wenn Throbbing Gristle 185 mal in Deiner Wantlist steht (so viele waren's wirklich), holen wir uns automatisch alles andere, was Throbbing Gristle je veröffentlicht hat — und das gleiche für jedes Label, das in Deiner Liste auftaucht.

Hier möchte ich Dir erklären, **was technisch geht, was es bedeutet** — und Dich um ein paar Entscheidungen bitten, bevor wir das bauen.

---

## 📊 Was ich in Deiner Wantlist gefunden habe

Damit Du ein Bild hast wovon wir reden:

**Top 10 Künstler in Deiner Wantlist:**
| # | Künstler | Einträge |
|---|---|---:|
| 1 | Depeche Mode | **2.417** |
| 2 | New Order | 972 |
| 3 | Kraftwerk | 670 |
| 4 | Yello | 535 |
| 5 | Cabaret Voltaire | 340 |
| 6 | Joy Division | 339 |
| 7 | Siouxsie & The Banshees | 339 |
| 8 | The Residents | 329 |
| 9 | The Smiths | 326 |
| 10 | Merzbow | 307 |

Klassisches Industrial / Synth / Post-Punk Pantheon. Depeche Mode ist offensichtlich Komplettist-Territorium.

**Top 10 Labels:**
| # | Label | Einträge |
|---|---|---:|
| 1 | Mute | **3.547** |
| 2 | 4AD | 1.601 |
| 3 | Rough Trade | 1.548 |
| 4 | ZH27 | 1.099 |
| 5 | Virgin | 892 |
| 6 | Factory | 841 |
| 7 | Sire | 548 |
| 8 | Polydor | 534 |
| 9 | Mercury | 475 |
| 10 | EMI | 472 |

Mute ist Dein klares Stamm-Label. Aber: Polydor/Mercury/EMI/Capitol sind Major-Labels mit zigtausenden Releases (Schlager, Klassik, alles) — da hast Du nur einzelne Industrial-Sachen rausgepickt, willst aber sicher nicht „alles von Polydor".

**Format-Verteilung:**
- CD: 42 % (19.400)
- Vinyl: 39 % (18.083)
- Cassette: 13 % (6.011)
- Rest (DVD, VHS, File, etc.): 6 %

**Jahres-Verteilung:**
- 80er: 34 %, 90er: 33 %, 2000er: 27 %
- Vor 1980: 2,5 %
- **Nach 2010: 0 %** (interessant — Du hast seit ~2015 die Wantlist quasi nicht mehr aktiv erweitert)

**Long-Tail-Realität:**
- 56 % der Künstler (4.144 von 7.462) haben nur **einen einzigen** Eintrag bei Dir
- 50 % der Labels (3.710 von 7.347) auch nur einen
- Das sind keine Komplettist-Targets, das sind one-off-Käufe.

→ **Empfehlung:** Wir scannen nur Künstler/Labels, die mindestens 3× in Deiner Wantlist stehen. Das reduziert die Arbeit massiv (von 7.500 auf ~2.000 Künstler), filtert die one-offs raus, und konzentriert sich auf das wo Du tatsächlich systematisch sammelst.

---

## 🎯 Was die Funktion macht

Vereinfacht in drei Schritten:

1. **Lesen:** Wir holen Deine komplette Discogs-Wantlist und ziehen alle Künstler + Labels raus, die da drin sind.
2. **Suchen:** Für jeden dieser Künstler und jedes dieser Labels holen wir die komplette Diskografie von Discogs.
3. **Filtern + Hinzufügen:** Was den Filtern entspricht (siehe unten) und noch nicht in Deiner Wantlist ist, wird automatisch hinzugefügt.

Das Ergebnis: **deutlich mehr Discogs-Notifications**, wenn jemand etwas im Marketplace listet, das in Dein Sammelgebiet passt.

---

## ⏱️ Wie lange dauert das?

Discogs erlaubt nur 60 API-Anfragen pro Minute (hartes Limit). Mit Live-Sample-Hochrechnung:

| Variante | API-Zeit |
|---|---|
| **Konservativ** | **~3,4 Stunden** — am Stück durchlaufbar |
| **Mittel** | **~9,7 Stunden** — über eine Nacht |
| **Umfassend** | **~18,6 Tage 24/7** — operativ unrealistisch |

Du kannst den Job jederzeit pausieren und später weiterlaufen lassen. Das System merkt sich, wo es war.

---

## 📊 Wie viele neue Einträge — mit echten Zahlen

Ich habe ein Sample von 50 Künstlern und 25 Labels aus Deiner Liste live abgerufen (mit dem Token den wir schon hatten) und die Filter durchgerechnet. Hier die Live-Hochrechnungen:

| Filter-Variante | **Neue Einträge** | Wantlist danach | Anmerkung |
|---|---:|---:|---|
| **Konservativ** | **9.000 – 14.500** | ~55.000 – 60.500 | Vinyl LP/12" + MC + CD-Album, ab 1980, ohne Reissues, nur Original-Pressings, nur Künstler/Labels mit ≥3 Wants, **ohne Major-Label-Aggregation** |
| **Mittel** | **27.000 – 148.000** | ~73.000 – 194.000 | Auch 7"/10", auch Reissues, ab 1970, Künstler/Labels mit ≥2 Wants |
| **Umfassend** | **~1,5 Millionen** ☠️ | ~1,5 Mio | Alles. **Klar nicht empfohlen** — nicht nur wegen Volumen, sondern auch weil 18 Tage Dauerlauf operativ Quatsch ist |

**Wichtig zur Klarstellung:** Dass „Umfassend" so explodiert, liegt vor allem daran dass Du Major-Label-Releases in Deiner Wantlist hast (Polydor, EMI, Mercury…). Polydor allein hat über 25.000 Releases im Discogs-Katalog, London Records sogar **431.500** (als Konzern hat der alles von Klassik bis Schlager veröffentlicht). Das willst Du nicht alles haben. Deshalb haben alle empfohlenen Profile einen automatischen Cap auf maximal 500-2.000 Releases pro Label/Künstler — Mega-Aggregationen werden ausgeschlossen.

**Mein klarer Vorschlag:** **Konservativ als Default-Run.** ~10.000 neue Einträge ist ein realistischer, verdaulicher Zuwachs (verdoppelt die Wantlist nicht, ergänzt sie sinnvoll), läuft an einem halben Tag durch, und Du siehst danach ob das gut funktioniert. Wenn ja, machen wir einen zweiten Run mit lockereren Filtern dran.

---

## ⚠️ Was Du wissen musst (Risiken)

**1. Discogs-Notifications werden mehr — wahrscheinlich um ein Drittel.**
Aktuell triggern Marketplace-Listings auf Deine 45.972 Wants. Bei +10k zusätzlichen Wants in Conservative wirst Du **etwa 22 % mehr Daily-Notifications** bekommen. Bei Mittel mit +27k Wants entsprechend 60 % mehr. Wenn Du schon jetzt manchmal Mühe hast, da Schritt zu halten — wird's nicht leichter.

**2. Die Wantlist verliert ihren „kuratierten" Charakter.**
Bisher bedeutet jeder Eintrag „das will ich konkret." Nach dem Run heißt es eher „das passt grob in mein Beuteschema." Das ist eine bewusste Entscheidung, die Du treffen musst.

**3. Discogs könnte den Account temporär sperren.**
Wenn wir die API zu aggressiv nutzen, kann Discogs den Token sperren — dann ist Dein Account ein paar Stunden eingeschränkt. Wir bauen das natürlich konservativ (langsamer als das Limit erlaubt), aber 0 % Risiko gibt's nicht.

**4. Original-Pressings only — oder alle Versionen?**
Discogs listet jede Version separat (deutsche Press, US-Press, Reissue 1995, Reissue 2012, Picture Disc Limited Edition…). Ohne „Original-Pressing only"-Filter explodiert das Volumen — manche Klassiker haben 30+ Versionen. Mit Filter kriegst Du pro Album genau **eine** Wantlist-Notification.

---

## 🤔 Entscheidungen, die ich von Dir brauche

Bitte gib mir zu jedem Punkt kurz Deine Meinung — dann bauen wir das richtig:

### 1. Welches Filter-Profil als Start?
- ☐ **Konservativ** (Empfehlung: ~9.000–14.500 neue Einträge, ~3-4 h Laufzeit)
- ☐ **Mittel** (~27.000–148.000 neue Einträge, ~10 h Laufzeit)
- ☐ **Umfassend** (1,5 Mio+ Einträge, 18 Tage 24/7 — würde ich klar abraten)
- ☐ **Custom** — wir setzen uns eine halbe Stunde zusammen und gehen die Filter im Detail durch

### 2. Original-Pressings only?
- ☐ Ja — pro Album nur 1 Eintrag, egal wie viele Pressungen es gibt
- ☐ Nein — alle Pressungen, Reissues, Limited Editions etc. werden separat gewantet

### 3. Was ist mit Releases, die wir bei VOD/tape-mag schon im Bestand haben?
- ☐ Trotzdem zur Wantlist — Du willst sie ggf. selbst auch privat besitzen
- ☐ Überspringen — wenn wir's eh schon im Lager haben, brauchst Du's nicht persönlich

### 4. Sollen wir einen Hard-Cap setzen?
Z.B. „maximal 12.000 neue Einträge pro Run, danach stoppt es automatisch und wir schauen drauf"
- ☐ Ja, sicherer (z.B. 12.000 als erster Run)
- ☐ Nein, durchlaufen lassen

### 5. Phase 2 sofort mitbauen — Künstler/Label-Blocklist?
„Throbbing Gristle hab ich schon manuell durchforstet, die brauche ich nicht erweitern" — sowas direkt zum Setup-Zeitpunkt einstellbar.
- ☐ Ja, gleich mit
- ☐ Nein, erst wenn wir merken dass wir's brauchen

### 6. Token
Den habe ich schon — der Discogs-Token den wir aus dem alten VOD_discogs-Projekt haben gehört zu Deinem `pripuzzi`-Account (live verifiziert heute). Damit können wir lesen UND auf Deine Wantlist schreiben. Wenn Dir das ungemütlich ist und Du lieber einen separaten Token nur für diesen Zweck generieren willst, geht das natürlich auch.
- ☐ OK, vorhandenen Token nutzen
- ☐ Bitte separaten Token generieren (sicherer)
- ☐ Erst nochmal drüber sprechen

---

## 💡 Bonus-Idee (kein Muss)

Wenn der Job läuft, könnten wir die Daten mehrfach nutzen:

- **Hauptzweck:** Deine Wantlist erweitern → Du kriegst mehr Discogs-Notifications für interessante Marketplace-Listings
- **Sekundär für VOD:** Die Liste der „interessanten Künstler/Labels" könnten wir später als Quelle nutzen, um automatisch passende Lots aus dem Discogs-Marketplace zu fischen, wenn wir sie für VOD beschaffen wollen

Aber das ist Phase X — fokussieren wir uns erstmal auf den ersten Schritt.

---

## 🚦 Wie geht's weiter

Wenn Du die 6 Fragen oben beantwortest, kann ich loslegen. Realistischer Bauplan:

- **~1 Woche Entwicklung** für die MVP (lesen + erweitern mit Konservativ-Profil)
- **Test-Run mit kleinem Cap** (erstmal nur 1.000 neue Einträge, schauen wie sich das anfühlt)
- **Voll-Run** wenn Du mit dem Test happy bist

Die ganze Logik ist **nicht-destruktiv** — wir fügen nur hinzu, wir löschen nichts aus Deiner Wantlist. Ein versehentlicher Run lässt sich also nicht kaputtmachen, höchstens „zu viel hinzufügen" (was man dann manuell oder per Bulk-Delete in Discogs wieder rausnehmen kann).

Falls Du mehr in die Tiefe willst (welche Künstler/Labels mit wievielen Releases, Jahres-Verteilung, etc.) — die volle Live-Analyse liegt unter [`DISCOGS_WANTLIST_ANALYSIS_2026-04-26.md`](DISCOGS_WANTLIST_ANALYSIS_2026-04-26.md). Aber für Deine Entscheidung reichen die Zahlen oben.

Sag Bescheid — gerne auch im nächsten Call wenn Dir Schreiben zu mühsam ist.

Robin
