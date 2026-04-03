# RSE-284: Bilder-CDN — Cloudflare R2 Integration + laufender Sync

## Step-by-Step Plan zur Review

**Status:** Migration nach R2 abgeschlossen (160.957 Dateien, 99.5 GB). Bilder werden aber noch von tape-mag.com geladen.

---

## Schritt 1: R2 Custom Domain konfigurieren

**Wo:** Cloudflare Dashboard → R2 → Bucket `vod-images` → Settings → Custom Domain

1. Domain auswählen: `images.vod-auctions.com`
2. DNS-Eintrag wird automatisch von Cloudflare erstellt (CNAME)
3. SSL wird automatisch via Cloudflare provisioniert
4. Testen: `https://images.vod-auctions.com/tape-mag/standard/test-image.jpg`

**Alternative:** Falls keine Custom Domain gewünscht → R2 Public Access aktivieren (Settings → Public Access → Allow). Dann URL: `https://pub-{hash}.r2.dev/tape-mag/standard/filename.jpg`

**Geschätzter Aufwand:** 10 Minuten (Cloudflare UI)

---

## Schritt 2: URL-Mapping verstehen

| Alte URL (tape-mag.com) | R2 Key | Neue URL (R2) |
|---|---|---|
| `https://tape-mag.com/bilder/gross/{file}` | `tape-mag/standard/{file}` | `https://images.vod-auctions.com/tape-mag/standard/{file}` |

**R2 Bucket-Struktur:**
```
vod-images/
├── tape-mag/hq/         (79.862 Dateien, 88.48 GB — Hochauflösend)
├── tape-mag/standard/   (79.862 Dateien, 11.05 GB — Standard/gross)
├── vod-records/products/ (1.233 Dateien, 104 MB)
└── vod-records/gallery/  (~200 MB)
```

**Wichtig:** Die "gross"-Bilder auf tape-mag.com entsprechen den `tape-mag/standard/` Keys in R2.

---

## Schritt 3: Storefront next.config.ts anpassen

**Datei:** `storefront/next.config.ts`

```typescript
images: {
  remotePatterns: [
    { protocol: "https", hostname: "tape-mag.com" },          // Fallback
    { protocol: "https", hostname: "images.vod-auctions.com" }, // R2 CDN
  ],
},
```

**Aufwand:** 2 Minuten

---

## Schritt 4: Datenbank-Migration (Release.coverImage URLs)

**Vorher:** Backup der betroffenen Zeilen

```sql
-- Backup
CREATE TABLE "Release_coverImage_backup" AS
SELECT id, "coverImage" FROM "Release" WHERE "coverImage" LIKE 'https://tape-mag.com/bilder/gross/%';

-- Migration: ~41.500 Zeilen
UPDATE "Release"
SET "coverImage" = REPLACE(
  "coverImage",
  'https://tape-mag.com/bilder/gross/',
  'https://images.vod-auctions.com/tape-mag/standard/'
)
WHERE "coverImage" LIKE 'https://tape-mag.com/bilder/gross/%';
```

**Verifizierung nach Migration:**
```sql
-- Sollte 0 zurückgeben
SELECT COUNT(*) FROM "Release" WHERE "coverImage" LIKE 'https://tape-mag.com/bilder/gross/%';
-- Sollte ~41.500 zurückgeben
SELECT COUNT(*) FROM "Release" WHERE "coverImage" LIKE 'https://images.vod-auctions.com/%';
```

**Analog für Image-Tabelle:**
```sql
UPDATE "Image"
SET url = REPLACE(url, 'https://tape-mag.com/bilder/gross/', 'https://images.vod-auctions.com/tape-mag/standard/')
WHERE url LIKE 'https://tape-mag.com/bilder/gross/%';
```

**Aufwand:** 15 Minuten (inkl. Backup + Verifizierung)

---

## Schritt 5: Legacy Sync anpassen

### 5a: IMAGE_BASE_URL aktualisieren

**Datei:** `scripts/shared.py` (Zeile 35)

```python
# Vorher:
IMAGE_BASE_URL = "https://tape-mag.com/bilder/gross/"

# Nachher:
IMAGE_BASE_URL = "https://images.vod-auctions.com/tape-mag/standard/"
```

