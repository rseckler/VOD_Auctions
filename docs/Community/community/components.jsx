/* global React */
// VOD Community — shared components
// Avatars, tier badges, post cards, headers, footer, sidebars.

const Icon = ({ name, size = 18, stroke = 1.5, ...rest }) => {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths}
    </svg>
  );
};

const ICON_PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2l3 12h11l2-8H6" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></>,
  heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  reply: <><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></>,
  bookmark: <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  disc: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>,
  arrow: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  back: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
  filter: <path d="M4 4h16l-6 8v6l-4 2v-8Z" />,
  bold: <><path d="M6 4h7a4 4 0 0 1 0 8H6Z" /><path d="M6 12h8a4 4 0 0 1 0 8H6Z" /></>,
  italic: <><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5-9 9" /></>,
  at: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  hash: <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>,
  tag: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1" /></>,
  home: <><path d="M3 12 12 3l9 9" /><path d="M5 10v10h14V10" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><circle cx="17" cy="6" r="3" /><path d="M22 17a5 5 0 0 0-5-5" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /></>,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  menu: <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></>,
  chevron: <polyline points="9 18 15 12 9 6" />,
  follow: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  archive: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><line x1="10" y1="13" x2="14" y2="13" /></>,
  pin: <><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-2-5V5h-10v7Z" /></>,
};

// ─── Avatars ──────────────────────────────────────────────────
// Monogram tile with deterministic warm-tinted hue. Tier ring + pin overlay.
const monogramHue = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
};
const Avatar = ({ name, tier, size = 40, mode = "mono" }) => {
  const initials = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/(?=[A-Z])|\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
  const isCurator = tier === "curator";
  const hue = monogramHue(name);
  // warm earth palette: rotate hue but stay in 25-50 range with low chroma
  const a = isCurator ? "#3a2e16" : `hsl(${(hue % 30) + 25}, 18%, 22%)`;
  const b = isCurator ? "#1c1915" : `hsl(${(hue % 30) + 25}, 14%, 14%)`;
  const showPin = tier === "platinum" || tier === "gold" || tier === "silver" || tier === "curator";
  const pinChar = tier === "curator" ? "★" : tier === "platinum" ? "◆" : tier === "gold" ? "★" : "★";
  return (
    <span className={`cm-avatar cm-avatar-${size} tier-${tier || "bronze"}`}>
      <span className="cm-avatar-inner">
        <span
          className={"cm-avatar-mono" + (isCurator ? " is-curator" : "")}
          style={{ "--mono-a": a, "--mono-b": b }}
        >
          {initials}
        </span>
      </span>
      {showPin && <span className={`cm-avatar-pin ${tier}`}>{pinChar}</span>}
    </span>
  );
};

// ─── Tier label (inline) ──────────────────────────────────────
const TierLabel = ({ tier }) => {
  if (!tier || tier === "bronze") return <span className="cm-tier-label">Bronze</span>;
  if (tier === "curator") return <span className="cm-tier-label is-curator"><span className="star">🎙</span> VOD Curator</span>;
  const cls = "is-" + tier;
  const label = tier[0].toUpperCase() + tier.slice(1);
  const star = tier === "platinum" ? "◆" : "★";
  return <span className={`cm-tier-label ${cls}`}><span className="star">{star}</span> {label}</span>;
};

// ─── Tag chip ────────────────────────────────────────────────
const Tag = ({ name, count, onClick }) => (
  <button type="button" className="cm-tag" onClick={onClick}>
    #{name}{count != null && <span className="cm-tag-count">{count}</span>}
  </button>
);

// ─── Reactions row ───────────────────────────────────────────
const REACTIONS = [
  { e: "🔥", name: "fire" },
  { e: "❤️", name: "love" },
  { e: "🤘", name: "horns" },
  { e: "👀", name: "eyes" },
  { e: "💯", name: "hundred" },
  { e: "🙏", name: "thanks" },
  { e: "⚡", name: "spark" },
];
const Reactions = ({ counts = {}, active }) => (
  <>
    {REACTIONS.filter((r) => counts[r.name] || r.name === active).map((r) => (
      <button
        key={r.name}
        type="button"
        className={"cm-react" + (r.name === active ? " is-active" : "")}
      >
        <span className="emoji">{r.e}</span>
        <span>{counts[r.name] || 1}</span>
      </button>
    ))}
  </>
);

