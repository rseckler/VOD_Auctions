# Claude-Code-Prompt zur Überarbeitung des ERP-/Warenwirtschafts-Konzepts

Du überarbeitest ein bestehendes Markdown-Konzept für ein ERP-/Warenwirtschafts-Zielbild.

## Ziel
Das Dokument soll inhaltlich, strukturell und argumentativ auf ein deutlich professionelleres Niveau gebracht werden. Es soll am Ende wie ein belastbares Entscheidungs- und Architekturpapier wirken: klar, präzise, systematisch, managementtauglich und gleichzeitig tief genug für Produkt, Operations und technische Konzeption.

## Wichtige Leitplanken
- Nicht nur sprachlich glätten, sondern fachlich und strukturell verbessern.
- Bestehende gute Inhalte beibehalten, aber Schwächen in Struktur, Argumentation und Präzision beheben.
- Keine oberflächliche Kürzung.
- Keine Marketing-Sprache.
- Keine generischen Beraterfloskeln.
- Schreibe konkret, nüchtern, professionell und entscheidungsorientiert.
- Das Ergebnis soll wie die nächste, deutlich bessere Version des bestehenden Konzepts wirken.

## Sehr wichtige inhaltliche Vorgabe
Eine zentrale Prämisse des Dokuments ist, dass Marketplace / Seller-Modell **NICHT** aus dem MVP oder aus der frühen Architekturbetrachtung ausgeklammert werden darf.

Bitte diese Position aktiv respektieren und sauber ausarbeiten:
- Marketplace soll von Anfang an strukturell mitgedacht werden.
- Die Begründung dafür ist: Ein späterer Umbau nach kurzer Zeit wäre riskant, teuer und fehleranfällig.
- Das Ziel ist deshalb nicht, Marketplace operativ sofort maximal auszubauen, sondern die Architektur, Datenmodelle, Prozesslogik und Entscheidungsgrundlagen von Anfang an so aufzusetzen, dass Kommission, Eigenware und Seller-/Marketplace-Modell sauber abbildbar sind.
- Bitte also **NICHT** empfehlen, Marketplace grundsätzlich aus Phase 1 oder aus dem frühen Zielbild herauszulösen.
- Stattdessen soll sauber herausgearbeitet werden, wie man Marketplace von Anfang an konzeptionell und strukturell berücksichtigt, ohne unnötig chaotisch oder überladen zu werden.
- Du darfst sehr wohl differenzieren zwischen:
  - strukturell von Anfang an mitdenken
  - operativ priorisieren / phasenweise aktivieren
- Aber die Architektur und das Zielbild sollen bewusst marketplace-fähig entworfen werden.

## Zusätzliche zentrale Produkt- und Release-Vorgabe
Dieses Konzept soll ausdrücklich in das nächste große Release aufgenommen werden.

### Ausgangslage
- Es gibt ein aktuell live laufendes System.
- Dieses Live-System muss weiter betrieben, optimiert und punktuell verbessert werden.
- Parallel dazu wird bereits am nächsten großen Release gearbeitet.
- Das in diesem Konzept beschriebene Zielbild ist nicht für einen unbestimmten späteren Zeitpunkt gedacht, sondern soll Bestandteil des nächsten großen Releases werden.
- Gleichzeitig darf die Entwicklung dieses nächsten großen Releases das aktuelle Live-System nicht unnötig behindern, destabilisieren oder operativ ausbremsen.
- Ziel ist daher eine Architektur, Entwicklungs- und Umgebungsstrategie, mit der:
  - das aktuelle Live-System stabil weiterlaufen kann,
  - daran weiterhin Verbesserungen möglich sind,
  - und parallel das nächste große Release sauber entwickelt, getestet, validiert und vorbereitet werden kann.

## Zusätzliche wichtige Architekturvorgabe
Die Zielarchitektur soll nicht nur parallele Entwicklung von Live-System und nächstem großen Release ermöglichen, sondern auch die kontrollierte, modulare und schrittweise Übernahme einzelner Komponenten in das Live-System.

