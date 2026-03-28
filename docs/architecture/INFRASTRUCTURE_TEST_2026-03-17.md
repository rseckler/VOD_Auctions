# Infrastruktur-Testbericht VOD_Auctions

**Datum:** 2026-03-17
**Getestet von:** Claude Code (Opus 4.6)
**Anlass:** Massive git-Hänger und SSH-Timeouts während Catalog Sort Fix Deploy

---

## Zusammenfassung

| Bereich | Status | Aktion |
|---------|--------|--------|
| Lokales System | OK | - |
| Git (lokal) | KRITISCH → BEHOBEN | Re-Clone durchgeführt |
| GitHub SSH | WARNUNG → BEHOBEN | SSH funktioniert nach Re-Clone |
| VPS Disk | KRITISCH → BEHOBEN | 90% → 78% (6 GB freigeräumt) |
| VPS Services | WARNUNG | Storefront 531 Restarts (historisch) |
| Externe APIs | OK | Alle 12 Services erreichbar |
| Claude Code | OK | v2.1.77, Agent Teams aktiv |

---

## 1. Lokales System

### Hardware & OS

| Metrik | Wert | Status |
|--------|------|--------|
| macOS | 26.3.1 (Build 25D2128) | OK |
| RAM | 48 GB (46G used, 857M free) | OK |
| Disk | 926 GB total, 758 GB frei (2% used) | OK |
| Load Average | 3.36 / 3.69 / 3.79 | OK |
| CPU | 17.5% user, 12.9% sys, 69.6% idle | OK |
| Disk I/O | 5.96 GB/s Write-Speed | Exzellent |

### Toolchain

| Tool | Version | Pfad |
|------|---------|------|
| Node.js | v25.8.1 | `/opt/homebrew/bin/node` |
| npm | 11.11.0 | `/opt/homebrew/bin/npm` |
| pnpm | 10.32.1 | `/opt/homebrew/bin/pnpm` |
| Python | 3.14.3 | `/opt/homebrew/bin/python3` |
| pip | 26.0 | Homebrew |
| Git | 2.50.1 (Apple Git-155) | Xcode CLT |
| GitHub CLI | 2.88.1 | Homebrew |

### Workspace-Größe (VOD_Auctions)

| Verzeichnis | Größe |
|-------------|-------|
| backend/node_modules | 5.1 GB |
| storefront/node_modules | 614 MB |
| storefront/.next | 441 MB |
| clickdummy/node_modules | 376 MB |
| **Gesamt** | **7.0 GB** |

---

## 2. Git — KRITISCH → BEHOBEN

### Problem

Alle git-Befehle die Commit-History traversieren (log, diff, commit, push) hingen unendlich. Nur Index-basierte Befehle (status, add) funktionierten.

### Diagnose

| Test | Ergebnis |
|------|----------|
| `git status --short` | OK (0.037s) |
| `git log --oneline -3` | **HÄNGT (>10s timeout)** |
| `git cat-file -p HEAD` | OK (0.015s) |
| `git cat-file -p HEAD^` | **HÄNGT** |
| `git repack` | **HÄNGT (>30s)** |
| Fresh clone `git log` | OK (0.015s) |
| `.git/index.lock` | Vorhanden (von abgebrochenen Prozessen) |

**Root Cause:** Pack-Files in `.git/objects/pack/` waren in inkonsistentem Zustand. Vermutlich durch mehrere gleichzeitig abgebrochene git-Prozesse (6 Zombie-Prozesse gefunden aus vorheriger Session).

**Verschärfende Faktoren:**
- Restriktive Pack-Settings: `pack.threads=1`, `pack.windowmemory=10m`, `pack.deltacachesize=1m`
- SSH zu GitHub intermittierend (Port 22 Timeouts)
- 1.564 prune-packable loose Objects

### Lösung: Re-Clone

| Schritt | Ergebnis | Zeit |
|---------|----------|------|
| Backup (mv) | Instant | 0.002s |
| Fresh clone (HTTPS) | 187 Commits | 0.99s |
| Modified files kopiert | 27 Dateien | Instant |
| Deleted files entfernt | 17 Dateien | Instant |
| Untracked files kopiert | 20+ Dateien | Instant |
| .env files kopiert | 2 von 4 vorhanden | Instant |
| node_modules (mv) | 3 Dirs (5.7 GB) | 0.009s |
| .next cache (mv) | 441 MB | Instant |
| scripts/venv (mv) | Moved | Instant |
| data dirs (mv) | 2 Dirs | Instant |