### 5b: Inkrementellen Bild-Sync hinzufügen

**Datei:** `scripts/legacy_sync.py`

Bei der Verarbeitung neuer/geänderter Bilder (Zeilen 286-289):

1. Bild von tape-mag.com herunterladen
2. Nach R2 hochladen mit Key `tape-mag/standard/{filename}`
3. URL im Supabase-Record auf R2-URL setzen

**Neue Dependency:** `boto3` in `scripts/requirements.txt` (S3-kompatibles SDK für R2)

**R2 Upload-Funktion (in shared.py oder eigenes Modul):**
```python
import boto3

r2_client = boto3.client(
    "s3",
    endpoint_url="https://98bed59e4077ace876d8c5870be1ad39.r2.cloudflarestorage.com",
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
)

def upload_to_r2(filename: str, image_data: bytes):
    r2_client.put_object(
        Bucket="vod-images",
        Key=f"tape-mag/standard/{filename}",
        Body=image_data,
        ContentType="image/jpeg",
    )
```

### 5c: R2 Credentials in scripts/.env

```env
R2_ACCESS_KEY_ID=e531882c76a536cf5348dd5c0e086d20
R2_SECRET_ACCESS_KEY=a4820d1214e8cf2159c59067ddd9e15b880c69c54cd022e3638591f0df53b7c9
```

**Aufwand:** 1 Stunde

---

## Schritt 6: Fallback-Logik (Optional)

Zwei Optionen:

**Option A: Next.js onError Fallback (einfach)**
- Image-Komponente mit `onError` Handler der auf tape-mag.com zurückfällt
- Pro: Kein Infrastruktur-Aufwand
- Con: Flackern bei Fehler, Client-seitig

**Option B: Cloudflare Worker als Proxy (robust)**
- Worker vor R2: Wenn R2 404 → redirect zu tape-mag.com
- Pro: Transparent, kein Frontend-Aufwand
- Con: Worker-Setup nötig

**Empfehlung:** Option A für den Anfang, Option B als Follow-up wenn nötig.

---

## Schritt 7: Admin System Health

**Datei:** `backend/src/api/admin/system-health/route.ts`

Neuer Health-Check:
```typescript
{
  name: "r2-images",
  label: "Cloudflare R2 (Image CDN)",
  status: "ok", // oder "warning" wenn unreachable
  message: "160,957 images, custom domain active",
  url: "https://images.vod-auctions.com"
}
```

Check: HEAD-Request auf eine bekannte Bild-URL.

**Aufwand:** 30 Minuten

---

## Schritt 8: Verifizierung

- [ ] 10 zufällige Releases prüfen → Bilder laden von R2
- [ ] Catalog-Seite → alle Thumbnails laden
- [ ] Lot-Detail → ImageGallery lädt von R2
- [ ] OG-Image Tags → korrekter R2-URL
- [ ] Lighthouse Performance → keine Regression
- [ ] Legacy Sync: neues Bild in MySQL → erscheint in R2 nach Sync
- [ ] System Health Dashboard → R2 Status grün

---

## Voraussetzungen

| Was | Details |
|---|---|
| Cloudflare Dashboard | Account `98bed59e4077ace876d8c5870be1ad39` |
| R2 Bucket | `vod-images` (160.957 Dateien, 99.5 GB) |
| DNS | `images.vod-auctions.com` muss konfigurierbar sein |
| R2 Access Key | `e531882c76a536cf5348dd5c0e086d20` |
| VPS | Python boto3 installieren, .env erweitern |

---

## Zusammenfassung

| Schritt | Aufwand | Risiko |
|---|---|---|
| 1. Custom Domain | 10 Min | Niedrig |
| 2. URL-Mapping | — | — |
| 3. next.config.ts | 2 Min | Niedrig |
| 4. DB-Migration | 15 Min | Mittel (Backup!) |
| 5. Legacy Sync | 1h | Mittel |
| 6. Fallback | 30 Min | Niedrig |
| 7. System Health | 30 Min | Niedrig |
| 8. Verifizierung | 30 Min | — |
| **Total** | **~3h** | |

**Kritischer Pfad:** Schritt 1 (Custom Domain) muss zuerst gemacht werden. Erst wenn `images.vod-auctions.com` funktioniert, können Schritte 3-5 folgen.