### Gewünschtes Zielbild
- Neue Themen und Komponenten sollen parallel entwickelt werden können.
- Diese Komponenten sollen isoliert testbar sein.
- Deployment und Aktivierung sollen voneinander entkoppelt sein.
- Nach Fertigstellung soll entschieden werden können, ob eine Komponente:
  - zunächst nur in Test-/Staging-Umgebungen verbleibt,
  - schrittweise aktiviert wird,
  - oder bereits vor dem vollständigen nächsten Release kontrolliert ins Live-System übernommen wird.
- Das Konzept soll daher nicht nur eine klassische Release-Logik beschreiben, sondern eine modulare Einführungs- und Aktivierungslogik für einzelne Komponenten des Gesamtkonzepts.
- Einzelne Bausteine des nächsten Releases sollen kontrolliert vorbereitet, getestet und gegebenenfalls schon vor dem vollständigen Gesamt-Release in das Live-System übernommen werden können.

Bitte arbeite diesen Punkt als eigenständigen Architektur- und Betriebsaspekt sauber in das Konzept ein.

## Folgende Fragen müssen dabei konkret adressiert werden
- Wie muss die Architektur aufgesetzt werden, damit dieses Konzept als Teil des nächsten großen Releases umgesetzt werden kann, ohne das aktuelle Live-System zu blockieren?
- Wie sollten Entwicklungs-, Test-, Staging-, Pre-Production- und Produktionsumgebungen geschnitten sein?
- Wie kann man Datenmodelle, APIs, Prozesse und Deployments so gestalten, dass laufender Betrieb und nächste Version kontrolliert nebeneinander existieren können?
- Wie lassen sich Breaking Changes, Migrationspfade und schrittweise Aktivierung neuer Logik beherrschbar machen?
- Welche Rolle spielen dabei Versionierung, Feature Flags, modulare Architektur, Umgebungsstrategie, Testdaten, Migrationen und Rollback-Fähigkeit?
- Wie kann verhindert werden, dass das Team entweder nur am Bestandssystem „flickt“ oder umgekehrt das neue Release baut, ohne den Live-Betrieb sauber abzusichern?
- Welche Teile sollten release-vorbereitend schon jetzt strukturell richtig angelegt werden, auch wenn sie operativ erst schrittweise aktiviert werden?
- Wie können neue Themen parallel entwickelt und nach Fertigstellung gezielt, kontrolliert und komponentenweise ins Live-System übernommen werden?
- Welche Teile des Konzepts eignen sich eher für eine schrittweise Einführung und welche eher für einen klaren Cutover?
- Wie verhindert man einen unkontrollierten Mischzustand zwischen alter und neuer Logik?

## Wichtig
- Dieser Punkt soll nicht nur technisch erwähnt werden, sondern als echter Bestandteil der Zielarchitektur.
- Das Dokument soll deutlich machen, wie eine ERP-/Wawi-nahe Plattform organisiert werden kann, wenn Bestandssystem und nächstes großes Release parallel existieren.
- Bitte nicht nur allgemein von „Staging“ oder „Dev/Prod“ sprechen, sondern konkret herausarbeiten:
  - Branching-/Release-Denke
  - Umgebungsmodell
  - Daten- und Migrationsstrategie
  - Parallelbetrieb / Übergangsarchitektur
  - kontrollierte Einführung neuer Module oder Prozesslogiken
  - Entkopplung von Live-Optimierungen und Next-Release-Entwicklung
  - modulare, kontrollierte Komponentenübernahme ins Live-System
  - Trennung von Deployment, Aktivierung und fachlichem Go-Live

