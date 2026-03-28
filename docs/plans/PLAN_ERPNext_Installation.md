# ERPNext Installation — VOD Records VPS
## Vollständiger Step-by-Step-Plan für Claude Code

**Stand:** 2026-03-28
**Ziel:** ERPNext (Frappe) auf bestehender Hostinger VPS installieren
**Domain:** `erp.vod-auctions.com` (DNS-A-Record auf 72.62.148.205 — gleiche Zone wie vod-auctions.com, bereits verwaltet)
**Methode:** frappe_docker (offizieller Docker Compose Stack)

---

## VPS-Status (geprüft 2026-03-28)

| Ressource | Ist | Minimum ERPNext | Status |
|-----------|-----|-----------------|--------|
| Disk frei | 57 GB | 10 GB | ✅ |
| RAM verfügbar | ~4.5 GB | 2 GB (Prod: 4 GB) | ✅ |
| Docker | 29.1.3 | 20+ | ✅ |
| OS | Ubuntu 24.04.3 LTS | Ubuntu 22.04+ | ✅ |
| MySQL | 8.0 (lokal, Port 3306) | — (MariaDB via Docker) | ✅ |
| Redis | läuft lokal Port 6379 | — (Redis via Docker) | ✅ |
| Nginx | aktiv | — | ✅ |

**Laufende Services (bleiben unberührt):**
- PM2: vodauction-backend (9000), vodauction-storefront (3006), Service_Overview (3002), tape-mag (3003)
- Docker: freqtrade (8085), freqtrade-bybit (8086), n8n (5678 intern), teamspeak6, blackfire-cron
- Apache: WordPress VOD Fest (8080/8081)
- Nginx: vod-auctions.com, api.vod-auctions.com, admin.vod-auctions.com

**ERPNext Port:** `8000` (intern im Docker-Netzwerk) → nginx Proxy → `erp.vod-auctions.com`

---

## Architektur-Entscheidungen

```
┌─────────────────────────────────────────────────────────┐
│ VPS 72.62.148.205                                        │
│                                                          │
│  nginx (Port 80/443)                                     │
│    └─ erp.vod-auctions.com → localhost:8080 (frappe)     │
│                                                          │
│  Docker Network: frappe_network                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ frappe-backend (gunicorn, Port 8000 intern)       │   │
│  │ frappe-frontend (nginx, Port 8080 → host)         │   │
│  │ frappe-worker-{default,long,short}                │   │
│  │ frappe-scheduler                                  │   │
│  │ frappe-socketio                                   │   │
│  │ mariadb (Port 3307 → host, getrennt von MySQL 8)  │   │
│  │ redis-cache + redis-queue + redis-socketio        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Warum frappe_docker statt bench-Install:**
- Isoliert von laufenden Diensten (eigenes Netzwerk, eigene MariaDB)
- MariaDB 10.6 im Container → kein Konflikt mit MySQL 8.0 auf Host
- Einfaches Backup (docker volumes), einfaches Update
- Kein Eingriff in systemweite Python/Node-Umgebung

---

## Phase 0 — Vorbereitung (DNS + Disk)

### Schritt 0.1 — DNS-Eintrag setzen (manuell, 5 Min)

> ⚠️ **Muss VOR Installation erledigt werden** (für SSL-Zertifikat)

Im Hostinger DNS-Panel (hpanel.hostinger.com):
```
Typ: A
Name: erp.vod-auctions.com (oder: erp)
Wert: 72.62.148.205
TTL: 3600
```

Alternativ auf `erp.vod-auctions.com` wenn vod-records.com-DNS nicht verwaltet wird.

### Schritt 0.2 — Disk-Check (Claude Code via SSH)

```bash
ssh vps "df -h / && docker system df"
```

Erwartung: mind. 15 GB frei. Falls < 15 GB:
```bash
ssh vps "docker system prune -f && docker image prune -a -f"
```

---

## Phase 1 — frappe_docker Setup

### Schritt 1.1 — Repository klonen

```bash
ssh vps "
  cd /root &&
  git clone https://github.com/frappe/frappe_docker.git erpnext &&
  cd erpnext &&
  git checkout main
"
```

### Schritt 1.2 — Environment-Datei erstellen

```bash
ssh vps "
  cd /root/erpnext &&
  cp example.env .env
"
```

Dann `.env` bearbeiten (Werte setzen):

```bash
ssh vps "cat > /root/erpnext/.env << 'EOF'
# ERPNext Version
ERPNEXT_VERSION=version-15

# Site
FRAPPE_SITE_NAME_HEADER=erp.vod-auctions.com