// ─── Top header ──────────────────────────────────────────────
const Header = ({ active = "community", onNav }) => {
  const link = (key, label, opts = {}) => (
    <button
      type="button"
      className={"cm-nav-link" + (active === key ? " is-active" : "")}
      onClick={() => onNav?.(key)}
    >
      {label}
      {opts.dot && <span className="cm-nav-dot" />}
    </button>
  );
  return (
    <div className="cm-header">
      <div className="cm-header-inner">
        <a className="cm-brand" onClick={() => onNav?.("home")}>
          <span className="cm-disc" /> VOD Auctions
        </a>
        <nav className="cm-nav">
          {link("auctions", "Auctions")}
          {link("community", "Community", { dot: true })}
          {link("catalog", "Catalog")}
          {link("bands", "Bands")}
          {link("labels", "Labels")}
          {link("about", "About")}
        </nav>
        <div className="cm-h-right">
          <button className="cm-icon-btn"><Icon name="search" /></button>
          <button className="cm-icon-btn"><Icon name="bell" /><span className="badge" /></button>
          <button className="cm-icon-btn"><Icon name="cart" /></button>
          <button className="cm-icon-btn"><Icon name="user" /></button>
        </div>
      </div>
    </div>
  );
};

// ─── Mobile header + bottom tabs ─────────────────────────────
const MobileHeader = ({ title = "Community", onMenu, onSearch }) => (
  <div className="cm-mobile-header">
    <button className="cm-icon-btn" onClick={onMenu}><Icon name="menu" /></button>
    <div style={{ flex: 1, textAlign: "center", font: "400 17px var(--font-serif)", letterSpacing: "-0.01em" }}>
      {title}
    </div>
    <button className="cm-icon-btn" onClick={onSearch}><Icon name="search" /></button>
  </div>
);

const BottomTabs = ({ active = "community", layout = "5slot", onNav }) => {
  const items = layout === "centerFab"
    ? [
        { key: "home", label: "Home", icon: "home" },
        { key: "auctions", label: "Auctions", icon: "disc" },
        { key: "compose", label: "", icon: "pen", isFab: true },
        { key: "community", label: "Community", icon: "users", dot: true },
        { key: "account", label: "Account", icon: "user" },
      ]
    : layout === "minimal"
    ? [
        { key: "home", label: "Home", icon: "home" },
        { key: "community", label: "Feed", icon: "users", dot: true },
        { key: "search", label: "Search", icon: "search" },
        { key: "account", label: "Account", icon: "user" },
      ]
    : [
        { key: "home", label: "Home", icon: "home" },
        { key: "auctions", label: "Auctions", icon: "disc" },
        { key: "community", label: "Community", icon: "users", dot: true },
        { key: "cart", label: "Cart", icon: "cart" },
        { key: "account", label: "Account", icon: "user" },
      ];
  return (
    <div className="cm-bottom-tab">
      {items.map((it) =>
        it.isFab ? (
          <button
            key={it.key}
            type="button"
            className="cm-bottom-tab-item"
            style={{ position: "relative", color: "var(--primary-foreground)" }}
            onClick={() => onNav?.(it.key)}
          >
            <span style={{
              position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
              width: 56, height: 56, borderRadius: 999,
              background: "linear-gradient(180deg,#d4a54a,#b8860b)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4),0 0 30px rgba(212,165,74,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "3px solid #1c1915",
            }}>
              <Icon name="pen" size={22} stroke={2} />
            </span>
          </button>
        ) : (
          <button
            key={it.key}
            type="button"
            className={"cm-bottom-tab-item" + (active === it.key ? " is-active" : "")}
            onClick={() => onNav?.(it.key)}
          >
            <Icon name={it.icon} size={20} />
            {it.dot && <span className="cm-bottom-tab-dot" />}
            {it.label}
          </button>
        )
      )}
    </div>
  );
};

// ─── Sub-nav ─────────────────────────────────────────────────
const SubNav = ({ active = "feed", onNav }) => {
  const item = (key, label, opts = {}) => (
    <button
      key={key}
      type="button"
      className={
        "cm-subnav-link" +
        (active === key ? " is-active" : "") +
        (opts.curator ? " cm-subnav-curator" : "")
      }
      onClick={() => onNav?.(key)}
    >
      {label}
    </button>
  );
  return (
    <div className="cm-subnav">
      <div className="cm-subnav-inner">
        {item("feed", "Feed")}
        {item("explore", "Explore")}
        {item("lists", "Lists")}
        {item("dispatch", "Dispatch", { curator: true })}
        {item("members", "Members")}
        <div className="cm-subnav-spacer" />
        <button type="button" className="cm-subnav-search">
          <Icon name="search" size={13} />
          Search the community
          <kbd>⌘K</kbd>
        </button>
      </div>
    </div>
  );
};