## Erwartung an diesen Teil
Formuliere einen klaren Abschnitt dazu, wie eine release-fähige Zielarchitektur aussehen sollte, damit:
- laufende Optimierungen im Live-System möglich bleiben
- parallel an der nächsten Version gearbeitet werden kann
- dieses Konzept gezielt in das nächste große Release integriert werden kann
- Tests und Validierung realistisch möglich sind
- Migrationen planbar bleiben
- operative Risiken beim Übergang minimiert werden
- einzelne Komponenten des Gesamtkonzepts kontrolliert und schrittweise ins Live-System übernommen werden können

## Arbeitsmodus
- Lies das bestehende Dokument vollständig.
- Identifiziere zuerst die tragfähigen Teile, die übernommen werden können.
- Identifiziere danach strukturelle Schwächen, Lücken und Unschärfen.
- Schreibe das Dokument anschließend vollständig in einer verbesserten Zielstruktur neu.
- Erhalte die fachliche Grundrichtung, aber erhöhe Präzision, Konsistenz und Entscheidungsreife deutlich.
- Ergänze fehlende Abschnitte aktiv, statt nur vorhandenen Text umzuformulieren.

## Arbeitsauftrag
Überarbeite das Konzept so, dass es in folgenden Punkten deutlich besser wird:

### 1. Klare Executive Summary
- Am Anfang ein prägnanter Management-Überblick:
  - Ausgangslage
  - Kernproblem
  - Zielbild
  - empfohlene Richtung
  - wichtigste offene Punkte / Risiken

### 2. Saubere Trennung der Geschäftsmodelle
Arbeite die unterschiedlichen Modelle klarer und belastbarer heraus, mindestens:
- Eigenware
- Kommission
- Seller-/Marketplace-Modell
- ggf. bestehendes Auktionsmodell, falls relevant

Für jedes Modell soll erkennbar werden:
- Eigentum an Ware
- Lager-/Fulfillment-Verantwortung
- Verkäuferrolle
- Rechnungslogik
- Zahlungsfluss
- Steuerliche Implikationen
- Buchhalterische Auswirkungen
- Relevanz für Bestandsführung und Settlement

**Wichtig:**  
Diese Modelle dürfen nicht nur als Varianten beschrieben werden, sondern als operativ unterschiedliche Prozesslogiken.

### 3. Prozesssicht statt nur Tool-/Seitensicht
Das Dokument soll entlang echter Prozessketten belastbarer werden, z. B.:
- Wareneingang / Einbuchung
- Bestandsklassifikation
- Verkauf / Order Management
- Rechnungsstellung
- Versand / Fulfillment
- Retoure / Storno / Sonderfälle
- Kommissionsabrechnung / Settlement
- Buchhaltung / DATEV / Steuerlogik

### 4. Steuer- und Buchungslogik deutlich präziser
Besonders sensibel:
- §25a / Differenzbesteuerung
- Kommissionsgeschäft
- Marketplace-/Seller-Modell
- Regelbesteuerung / sonstige steuerliche Sonderfälle
- DATEV-Export nur als Folge einer klaren Buchungslogik

**Wichtig:**
- Keine falsche Scheingenauigkeit.
- Wo steuerliche Validierung nötig ist, klar benennen.
- Aber trotzdem konkret herausarbeiten, welche fachlichen Entscheidungen und Datenfelder dafür mindestens nötig sind.
- §25a bitte nicht als simples Zusatzfeld behandeln, sondern als fachliches Regelwerk mit Abhängigkeiten.

### 5. Datenmodell robuster machen
Das bestehende Datenmodell soll verbessert werden, damit es ERP-/Wawi-tauglicher wird.  
Achte insbesondere auf:
- Trennung von Produktstamm, Bestandseinheit, Bewegungsdaten und Finanzlogik
- Bestandsbewegungen / Inventory Movements
- Reservierungen
- Retourenereignisse
- Settlement-Lines statt nur grober Aggregation
- steuerliche Klassifikation / Entscheidungslogik
- Auditierbarkeit / Nachweise / Dokumentreferenzen

Bitte das Datenmodell nicht unnötig aufblasen, aber so präzisieren, dass klar wird, welche Kernobjekte wirklich notwendig sind.