# MariaDB (separater Container, Port 3307 nach außen — kein Konflikt mit MySQL 3306)
DB_HOST=mariadb-database
DB_PORT=3306
MYSQL_ROOT_PASSWORD=SETZE_HIER_STARKES_PASSWORT
MARIADB_ROOT_PASSWORD=SETZE_HIER_STARKES_PASSWORT

# Admin
ADMIN_PASSWORD=SETZE_HIER_STARKES_PASSWORT

# Frappe
FRAPPE_VERSION=version-15
EOF
"
```

> **Passwörter werden beim tatsächlichen Run mit 1Password-generierten Werten ersetzt.**

### Schritt 1.3 — docker-compose.yml erstellen

frappe_docker bietet Compose-Overlays. Wir nutzen den PWD-Compose-Ansatz (Production with Docker):

```bash
ssh vps "
  cd /root/erpnext &&
  cat > compose.override.yml << 'EOF'
version: \"3\"

services:
  frontend:
    ports:
      - \"127.0.0.1:8090:8080\"  # Nur localhost — nginx proxied

  mariadb:
    ports:
      - \"127.0.0.1:3307:3306\"  # Localhost-only, getrennt von MySQL 3306
    volumes:
      - mariadb-data:/var/lib/mysql

volumes:
  mariadb-data:
EOF
"
```

### Schritt 1.4 — Docker Compose starten (Pull + Build)

```bash
ssh vps "
  cd /root/erpnext &&
  docker compose -f compose.yaml -f compose.override.yml pull
"
```

> Pull dauert ~5-10 Minuten (Images: ~2 GB gesamt). Claude Code wartet und prüft danach.

```bash
ssh vps "
  cd /root/erpnext &&
  docker compose -f compose.yaml -f compose.override.yml up -d
"
```

### Schritt 1.5 — Container-Status prüfen

```bash
ssh vps "
  cd /root/erpnext &&
  docker compose -f compose.yaml -f compose.override.yml ps
"
```

Erwartetes Ergebnis: alle Container `Up` (backend, frontend, mariadb, redis-cache, redis-queue, scheduler, workers).

---

## Phase 2 — ERPNext Site erstellen

### Schritt 2.1 — Site anlegen

```bash
ssh vps "
  docker exec -it \$(docker ps -qf 'name=erpnext-backend') \
    bench new-site erp.vod-auctions.com \
    --mariadb-root-password 'MARIADB_ROOT_PASS' \
    --admin-password 'ADMIN_PASS' \
    --install-app erpnext
"
```

> Dieser Schritt dauert 5-15 Minuten. ERPNext-App + alle Migrationen werden eingespielt.

### Schritt 2.2 — Site als Standard setzen

```bash
ssh vps "
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench use erp.vod-auctions.com
"
```

### Schritt 2.3 — Funktionstest (intern)

```bash
ssh vps "curl -s -o /dev/null -w '%{http_code}' http://localhost:8090"
```

Erwartung: `200` oder `301` (Login-Redirect)

---

## Phase 3 — Nginx + SSL

### Schritt 3.1 — Nginx-Konfiguration erstellen

```bash
ssh vps "cat > /etc/nginx/sites-available/erpnext.conf << 'NGINX'
upstream erpnext_upstream {
    server 127.0.0.1:8090;
}

server {
    listen 80;
    server_name erp.vod-auctions.com;

    # Certbot ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name erp.vod-auctions.com;

    ssl_certificate     /etc/letsencrypt/live/erp.vod-auctions.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.vod-auctions.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50m;

    # WebSocket (Frappe Socket.io)
    location /socket.io/ {
        proxy_pass http://erpnext_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        proxy_pass http://erpnext_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 600;
    }
}
NGINX
"
```

### Schritt 3.2 — Nginx-Config aktivieren und testen

```bash
ssh vps "
  ln -sf /etc/nginx/sites-available/erpnext.conf /etc/nginx/sites-enabled/erpnext.conf &&
  nginx -t
"
```

### Schritt 3.3 — HTTP-Only temporär aktivieren (für Certbot)

Zuerst nur HTTP-Block aktivieren (SSL-Zertifikat existiert noch nicht):

```bash
ssh vps "nginx -s reload"
```

### Schritt 3.4 — SSL-Zertifikat holen

```bash
ssh vps "
  certbot --nginx -d erp.vod-auctions.com \
    --non-interactive \
    --agree-tos \
    --email frank@vod-auctions.com
