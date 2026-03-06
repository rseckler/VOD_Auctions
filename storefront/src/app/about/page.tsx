import type { Metadata } from "next"
import Link from "next/link"
import {
  Disc3,
  Music,
  Archive,
  Users,
  ExternalLink,
  Calendar,
  MapPin,
  Tag,
} from "lucide-react"

export const metadata: Metadata = {
  title: "About VOD Records",
  description:
    "Vinyl-On-Demand (VOD) Records — German label founded in 2003 by Frank Bull, specializing in reissues and archiving of avant-garde, industrial and experimental music from the cassette culture era.",
  openGraph: {
    title: "About VOD Records — VOD Auctions",
    description:
      "Vinyl-On-Demand (VOD) Records — German label preserving the cassette culture of the late 1970s and early 1980s.",
  },
}

const GENRES = [
  "Industrial",
  "Avantgarde",
  "Krautrock",
  "Punk / Wave",
  "Minimal Synth",
  "Dark Ambient",
  "Experimental",
  "Electroacoustic",
  "Tape / DIY",
  "Noise",
  "Post-Punk",
]

const NOTABLE_ARTISTS = [
  "Die Todliche Doris",
  "Hermann Kopp",
  "Mutter",
  "Zoviet France",
  "Throbbing Gristle",
  "Clock DVA",
  "Muslimgauze",
  "S.P.K.",
  "Current 93",
  "The Legendary Pink Dots",
  "Nurse with Wound",
  "Psychic TV",
  "Merzbow",
  "Conrad Schnitzler",
  "John Duncan",
  "Portion Control",
  "Sutcliffe Jugend",
  "Clair Obscur",
  "In the Nursery",
  "The Force Dimension",
]

const SUB_LABELS = [
  {
    name: "Pripuzzi Records",
    description: "Sub-label for special edition releases",
  },
  {
    name: "Vinyl Over Dose",
    description: "Extended and deluxe vinyl editions",
  },
  {
    name: "VOD Publishing",
    description: "Books, print publications and documentation",
  },
]