### 6. Release-fähige Zielarchitektur und Parallelentwicklung
Ergänze einen klaren, belastbaren Abschnitt dazu, wie die Architektur und Entwicklungsorganisation aufgesetzt werden sollte, damit parallel an:
- dem aktuellen Live-System
- und dem nächsten großen Release
gearbeitet werden kann.

Berücksichtige ausdrücklich:
- Dieses Konzept soll in das nächste große Release aufgenommen werden.
- Die Umsetzung dieses Konzepts darf das aktuelle Live-System nicht behindern.
- Live-Betrieb, Live-Optimierung und Next-Release-Entwicklung müssen parallel sauber möglich sein.
- Neue Themen sollen parallel entwickelt und nach Fertigstellung kontrolliert in das Live-System übernommen werden können.
- Deployment, Aktivierung und Rollout einzelner Komponenten sollen bewusst voneinander getrennt werden.

Der Abschnitt soll mindestens behandeln:
- Release-Denke statt reinem laufendem Änderungsmodus
- Trennung und Zusammenspiel von Live-System, nächstem Release und Übergangsphasen
- Umgebungsmodell (lokal, dev, test, staging, pre-prod, prod – soweit sinnvoll)
- Branching-/Release-Strategie
- Versionierung von APIs, Modulen und Migrationspfaden
- Umgang mit Breaking Changes
- Datenbankmigrationen und Rückwärtskompatibilität
- Feature Flags / schrittweise Aktivierung
- Teststrategie für alten und neuen Funktionsumfang
- Rollback-Fähigkeit
- kontrollierter Übergang von Version N auf Version N+1
- Schutz des Live-Systems vor instabiler oder unfertiger Next-Release-Logik
- wie neue Kernmodule parallel entwickelt und isoliert getestet werden können
- wie Live-Fixes und Release-Entwicklung organisatorisch und technisch sauber nebeneinander laufen
- wie einzelne Komponenten des Gesamtkonzepts vor dem vollständigen Gesamt-Release bereits kontrolliert übernommen werden können
- welche Komponenten eher modular aktivierbar sind und welche einen klaren Migrations- oder Cutover-Zeitpunkt brauchen

**Wichtig:**
- Bitte nicht bei Standardfloskeln bleiben.
- Arbeite konkret heraus, welche architektonischen Prinzipien helfen, parallele Entwicklung und parallelen Betrieb beherrschbar zu machen.
- Benenne auch Risiken, wenn diese Release-Fähigkeit nicht von Anfang an eingeplant wird.

### 7. Architekturentscheidung belastbarer machen
Falls im Dokument verschiedene Architekturpfade / Optionen bewertet werden:
- mache die Bewertung expliziter und methodischer
- nutze nachvollziehbare Kriterien
- stelle Vor- und Nachteile sauber gegenüber
- berücksichtige explizit:
  - Fit für mehrere Geschäftsmodelle
  - Fit für Kommission
  - Fit für Marketplace
  - Fit für §25a / steuerliche Sonderlogik
  - Flexibilität vs. Betriebsaufwand
  - Integrationsrisiken
  - Datenhoheit
  - spätere Umbaukosten
  - Risiko von Workarounds / Custom-Logik
  - Fähigkeit zu Parallelentwicklung und Release-Betrieb
  - Eignung, dieses Konzept im nächsten großen Release umzusetzen, ohne das Live-System unnötig zu belasten
  - Eignung für modulare, schrittweise Übernahme einzelner Komponenten ins Live-System

**Wichtige Perspektive:**  
Ein scheinbar kleinerer Scope heute ist nicht automatisch besser, wenn dadurch in kurzer Zeit ein riskanter Umbau entsteht oder parallele Release-Arbeit unnötig erschwert wird.