"
```

### Schritt 3.5 — Nginx neu laden

```bash
ssh vps "nginx -s reload"
```

### Schritt 3.6 — HTTPS-Test

```bash
ssh vps "curl -s -o /dev/null -w '%{http_code}' https://erp.vod-auctions.com"
```

Erwartung: `200` oder `302` (Login-Redirect auf /login)

---

## Phase 4 — Deutsche Lokalisierung

### Schritt 4.1 — German app installieren (Community)

Frappe hat eine offizielle `german` App für Übersetzungen:

```bash
ssh vps "
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench get-app --branch main \
    https://github.com/frappe/frappe/tree/main/apps/german 2>/dev/null || \
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench get-app hrms
"
```

### Schritt 4.2 — ALYF German Accounting (SKR04 + §25a)

ALYF GmbH pflegt das offizielle deutsche Kontenrahmen-Modul:

```bash
ssh vps "
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench get-app \
    https://github.com/alyf-de/erpnext_germany &&
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench --site erp.vod-auctions.com install-app erpnext_germany
"
```

> Falls ALYF-App nicht verfügbar: SKR04 manuell über Chart of Accounts importieren (CSV liegt in ALYF-Repo).

### Schritt 4.3 — Site-Neustart nach App-Installation

```bash
ssh vps "
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench --site erp.vod-auctions.com migrate
"
```

---

## Phase 5 — Ersteinrichtung ERPNext (Browser + API)

> Diese Phase erfolgt überwiegend im Browser: `https://erp.vod-auctions.com`
> Login: Administrator / [ADMIN_PASSWORD]

### Schritt 5.1 — Setup Wizard (Browser)

Setup Wizard öffnet sich automatisch beim ersten Login:

```
1. Language: Deutsch
2. Country: Germany
3. Timezone: Europe/Berlin
4. Currency: EUR
5. Company Name: VOD Records
6. Company Abbreviation: VODR
7. Chart of Accounts: Germany - SKR04 (via ALYF App)
   oder: Germany - Standard (falls ALYF noch nicht aktiv)
8. Financial Year: 01.01.2026 – 31.12.2026
```

### Schritt 5.2 — Firma konfigurieren (Settings)

Über ERPNext UI oder via API:

```
Company → VOD Records:
  Adresse: Alpenstrasse 25/1, 88045 Friedrichshafen
  Land: Deutschland
  USt-IdNr.: DE232493058
  Steuer-ID: [Steuernummer Frank Bull]
  Default Currency: EUR
  Geschäftsjahresbeginn: 01.01.2026
```

### Schritt 5.3 — §25a Steuertemplate erstellen

Über: Accounting → Tax → Sales Taxes and Charges Template

```
Template Name: §25a UStG — Differenzbesteuerung
Anwendung: Sales
Steuerzeilen:
  Account: (Umsatzsteuer auf Marge, SKR04 Konto 19x)
  Rate: 0%  (Bruttobetrag — USt intern kalkuliert, kein Ausweis)
  Beschreibung: Gebrauchtgegenstände / Sonderregelung §25a UStG.
                Ein gesonderter Umsatzsteuerausweis ist nicht zulässig.
```

> **Hinweis:** Genaue Konten-Konfiguration mit ALYF oder Steuerberater abgleichen — dies ist die technische Grundstruktur.

### Schritt 5.4 — Rechnungs-Fußzeilentext konfigurieren

Über: Print Settings → Default Footer:

```
Gebrauchtgegenstände / Sonderregelung (§ 25a UStG).
Ein gesonderter Umsatzsteuerausweis ist nicht zulässig.
```

---

## Phase 6 — Backup-Strategie

### Schritt 6.1 — Automatisches Bench-Backup einrichten

ERPNext (bench) hat eingebautes Backup. Im Container konfigurieren:

```bash
ssh vps "
  docker exec \$(docker ps -qf 'name=erpnext-backend') \
    bench --site erp.vod-auctions.com set-config backup_limit 7
"
```

### Schritt 6.2 — Backup-Cron auf VPS

```bash
ssh vps "
  (crontab -l 2>/dev/null; echo '0 3 * * * docker exec \$(docker ps -qf name=erpnext-backend) bench --site erp.vod-auctions.com backup --with-files >> /root/erpnext/backup.log 2>&1') | crontab -
"
```

Backups landen in: `/root/erpnext/sites/erp.vod-auctions.com/private/backups/`

---

## Phase 7 — PM2-ähnlicher Auto-Start (Docker Restart Policy)

Docker Compose neu starten wenn VPS neu bootet:

