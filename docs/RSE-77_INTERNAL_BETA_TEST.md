# RSE-77 — Interner Beta-Test: VOD Auctions

**Zweck:** Erster echter End-to-End-Test mit realen Usern vor dem öffentlichen Launch
**Koordinator:** Robin Seckler (rseckler@gmail.com)
**Zeitfenster:** 48h — [DATUM EINTRAGEN] bis [DATUM+2 TAGE]
**Teilnehmerzahl:** 3–6 Personen

---

## Admin-Checkliste (vor dem Test)

- [ ] Neuen Auction Block erstellen: 8–10 Produkte, Startpreis €1–€5, Laufzeit 48h
- [ ] Block-Status auf `active` setzen
- [ ] Stripe Live-Mode bestätigen (Testbetrag €1 manuell prüfen)
- [ ] PayPal Live-Mode bestätigen
- [ ] Resend: Test-Mail an sich selbst schicken (Welcome + Outbid)
- [ ] Refund-Bereitschaft: nach jeder Zahlung innerhalb 24h manuell zurücküberweisen
- [ ] Einladungs-Mail an Testpersonen senden (Template unten)
- [ ] Admin-Dashboard während des Tests im Auge behalten

---

## Testablauf (5 Phasen)

### Phase 1 — Zugang & Registrierung

| Schritt | Aktion                            | Erwartetes Ergebnis                          |
| ------- | --------------------------------- | -------------------------------------------- |
| 1.1     | https://vod-auctions.com aufrufen | Password Gate erscheint                      |
| 1.2     | Passwort `vod2026` eingeben       | Redirect auf Homepage                        |
| 1.3     | „Login" → „Register" klicken      | Auth-Modal öffnet sich                       |
| 1.4     | Account mit echter E-Mail anlegen | Welcome-Mail kommt an                        |
| 1.5     | Eingeloggten Zustand prüfen       | Avatar im Header sichtbar, kein Login-Button |

### Phase 2 — Browse & Watchlist

| Schritt | Aktion                               | Erwartetes Ergebnis                    |
| ------- | ------------------------------------ | -------------------------------------- |
| 2.1     | „Auctions" im Menü aufrufen          | Aktiver Block sichtbar                 |
| 2.2     | Block öffnen, Lots durchstöbern      | Fotos, Beschreibungen, Preise sichtbar |
| 2.3     | Ein Lot auf die Merkliste setzen (♡) | Saved-Badge im Account-Menü erscheint  |
| 2.4     | Katalog (/catalog) aufrufen          | Produkte durchsuchen, Filter testen    |

### Phase 3 — Bieten

| Schritt | Aktion                                | Erwartetes Ergebnis                     |
| ------- | ------------------------------------- | --------------------------------------- |
| 3.1     | Bid-Betrag eingeben + „Place Bid"     | Bid-Counter erhöht sich                 |
| 3.2     | Von anderem Testuser überboten werden | Outbid-Mail kommt an                    |
| 3.3     | Erneut bieten (höherer Betrag)        | Wieder Höchstbietender                  |
| 3.4     | Bid-Historie auf Lot-Seite prüfen     | Anonymisierte Bieter-Übersicht sichtbar |

### Phase 4 — Zahlung

| Schritt | Aktion                                            | Erwartetes Ergebnis                    |
| ------- | ------------------------------------------------- | -------------------------------------- |
| 4.1     | Auktion endet (warten oder Admin beendet manuell) | „You won!"-Mail kommt an               |
| 4.2     | Account → Won Items aufrufen                      | Offener Zahlungsstatus sichtbar        |
| 4.3     | Checkout starten                                  | Shipping-Adresse, Versandart auswählen |
| 4.4     | Mit Kreditkarte oder PayPal zahlen                | Payment-Bestätigungs-Mail kommt an     |
| 4.5     | Bestellnummer (VOD-ORD-XXXXXX) notieren           | Wird für Refund gebraucht              |

### Phase 5 — Post-Payment & Feedback