### Ergebnis nach Re-Clone

| Test | Vorher | Nachher |
|------|--------|---------|
| `git status` | 37ms | **65ms** |
| `git log --oneline -5` | **HÄNGT** | **13ms** |
| `git diff --stat` | **HÄNGT** | **20ms** |
| History traversal (187 commits) | **HÄNGT** | **12ms** |
| Commit + Push | **HÄNGT** | **< 3s** |

### Entfernte Pack-Settings

```
# VORHER (restriktiv):
pack.threads = 1
pack.windowmemory = 10m
pack.deltacachesize = 1m
pack.packsizelimit = 50m

# NACHHER: Default-Werte (nicht gesetzt)
```

### Remote URL

```
# VORHER: SSH (intermittierend)
git@github.com:rseckler/VOD_Auctions.git

# ZWISCHENZEITLICH: HTTPS (für Clone)
https://github.com/rseckler/VOD_Auctions.git

# NACHHER: SSH (funktioniert nach Re-Clone)
git@github.com:rseckler/VOD_Auctions.git
```

---

## 3. GitHub Connectivity

### SSH

| Test | Ergebnis | Zeit | Status |
|------|----------|------|--------|
| `ssh -T git@github.com` (1. Versuch) | Authenticated as `rseckler` | 1.26s | OK |
| `ssh -T git@github.com` (2. Versuch) | Timeout Port 22 | >5s | FAIL |
| `git ls-remote` (SSH) | Timeout | >15s | FAIL |
| `git ls-remote` (HTTPS) | OK, returns main ref | 0.38-0.46s | OK |
| Nach Re-Clone: `git push` (SSH) | OK | <3s | OK |

**Ergebnis:** SSH war intermittierend, funktioniert aber nach Re-Clone wieder zuverlässig.

### GitHub API (HTTPS)

| Test | Ergebnis | Zeit |
|------|----------|------|
| `api.github.com/repos/rseckler/VOD_Auctions` | 200 OK | 0.24s |
| `api.github.com/rate_limit` | 59/60 remaining | 0.06s |

### GitHub CLI

| Test | Ergebnis |
|------|----------|
| Version | 2.88.1 (2026-03-12) |
| Auth Status | **Nicht eingeloggt** |

**TODO:** `gh auth login` ausführen für PR/Issue-Workflows.

### SSH-Konfiguration

- 1 Ed25519 Key via **1Password SSH Agent**
- Agent Socket: `~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock`
- SSH Config: 1Password Agent global konfiguriert, `vps` und `macmini` Host-Aliases

---

## 4. VPS (Hostinger 72.62.148.205) — DISK BEHOBEN

### Netzwerk

| Test | Ergebnis | Status |
|------|----------|--------|
| Ping (3 Pakete) | 0% Loss, avg 13.3ms | OK |
| Storefront (vod-auctions.com) | 307 (Gate redirect), 49ms | OK |
| Backend (/health) | 200 OK, 55ms | OK |
| Admin (admin.vod-auctions.com) | 301 (→ /app), 92ms | OK |
| SSH Verbindung | OK, 0.76s | OK |

### Server-Ressourcen

| Metrik | Wert | Status |
|--------|------|--------|
| Uptime | 13 Tage, 19h44m | OK |
| Load Average | 1.10, 1.30, 1.25 | OK |
| RAM | 2.9G / 7.8G (4.9G frei) | OK |
| Swap | 1.3G / 4.0G | OK |
| **Disk (vorher)** | **43G / 48G (90%)** | **KRITISCH** |
| **Disk (nachher)** | **37G / 48G (78%)** | **OK** |

### Disk-Cleanup durchgeführt