```bash
ssh vps "
  cd /root/erpnext &&
  docker compose -f compose.yaml -f compose.override.yml \
    up -d --restart-policy unless-stopped 2>/dev/null || \
  sed -i 's/restart: on-failure/restart: unless-stopped/g' compose.yaml &&
  docker compose -f compose.yaml -f compose.override.yml restart
"
```

Systemd-Service für Auto-Start bei Reboot:

```bash
ssh vps "cat > /etc/systemd/system/erpnext.service << 'SYSTEMD'
[Unit]
Description=ERPNext Docker Stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/erpnext
ExecStart=/usr/bin/docker compose -f compose.yaml -f compose.override.yml up -d
ExecStop=/usr/bin/docker compose -f compose.yaml -f compose.override.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SYSTEMD
  systemctl daemon-reload &&
  systemctl enable erpnext
"
```

---

## Phase 8 — vod-auctions.com Integration vorbereiten

### Schritt 8.1 — API Key für vod-auctions.com erstellen

Im ERPNext Browser:
```
Settings → API Access → Neuen API Key erstellen
User: Administrator
Key wird generiert → in vod-auctions.com .env speichern:
  ERPNEXT_URL=https://erp.vod-auctions.com
  ERPNEXT_API_KEY=xxx
  ERPNEXT_API_SECRET=yyy
```

### Schritt 8.2 — Test-API-Aufruf

```bash
ssh vps "
  curl -s https://erp.vod-auctions.com/api/method/frappe.auth.get_logged_user \
    -H 'Authorization: token API_KEY:API_SECRET'
"
```

Erwartung: `{\"message\": \"Administrator\"}`

---

## Rollback-Plan

Falls etwas schiefläuft — bestehende Services **bleiben unberührt**:

```bash
# ERPNext komplett stoppen
ssh vps "cd /root/erpnext && docker compose down"

# nginx-Config deaktivieren
ssh vps "rm /etc/nginx/sites-enabled/erpnext.conf && nginx -s reload"

# Volumes löschen (destruktiv — nur wenn neu starten)
ssh vps "cd /root/erpnext && docker compose down -v"

# Directory entfernen
ssh vps "rm -rf /root/erpnext"
```

Alle anderen PM2-Dienste, Docker-Container (freqtrade, n8n) und nginx-Configs bleiben **vollständig unverändert**.

---

## Zeitplan für Claude Code

| Phase | Schritt | Dauer (geschätzt) | Claude Code? |
|-------|---------|-------------------|:------------:|
| 0 | DNS-Eintrag setzen | 5 Min | ❌ Manuell |
| 0 | Disk-Check | 1 Min | ✅ |
| 1 | frappe_docker klonen + .env | 3 Min | ✅ |
| 1 | Docker Pull (Images ~2 GB) | 10 Min | ✅ (wartet) |
| 1 | Container starten + prüfen | 3 Min | ✅ |
| 2 | Site erstellen + ERPNext installieren | 15 Min | ✅ (wartet) |
| 3 | Nginx-Config + SSL-Zertifikat | 5 Min | ✅ |
| 4 | ALYF-App installieren | 5 Min | ✅ |
| 5 | Setup Wizard | 10 Min | ❌ Browser |
| 5 | §25a-Template | 10 Min | ❌ Browser / ✅ via API |
| 6 | Backup-Cron | 2 Min | ✅ |
| 7 | Systemd Auto-Start | 2 Min | ✅ |
| 8 | API Key + Test | 5 Min | ✅ + Browser |
| **Total** | | **~75 Min** | **~85% automatisiert** |

---

## Manuell erforderlich (vor Start)

1. **DNS-A-Record** `erp.vod-auctions.com → 72.62.148.205` im Hostinger hPanel setzen
2. **Passwörter generieren** (1Password) für:
   - `MARIADB_ROOT_PASSWORD`
   - `ADMIN_PASSWORD` (ERPNext Administrator)
3. Warten bis DNS propagiert ist (prüfbar via `nslookup erp.vod-auctions.com`)

---

## Offene Punkte nach Installation

- [ ] §25a-Steuertemplate mit ALYF oder StB final konfigurieren
- [ ] Kommissions-DocTypes anlegen (Einlieferer, Konsignationsartikel, Settlement)
- [ ] DATEV-Export-Modul testen
- [ ] vod-auctions.com Stripe-Webhook → ERPNext Sales Invoice API-Integration (RSE-230)
- [ ] Artikel-Import (41.500 Releases als ERPNext Items, optional)

---

*Plan erstellt: 2026-03-28*
*Basierend auf: frappe_docker v15, Ubuntu 24.04, VPS 72.62.148.205*
