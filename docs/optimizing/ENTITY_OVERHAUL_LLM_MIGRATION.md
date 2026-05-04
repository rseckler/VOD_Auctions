# Entity Content Overhaul — LLM Provider Migration

**Status:** Entscheidungs-Dokument, vor Umsetzung
**Ziel:** Aktuelle OpenAI-basierte Pipeline (`scripts/entity_overhaul/`) auf günstigere/unabhängigere Infrastruktur migrieren
**Linear:** RSE-227
**Stand:** 2026-04-14
**Letzter Review:** Robin + Claude (Diskussion dokumentiert unten)

## Ausgangslage

Pipeline generiert kuratierte Beschreibungen für Bands, Labels und Press-Orgas der VOD-Auctions Plattform. Spezieller Stil: Industrial / Power Electronics / Noise / Experimental — kein Mainstream-Content.

**Progress-Snapshot (Admin-Dashboard Stand 2026-04-14):**
- Overall: **26,0%** (19.623 / 75.352 Entities mit Content)
- Bands: 19% (11.939 / 64.285) — 52.346 offen
- Labels: 64% (5.800 / 9.084) — 3.284 offen
- Press Orgs: 95% (1.884 / 1.983) — 99 offen
- Aktuell Running-Batch: 576 / 3.650 (P2)
- Quality: 566 accepted · 8 revised · 1 rejected · 1 error
- Gesamt offen: **~55.729 Entities**

**Pipeline pro Entity (5 API-Calls):**
1. `writer.py` → **gpt-4o** (temp 0.7, max 1.500 tokens) — Haupttext
2. `profiler.py` → gpt-4o-mini (max 800)
3. `seo_agent.py` → gpt-4o-mini (max 400)
4. `quality_agent.py` → gpt-4o-mini (max 600)
5. `musician_mapper.py` → gpt-4o-mini (conditional)

**Aktuelle Kosten:** ~$0,035 / Entity → Gesamt-Rest **~$1.950**.
**Bottleneck:** API-Kontingent / Monatsbudget (aktuell $100/Monat limit).

## Evaluierte Optionen

### Option A — Claude API (Sonnet + Haiku)

| Komponente | Modell | Kosten pro Entity |
|---|---|---|
| Writer (3K in / 1K out) | Claude Sonnet 4.5 ($3/$15) | $0,024 |
| Nebenagenten (5K in / 1,5K out total) | Claude Haiku 4.5 ($1/$5) | $0,013 |
| **Total** | | **~$0,037** |

**Gesamt-Rest:** ~$2.060 — **praktisch gleich teuer wie OpenAI.**
**Haken:** Haiku 4.5 ist 6-8× teurer als gpt-4o-mini. Sonnet für Writer bringt nichts Signifikantes ggü. gpt-4o.

**Rate Limits (API):** keine 5h-/Tages-Hardcaps auf bezahlten Tiers, nur RPM/TPM pro Minute. Bei Tier 2 (1.000 RPM) ist Claude nie der Bottleneck — Discogs (40/min) und MusicBrainz (50/min) drosseln die Pipeline eh.

**Verdict:** Kein Kostenvorteil. Nur sinnvoll bei Wunsch nach Provider-Konsolidierung.

### Option B — Claude Max Abo

**Technisch:** nur über Claude Code SDK (headless) möglich. Max hat keinen direkten API-Endpoint.

**Rechnung (Max 20x, ~$200/Monat):**
- 5h-Fenster: ~200-800 Sonnet-Messages
- Wochenlimit: ~2.400-4.800 Messages

Unser Bedarf: ~275.000 Requests (Writer + 4 Nebenagenten × 55.729). Selbst bei nur Writer (55K Messages) = **~12 Wochen Dauerbetrieb**, in denen Claude Code für nichts anderes nutzbar ist.

**ToS-Risiko:** Max-AUP ist auf interaktive Nutzung ausgelegt. Bulk-Pipelines in dieser Größenordnung sind klar außerhalb des gedachten Rahmens.

**Verdict:** Nicht praktikabel. Verworfen.

### Option C — Ollama auf Mac Mini M1

**Hardware:** M1, wahrscheinlich 8-16GB unified memory
**Maximale Modellgröße:** 7-14B (Qwen 2.5 7B, Mistral 7B)
**Speed:** ~20-40 tok/s bei 7-8B