const MobileSubNav = ({ active = "feed", onNav }) => (
  <div className="cm-mobile-subnav">
    {["feed", "explore", "lists", "dispatch", "members"].map((k) => (
      <button
        key={k}
        type="button"
        className={"cm-mobile-subnav-link" + (active === k ? " is-active" : "")}
        onClick={() => onNav?.(k)}
      >
        {k === "dispatch" ? "Dispatch ✦" : k[0].toUpperCase() + k.slice(1)}
      </button>
    ))}
  </div>
);

// ─── Footer ──────────────────────────────────────────────────
const Footer = () => (
  <div className="cm-footer">
    <div className="cm-footer-inner">
      <div>
        <div className="cm-footer-mark">
          <span className="cm-disc" /> VOD Auctions
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted-foreground)", maxWidth: 280, lineHeight: 1.6 }}>
          Curated auctions for industrial, power-electronics and tape-underground vinyl. Friedrichshafen, since 2003.
        </div>
      </div>
      <div className="cm-footer-cols">
        <div className="cm-footer-col">
          <div className="cm-footer-col-title">Marketplace</div>
          <a className="cm-footer-link">Auctions</a>
          <a className="cm-footer-link">Catalog</a>
          <a className="cm-footer-link">Bands</a>
          <a className="cm-footer-link">Labels</a>
        </div>
        <div className="cm-footer-col">
          <div className="cm-footer-col-title">Community</div>
          <a className="cm-footer-link">Feed</a>
          <a className="cm-footer-link">Dispatch</a>
          <a className="cm-footer-link">Members</a>
          <a className="cm-footer-link">Code of Conduct</a>
        </div>
        <div className="cm-footer-col">
          <div className="cm-footer-col-title">House</div>
          <a className="cm-footer-link">About</a>
          <a className="cm-footer-link">Gallery</a>
          <a className="cm-footer-link">Contact</a>
          <a className="cm-footer-link">Imprint</a>
        </div>
      </div>
    </div>
  </div>
);

// ─── Inline release card ─────────────────────────────────────
const ReleaseInline = ({ format = "vinyl", artist, title, year, label, price, ownership }) => (
  <a className="cm-release-inline" onClick={(e) => e.preventDefault()}>
    <div className={`cm-release-cover is-${format}`} />
    <div className="cm-release-info">
      <div className="cm-release-fmt">{format} · {label} · {year}</div>
      <div className="cm-release-title">{title}</div>
      <div className="cm-release-artist">{artist}</div>
    </div>
    <div className="cm-release-foot">
      {price ? `From €${price}` : ownership ? `${ownership} own` : ""}
    </div>
  </a>
);

// ─── Standard post card ──────────────────────────────────────
const PostCard = ({ post, onOpenPost, onOpenProfile }) => (
  <article className="cm-post" onClick={() => onOpenPost?.(post.id)} style={{ cursor: "pointer" }}>
    <div className="cm-post-head">
      <a onClick={(e) => { e.stopPropagation(); onOpenProfile?.(post.author.handle); }} style={{ cursor: "pointer" }}>
        <Avatar name={post.author.name} tier={post.author.tier} size={48} />
      </a>
      <div className="cm-post-meta">
        <div className="cm-post-author">
          <a className="cm-post-name" onClick={(e) => { e.stopPropagation(); onOpenProfile?.(post.author.handle); }} style={{ cursor: "pointer" }}>
            {post.author.name}
          </a>
          <TierLabel tier={post.author.tier} />
          {post.author.location && <span className="cm-post-loc">· {post.author.location}</span>}
        </div>
        <div className="cm-post-time">{post.time}</div>
      </div>
      <button className="cm-icon-btn" onClick={(e) => e.stopPropagation()}><Icon name="more" size={16} /></button>
    </div>
    <div className="cm-post-body" dangerouslySetInnerHTML={{ __html: post.body }} />
    {post.release && <ReleaseInline {...post.release} />}
    {post.tags && (
      <div className="cm-post-tags">
        {post.tags.map((t) => <Tag key={t} name={t} />)}
      </div>
    )}
    <div className="cm-post-actions" onClick={(e) => e.stopPropagation()}>
      <Reactions counts={post.reactions} active={post.activeReaction} />
      <button className="cm-react"><Icon name="message" size={14} /> {post.comments}</button>
      <div className="cm-react-spacer" />
      <button className="cm-react"><Icon name="bookmark" size={14} /></button>
      <button className="cm-react"><Icon name="share" size={14} /></button>
    </div>
  </article>
);

