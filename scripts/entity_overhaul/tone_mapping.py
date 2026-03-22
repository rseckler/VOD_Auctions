"""
Genre -> Tone directive mapping.
Used by the Profiler Agent to classify entities and by the Writer Agent for style injection.
"""

TONE_MAP = {
    "dark_ambient": {
        "vocabulary": ["cavernous", "glacial", "subterranean", "ritual", "liminal", "bottomless", "tectonic"],
        "rhythm": "Long, flowing sentences. Slow build. Measured pauses.",
        "perspective": "Contemplative, reverent",
        "example_file": "dark_ambient.txt",
    },
    "power_electronics": {
        "vocabulary": ["confrontational", "abrasive", "cathartic", "visceral", "unrelenting", "hostile"],
        "rhythm": "Short, punchy. Staccato. Impact over elegance.",
        "perspective": "Direct, unflinching",
        "example_file": "power_electronics.txt",
    },
    "industrial": {
        "vocabulary": ["mechanical", "relentless", "dystopian", "percussive", "functional", "metronomic"],
        "rhythm": "Medium, rhythmic. Factory cadence. Repetitive structures.",
        "perspective": "Observational, clinical",
        "example_file": "industrial.txt",
    },
    "noise": {
        "vocabulary": ["obliterating", "saturated", "tectonic", "ecstatic", "total", "overwhelming"],
        "rhythm": "Run-on cascades OR one-word impacts.",
        "perspective": "Immersive, experiential",
        "example_file": "noise.txt",
    },
    "minimal_synth": {
        "vocabulary": ["austere", "spectral", "analog warmth", "nocturnal", "skeletal", "precise"],
        "rhythm": "Measured, precise. Cold elegance.",
        "perspective": "Detached, aesthetic",
        "example_file": "minimal_synth.txt",
    },
    "experimental": {
        "vocabulary": ["exploratory", "liminal", "process-driven", "sculptural", "fractal", "interdisciplinary"],
        "rhythm": "Variable, reflecting the work itself.",
        "perspective": "Analytical yet engaged",
        "example_file": "experimental.txt",
    },
    "neofolk": {
        "vocabulary": ["archaic", "pastoral", "ritualistic", "stark", "elemental", "invocational"],
        "rhythm": "Cadenced, almost literary.",
        "perspective": "Mythological, invocational",
        "example_file": "neofolk.txt",
    },
    "death_industrial": {
        "vocabulary": ["corroded", "suffocating", "terminal", "decayed", "hostile", "institutional"],
        "rhythm": "Heavy, compressed. Low oxygen.",
        "perspective": "Witness to collapse",
        "example_file": "death_industrial.txt",
    },
    "drone": {
        "vocabulary": ["infinite", "harmonic", "tectonic", "gravitational", "sustained", "resonant"],
        "rhythm": "One long sentence that never fully resolves.",
        "perspective": "Geological time",
        "example_file": "drone.txt",
    },
    "ebm": {
        "vocabulary": ["pulsing", "regimented", "synthetic", "club-ready", "angular", "propulsive"],
        "rhythm": "Metronomic. Beat-locked prose.",
        "perspective": "Functional, kinetic",
        "example_file": "ebm.txt",
    },
}

# Genre keyword -> tone mapping (for Profiler classification)
GENRE_KEYWORDS = {
    "dark_ambient": ["dark ambient", "ritual ambient", "isolationism", "ritual"],
    "power_electronics": ["power electronics", "pe", "harsh electronics"],
    "industrial": ["industrial", "post-industrial", "old school industrial", "martial industrial"],
    "noise": ["noise", "harsh noise", "japanoise", "noise wall", "hnw"],
    "minimal_synth": ["minimal synth", "coldwave", "cold wave", "minimal wave", "darkwave", "dark wave", "synth-pop", "synthpop"],
    "experimental": ["experimental", "avant-garde", "musique concrete", "concrete", "electroacoustic", "sound art", "free improvisation"],
    "neofolk": ["neofolk", "neo-folk", "apocalyptic folk", "martial folk", "dark folk"],
    "death_industrial": ["death industrial", "death ambient"],
    "drone": ["drone", "drone metal", "drone ambient", "minimalism", "minimal music"],
    "ebm": ["ebm", "electronic body music", "electro-industrial", "aggrotech", "futurepop"],
}

def classify_tone(genres: list[str]) -> str:
    """
    Classify a list of genre tags into the best-matching tone directive.
    Returns the tone key (e.g., 'dark_ambient', 'noise').
    Falls back to 'experimental' if no match.
    """
    if not genres:
        return "experimental"

    genre_lower = [g.lower().strip() for g in genres]
    scores: dict[str, int] = {}

    for tone_key, keywords in GENRE_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            for genre in genre_lower:
                if keyword in genre:
                    score += 2  # Direct match
                elif any(word in genre for word in keyword.split()):
                    score += 1  # Partial match
        if score > 0:
            scores[tone_key] = score

    if not scores:
        return "experimental"

    return max(scores, key=scores.get)