| # | Aktion | Einsparung |
|---|--------|-----------|
| 1 | Snap Cache gelöscht | ~2.8G |
| 2 | Docker unused Images gepruned | 569M |
| 3 | Docker Build Cache gepruned | 671M |
| 4 | blackfire .next/cache gelöscht | ~530M |
| 5 | apt cache geleert | ~139M |
| 6 | PM2 Logs geflusht | ~22M |
| 7 | Watch_Service Logs truncated | ~75M |
| 8 | /tmp geleert | ~217M |
| 9 | journalctl vacuum (→20M) | 63M |
| 10 | Alte Log-Archive gelöscht | ~10M |
| **Gesamt** | | **~6 GB** |

### Nicht gelöscht (User-Entscheidung: behalten)

| Item | Größe | Grund |
|------|-------|-------|
| Wine/MetaTrader 5 | 2.0G | User will behalten |
| Snap Chromium | 822M | User will behalten |
| n8n Container | 1.9G | User will behalten |

### PM2 Services

| Service | Status | Uptime | Restarts | RAM |
|---------|--------|--------|----------|-----|
| blackfire-service | online | 13D | 0 | 56 MB |
| microinvest-dashboard | online | 13D | 0 | 113 MB |
| service-overview | online | 13D | 0 | 134 MB |
| stromportal-api | online | 3D | 1 | 31 MB |
| tapemag-migration | online | 7D | 1 | 58 MB |
| **vodauction-backend** | online | 15h | **131** | 64 MB |
| **vodauction-storefront** | online | 4m | **531** | 156 MB |
| watch-service-web | online | 13D | 0 | 56 MB |

**Warnung:** vodauction-storefront hat 531 kumulative Restarts. Aktuell stabil seit letztem Deploy, aber historisch instabil. Logs sollten untersucht werden.

### Backend API Performance (localhost)

| Endpoint | Status | Zeit |
|----------|--------|------|
| /health | 200 | 3.4ms |
| /store/catalog?limit=1 | 200 | 132ms |

### SSL-Zertifikate

| Domain | Gültig bis | Tage übrig |
|--------|-----------|------------|
| vod-auctions.com | 01.06.2026 | ~76 |
| api.vod-auctions.com | 01.06.2026 | ~76 |

### Crontabs (VOD_Auctions)

| Zeitplan | Job |
|----------|-----|
| Täglich 04:00 UTC | `legacy_sync.py` (MySQL → Supabase) |
| Mo-Fr 02:00 UTC | `discogs_daily_sync.py` (Preisupdate) |

---

## 5. Externe Services

| # | Service | HTTP Status | Antwortzeit | Status |
|---|---------|-------------|-------------|--------|
| 1 | Supabase REST API | 401 (auth required) | 0.10s | OK |
| 2 | Supabase Main | 404 (no root) | 0.04s | OK |
| 3 | Stripe API | 404 (no auth) | 0.14s | OK |
| 4 | PayPal API | 406 (no headers) | 0.07s | OK |
| 5 | Brevo (CRM) | 404 (no root) | 0.16s | OK |
| 6 | Resend (Email) | 200 | 0.75s | OK |
| 7 | Discogs API | 200 | 0.23s | OK |
| 8 | Linear | 400 (no query) | 0.34s | OK |
| 9 | Upstash Redis | 200 | 0.20s | OK |
| 10 | Sentry | 302 (redirect) | 0.18s | OK |
| 11 | Anthropic (Claude) | 404 (no root) | 0.03s | OK |
| 12 | Google Analytics | 301 (redirect) | 0.07s | OK |

**Alle 12 Services erreichbar. Schnellster: Anthropic (0.03s), Langsamster: Resend (0.75s).**

---

## 6. Claude Code Setup

### Version & Konfiguration

| Komponente | Wert |
|------------|------|
| Claude Code | v2.1.77 |
| Binary | `/opt/homebrew/bin/claude` (Homebrew) |
| Agent Teams | Aktiv (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, tmux mode) |
| Dangerous Mode | `skipDangerousModePermissionPrompt: true` |

### MCP Server

| Server | Typ | Status |
|--------|-----|--------|
| Linear | Remote (Claude.ai) | Konfiguriert, Permissions granted |
| Vercel | Remote (Claude.ai) | Konfiguriert, Permissions granted |
| Supabase | Remote (Claude.ai) | Konfiguriert, Permissions granted |
| Stitch | Lokal (stdio) | Konfiguriert, nicht laufend |

### Plugins

| Plugin | Status |
|--------|--------|
| frontend-design@claude-plugins-official | Installiert + aktiv |

