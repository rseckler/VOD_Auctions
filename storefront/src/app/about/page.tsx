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
import { medusaFetch } from "@/lib/api"

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

// ─── Defaults (used when CMS has no content) ────────────────────────────────

const DEFAULT_HERO = {
  title: "About VOD Records",
  motto: "Feel the Excitement on Vinyl",
  description:
    "Vinyl-On-Demand (VOD) Records is a German label dedicated to the reissue and preservation of avant-garde, industrial and experimental music — with a focus on the cassette culture of the late 1970s and early 1980s.",
}

const DEFAULT_FOUNDER = {
  name: "Frank Bull",
  subtitle: "(born Frank Maier)",
  body: `<p>Frank Bull is a self-described <em>&ldquo;DIY Culture Archivist&rdquo;</em> from Friedrichshafen on Lake Constance, Germany. For over 20 years, he obsessively collected rare audio material from the underground cassette scene before founding Vinyl-On-Demand in 2003.</p>
<p>His motivation was clear: the history of German tape culture was &ldquo;not properly written&rdquo;, and the rare cassettes of the 70s and 80s had become nearly impossible to obtain. What began as reissuing limited cassettes on vinyl quickly evolved into elaborate deluxe box sets with unreleased bonus material.</p>
<p>The first major VOD release in 2004 was a landmark six-LP box set of Die Todliche Doris. By 2018, the label had released nearly 1,000 pieces of media over 14 years — each release crafted with meticulous attention to design, packaging and documentation.</p>
<p>Bull&apos;s personal archive holds over 25,000 physical artifacts and approximately 20 terabytes of digitized audio from cassettes and reel-to-reel tapes. His philosophy follows Wagner&apos;s concept of <em>Gesamtkunstwerk</em> — every release is a total work of art combining music, design and documentation.</p>`,
  quote:
    "The key to all is passion, love and enthusiasm for music recorded between 76–86.",
  badges: [
    "25,000+ Artifacts",
    "20 TB Digitized Audio",
    "~1,000 Releases",
    "Limited Editions: 300–666 Copies",
  ],
}

const DEFAULT_MISSION = {
  body: `<p>Many DIY musicians of the late 1970s and 1980s deliberately avoided major labels, preferring to control their own production and distribution. The result: extremely limited cassette editions that became inaccessible over time — often existing in runs of just 50 to 200 copies.</p>
<p>VOD Records exists to preserve this legacy. Each reissue is produced in limited editions of 300 to 666 copies, with professional designers assigned to individual artists. The label ensures that overlooked recordings receive the quality presentation they deserve — on vinyl, the format they were always meant for.</p>`,
}

