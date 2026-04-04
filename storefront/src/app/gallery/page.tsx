import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"
import {
  Headphones,
  Archive,
  Coffee,
  MessageCircle,
  Package,
  Clock,
  MapPin,
  Phone,
  Mail,
  ChevronRight,
} from "lucide-react"
import { medusaFetch } from "@/lib/api"
import { GalleryTracker } from "./GalleryTracker"

export const metadata: Metadata = {
  title: "VOD Gallery — Friedrichshafen",
  description:
    "One of Europe's most comprehensive collections of industrial, experimental and underground music. Archive, listening room and meeting point in Friedrichshafen, Germany.",
  keywords: [
    "VOD Gallery",
    "industrial music",
    "experimental music",
    "record collection",
    "vinyl gallery",
    "Friedrichshafen",
    "rare records",
    "music archive",
    "listening room",
    "VOD Records",
    "cassette culture",
    "noise music",
    "Bodensee",
    "Lake Constance",
  ],
  alternates: {
    canonical: "https://vod-auctions.com/gallery",
  },
  openGraph: {
    title: "VOD Gallery — Friedrichshafen",
    description:
      "41,500+ records, artefacts and rare collectibles. A collection you can walk into.",
    url: "https://vod-auctions.com/gallery",
    type: "website",
    images: [
      {
        url: "/gallery/gallery-04.jpg",
        width: 1200,
        height: 630,
        alt: "VOD Gallery interior — industrial music archive and listening room in Friedrichshafen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VOD Gallery — Friedrichshafen",
    description:
      "41,500+ records, artefacts and rare collectibles. Archive, listening room and meeting point.",
    images: ["/gallery/gallery-04.jpg"],
  },
}

// ── Types ──

interface GalleryMedia {
  id: string
  url: string
  alt_text: string
  section: string
  position: number
  title: string | null
  subtitle: string | null
  description: string | null
  link_url: string | null
  link_label: string | null
}

interface GalleryContent {
  title?: string
  subtitle?: string
  body?: string
  quote?: string
  cta_text?: string
  cta_link?: string
  hours?: string
  phone?: string
  email?: string
  address?: string
  region?: string
}

interface GalleryData {
  media: Record<string, GalleryMedia[]>
  content: Record<string, GalleryContent>
}

// ── Defaults (fallback when API unavailable) ──

const DEFAULT_HERO = {
  title: "A Collection You Can Walk Into",
  subtitle: "41,500+ records, artefacts and rare collectibles. Friedrichshafen, Germany.",
  cta_text: "Plan Your Visit",
  cta_link: "#visit",
}

const DEFAULT_INTRO = {
  body: "The VOD Gallery in Friedrichshafen houses one of Europe's most comprehensive collections of industrial, experimental and underground music. More than a store, it is an archive, a listening room and a meeting point — a place where five decades of sound culture become visible, audible and accessible. Visitors are welcome to browse, listen, discover and acquire pieces that exist nowhere else.",
}

const DEFAULT_LISTENING = {
  title: "The Listening Room",
  body: "A dedicated space within the gallery, equipped with a high-fidelity sound system and a curated programme of recordings drawn from the VOD archive. No requests. No playlists. The selection is made by Frank Bull — five decades of listening, distilled into one room.\n\nDrop in during opening hours and listen. No appointment necessary. Coffee is included.",
}

const DEFAULT_COFFEE = {
  quote: "Every visit to the VOD Gallery begins with coffee — or ends with one. Our professional espresso machine produces the kind of coffee that makes you want to stay a little longer, look a little closer, listen a little deeper. No hurry. The records aren't going anywhere.",
}

const DEFAULT_VISIT = {
  hours: "Wednesday – Friday  14:00 – 19:00\nSaturday  11:00 – 17:00\n\nOr by appointment.",
  phone: "+49 7541 34412",
  email: "frank@vinyl-on-demand.com",
  address: "VOD Gallery\nEugenstrasse 57/2\n88045 Friedrichshafen\nGermany",
  region: "Lake Constance / Bodensee region",
}

const DEFAULT_CLOSING = {
  quote: "Some collections are catalogued. This one is lived.",
}

const DEFAULT_GALLERY_IMAGES: GalleryMedia[] = [
  { id: "1", url: "/gallery/gallery-01.jpg", alt_text: "VOD Gallery panoramic view", section: "visual_gallery", position: 0, title: null, subtitle: null, description: null, link_url: null, link_label: null },
  { id: "2", url: "/gallery/gallery-12.jpg", alt_text: "Wall of framed concert posters", section: "visual_gallery", position: 1, title: null, subtitle: null, description: null, link_url: null, link_label: null },
  { id: "3", url: "/gallery/gallery-06.jpg", alt_text: "Throbbing Gristle Roland case", section: "visual_gallery", position: 2, title: null, subtitle: null, description: null, link_url: null, link_label: null },
  { id: "4", url: "/gallery/gallery-11.jpg", alt_text: "Vinyl records and cassette wall", section: "visual_gallery", position: 3, title: null, subtitle: null, description: null, link_url: null, link_label: null },
  { id: "5", url: "/gallery/gallery-09.jpg", alt_text: "Flowmotion zines in vitrine", section: "visual_gallery", position: 4, title: null, subtitle: null, description: null, link_url: null, link_label: null },
  { id: "6", url: "/gallery/gallery-14.jpg", alt_text: "Gallery interior", section: "visual_gallery", position: 5, title: null, subtitle: null, description: null, link_url: null, link_label: null },
]

const DEFAULT_COLLECTION: GalleryMedia[] = [
  { id: "c1", url: "/gallery/gallery-11.jpg", alt_text: "Sound Carriers", section: "collection_sound_carriers", position: 0, title: "Sound Carriers", subtitle: null, description: "Vinyl, cassettes, CDs, reels — from first pressings to rare test presses", link_url: null, link_label: null },
  { id: "c2", url: "/gallery/gallery-08.jpg", alt_text: "Printed Matter", section: "collection_printed_matter", position: 0, title: "Printed Matter", subtitle: null, description: "Zines, books, magazines, liner notes — the written word of underground culture", link_url: null, link_label: null },
  { id: "c3", url: "/gallery/gallery-12.jpg", alt_text: "Artwork & Posters", section: "collection_artwork", position: 0, title: "Artwork & Posters", subtitle: null, description: "Original artwork, prints, photography — the visual language of industrial music", link_url: null, link_label: null },
  { id: "c4", url: "/gallery/gallery-09.jpg", alt_text: "Documents & Ephemera", section: "collection_documents", position: 0, title: "Documents & Ephemera", subtitle: null, description: "Flyers, correspondence, setlists — the paper trail of a movement", link_url: null, link_label: null },
  { id: "c5", url: "/gallery/gallery-06.jpg", alt_text: "Rare Collectibles", section: "collection_rare", position: 0, title: "Rare Collectibles", subtitle: null, description: "One-of-a-kind items, artist proofs, hand-numbered editions, prototype releases", link_url: null, link_label: null },
]

const DEFAULT_FEATURED: GalleryMedia[] = [
  { id: "f1", url: "/gallery/gallery-06.jpg", alt_text: "TG Roland case", section: "featured", position: 0, title: "Throbbing Gristle — Roland Synthesizer Case", subtitle: "Rare Artefact", description: 'Original flight case marked "T.G. London", used to transport equipment during the Industrial Records era. Surrounded by original photographs and press documentation from the period.', link_url: null, link_label: null },
  { id: "f2", url: "/gallery/gallery-05.jpg", alt_text: "SPK poster and tapes", section: "featured", position: 1, title: "SPK — Original Concert Poster & Tape Archive", subtitle: "Exhibition Piece", description: "Framed original poster alongside a comprehensive collection of SPK cassette releases, zines and related ephemera from the early 1980s Australian industrial scene.", link_url: null, link_label: null },
  { id: "f3", url: "/gallery/gallery-12.jpg", alt_text: "Concert posters wall", section: "featured", position: 2, title: "Original Concert Posters — Laibach, Coil & More", subtitle: "Gallery Wall", description: "A curated wall of framed original concert and event posters spanning four decades of industrial and experimental music — Cop Shoot Cop, The World of Skin, Laibach, Neurosis.", link_url: null, link_label: null },
  { id: "f4", url: "/gallery/gallery-09.jpg", alt_text: "Flowmotion zines", section: "featured", position: 3, title: "Flowmotion — Complete Zine Archive", subtitle: "Printed Matter", description: "The full run of Flowmotion magazine, one of the essential publications of the European industrial and experimental music scene, displayed alongside related cassette releases.", link_url: null, link_label: null },
]

const DEFAULT_HERO_IMAGE: GalleryMedia = {
  id: "h1", url: "/gallery/gallery-04.jpg", alt_text: "VOD Gallery interior", section: "hero", position: 0, title: null, subtitle: null, description: null, link_url: null, link_label: null,
}

const DEFAULT_LISTENING_IMAGE: GalleryMedia = {
  id: "l1", url: "/gallery/gallery-13.jpg", alt_text: "Browsing cassettes at VOD Gallery", section: "listening_room", position: 0, title: null, subtitle: null, description: null, link_url: null, link_label: null,
}

const EXPERIENCE_MODULES = [
  { icon: Headphones, title: "Listen", description: "Immerse yourself in curated selections on our high-fidelity sound system" },
  { icon: Archive, title: "Discover", description: "Browse 41,500+ records, artefacts and rare collectibles spanning five decades" },
  { icon: Coffee, title: "Linger", description: "Take your time over expertly prepared espresso from our professional machine" },
  { icon: MessageCircle, title: "Connect", description: "Meet Frank Bull and fellow collectors — conversation is part of the experience" },
  { icon: Package, title: "Acquire", description: "Find pieces available nowhere else — from rare first pressings to unique artefacts" },
]

// ── Data Fetching ──

async function getGalleryData(): Promise<GalleryData | null> {
  return medusaFetch<GalleryData>("/store/gallery", { revalidate: 120 })
}

// ── Page ──

export default async function GalleryPage() {
  const data = await getGalleryData()

  const media = data?.media || {}
  const content = data?.content || {}

  // Resolve content with fallbacks
  const hero = { ...DEFAULT_HERO, ...(content.hero || {}) }
  const intro = { ...DEFAULT_INTRO, ...(content.introduction || {}) }
  const listening = { ...DEFAULT_LISTENING, ...(content.listening_room || {}) }
  const coffee = { ...DEFAULT_COFFEE, ...(content.coffee || {}) }
  const visit = { ...DEFAULT_VISIT, ...(content.visit || {}) }
  const closing = { ...DEFAULT_CLOSING, ...(content.closing || {}) }

  // Resolve media with fallbacks
  const heroImage = media.hero?.[0] || DEFAULT_HERO_IMAGE
  const galleryImages = media.visual_gallery?.length ? media.visual_gallery.slice(0, 6) : DEFAULT_GALLERY_IMAGES
  const collectionItems = [
    media.collection_sound_carriers?.[0],
    media.collection_printed_matter?.[0],
    media.collection_artwork?.[0],
    media.collection_documents?.[0],
    media.collection_rare?.[0],
  ].filter(Boolean).length === 5
    ? [
        media.collection_sound_carriers![0],
        media.collection_printed_matter![0],
        media.collection_artwork![0],
        media.collection_documents![0],
        media.collection_rare![0],
      ]
    : DEFAULT_COLLECTION
  const featuredItems = media.featured?.length ? media.featured : DEFAULT_FEATURED
  const listeningImage = media.listening_room?.[0] || DEFAULT_LISTENING_IMAGE

  // Schema.org JSON-LD (LocalBusiness + Museum hybrid)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "Museum", "Store"],
    name: "VOD Gallery",
    description: intro.body,
    url: "https://vod-auctions.com/gallery",
    image: "https://vod-auctions.com/gallery/gallery-04.jpg",
    telephone: visit.phone,
    email: visit.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Eugenstrasse 57/2",
      addressLocality: "Friedrichshafen",
      postalCode: "88045",
      addressCountry: "DE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 47.6567,
      longitude: 9.4782,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Wednesday", "Thursday", "Friday"],
        opens: "14:00",
        closes: "19:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Saturday",
        opens: "11:00",
        closes: "17:00",
      },
    ],
    sameAs: [
      "https://vod-auctions.com",
      "https://www.discogs.com/seller/VODRecords",
    ],
    parentOrganization: {
      "@type": "Organization",
      name: "VOD Records",
      url: "https://vod-records.com",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "VOD Gallery Collection",
      itemListElement: [
        { "@type": "OfferCatalog", name: "Sound Carriers" },
        { "@type": "OfferCatalog", name: "Printed Matter" },
        { "@type": "OfferCatalog", name: "Artwork & Posters" },
        { "@type": "OfferCatalog", name: "Documents & Ephemera" },
        { "@type": "OfferCatalog", name: "Rare Collectibles" },
      ],
    },
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Listening Room", value: true },
      { "@type": "LocationFeatureSpecification", name: "Espresso Bar", value: true },
      { "@type": "LocationFeatureSpecification", name: "Private Appointments", value: true },
    ],
  }

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <GalleryTracker />

      {/* ── Section 1: Hero ── */}
      <section className="relative h-[85vh] min-h-[500px] flex items-end">
        <Image
          src={heroImage.url}
          alt={heroImage.alt_text}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1c1915] via-[#1c1915]/40 to-transparent" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-16 md:pb-24 w-full">
          <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl text-foreground leading-[1.05] mb-4">
            {hero.title?.includes("Walk Into") ? (
              <>
                A Collection You Can{" "}
                <span className="text-primary">Walk Into</span>
              </>
            ) : (
              <span>{hero.title}</span>
            )}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-8">
            {hero.subtitle}
          </p>
          <Link
            href={hero.cta_link || "#visit"}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
          >
            {hero.cta_text}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Section 2: Introduction ── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            {intro.body}
          </p>
        </div>
      </section>

      {/* ── Section 3: Visual Gallery ── */}
      <section className="pb-20 md:pb-28">
        <div className="mx-auto max-w-6xl px-6">
          {/* Hero image — full width */}
          {galleryImages[0] && (
            <div className="relative overflow-hidden rounded-lg group aspect-[16/9] mb-3 md:mb-4">
              <Image
                src={galleryImages[0].url}
                alt={galleryImages[0].alt_text}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                sizes="100vw"
              />
            </div>
          )}
          {/* Remaining 5 tiles — uniform 3-column grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {galleryImages.slice(1).map((img) => (
              <div
                key={img.id}
                className="relative overflow-hidden rounded-lg group aspect-[4/3]"
              >
                <Image
                  src={img.url}
                  alt={img.alt_text}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 768px) 50vw, (max-width: 1400px) 33vw, 480px"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: The Collection ── */}
      <section className="py-20 md:py-28 border-t border-[rgba(232,224,212,0.08)]">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-4">
            The Collection
          </h2>
          <p className="text-muted-foreground mb-12 max-w-2xl">
            Five categories spanning the full material culture of industrial and
            experimental music — from sound carriers to one-of-a-kind artefacts.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {collectionItems.map((cat, i) => (
              <div
                key={cat.id}
                className={`group rounded-lg overflow-hidden border border-[rgba(232,224,212,0.08)] cursor-default${
                  i === collectionItems.length - 1 && collectionItems.length % 2 !== 0
                    ? " md:col-span-2"
                    : ""
                }`}
              >
                {/* Image on top */}
                <div className={`relative overflow-hidden${
                  i === collectionItems.length - 1 && collectionItems.length % 2 !== 0
                    ? " aspect-[5/2]"
                    : " aspect-[5/4]"
                }`}>
                  <Image
                    src={cat.url}
                    alt={cat.alt_text}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 620px"
                  />
                </div>
                {/* Text block below */}
                <div className="p-5 bg-[rgba(232,224,212,0.02)]">
                  <h3 className="font-serif text-lg text-foreground mb-1">
                    {cat.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-snug">
                    {cat.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: From the Archive ── */}
      <section className="py-20 md:py-28 border-t border-[rgba(232,224,212,0.08)]">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-12">
            From the Archive
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {featuredItems.map((item) => (
              <div
                key={item.id}
                className="group rounded-lg overflow-hidden border border-[rgba(232,224,212,0.08)]"
              >
                {/* Full-width image on top */}
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={item.url}
                    alt={item.alt_text}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 580px"
                  />
                </div>
                {/* Text block below */}
                <div className="p-5 bg-[rgba(232,224,212,0.02)]">
                  {item.subtitle && (
                    <p className="text-xs text-primary font-medium uppercase tracking-wider mb-2">
                      {item.subtitle}
                    </p>
                  )}
                  <h3 className="font-serif text-xl text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                  {item.link_url && (
                    <Link
                      href={item.link_url}
                      className="text-sm text-primary hover:text-primary/80 transition-colors mt-3 inline-block"
                    >
                      {item.link_label || "View in catalogue"} &rarr;
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: The Listening Room ── */}
      <section className="py-20 md:py-28 border-t border-[rgba(232,224,212,0.08)]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-12 items-center">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-6">
                {listening.title}
              </h2>
              {listening.body?.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-muted-foreground leading-relaxed mb-4">
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="relative aspect-[3/2] rounded-lg overflow-hidden">
              <Image
                src={listeningImage.url}
                alt={listeningImage.alt_text}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 60vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 7: The Experience ── */}
      <section className="py-20 md:py-28 border-t border-[rgba(232,224,212,0.08)]">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-12">
            The Experience
          </h2>
          <div className="flex flex-col gap-8">
            {EXPERIENCE_MODULES.map((mod) => {
              const Icon = mod.icon
              return (
                <div key={mod.title} className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg text-foreground mb-1">
                      {mod.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {mod.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Section 8: Coffee ── */}
      <section className="py-16 md:py-20 border-t border-[rgba(232,224,212,0.08)]">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Coffee className="h-8 w-8 text-primary mx-auto mb-6" />
          <p className="text-muted-foreground leading-relaxed text-lg italic">
            &quot;{coffee.quote}&quot;
          </p>
        </div>
      </section>

      {/* ── Section 9: Plan Your Visit ── */}
      <section
        id="visit"
        className="py-20 md:py-28 border-t border-[rgba(232,224,212,0.08)]"
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-12">
            Plan Your Visit
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Left: Hours + Contact */}
            <div className="space-y-10">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-primary" />
                  <h3 className="font-serif text-lg text-foreground">
                    Opening Hours
                  </h3>
                </div>
                <div className="text-sm space-y-1">
                  {visit.hours?.split("\n").map((line, i) => (
                    <p
                      key={i}
                      className={
                        line.trim() === ""
                          ? "h-2"
                          : line.includes("appointment")
                            ? "text-muted-foreground/70 pt-2"
                            : "text-muted-foreground"
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="h-5 w-5 text-primary" />
                  <h3 className="font-serif text-lg text-foreground">Contact</h3>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary/60" />
                    <a href={`tel:${visit.phone?.replace(/\s/g, "")}`} className="hover:text-primary transition-colors">
                      {visit.phone}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary/60" />
                    <a href={`mailto:${visit.email}`} className="hover:text-primary transition-colors">
                      {visit.email}
                    </a>
                  </div>
                  <p className="text-muted-foreground/70 pt-2">
                    Appointments welcome — write or call to arrange a private visit.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Address + Getting here */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-primary" />
                <h3 className="font-serif text-lg text-foreground">
                  Getting Here
                </h3>
              </div>
              <address className="not-italic text-sm text-muted-foreground space-y-1 mb-6">
                {visit.address?.split("\n").map((line, i) => (
                  <p key={i} className={i === 0 ? "text-foreground font-medium" : ""}>
                    {line}
                  </p>
                ))}
                {visit.region && (
                  <p className="text-primary/70 pt-1">{visit.region}</p>
                )}
              </address>

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex gap-3">
                  <span className="text-primary font-medium w-16 flex-shrink-0">By car</span>
                  <span>A96 &rarr; Exit Friedrichshafen-Nord, 5 min</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary font-medium w-16 flex-shrink-0">By train</span>
                  <span>Friedrichshafen Stadtbahnhof, 10 min walk</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-primary font-medium w-16 flex-shrink-0">By ferry</span>
                  <span>Konstanz / Meersburg ferry + 20 min drive</span>
                </div>
              </div>

              <div className="mt-8 rounded-lg overflow-hidden border border-[rgba(232,224,212,0.08)] aspect-[16/9]">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2689.2!2d9.4782!3d47.6567!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x479b31f3b5b35e0d%3A0x0!2zNDfCsDM5JzI0LjEiTiA5wrAyOCc0MS41IkU!5e0!3m2!1sen!2sde!4v1"
                  width="100%"
                  height="100%"
                  style={{ border: 0, filter: "invert(0.9) hue-rotate(180deg) saturate(0.3)" }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="VOD Gallery location — Friedrichshafen"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 10: Closing ── */}
      <section className="py-20 md:py-28 border-t border-[rgba(232,224,212,0.08)]">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="font-serif text-2xl md:text-3xl text-primary leading-relaxed">
            &quot;{closing.quote}&quot;
          </p>
          <Link
            href="/catalog"
            className="inline-block mt-8 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Explore the archive &rarr;
          </Link>
        </div>
      </section>
    </main>
  )
}
