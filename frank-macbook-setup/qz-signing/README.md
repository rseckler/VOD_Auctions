# QZ Tray Signing Certificate

Dieses Verzeichnis enthält das **öffentliche** Cert unseres QZ-Tray-Signing-Setups (`override.crt`). Der Private-Key liegt **nicht hier** — der ist nur im Backend `.env` als `QZ_SIGN_PRIVATE_KEY`.

## Was das Cert tut

QZ Tray zeigt bei unsigned/untrusted Connections einen „Allow/Block"-Dialog mit **ausgegrauter „Remember"-Checkbox**. Das heißt: bei jedem Print-Aktion (`connect`, `getVersion`, `printers.find`, `print`) muss der User erneut bestätigen — insgesamt vier Dialoge pro Druck.

Wird das Cert als `override.crt` in QZ Tray's Config-Dir hinterlegt, betrachtet QZ Tray es als **Trusted Root** → Dialoge entfallen komplett, alle Print-Aktionen laufen silent.

## Installation

`install.sh` macht das automatisch (Step 3 im Setup). Manuell:

```sh
mkdir -p "$HOME/Library/Application Support/qz"
cp frank-macbook-setup/qz-signing/override.crt "$HOME/Library/Application Support/qz/override.crt"
pkill -f "QZ Tray"; open "/Applications/QZ Tray.app"
```

## Cert-Details

- **Algorithm:** RSA 2048-bit
- **Subject:** `O=VOD Auctions, OU=Inventory Print, CN=vod-auctions.com`
- **Signature:** SHA256withRSA
- **Valid From:** 2026-04-22
- **Valid Until:** 2036-04-19 (10 Jahre)

## Sicherheits-Hinweis

Das Cert ist public-key-Kryptografie — es darf öffentlich im Repo liegen. Was geheim bleiben **muss**:

- `QZ_SIGN_PRIVATE_KEY` im `backend/.env` des VPS (nie committen, nie exponieren)
- Falls das je kompromittiert wird: neues Cert generieren, VPS-ENV updaten, und ein neues `override.crt` ausrollen

Private-Key-Rotation:

```sh
# Lokal
openssl genpkey -algorithm RSA -out qz-private.pem -pkeyopt rsa_keygen_bits:2048
openssl req -new -x509 -key qz-private.pem -out qz-cert.pem -days 3650 \
  -subj "/O=VOD Auctions/OU=Inventory Print/CN=vod-auctions.com"

# override.crt im Repo ersetzen
cp qz-cert.pem frank-macbook-setup/qz-signing/override.crt

# VPS ENV setzen (siehe backend/scripts/migrations/... als Guide)
```