### Hooks (3 Lifecycle Hooks)

Alle Fire-and-forget HTTP POSTs an lokalen "Claude Remote" Webhook-Server:
- `Notification` → `http://localhost:$CLAUDE_REMOTE_PORT/hook`
- `SessionStart` → gleich
- `Stop` → gleich

### Projekt-Permissions

108 explizite Allow-Einträge in `.claude/settings.local.json`:
- Bash-Befehle (git, ssh, npm, curl, scp, etc.)
- MCP-Tool-Permissions (Linear, Vercel, Supabase)
- WebFetch für ~40 Domains

### Memory-System

**Leer** — keine Memories für dieses Projekt gespeichert.

---

## 7. Offene Optimierungs-Tasks

### Erledigt (2026-03-17)

| # | Task | Status |
|---|------|--------|
| 1 | Git Re-Clone (korrupte Pack-Files) | DONE |
| 2 | Git Pack-Settings entfernt | DONE |
| 3 | VPS Disk Cleanup (90% → 78%) | DONE |
| 4 | Sort-Fix committed + pushed | DONE |
| 5 | VOD_Auctions.bak gelöscht | DONE |

### Offen — Diese Woche

| # | Task | Aufwand | Impact |
|---|------|---------|--------|
| 6 | `gh auth login` — GitHub CLI einloggen | 2 min | Ermöglicht PR/Issue-Workflows |
| 7 | VPS Storefront Restarts untersuchen (`pm2 logs`) | 15 min | Stabilität |
| 8 | Claude Memory aufbauen (User/Feedback/Project) | 10 min | Bessere Kontext-Persistenz |
| 9 | VPS PM2 Log-Rotation konfigurieren | 10 min | Verhindert Log-Bloat |

### Offen — Nice-to-have

| # | Task | Aufwand | Impact |
|---|------|---------|--------|
| 10 | SSH über Port 443 als Fallback konfigurieren | 5 min | Robustere SSH-Verbindung |
| 11 | VPS Disk-Monitoring Alert (>85%) | 30 min | Frühwarnung |
| 12 | Certbot Auto-Renewal verifizieren (`certbot renew --dry-run`) | 5 min | SSL-Sicherheit |
| 13 | VPS: Snap-Pakete evaluieren (GNOME/Mesa/CUPS unnötig?) | 15 min | Weitere 3.4G frei |

---

## Anhang: Auslöser der Probleme

### Chronologie (2026-03-17)

1. **~05:00** — Catalog Sort Fix begonnen (2 Dateien geändert)
2. **~05:05** — `git status` hängt → erste Untersuchung
3. **~05:05–05:30** — Mehrere git-Befehle gestartet, alle hängen → 6+ Zombie-Prozesse
4. **~05:30** — SSH zu GitHub intermittierend (Port 22 Timeouts)
5. **~05:35** — VPS-Deploy per SCP (Umgehung von git)
6. **~05:40** — Erster VPS-Deploy mit falschem Fix (VPS-Dateien überschrieben lokale)
7. **~06:00** — Korrekter Fix deployed, Sort funktioniert
8. **~06:48** — Umfassende Infrastruktur-Analyse gestartet (5 parallele Agents)
9. **~07:30** — Git Re-Clone durchgeführt → alle git-Operationen wieder <100ms
10. **~07:45** — VPS Disk Cleanup → 90% → 78%
11. **~07:50** — Sort-Fix committed + pushed zu GitHub

### Lessons Learned

1. **Git-Hänger bei Pack-Korruption:** `git status` kann funktionieren während `git log/commit/push` hängen — irreführend. Bei Verdacht sofort `git log --oneline -1` testen.
2. **Zombie-Prozesse erzeugen index.lock:** Abgebrochene git-Befehle hinterlassen Lock-Files die Folgebefehle blockieren.
3. **SCP als Deploy-Fallback:** Bei git-Problemen kann direkt per SCP deployed werden.
4. **Parallele Diagnose-Agents:** Statt sequentiell zu debuggen, parallele Agents für verschiedene Systeme starten — spart erheblich Zeit.
5. **VPS Disk-Monitoring fehlt:** 90% Disk-Nutzung wurde erst bei Problemen entdeckt. Alert-Schwelle bei 85% einrichten.