| Schritt | Aktion                         | Erwartetes Ergebnis                  |
| ------- | ------------------------------ | ------------------------------------ |
| 5.1     | Account → Orders aufrufen      | Bestellung mit Status sichtbar       |
| 5.2     | PDF-Rechnung herunterladen     | Korrekte Daten, VOD Records Absender |
| 5.3     | Logout via Header-Dropdown     | Login-Button erscheint wieder        |
| 5.4     | Feedback an rseckler@gmail.com | Screenshot bei Fehlern anhängen      |

---

## Feedback-Template für Testpersonen

	Betreff: VOD Auctions Feedback — [Name]
	
	Was hat gut funktioniert:
	-
	
	Was war unklar oder kaputt:
	-
	
	Gerät / Browser:
	-
	
	Screenshots im Anhang: ja / nein

---

## Bekannte Einschränkungen (Stand Beta)

- Keine Apple Pay / Google Pay (kommt in Phase C)
- Shipping-Tracking manuell (kein automatischer Carrier-Link)
- Password Gate aktiv — Plattform nicht öffentlich zugänglich

---

## Refund-Prozess (Admin)

1. Admin-Dashboard: https://admin.vod-auctions.com/app/orders
2. Bestellung über Bestellnummer suchen
3. „Refund" klicken → Betrag bestätigen
4. Stripe/PayPal erstatten automatisch, dauert 3–5 Werktage beim Kunden
5. Kurze Bestätigungs-Mail an Testperson senden

---

## Einladungs-Mail (Template)

> Betreff: Du bist dabei — interner Test der neuen Auktionsplattform VOD Auctions🎵

---

Hello,

Jetzt ist es soweit. Die neue Plattform mit und für Frank - VOD Auctions - ist jetzt soweit start bereit. Ich habe jetzt den Großteil umgesetzt und jetzt müssen wir mal den Ernstfall proben.

Bitte kurz mitmachen: Account anlegen, auf ein paar Sachen bieten, eine davon „gewinnen" und einmal durch den Bezahlprozess gehen. Das Geld kommt sofort dann gleich wieder zurück.

Dauert insgesamt ca. 10–15 Minuten, aufgeteilt über 48 Stunden (damit die Gebote ein bisschen hin und her gehen können).

**So geht's:**

**1 — Seite aufrufen**
👉 https://vod-auctions.com
Passwort für den Beta-Zugang: **vod2026**

**2 — Account anlegen**
Oben rechts auf „Login" → dann „Register".
Einfach mit deiner echten (oder einer Wegwerf-)Adresse registrieren.

**3 — Auktionen anschauen**
Unter „Auctions" findest du einen laufenden Block mit ca. 10 Produkten.
Alles echte Sachen aus meinem Lager — Vinyl, CDs, Bücher.

**4 — Mitbieten**
Such dir was aus und biet drauf. Startgebot liegt bei €1.
Wenn dich jemand überbiet, kriegst du eine Mail — dann kannst du nachziehen. Gerne auch in 0,10 Euro Schritten, damit der Kaufpreis nicht so hoch wird. 

**5 — Wenn du gewonnen hast: einmal zahlen**
Ich schick dir dann eine Mail. Geh in deinen Account, schließ die Zahlung ab (Kreditkarte oder PayPal).
**Ich erstatte dir den Betrag sofort zurück.**

**6 — Kurzes Feedback an mich**
Was hat funktioniert? Was war komisch oder kaputt?
Einfach kurze Mail mit Screenshot (falls was schiefläuft) an rseckler@gmail.com.

---

Das ist noch Beta — also wenn irgendwas nicht klappt, ist das genau der Punkt. Ich freue mich über jeden Hinweis, auch wenn er klein wirkt.

Der Test läuft vom **Heute 30.03. 12 Uhr** bis **02.04. 12 Uhr - Also 48h**.

Grüße,
Robin

---

*Dieses Dokument gehört zu Linear Issue RSE-77.*
