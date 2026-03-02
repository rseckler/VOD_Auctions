export interface AuctionBlock {
  id: string
  slug: string
  title: string
  subtitle: string
  description: string
  imageUrl: string
  status: "active" | "scheduled" | "ended" | "preview"
  itemCount: number
  startDate: string
  endDate: string
  minStartPrice: number
  totalBids: number
}

export const blocks: AuctionBlock[] = [
  {
    id: "blk-001",
    slug: "dark-ambient-drone",
    title: "Dark Ambient & Drone",
    subtitle: "50 seltene Tonträger aus den Tiefen des Dark Ambient",
    description:
      "Von Lustmord über Atrium Carceri bis zu obskuren CDr-Veröffentlichungen — diese kuratierte Auswahl umfasst 50 handverlesene Tonträger aus der Welt des Dark Ambient und Drone. Raritäten aus den 90ern, limitierte Auflagen und Sammlerstücke, die auf dem offenen Markt kaum zu finden sind.",
    imageUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=1200&h=600&fit=crop",
    status: "active",
    itemCount: 50,
    startDate: "2026-03-01T10:00:00Z",
    endDate: "2026-03-15T22:00:00Z",
    minStartPrice: 1,
    totalBids: 187,
  },
  {
    id: "blk-002",
    slug: "ebm-classics",
    title: "EBM Classics",
    subtitle: "Elektronische Körpermusik — Die Originale",
    description:
      "Front 242, Nitzer Ebb, DAF, Die Krupps — die Pioniere der Electronic Body Music in seltenen Erstpressungen, limitierten 12\"s und vergriffenen Compilations.",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&h=600&fit=crop",
    status: "scheduled",
    itemCount: 35,
    startDate: "2026-03-20T10:00:00Z",
    endDate: "2026-04-03T22:00:00Z",
    minStartPrice: 1,
    totalBids: 0,
  },
  {
    id: "blk-003",
    slug: "noise-japan",
    title: "Noise Japan",
    subtitle: "Japanoise — Von Merzbow bis Hijokaidan",
    description:
      "Die japanische Noise-Szene in ihrer vollen Brutalität: Merzbow, Masonna, Hijokaidan, Incapacitants und viele mehr. Limitierte Vinyl-Pressungen, obskure CDrs und legendäre Kassetten.",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&h=600&fit=crop",
    status: "scheduled",
    itemCount: 40,
    startDate: "2026-04-10T10:00:00Z",
    endDate: "2026-04-24T22:00:00Z",
    minStartPrice: 1,
    totalBids: 0,
  },
]

export function getBlock(slug: string): AuctionBlock | undefined {
  return blocks.find((b) => b.slug === slug)
}