**Probleme:**
- 7-14B Modelle produzieren für Industrial-Subkultur-Content sichtbar schwächere Prosa als GPT-4o → Quality-Agent rejected viel → Revision-Loops explodieren
- Mac Mini läuft bereits Stromportal (InfluxDB 3 + Collector + FastAPI) → RAM-Druck + Thermal Throttling würde andere Services beeinflussen
- Zeit: ~190 Tage Dauerbetrieb geschätzt

**Verdict:** Zu schwache Qualität + Konflikt mit Stromportal. Verworfen.

### Option D — Ollama auf MacBook M5 Pro 48GB ⭐

**Hardware:** M5 Pro, 48GB unified memory — genug für 32B Modelle komfortabel, 70B mit Q4.

**Kandidatenmodelle:**

| Modell | RAM (Q4) | Speed (geschätzt) | Eignung |
|---|---|---|---|
| Mistral Small 3 24B | ~14GB | 30-40 tok/s | ⭐ EU-Sprachen stark, Apache 2.0 |
| **Qwen 2.5 32B** | **~18GB** | **25-30 tok/s** | **⭐ Multilingual top, nahe GPT-4o** |
| Gemma 2 27B | ~16GB | 25-30 tok/s | Gutes DE, Google-Restriktionen |
| Qwen 2.5 72B | ~40GB | 8-12 tok/s | Near-GPT-4o, aber halbe Speed |
| Llama 3.3 70B | ~40GB | 8-12 tok/s | EN top, DE OK |

**Zeit-Rechnung (Mistral Small 3 24B @ ~35 tok/s, ~2.600 Output-Tokens/Entity):**
- Szenario A (alles lokal): ~90s/Entity → 55.729 × 90s = ~58 Tage 24/7 → **4-5 Monate bei 10h/Tag Nacht-/Wochenendbetrieb**
- Szenario B (Writer lokal, Nebenagenten weiter gpt-4o-mini): ~40s/Entity → ~26 Tage × 10h = **~2,5 Monate**, Restkosten **~$120 total**
- Szenario C (Writer-Loop nur nachts, 8h/Nacht ~1.000 Entities): **~8 Wochen** reiner Nacht-Betrieb, MacBook tagsüber frei

**Vorteile:**
- $0 variable Kosten
- $0 API-Budget-Abhängigkeit
- Daten bleiben lokal
- Einmal eingerichtet: auch für zukünftige Bulk-Jobs nutzbar (neue Imports, Re-Writes)

**Nachteile / Risiken:**
- Quality vs GPT-4o: 24-32B Modelle produzieren ~85-90% der Qualität → Quality-Threshold evtl. von 75 auf 70 senken
- MacBook als Arbeitsgerät: Wärme, Lüfter, Akku-Stress wenn nicht am Netz
- Setup-Aufwand + Test-Phase

**Verdict:** ⭐ **Bevorzugter Pfad**, sofern Quality-Pilot bestätigt dass lokales 24-32B Modell >75 Score im Schnitt liefert.

### Option E — Anthropic Batch API + Prompt Caching (Fallback)

**Kosten-Hebel:**
- Batch API: 50% Rabatt auf alle Tokens (24h Turnaround)
- Prompt Caching: Tone Examples + System Prompt (~3K Tokens identisch bei jedem Writer-Call) → 90% Rabatt auf Cached-Part

**Kalkulation:** Writer sinkt von $0,024 auf ~$0,009 → Gesamt-Rest **~$700**.
**Setup-Aufwand:** ~1h (Anthropic SDK + Caching-Header).

**Verdict:** Fallback falls Option D im Pilot nicht hält, was sie verspricht. Deutlich billiger als OpenAI-Status-quo, keine Hardware-Abhängigkeit.

## Vergleichstabelle

| Option | Kosten Rest | Dauer | Qualität | Risiko |
|---|---|---|---|---|
| Status quo OpenAI | ~$1.950 | 6 Monate | Referenz | Budget |
| A — Claude API | ~$2.060 | 4 Monate | = GPT-4o | Kosten gleich |
| B — Claude Max | "$0"* | 3+ Monate | = GPT-4o | **ToS, Claude Code blockiert** |
| C — Ollama M1 Mini | $0 | ~190 Tage | ⚠️ schwach | Qualität, Stromportal-Konflikt |
| **D — Ollama M5 Pro** | **$0-120** | **2-5 Monate** | **85-90% GPT-4o** | **Quality-Pilot nötig** |
| E — Claude Batch+Cache | ~$700 | 4-6 Wochen | = GPT-4o | gering |

## Empfehlung