### 8. Risiken und Ausnahmefälle ernsthaft ergänzen
Das überarbeitete Dokument soll nicht nur Happy Paths beschreiben.  
Ergänze klar erkennbare Risiken und Sonderfälle, z. B.:
- Retoure
- Teilretoure
- beschädigte Ware
- Storno nach Rechnungsstellung
- Korrekturen im Settlement
- Korrekturen im Bestand
- Chargebacks / Zahlungsausfälle
- Inkonsistenzen zwischen Bestands-, Order- und Finanzstatus
- Steuerliche Ausschluss- oder Sonderfälle
- Risiken aus Parallelbetrieb, Migrationen und Versionsübergängen
- Risiken aus einer zu engen Kopplung zwischen Live-System und Next-Release-Entwicklung
- Risiken aus teilweiser Aktivierung neuer Komponenten
- Risiken aus gemischter alter und neuer Logik im selben operativen Prozess

### 9. Klare Empfehlung formulieren – aber ohne die Marketplace-Prämisse zu unterlaufen
Die Empfehlung soll differenziert und belastbar sein.

**Wichtig:**
- Nicht einfach sagen: „Marketplace später“
- Sondern herausarbeiten:
  - was von Anfang an strukturell berücksichtigt werden muss
  - was operativ in Phasen ausgerollt werden kann
  - welche Architekturentscheidungen genau deshalb heute schon wichtig sind
  - wie diese Entscheidungen auch parallele Release-Entwicklung unterstützen
  - wie dieses Konzept konkret ins nächste große Release integriert werden kann, ohne das Live-System auszubremsen
  - wie einzelne Bausteine kontrolliert vorbereitet, getestet und bei Reife schrittweise ins Live-System übernommen werden können

## Sprachliche Anforderungen
- Deutsch
- professionell, präzise, ruhig
- keine unnötig langen Sätze
- klare Überschriften
- logischer Fluss
- keine Dopplungen
- keine vagen Aussagen ohne Konsequenz

## Erwartetes Ergebnis
1. Liefere zuerst eine vollständig überarbeitete Fassung des Konzepts in sauberem Markdown.
2. Danach liste separat die wichtigsten inhaltlichen Verbesserungen auf.
3. Danach liste separat die wichtigsten noch offenen fachlichen Entscheidungen / Annahmen / Validierungsbedarfe auf.
4. Danach liste separat die wichtigsten Architekturentscheidungen für Parallelbetrieb und Release-Fähigkeit auf.
5. Danach liste separat die wichtigsten Entscheidungen, damit dieses Konzept sauber Teil des nächsten großen Releases werden kann, ohne das aktuelle Live-System zu behindern.
6. Danach liste separat die wichtigsten Architekturentscheidungen für modulare, schrittweise Komponentenübernahme ins Live-System auf.
7. Wo sinnvoll, formuliere Tabellen oder Entscheidungsraster statt Fließtext.

## Wichtig
- Respektiere die strategische Grundhaltung, dass Marketplace von Anfang an konzeptionell mitgedacht werden **MUSS**.
- Respektiere zusätzlich die Grundhaltung, dass die Zielarchitektur release-fähig sein muss und parallele Arbeit an Live-System und nächster großer Version ausdrücklich unterstützen soll.
- Respektiere außerdem, dass dieses Konzept konkret in das nächste große Release aufgenommen werden soll und deshalb so ausgearbeitet werden muss, dass parallele Entwicklung, Testbarkeit und kontrollierte Einführung möglich sind.
- Respektiere zusätzlich, dass einzelne Komponenten des Konzepts vor einem vollständigen Gesamt-Release kontrolliert, modular und schrittweise in das Live-System übernommen werden können sollen.
- Verbessere das Dokument in diese Richtung, statt diese Grundannahmen wegzudiskutieren.
- Falls du Schwächen in dieser Position siehst, formuliere sie als Risiken oder Voraussetzungen – aber **nicht** als pauschale Empfehlung, Marketplace aus dem frühen Zielbild zu entfernen oder die Release-Komplexität auszublenden.

Arbeite nun das vorliegende Konzept entsprechend vollständig um.