const DEFAULT_GENRES = [
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

const DEFAULT_ARTISTS = {
  description:
    "A selection of artists whose work has been preserved and reissued through VOD Records:",
  items: [
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
  ],
}

const DEFAULT_SUBLABELS = [
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

const DEFAULT_TAPEMAG = {
  body: `<p>TAPE-MAG is the companion magazine and database dedicated to exploring 20th-century avant-garde and audio art. Developed over three years, it catalogs over 8,000 artists and serves as a comprehensive archive of the cassette culture movement.</p>
<p>The database preserves the history of a music scene that operated largely outside the mainstream — documenting artists, labels, releases and the networks that connected them.</p>`,
  link: "https://www.tape-mag.com",
}

const DEFAULT_VODFEST = {
  body: `<p>VOD Fest is the annual underground music festival organized by VOD Records — celebrating Industrial, Experimental, Post-Punk and Avant-Garde music with 21 bands across 2 stages.</p>
<p>The festival brings together groundbreaking artists from across the industrial and experimental spectrum — including ZOSKIA, THE ANTI GROUP, CRASH COURSE IN SCIENCE, DAS SYNTHETISCHE MISCHGEWEBE, CLAIR OBSCUR, CLUB MORAL, MARC HURTADO / LYDIA LUNCH, and JOACHIM IRMLER (FAUST), among others. Three days of performances running from 5 PM to midnight.</p>`,
  date: "July 17–19, 2026",
  location: "Kulturhaus Caserne, Friedrichshafen",
  ticket_link: "https://vod-records.com/vod-fest",
}

const DEFAULT_LINKS = [
  {
    title: "VOD Records",
    url: "https://www.vod-records.com",
    description:
      "Official online shop — browse the complete catalog of vinyl reissues, box sets and limited editions.",
  },
  {
    title: "TAPE-MAG",
    url: "https://www.tape-mag.com",
    description:
      "Archive and database exploring 20th-century avant-garde — 8,000+ artists cataloged.",
  },
  {
    title: "VOD Fest",
    url: "https://vod-records.com/vod-fest",
    description:
      "Annual festival in Friedrichshafen — Industrial, Experimental, Post-Punk and Avant-Garde. Next: July 17–19, 2026.",
  },
]

// ─── Data Fetching ───────────────────────────────────────────────────────────

type CmsContent = Record<string, Record<string, unknown>>

async function getAboutContent(): Promise<CmsContent> {
  const data = await medusaFetch<{ sections: CmsContent }>(
    "/store/content?page=about",
    { revalidate: 120 }
  )
  return data?.sections || {}
}

// Helper to safely get a string from CMS or default
function str(
  cms: Record<string, unknown> | undefined,
  key: string,
  fallback: string
): string {
  if (!cms || cms[key] === undefined || cms[key] === "") return fallback
  return String(cms[key])
}

function arr(
  cms: Record<string, unknown> | undefined,
  key: string,
  fallback: string[]
): string[] {
  if (!cms || !Array.isArray(cms[key]) || (cms[key] as string[]).length === 0)
    return fallback
  return cms[key] as string[]
}

function objArr(
  cms: Record<string, unknown> | undefined,
  key: string,
  fallback: Record<string, string>[]
): Record<string, string>[] {
  if (!cms || !Array.isArray(cms[key]) || (cms[key] as Record<string, string>[]).length === 0)
    return fallback
  return cms[key] as Record<string, string>[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default async function AboutPage() {
  const cms = await getAboutContent()

  const hero = cms.hero as Record<string, unknown> | undefined
  const founder = cms.founder as Record<string, unknown> | undefined
  const mission = cms.mission as Record<string, unknown> | undefined
  const genres = cms.genres as Record<string, unknown> | undefined
  const artists = cms.artists as Record<string, unknown> | undefined
  const sublabels = cms.sublabels as Record<string, unknown> | undefined
  const tapemag = cms.tapemag as Record<string, unknown> | undefined
  const vodfest = cms.vodfest as Record<string, unknown> | undefined
  const links = cms.links as Record<string, unknown> | undefined

  const heroTitle = str(hero, "title", DEFAULT_HERO.title)
  const heroMotto = str(hero, "motto", DEFAULT_HERO.motto)
  const heroDesc = str(hero, "description", DEFAULT_HERO.description)

  const founderName = str(founder, "name", DEFAULT_FOUNDER.name)
  const founderSubtitle = str(founder, "subtitle", DEFAULT_FOUNDER.subtitle)
  const founderBody = str(founder, "body", DEFAULT_FOUNDER.body)
  const founderQuote = str(founder, "quote", DEFAULT_FOUNDER.quote)
  const founderBadges = arr(founder, "badges", DEFAULT_FOUNDER.badges)

  const missionBody = str(mission, "body", DEFAULT_MISSION.body)

  const genreItems = arr(genres, "items", DEFAULT_GENRES)

  const artistDesc = str(artists, "description", DEFAULT_ARTISTS.description)
  const artistItems = arr(artists, "items", DEFAULT_ARTISTS.items)

  const sublabelItems = objArr(sublabels, "items", DEFAULT_SUBLABELS)

  const tapemagBody = str(tapemag, "body", DEFAULT_TAPEMAG.body)
  const tapemagLink = str(tapemag, "link", DEFAULT_TAPEMAG.link)

  const vodfestBody = str(vodfest, "body", DEFAULT_VODFEST.body)
  const vodfestDate = str(vodfest, "date", DEFAULT_VODFEST.date)
  const vodfestLocation = str(vodfest, "location", DEFAULT_VODFEST.location)
  const vodfestTicketLink = str(
    vodfest,
    "ticket_link",
    DEFAULT_VODFEST.ticket_link
  )

  const linkItems = objArr(links, "items", DEFAULT_LINKS)

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
          <h1 className="heading-hero mb-5">
            {heroTitle.includes("VOD") ? (
              <>
                {heroTitle.split("VOD")[0]}
                <span className="text-primary">VOD{heroTitle.split("VOD")[1]}</span>
              </>
            ) : (
              heroTitle
            )}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {heroDesc}
          </p>
          {heroMotto && (
            <p className="text-xl text-primary/80 font-serif italic mt-6">
              &ldquo;{heroMotto}&rdquo;
            </p>
          )}
        </div>
      </section>

      {/* The Founder */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <h2 className="heading-2 font-serif">The Founder</h2>
          </div>

          <h3 className="text-xl font-medium text-foreground mb-4">
            {founderName}{" "}
            {founderSubtitle && (
              <span className="text-muted-foreground font-normal text-base">
                {founderSubtitle}
              </span>
            )}
          </h3>

          <div
            className="space-y-4 text-muted-foreground leading-relaxed prose-about"
            dangerouslySetInnerHTML={{ __html: founderBody }}
          />

          {founderQuote && (
            <p className="text-primary/80 italic mt-6">
              &ldquo;{founderQuote}&rdquo;
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {founderBadges.map((badge) => (
              <span
                key={badge}
                className="px-3 py-1 rounded-full bg-[rgba(212,165,74,0.1)] border border-[rgba(212,165,74,0.2)] text-primary"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
            <Archive className="h-5 w-5 text-primary" />
          </div>
          <h2 className="heading-2 font-serif">Mission</h2>
        </div>
        <div
          className="space-y-4 text-muted-foreground leading-relaxed prose-about"
          dangerouslySetInnerHTML={{ __html: missionBody }}
        />
      </section>

      {/* Genres */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/60 to-primary/20 flex items-center justify-center">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <h2 className="heading-2 font-serif">Genres</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {genreItems.map((genre) => (
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
          <h2 className="heading-2 font-serif">Notable Artists</h2>
        </div>
        <p className="text-muted-foreground mb-6">{artistDesc}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {artistItems.map((artist) => (
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
          <h2 className="heading-2 font-serif">Sub-Labels</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {sublabelItems.map((label) => (
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
            <h2 className="heading-2 font-serif">TAPE-MAG</h2>
          </div>
          <div
            className="space-y-4 text-muted-foreground leading-relaxed prose-about"
            dangerouslySetInnerHTML={{ __html: tapemagBody }}
          />
          {tapemagLink && (
            <a
              href={tapemagLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 text-primary hover:underline text-sm font-medium"
            >
              Visit tape-mag.com
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </section>

      {/* VOD Fest */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-[rgba(212,165,74,0.06)] to-transparent p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary-foreground" />
            </div>
            <h2 className="heading-2 font-serif">VOD Fest</h2>
          </div>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <div
              className="prose-about"
              dangerouslySetInnerHTML={{ __html: vodfestBody.split("</p>")[0] + "</p>" }}
            />
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-foreground">{vodfestDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-foreground">{vodfestLocation}</span>
              </div>
            </div>
            {vodfestBody.split("</p>").length > 2 && (
              <div
                className="prose-about"
                dangerouslySetInnerHTML={{
                  __html: vodfestBody
                    .split("</p>")
                    .slice(1)
                    .filter((s) => s.trim())
                    .map((s) => s + "</p>")
                    .join(""),
                }}
              />
            )}
          </div>
          {vodfestTicketLink && (
            <a
              href={vodfestTicketLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary/70 text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              VOD Fest 2026 — Tickets & Lineup
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </section>

      {/* Links */}
      <section className="mx-auto max-w-4xl px-6 py-16 pb-24">
        <h2 className="heading-2 font-serif mb-6">Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {linkItems.map((link) => (
            <a
              key={link.title}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-[rgba(232,224,212,0.08)] bg-[rgba(232,224,212,0.02)] p-6 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-foreground">{link.title}</h3>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm text-muted-foreground">
                {link.description}
              </p>
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