**Pilot für Option D**, mit Option E als klarem Fallback:

1. **Pilot-Lauf** über ein Wochenende — 100 Test-Entities mit Ollama + Mistral Small 3 24B (oder Qwen 2.5 32B, beide testen)
2. **Quality-Vergleich** mit existierendem P1-Sample (Ø 82,3 Score)
3. Entscheidungs-Kriterium: **Ø Quality-Score > 75** → Switch auf Ollama-Pipeline
4. **Fallback** wenn < 75 → Batch API + Prompt Caching implementieren

## Nächste Schritte (für Fortsetzung)

### Pilot Setup (~2h Aufwand)

```bash
# 1. Ollama installieren
brew install ollama
ollama serve  # läuft als Background-Service

# 2. Kandidatenmodelle ziehen (parallel möglich)
ollama pull mistral-small:24b
ollama pull qwen2.5:32b
# Optional als High-End-Vergleich:
ollama pull qwen2.5:72b

# 3. Smoke-Test
ollama run mistral-small:24b "Schreibe einen 200-Wort-Essay über Throbbing Gristle im Industrial-Kontext."
```

### Code-Anpassungen

Minimal-invasive Variante: Ollama ist OpenAI-API-kompatibel auf `http://localhost:11434/v1`. Reicht ein neuer Client in `config.py`:

```python
# scripts/entity_overhaul/config.py

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")  # openai | ollama | anthropic

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")

MODELS = {
    "openai": {
        "writer": "gpt-4o",
        "profiler": "gpt-4o-mini",
        "seo": "gpt-4o-mini",
        "quality": "gpt-4o-mini",
        "musician_mapper": "gpt-4o-mini",
    },
    "ollama": {
        "writer": "mistral-small:24b",       # oder qwen2.5:32b
        "profiler": "mistral-small:24b",
        "seo": "qwen2.5:7b",                 # Nebenagenten können kleiner
        "quality": "qwen2.5:7b",
        "musician_mapper": "qwen2.5:7b",
    },
    # Hybrid-Modus Szenario B:
    "hybrid": {
        "writer": "ollama:mistral-small:24b",
        "profiler": "openai:gpt-4o-mini",
        "seo": "openai:gpt-4o-mini",
        "quality": "openai:gpt-4o-mini",
        "musician_mapper": "openai:gpt-4o-mini",
    },
}
```

Dann in `writer.py` + Nebenagenten Client-Auswahl nach Provider-Prefix. Konstruktor:

```python
from openai import OpenAI
if LLM_PROVIDER == "ollama":
    client = OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")
else:
    client = OpenAI(api_key=OPENAI_API_KEY)
```

### Pilot-Protokoll

Separate `orchestrator.py --pilot`-Flag anlegen, das:
- 100 zufällige Entities aus P2-Queue (gemischt Band/Label) zieht
- Generiert mit lokalem Modell, schreibt in **eigene Pilot-Tabelle** (nicht produktiv)
- Quality-Agent-Score loggt je Entity
- Schreibt am Ende Summary: Ø Score, Ø Laufzeit, Pass-Rate (>75), Anzahl Revisionen

### Entscheidungs-Gate

| Metrik | Schwelle | Konsequenz |
|---|---|---|
| Ø Quality-Score | ≥ 78 | ✅ Ollama-Pipeline produktiv |
| Ø Quality-Score | 70-77 | ⚠️ Hybrid (Option D Szenario B) prüfen, ggf. Qwen 72B testen |
| Ø Quality-Score | < 70 | ❌ Batch-API + Caching (Option E) |
| Ø Speed | < 20 tok/s | ⚠️ Hybrid erwägen |

## Offene Fragen

- Läuft Stromportal weiterhin auf dem M1 Mini? (geht aus CLAUDE.md so hervor — confirmen)
- MacBook am Netz während Pilot-Phase? (Batterie sonst nach 4h leer, Akku-Stress bei Dauerbetrieb)
- Quality-Threshold von 75 → 70 senken akzeptabel? (RSE-227 / Frank-Entscheidung)
- Produktions-Hostname wenn MacBook mobil: Wie Pipeline erreichbar halten? Für Pilot egal, später evtl. Migration auf VPS mit GPU.

## Referenzen

- Pipeline Code: `scripts/entity_overhaul/`
- Admin Dashboard: `/app/entity-content`
- Linear: [RSE-227](https://linear.app/rseckler/issue/RSE-227)
- Original-Konzept: `scripts/entity_overhaul/` (kein gesondertes Doc)
