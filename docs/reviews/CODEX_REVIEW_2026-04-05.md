# Codex Review — 2026-04-05

**Target:** working tree diff
**Reviewer:** Codex (built-in reviewer)
**Session ID:** `019d5e50-acae-75c2-be26-40b294e47d69`

## Zusammenfassung

Es gibt keine Runtime-Code-Änderungen in diesem Patch, aber das Doku-Update führt handlungsrelevante Inkonsistenzen ein: Es schreibt eine nicht existierende Komponente vor, listet bereits behobene Route-Verstöße auf und löscht Dokumente, auf die andere getrackte Dateien noch verweisen. Diese Punkte machen den Patch als neue Source of Truth unzuverlässig.

## Findings

### [P2] `admin-table`-Import entfernen oder Datei anlegen
**Datei:** `docs/DESIGN_GUIDE_BACKEND.md:393`

Der Guide besagt nun, dass jede Admin-Seite `DataTable` aus `../../components/admin-table` importieren soll, aber `backend/src/admin/components/admin-table.tsx` existiert nirgends im Repo. Da dieses Dokument als verbindlicher Design Guide markiert ist, läuft jeder, der eine Seite danach implementiert, sofort in einen kaputten Import — es sei denn, die Komponente landet im selben Change.

### [P3] Veraltete Sub-Page `defineRouteConfig`-Violations-Liste entfernen
**Datei:** `docs/DESIGN_GUIDE_BACKEND.md:155-161`

Der Abschnitt behauptet, dass `/app/crm`, `/app/config` und `/app/waitlist` immer noch `defineRouteConfig` exportieren, aber diese Route-Dateien tun das nicht mehr. Da der Guide als autoritativ beschrieben ist, schickt diese Liste den nächsten Cleanup-Pass hinter nicht existierenden Sidebar-Duplikaten her und lädt zu No-op-Edits ein.

### [P3] Gelöschte Top-Level UI/UX-Docs erhalten oder Referenzen umbiegen
**Datei:** `docs/UI_UX_GAP_ANALYSIS.md:1-5`

Das Löschen dieser Top-Level `docs/UI_UX_*.md`-Dateien ohne Update der bestehenden Referenzen lässt den Audit-Workflow auf fehlende Pfade zeigen. Zum Beispiel verweisen die verbleibenden Dokumente unter `docs/UI_UX/` noch auf `docs/UI_UX_GAP_ANALYSIS.md` und `docs/UI_UX_STYLE_GUIDE.md` — nach dieser Änderung lösen diese Instruktionen nicht mehr auf, es sei denn, Redirects/Stubs werden hinzugefügt oder die Referenzen im selben Patch angepasst.

## Priorisierung

| Priorität | Count | Bedeutung |
|-----------|-------|-----------|
| P2        | 1     | Sollte zeitnah behoben werden (Build/Import-Breakage-Risiko) |
| P3        | 2     | Konsistenz/Aufräumarbeiten |