// ─── Editorial card ──────────────────────────────────────────
const EditorialCard = ({ post, variant = "feed", onOpen }) => (
  <article
    className={"cm-editorial" + (variant === "feed" ? " is-feed" : "")}
    onClick={() => onOpen?.(post.id)}
    style={{ cursor: "pointer" }}
  >
    <div className="cm-editorial-eyebrow">
      <span>From the Vault</span>
      <span className="num">№ {post.issue}</span>
      <span style={{ color: "var(--muted-foreground)", letterSpacing: "0.06em", fontWeight: 500 }}>
        · {post.dateLabel || "Frank Maier"}
      </span>
    </div>
    <div className="cm-editorial-body">
      <h2 className="cm-editorial-title">{post.title}</h2>
      <p className="cm-editorial-lede">{post.lede}</p>
    </div>
    <div className="cm-editorial-foot">
      <div className="cm-editorial-author">
        <Avatar name="Frank Maier" tier="curator" size={40} />
        <div>
          <div className="cm-editorial-author-name">Frank Maier</div>
          <div className="cm-editorial-author-role">🎙 VOD Curator</div>
        </div>
      </div>
      <div className="cm-editorial-stats">
        <span>🔥 {post.reactions?.fire || 0}</span>
        <span>💬 {post.comments}</span>
        <span>{post.time}</span>
      </div>
    </div>
  </article>
);

// ─── Sidebar widgets ─────────────────────────────────────────
const TrendingTags = ({ tags }) => (
  <div className="cm-widget">
    <div className="cm-widget-head">
      <div className="cm-widget-title">Trending Tags</div>
      <a className="cm-widget-link">All →</a>
    </div>
    <div className="cm-post-tags" style={{ marginTop: 0 }}>
      {tags.map((t) => <Tag key={t.name} name={t.name} count={t.count} />)}
    </div>
  </div>
);

const SuggestedMembers = ({ members }) => (
  <div className="cm-widget">
    <div className="cm-widget-head">
      <div className="cm-widget-title">Suggested Members</div>
      <a className="cm-widget-link">More</a>
    </div>
    <div className="cm-suggested">
      {members.map((m) => (
        <div key={m.handle} className="cm-suggested-row">
          <Avatar name={m.name} tier={m.tier} size={40} />
          <div className="cm-suggested-meta">
            <div className="cm-suggested-name">{m.name}</div>
            <div className="cm-suggested-sub">
              <TierLabel tier={m.tier} />
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{m.location}</span>
            </div>
          </div>
          <button className="cm-btn cm-btn-outline cm-btn-sm">Follow</button>
        </div>
      ))}
    </div>
  </div>
);

const ActiveBlocks = ({ blocks }) => (
  <div className="cm-widget">
    <div className="cm-widget-head">
      <div className="cm-widget-title">Active in Auctions</div>
      <a className="cm-widget-link">All →</a>
    </div>
    {blocks.map((b) => (
      <a key={b.id} className="cm-block-mini">
        <div className="cm-block-mini-tag"><span className="dot" /> Live · ends {b.ends}</div>
        <div className="cm-block-mini-title">{b.title}</div>
        <div className="cm-block-mini-foot">
          <span>{b.lots} Lots</span>
          <span className="price">From €{b.from}</span>
        </div>
      </a>
    ))}
  </div>
);

const FromCatalog = ({ items }) => (
  <div className="cm-widget">
    <div className="cm-widget-head">
      <div className="cm-widget-title">From the Catalog</div>
      <a className="cm-widget-link">More →</a>
    </div>
    {items.map((r, i) => (
      <div key={i} style={{ marginTop: i ? 12 : 0 }}>
        <ReleaseInline {...r} />
      </div>
    ))}
  </div>
);

// Export to window so other Babel scripts can import
Object.assign(window, {
  Avatar, TierLabel, Tag, Reactions, Header, MobileHeader, BottomTabs,
  SubNav, MobileSubNav, Footer, ReleaseInline, PostCard, EditorialCard,
  TrendingTags, SuggestedMembers, ActiveBlocks, FromCatalog, Icon, REACTIONS,
});
