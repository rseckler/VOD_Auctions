# Uptime Kuma Setup — VOD Auctions

## Installation auf VPS

```bash
# Auf VPS einloggen
ssh root@72.62.148.205

# Docker Compose für Uptime Kuma
mkdir -p /root/uptime-kuma
cat > /root/uptime-kuma/docker-compose.yml << 'EOF'
version: "3"
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    ports:
      - "3010:3001"
    restart: unless-stopped
EOF

cd /root/uptime-kuma && docker compose up -d
```

## Nginx Config

Erstelle `/etc/nginx/sites-available/uptime-kuma`:
```nginx
server {
    listen 80;
    server_name status.vod-auctions.com;

    location / {
        proxy_pass http://localhost:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Dann aktivieren:
```bash
ln -s /etc/nginx/sites-available/uptime-kuma /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

SSL via Certbot:
```bash
certbot --nginx -d status.vod-auctions.com
```

## Monitore konfigurieren (nach Installation unter status.vod-auctions.com)

1. **Storefront:** https://vod-auctions.com — HTTP(s), Interval: 60s
2. **API:** https://api.vod-auctions.com/health — HTTP(s), Interval: 60s
3. **Admin:** https://admin.vod-auctions.com — HTTP(s), Interval: 300s
4. **Supabase:** https://bofblwqieuvmqybzxapx.supabase.co — HTTP(s), Interval: 300s

## Alerts
- Email: frank@vod-records.com
- Telegram: Optional (Bot Token erforderlich)
