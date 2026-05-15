/* global window */
// Sample data for the VOD Community prototype.
// All content drawn from the brief — no Lorem.

window.CMData = {
  members: {
    frank: { name: "Frank Maier", handle: "FrankMaier", tier: "curator", location: "Pratteln", since: 2003 },
    zko: { name: "DiscoveredZkoIn1989", handle: "DiscoveredZkoIn1989", tier: "gold", location: "Berlin", since: 2009 },
    tape: { name: "TapeUndergroundDe", handle: "TapeUndergroundDe", tier: "silver", location: "Köln", since: 2014 },
    noise: { name: "NoiseAndArchive", handle: "NoiseAndArchive", tier: "silver", location: "Wien", since: 2011 },
    prague: { name: "IndustrialPragueOG", handle: "IndustrialPragueOG", tier: "bronze", location: "Prag", since: 2018 },
    mb: { name: "MaurizioForever", handle: "MaurizioForever", tier: "platinum", location: "Milano", since: 2005 },
  },

  trendingTags: [
    { name: "power-electronics", count: 23 },
    { name: "tape-culture", count: 18 },
    { name: "zko", count: 12 },
    { name: "vinyl-on-demand", count: 9 },
    { name: "archive-find", count: 7 },
    { name: "noise", count: 6 },
    { name: "first-pressing", count: 4 },
  ],

  blocks: [
    { id: 1, title: "Block #41 — Industrial Tapes 1984–1989", ends: "in 2 days", lots: 47, from: 80 },
    { id: 2, title: "ZKO Re-Issues — Curator Selection", ends: "in 6 hours", lots: 18, from: 45 },
  ],

  catalogItems: [
    { format: "vinyl", artist: "Z'EV", title: "Elemental Music", year: 1985, label: "ZKO 005", ownership: 23 },
    { format: "tape", artist: "Vortex Campaign", title: "Aufstand der Praxis", year: 1985, label: "ZKO 012", ownership: 8 },
  ],

  // Posts in the Hub feed
  feedPosts: [
    {
      id: "p1",
      kind: "member",
      author: { name: "DiscoveredZkoIn1989", handle: "DiscoveredZkoIn1989", tier: "gold", location: "Berlin" },
      time: "vor 4 Stunden",
      body: 'Endlich nach 12 Jahren Suche: meine erste Kopie von <strong>Vortex Campaign — Aufstand der Praxis</strong> (Tape, 1985). Habe ich heute aus Block #41 gewonnen. Der Sound ist roher als ich dachte — die Tape-Saturation auf Side B ist unverkennbar Bianchi-Schule, Berlin 1985.',
      release: { format: "tape", artist: "Vortex Campaign", title: "Aufstand der Praxis", year: 1985, label: "ZKO 012", ownership: 8 },
      tags: ["tape-culture", "zko", "archive-find"],
      reactions: { fire: 14, horns: 3 },
      activeReaction: "fire",
      comments: 3,
    },
    {
      id: "p2",
      kind: "member",
      author: { name: "TapeUndergroundDe", handle: "TapeUndergroundDe", tier: "silver", location: "Köln" },
      time: "vor 1 Tag",
      body: "Hat jemand das letzte ZKO-Re-Issue von 2024 noch im Sleeve? Ich vergleiche grade Pressungen — speziell die A-Side-Matrix. Wer hat noch ein originales Inner-Sleeve, das nicht durch Schweiß und Zeit gelitten hat? DM bitte.",
      tags: ["zko", "first-pressing", "re-issue"],
      reactions: {},
      comments: 7,
    },
    {
      id: "p3",
      kind: "member",
      author: { name: "NoiseAndArchive", handle: "NoiseAndArchive", tier: "silver", location: "Wien" },
      time: "vor 2 Tagen",
      body: "Maurizio Bianchi — Symphony for a Genocide. Re-Issue 2022 vs Original 1981. Ich habe heute beide nebeneinander auf dem Garrard 401 laufen lassen. Vorläufiges Urteil: die 2022er klingt wärmer im Bass, dafür hat die 81er diesen tape-hiss-glow, den man nicht mastern kann. Beides sammelnswert.",
      release: { format: "vinyl", artist: "Maurizio Bianchi", title: "Symphony for a Genocide", year: 1981, label: "Re-Issue 2022", ownership: 14 },
      tags: ["industrial", "re-issue", "first-pressing"],
      reactions: { fire: 22, eyes: 4, horns: 2 },
      comments: 12,
    },
    {
      id: "p4",
      kind: "member",
      author: { name: "IndustrialPragueOG", handle: "IndustrialPragueOG", tier: "bronze", location: "Prag" },
      time: "vor 3 Tagen",
      body: "Erste Frage in dieser Community — sorry falls schon hundertmal gestellt: was ist der konsensfähige Einstieg in NON / Boyd Rice? Pagan Muzak (1978) oder lieber Easy Listening for Iron Youth? Habe Zugriff auf beide, aber nur Budget für eine.",
      tags: ["noise", "industrial"],
      reactions: { eyes: 5, thanks: 2 },
      comments: 9,
    },
  ],

  // Frank's hero editorial
  editorial: {
    id: "ed43",
    issue: 43,
    title: "Die ZKO-Tape-Ära 1984–1986: Was uns die zweite Kassette über Frank Tovey verriet",
    lede:
      "Aus dem Archiv kommt ein zweiteiliger Bericht über Z'EV's Begegnungen mit Frank Tovey in West-Berlin, 1984. Inklusive zwei Aufnahmen, die nie offiziell veröffentlicht wurden — und einer Provenienz-Geschichte, die ich erst diesen Februar mit Cosey abgleichen konnte.",
    time: "vor 2 Tagen",
    dateLabel: "Donnerstag, 5. Mai 2026",
    reactions: { fire: 87 },
    comments: 24,
    readingTime: "7 min Lesezeit",
  },

  // Single Post — comments
  comments: [
    {
      id: "c1",
      author: { name: "DiscoveredZkoIn1989", handle: "DiscoveredZkoIn1989", tier: "gold" },
      time: "vor 1 Tag",
      text: "Frank, die zweite Aufnahme — ist das die mit dem Walther-Mikrofon, die Z'EV mal im Interview erwähnt hat? Falls ja: das ist eine kleine Sensation. Wir reden hier seit Jahren über das Tape und niemand hatte je Belegmaterial.",
      reactions: { fire: 4 },
    },
    {
      id: "c2",
      author: { name: "Frank Maier", handle: "FrankMaier", tier: "curator" },
      time: "vor 23 Stunden",
      text: '<span class="cm-comment-mention">@DiscoveredZkoIn1989</span> — exakt das. Ich hab die Provenienz mit Cosey im Februar abgeglichen. Mehr dazu in Teil 2 nächste Woche.',
      reactions: { fire: 12, thanks: 3 },
      isReply: true,
    },
    {
      id: "c3",
      author: { name: "MaurizioForever", handle: "MaurizioForever", tier: "platinum" },
      time: "vor 19 Stunden",
      text: "Wenn die zweite Aufnahme tatsächlich das Walther-Mic-Tape ist, ist das das wichtigste Provenienz-Find der ZKO-Forschung in den letzten zehn Jahren. Punkt. Frank, danke für die Recherche-Tiefe — das ist der Grund warum man hier ist und nicht auf Discogs.",
      reactions: { fire: 18, hundred: 6, horns: 2 },
    },
    {
      id: "c4",
      author: { name: "TapeUndergroundDe", handle: "TapeUndergroundDe", tier: "silver" },
      time: "vor 14 Stunden",
      text: "Eine Frage zur Datierung: in deinem Text steht „spätestens November 1984“. Hast du dafür eine konkrete Quelle (Korrespondenz, Studio-Sheet)? Ich habe für meine eigene Z'EV-Bibliographie nur einen Brief an Genesis P. mit Datum „Herbst 1984“ — wäre dankbar wenn ich das schärfen könnte.",
      reactions: { eyes: 3 },
    },
    {
      id: "c5",
      author: { name: "NoiseAndArchive", handle: "NoiseAndArchive", tier: "silver" },
      time: "vor 8 Stunden",
      text: "Habe deine Empfehlung gestern Abend mit dem ZKO-Re-Issue verglichen. Du hast Recht über das Master — die Cosey-Variante atmet tatsächlich anders.",
      reactions: { fire: 7 },
    },
  ],
};