export default function AboutPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,165,74,0.08)_0%,transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl px-6 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.25)] text-primary text-sm font-medium mb-6">
            <Disc3 className="h-4 w-4" />
            Est. 2003
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-[1.1] mb-5">
            About{" "}
            <span className="text-primary">VOD Records</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Vinyl-On-Demand (VOD) Records is a German label dedicated to the
            reissue and preservation of avant-garde, industrial and experimental
            music — with a focus on the cassette culture of the late 1970s and
            early 1980s.
          </p>
          <p className="text-xl text-primary/80 font-serif italic mt-6">
            &ldquo;Feel the Excitement on Vinyl&rdquo;
          </p>
        </div>
      </section>

      {/* The Founder */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[#b8860b] flex items-center justify-center">
              <Users className="h-5 w-5 text-[#1c1915]" />
            </div>
            <h2 className="font-serif text-3xl">The Founder</h2>
          </div>

          <h3 className="text-xl font-medium text-foreground mb-4">
            Frank Bull{" "}
            <span className="text-muted-foreground font-normal text-base">
              (born Frank Maier)
            </span>
          </h3>

          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Frank Bull is a self-described <em>&ldquo;DIY Culture Archivist&rdquo;</em>{" "}
              from Friedrichshafen on Lake Constance, Germany. For over 20 years,
              he obsessively collected rare audio material from the underground
              cassette scene before founding Vinyl-On-Demand in 2003.
            </p>
            <p>
              His motivation was clear: the history of German tape culture was
              &ldquo;not properly written&rdquo;, and the rare cassettes of the
              70s and 80s had become nearly impossible to obtain. What began as
              reissuing limited cassettes on vinyl quickly evolved into elaborate
              deluxe box sets with unreleased bonus material.
            </p>
            <p>
              The first major VOD release in 2004 was a landmark six-LP box set
              of Die Todliche Doris. By 2018, the label had released nearly 1,000
              pieces of media over 14 years — each release crafted with
              meticulous attention to design, packaging and documentation.
            </p>
            <p>
              Bull&apos;s personal archive holds over 25,000 physical artifacts
              and approximately 20 terabytes of digitized audio from cassettes
              and reel-to-reel tapes. His philosophy follows Wagner&apos;s concept of{" "}
              <em>Gesamtkunstwerk</em> — every release is a total work of art
              combining music, design and documentation.
            </p>
            <p className="text-primary/80 italic">
              &ldquo;The key to all is passion, love and enthusiasm for music
              recorded between 76&ndash;86.&rdquo;
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.2)] text-primary">
              25,000+ Artifacts
            </span>
            <span className="px-3 py-1 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.2)] text-primary">
              20 TB Digitized Audio
            </span>
            <span className="px-3 py-1 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.2)] text-primary">
              ~1,000 Releases
            </span>
            <span className="px-3 py-1 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.2)] text-primary">
              Limited Editions: 300&ndash;666 Copies
            </span>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
            <Archive className="h-5 w-5 text-primary" />
          </div>
          <h2 className="font-serif text-3xl">Mission</h2>
        </div>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Many DIY musicians of the late 1970s and 1980s deliberately avoided
            major labels, preferring to control their own production and
            distribution. The result: extremely limited cassette editions that
            became inaccessible over time — often existing in runs of just 50 to
            200 copies.
          </p>
          <p>
            VOD Records exists to preserve this legacy. Each reissue is produced
            in limited editions of 300 to 666 copies, with professional designers
            assigned to individual artists. The label ensures that overlooked
            recordings receive the quality presentation they deserve — on vinyl,
            the format they were always meant for.
          </p>
        </div>
      </section>

      {/* Genres */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <h2 className="font-serif text-3xl">Genres</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {GENRES.map((genre) => (
            <span
              key={genre}
              className="px-4 py-2 rounded-lg border border-[rgba(232,224,212,0.1)] bg-[rgba(232,224,212,0.03)] text-foreground text-sm hover:border-primary/30 transition-colors"
            >
              {genre}
            </span>
          ))}
        </div>
      </section>

      {/* Notable Artists */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
            <Music className="h-5 w-5 text-primary" />
          </div>
          <h2 className="font-serif text-3xl">Notable Artists</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          A selection of artists whose work has been preserved and reissued
          through VOD Records:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {NOTABLE_ARTISTS.map((artist) => (
            <div
              key={artist}
              className="px-4 py-3 rounded-lg border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] text-sm text-foreground"
            >
              {artist}
            </div>
          ))}
        </div>
      </section>

      {/* Sub-Labels */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
            <Disc3 className="h-5 w-5 text-primary" />
          </div>
          <h2 className="font-serif text-3xl">Sub-Labels</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SUB_LABELS.map((label) => (
            <div
              key={label.name}
              className="rounded-xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-6"
            >
              <h3 className="font-medium text-foreground mb-2">{label.name}</h3>
              <p className="text-sm text-muted-foreground">
                {label.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* TAPE-MAG */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
              <Archive className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-serif text-3xl">TAPE-MAG</h2>
          </div>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              TAPE-MAG is the companion magazine and database dedicated to
              exploring 20th-century avant-garde and audio art. Developed over
              three years, it catalogs over 8,000 artists and serves as a
              comprehensive archive of the cassette culture movement.
            </p>
            <p>
              The database preserves the history of a music scene that operated
              largely outside the mainstream — documenting artists, labels,
              releases and the networks that connected them.
            </p>
          </div>
          <a
            href="https://www.tape-mag.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 text-primary hover:underline text-sm font-medium"
          >
            Visit tape-mag.com
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* VOD Fest */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-[rgba(212,165,74,0.06)] to-transparent p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[#b8860b] flex items-center justify-center">
              <Calendar className="h-5 w-5 text-[#1c1915]" />
            </div>
            <h2 className="font-serif text-3xl">VOD Fest</h2>
          </div>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              VOD Fest is the annual underground music festival organized by VOD
              Records — celebrating Industrial, Experimental, Post-Punk and
              Avant-Garde music with 21 bands across 2 stages.
            </p>
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-foreground">July 17&ndash;19, 2026</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-foreground">
                  Kulturhaus Caserne, Friedrichshafen
                </span>
              </div>
            </div>
            <p>
              The festival brings together groundbreaking artists from across
              the industrial and experimental spectrum — including ZOSKIA, THE
              ANTI GROUP, CRASH COURSE IN SCIENCE, DAS SYNTHETISCHE
              MISCHGEWEBE, CLAIR OBSCUR, CLUB MORAL, MARC HURTADO / LYDIA
              LUNCH, and JOACHIM IRMLER (FAUST), among others. Three days of
              performances running from 5 PM to midnight.
            </p>
          </div>
          <a
            href="https://vod-records.com/vod-fest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-[#b8860b] text-[#1c1915] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            VOD Fest 2026 — Tickets & Lineup
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Links */}
      <section className="mx-auto max-w-4xl px-6 py-16 pb-24">
        <h2 className="font-serif text-3xl mb-6">Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a
            href="https://www.vod-records.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-6 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-foreground">VOD Records</h3>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground">
              Official online shop — browse the complete catalog of vinyl
              reissues, box sets and limited editions.
            </p>
          </a>
          <a
            href="https://www.tape-mag.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-6 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-foreground">TAPE-MAG</h3>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground">
              Archive and database exploring 20th-century avant-garde — 8,000+
              artists cataloged.
            </p>
          </a>
          <a
            href="https://vod-records.com/vod-fest"
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-6 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-foreground">VOD Fest</h3>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground">
              Annual festival in Friedrichshafen — Industrial, Experimental,
              Post-Punk and Avant-Garde. Next: July 17&ndash;19, 2026.
            </p>
          </a>
        </div>
      </section>
    </main>
  )
}
