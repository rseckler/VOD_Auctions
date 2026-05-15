/* global React, window */
// VOD Community — screen compositions.
// Each screen is a function that takes ({nav, view, mobile, tweaks, openModal}).

const D = window.CMData;
const {
  Avatar, TierLabel, Tag, Reactions, Header, MobileHeader, BottomTabs,
  SubNav, MobileSubNav, Footer, ReleaseInline, PostCard, EditorialCard,
  TrendingTags, SuggestedMembers, ActiveBlocks, FromCatalog, Icon, REACTIONS,
} = window;

// ─────────────────────────────────────────────────────────────
// Screen 1 — Community Hub
// ─────────────────────────────────────────────────────────────
function HubScreen({ nav, mobile, tweaks, openModal, mobileTabsLayout }) {
  const layoutClass =
    tweaks.hubLayout === "3col" ? "layout-3col" :
    tweaks.hubLayout === "1col" ? "layout-1col" : "layout-2col";
  const densityClass =
    tweaks.density === "dense" ? "is-dense" :
    tweaks.density === "medium" ? "is-medium" : "is-spacious";

  const goPost = () => nav("post");
  const goProfile = (h) => nav("profile", { handle: h });

  if (mobile) {
    return (
      <div className="cm-screen is-mobile" data-screen-label="01 Hub Mobile">
        <MobileHeader title="Community" />
        <MobileSubNav active="feed" onNav={() => {}} />
        <div className="cm-container">
          <div style={{ padding: "20px 0 12px" }}>
            <EditorialCard post={D.editorial} variant="feed" onOpen={goPost} />
          </div>
          <div className="cm-feed is-spacious" style={{ paddingBottom: 24 }}>
            <div className="cm-feed-divider">Recent · From the people you follow</div>
            {D.feedPosts.map((p) => (
              <PostCard key={p.id} post={p} onOpenPost={goPost} onOpenProfile={goProfile} />
            ))}
          </div>
          <div style={{ padding: "12px 0 32px", display: "flex", flexDirection: "column", gap: 28 }}>
            <ActiveBlocks blocks={D.blocks} />
            <TrendingTags tags={D.trendingTags} />
            <SuggestedMembers members={[D.members.mb, D.members.tape, D.members.noise]} />
          </div>
        </div>
        <button className="cm-fab" onClick={openModal}><Icon name="pen" size={16} /> Compose</button>
        <BottomTabs active="community" layout={mobileTabsLayout} />
      </div>
    );
  }

  return (
    <div className="cm-screen" data-screen-label="01 Hub Desktop">
      <Header active="community" onNav={(k) => k === "community" ? nav("hub") : null} />
      <SubNav active="feed" onNav={(k) => k === "members" ? nav("members") : null} />
      <div className="cm-container">
        <div style={{ padding: "32px 0 24px" }}>
          <EditorialCard post={D.editorial} variant="hero" onOpen={goPost} />
        </div>
        <div className={`cm-hub-grid ${layoutClass}`}>
          {tweaks.hubLayout === "3col" && (
            <aside className="cm-rail">
              <button className="cm-rail-link is-active" type="button"><span className="dot" /> Feed</button>
              <button className="cm-rail-link" type="button">Following</button>
              <button className="cm-rail-link" type="button">Bookmarks</button>
              <div className="cm-rail-section">
                <div className="cm-rail-section-title">Filter</div>
                <button className="cm-rail-link" type="button">Editorial</button>
                <button className="cm-rail-link" type="button">Catalog-anchored</button>
                <button className="cm-rail-link" type="button">Acquired</button>
              </div>
              <div className="cm-rail-section">
                <div className="cm-rail-section-title">Lists you saved</div>
                <button className="cm-rail-link" type="button">ZKO Essentials</button>
                <button className="cm-rail-link" type="button">Cassette Underground</button>
              </div>
            </aside>
          )}

          <main>
            <div className="cm-page-eyebrow">
              <span className="cm-page-eyebrow-text">Recent · From the people you follow</span>
              <span className="cm-page-eyebrow-rule" />
              <a className="cm-page-eyebrow-link">Manage feed →</a>
            </div>
            <div className={`cm-feed ${densityClass}`}>
              {D.feedPosts.map((p) => (
                <PostCard key={p.id} post={p} onOpenPost={goPost} onOpenProfile={goProfile} />
              ))}
            </div>
          </main>

          {tweaks.hubLayout !== "1col" && (
            <aside className="cm-sidebar">
              <ActiveBlocks blocks={D.blocks} />
              <TrendingTags tags={D.trendingTags} />
              <SuggestedMembers members={[D.members.mb, D.members.tape, D.members.noise]} />
              <FromCatalog items={D.catalogItems} />
            </aside>
          )}
        </div>
      </div>
      <Footer />
      <button className="cm-fab" onClick={openModal}><Icon name="pen" size={16} /> Compose</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 2 — Single Post (Frank editorial)
// ─────────────────────────────────────────────────────────────
function PostScreen({ nav, mobile, tweaks }) {
  const goProfile = (h) => nav("profile", { handle: h });
  const Comment = ({ c }) => (
    <div className={
      "cm-comment" +
      (c.isReply ? " is-reply" : "") +
      (c.author.tier === "curator" ? " is-curator" : "")
    }>
      <a onClick={() => goProfile(c.author.handle)} style={{ cursor: "pointer" }}>
        <Avatar name={c.author.name} tier={c.author.tier} size={c.isReply ? 32 : 40} />
      </a>
      <div className="cm-comment-body">
        <div className="cm-comment-head">
          <a className="cm-comment-name" onClick={() => goProfile(c.author.handle)} style={{ cursor: "pointer" }}>
            {c.author.name}
          </a>
          <TierLabel tier={c.author.tier} />
          <span className="cm-comment-time">· {c.time}</span>
        </div>
        <div className="cm-comment-text" dangerouslySetInnerHTML={{ __html: c.text }} />
        <div className="cm-comment-actions">
          <Reactions counts={c.reactions} />
          <button className="cm-comment-action"><Icon name="reply" size={12} /> Reply</button>
          <button className="cm-comment-action"><Icon name="more" size={12} /></button>
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="cm-post-detail">
      <div className="cm-post-detail-eyebrow">
        <span style={{ color: "var(--primary)" }}>Dispatch</span>
        <span>·</span>
        <span className="num">From the Vault № 43</span>
        <span>·</span>
        <span style={{ color: "var(--muted-foreground)" }}>Part 1 of 2</span>
      </div>
      <h1 className="cm-post-detail-title">
        Die ZKO-Tape-Ära 1984–1986: Was uns die zweite Kassette über Frank Tovey verriet
      </h1>
      <p className="cm-post-detail-deck">
        Aus dem Archiv kommt ein zweiteiliger Bericht über Z'EV's Begegnungen mit Frank Tovey in West-Berlin, 1984.
        Inklusive zwei Aufnahmen, die nie offiziell veröffentlicht wurden.
      </p>
      <div className="cm-author-strip">
        <a onClick={() => goProfile("FrankMaier")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name="Frank Maier" tier="curator" size={48} />
          <div>
            <div className="cm-comment-name">Frank Maier</div>
            <TierLabel tier="curator" />
          </div>
        </a>
        <span className="cm-author-strip-divider" />
        <span className="cm-author-strip-meta">
          <span>Donnerstag, 5. Mai 2026</span>
          <span>·</span>
          <span>7 min Lesezeit</span>
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="cm-btn cm-btn-outline cm-btn-sm">Following</button>
        </div>
      </div>

      <div className="cm-post-detail-hero" data-caption="Z'EV / Berlin · Spring 1984 — Archive 03/B" />

      <div className="cm-prose">
        <p>
          Im Herbst 1984 schickte Z'EV zwei Kassetten an Frank Tovey nach West-Berlin. Eine davon
          ist offiziell als ZKO 005 erschienen. Die andere — diejenige, von der seit Jahren in
          Sammler-Kreisen gemunkelt wurde — galt als verschollen. Bis im Februar dieses Jahres,
          beim systematischen Sortieren von Cosey's Korrespondenz, eine handschriftliche Notiz
          auftauchte: „W-Mic, B-side, do not destroy."
        </p>
        <p>
          Was wir heute mit Sicherheit sagen können: das zweite Tape existiert, ist datierbar auf
          spätestens November 1984, und wurde mit einem Walther-Studiomikrofon aufgenommen — einem
          Gerät, das Z'EV in einem Interview von 1991 nur einmal namentlich erwähnt hat, ohne es
          jemals einer konkreten Aufnahme zuzuordnen.
        </p>
        <h2>Die Provenienz</h2>
        <p>
          Die Spur führt über drei Stationen: Cosey's Pratteln-Archiv (Eingang März 1986),
          Genesis P.'s Korrespondenz mit Frank Tovey (Brief vom 11. November 1984), und Z'EV's
          eigenes Aufnahmeprotokoll, das mir Cosey im Februar in Kopie übermittelt hat.
        </p>
        <blockquote>
          Frank's Handschrift auf dem Sleeve war unverkennbar. Wir haben drei Stunden gebraucht,
          um die Datierung gegen das Reise-Tagebuch abzugleichen — am Ende war alles drin, sogar
          die Wetter-Notiz.
          <cite>Cosey · Februar 2026</cite>
        </blockquote>
        <p>
          In Teil 2 nächste Woche: das B-side-Material selbst, mit zwei Aufnahmen die wir hier
          zum ersten Mal als Stream einbetten — und die Frage, warum dieses Tape 40 Jahre
          gebraucht hat um anzukommen.
        </p>
      </div>

      <div className="cm-reactions-bar">
        {REACTIONS.map((r) => (
          <button key={r.name} className={"cm-react" + (r.name === "fire" ? " is-active" : "")}>
            <span className="emoji">{r.e}</span>
            <span>{r.name === "fire" ? 87 : r.name === "horns" ? 14 : r.name === "love" ? 22 : r.name === "hundred" ? 9 : r.name === "thanks" ? 5 : ""}</span>
          </button>
        ))}
        <span className="cm-reactions-count">144 reactions · 24 comments</span>
      </div>

      <div className="cm-comments-head">
        <div className="cm-comments-head-title">24 Comments</div>
        <div className="cm-comments-head-meta">Sort: Most recent</div>
      </div>
      <div className="cm-composer">
        <Avatar name="DiscoveredZkoIn1989" tier="gold" size={40} />
        <div style={{ flex: 1 }}>
          <textarea className="cm-composer-input" placeholder="Share your thoughts on this dispatch…" />
          <div className="cm-composer-actions">
            <div className="cm-composer-tools">
              <button className="cm-composer-tool"><Icon name="bold" size={14} /></button>
              <button className="cm-composer-tool"><Icon name="italic" size={14} /></button>
              <button className="cm-composer-tool"><Icon name="link" size={14} /></button>
              <button className="cm-composer-tool"><Icon name="image" size={14} /></button>
              <button className="cm-composer-tool"><Icon name="at" size={14} /></button>
            </div>
            <button className="cm-btn cm-btn-primary cm-btn-sm">Post Comment</button>
          </div>
        </div>
      </div>

      <div>
        {D.comments.map((c) => <Comment key={c.id} c={c} />)}
      </div>
    </div>
  );

  if (mobile) {
    return (
      <div className="cm-screen is-mobile" data-screen-label="02 Post Mobile">
        <MobileHeader title="Dispatch" />
        <div className="cm-container">{content}</div>
        <BottomTabs active="community" layout="default" />
      </div>
    );
  }

  return (
    <div className="cm-screen" data-screen-label="02 Post Desktop">
      <Header active="community" onNav={(k) => k === "community" ? nav("hub") : null} />
      <SubNav active="dispatch" onNav={(k) => k === "feed" ? nav("hub") : null} />
      <div className="cm-container-narrow" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 64 }}>
        {content}
        <aside className="cm-sidebar" style={{ paddingTop: 56 }}>
          <FromCatalog items={D.catalogItems} />
          <div className="cm-widget">
            <div className="cm-widget-head">
              <div className="cm-widget-title">More from Frank</div>
              <a className="cm-widget-link">All →</a>
            </div>
            {[
              { n: 42, t: "Re-Discovered: Eine vergessene Maurizio-Bianchi-Aufnahme", d: "vor 9 Tagen" },
              { n: 41, t: "Why Industrial Was Never Dance Music — Eine Rückbetrachtung", d: "vor 16 Tagen" },
              { n: 40, t: "Inside the Archive: Was zwei Wochen Sortieren über Vortex Campaign verraten haben", d: "vor 23 Tagen" },
            ].map((it) => (
              <a key={it.n} style={{
                display: "block", padding: "14px 0", cursor: "pointer",
                borderTop: "1px solid var(--fg-04)",
              }}>
                <div style={{ font: "700 9px var(--font-sans)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--primary)", marginBottom: 6 }}>From the Vault № {it.n}</div>
                <div style={{ font: "400 16px/1.3 var(--font-serif)", color: "var(--foreground)", marginBottom: 4 }}>{it.t}</div>
                <div style={{ font: "400 11px var(--font-sans)", color: "var(--muted-foreground)" }}>{it.d}</div>
              </a>
            ))}
          </div>
          <div className="cm-widget">
            <div className="cm-widget-head"><div className="cm-widget-title">Tags</div></div>
            <div className="cm-post-tags" style={{ marginTop: 0 }}>
              {["zko", "frank-tovey", "z-ev", "tape-culture", "archive-find", "provenance"].map((t) => (
                <Tag key={t} name={t} />
              ))}
            </div>
          </div>
        </aside>
      </div>
      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 3 — Member Profile
// ─────────────────────────────────────────────────────────────
function ProfileScreen({ nav, mobile, params }) {
  const handle = params?.handle || "DiscoveredZkoIn1989";
  const isCurator = handle === "FrankMaier";
  const member = isCurator
    ? { ...D.members.frank, bio: "Inhaber Vinyl on Demand. Seit 2003 im Aufbau des Archivs. Schweiz / West-Berlin." }
    : { ...D.members.zko, bio: "Industrial & Tape-Underground seit den 90ern. Schwerpunkt Z'EV, Maurizio Bianchi, frühe ZKO. Tausche nicht, kaufe nur." };

  const stats = isCurator
    ? [
        { n: "217", l: "Editorials" },
        { n: "1,847", l: "Comments" },
        { n: "—", l: "Following" },
        { n: "4,213", l: "Followers" },
        { n: "—", l: "Owned" },
        { n: "—", l: "Wantlist" },
      ]
    : [
        { n: "127", l: "Posts" },
        { n: "432", l: "Comments" },
        { n: "94", l: "Following" },
        { n: "218", l: "Followers" },
        { n: "2,341", l: "Owned" },
        { n: "87", l: "Wantlist" },
      ];

  const profileCard = (
    <div className={"cm-profile-card" + (mobile ? " is-mobile" : "")}>
      <Avatar name={member.name} tier={member.tier} size={mobile ? 96 : 120} />
      <div className="cm-profile-id">
        <h1 className="cm-profile-name">{member.name}</h1>
        <div className="cm-profile-handle">@{member.handle}</div>
        <div className="cm-profile-tier">
          <span className="cm-profile-tier-text">
            {isCurator ? "🎙 VOD Curator" :
              member.tier === "platinum" ? "◆ Platinum Member" :
              member.tier === "gold" ? "★ Gold Member" : "★ Silver Member"}
          </span>
        </div>
        <div className="cm-profile-meta">
          <span>{member.location}</span>
          <span className="sep" />
          <span>{isCurator ? "Founder · seit 2003" : `Sammler seit ${member.since}`}</span>
        </div>
        <div className="cm-profile-bio">{member.bio}</div>
        <div className="cm-profile-links">
          <button className="cm-icon-btn"><Icon name="globe" size={16} /></button>
          <button className="cm-icon-btn"><Icon name="disc" size={16} /></button>
          <button className="cm-icon-btn"><Icon name="music" size={16} /></button>
          <button className="cm-icon-btn"><Icon name="link" size={16} /></button>
        </div>
      </div>
      {!mobile && (
        <div className="cm-profile-actions">
          <button className="cm-btn cm-btn-primary"><Icon name="follow" size={14} /> Follow</button>
          <button className="cm-btn cm-btn-outline" style={{ opacity: 0.5 }}>
            <Icon name="message" size={14} /> Message
          </button>
        </div>
      )}
      {mobile && (
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button className="cm-btn cm-btn-primary" style={{ flex: 1 }}><Icon name="follow" size={14} /> Follow</button>
          <button className="cm-btn cm-btn-outline" style={{ flex: 1, opacity: 0.5 }}>Message</button>
        </div>
      )}
    </div>
  );

  const statsBar = (
    <div className="cm-stats-bar">
      {stats.map((s) => (
        <div key={s.l} className="cm-stat">
          <div className="cm-stat-num">{s.n}</div>
          <div className="cm-stat-label">{s.l}</div>
        </div>
      ))}
    </div>
  );

  const tabs = (
    <div className="cm-profile-tabs">
      {(isCurator
        ? ["Dispatch", "Editorials", "Lists", "Comments"]
        : ["Posts", "Lists", "Reviews", "Acquired", "Wantlist", "Comments"]
      ).map((t, i) => (
        <button key={t} className={"cm-profile-tab" + (i === 0 ? " is-active" : "")} type="button">
          {t}
          {i === 0 && <span className="count">{isCurator ? 217 : 127}</span>}
        </button>
      ))}
    </div>
  );

  const tabContent = (
    <div className="cm-feed is-spacious">
      {(isCurator
        ? [D.editorial, { ...D.editorial, id: "ed42", issue: 42, title: "Re-Discovered: Eine vergessene Maurizio-Bianchi-Aufnahme", lede: "Eine Probe-Pressung ohne Sleeve, eine Etikettenschrift ich nie gesehen habe. Was zwei Wochen Sortieren über Bianchi 1983 verraten haben.", time: "vor 9 Tagen", reactions: { fire: 64 }, comments: 18 }]
        : D.feedPosts.slice(0, 3).map((p) => ({ ...p, author: { ...p.author, name: member.name, tier: member.tier, handle: member.handle, location: member.location } }))
      ).map((p) =>
        p.issue
          ? <EditorialCard key={p.id} post={p} variant="feed" onOpen={() => nav("post")} />
          : <PostCard key={p.id} post={p} onOpenPost={() => nav("post")} onOpenProfile={() => {}} />
      )}
    </div>
  );

  if (mobile) {
    return (
      <div className="cm-screen is-mobile" data-screen-label="03 Profile Mobile">
        <MobileHeader title={member.name} />
        <div className={"cm-profile-banner" + (isCurator ? " is-curator" : "")}>
          <div className="cm-profile-banner-caption">
            {isCurator ? "VOD Gallery · Friedrichshafen" : "Berlin · 2024"}
          </div>
        </div>
        <div className="cm-container">
          {profileCard}
          {statsBar}
          {tabs}
          {tabContent}
        </div>
        <BottomTabs active="account" layout="default" />
      </div>
    );
  }

  return (
    <div className="cm-screen" data-screen-label="03 Profile Desktop">
      <Header active="community" onNav={(k) => k === "community" ? nav("hub") : null} />
      <SubNav active="members" onNav={(k) => k === "feed" ? nav("hub") : k === "members" ? nav("members") : null} />
      <div className={"cm-profile-banner" + (isCurator ? " is-curator" : "")}>
        <div className="cm-profile-banner-caption">
          {isCurator ? "VOD Gallery · Friedrichshafen" : "Berlin · Plattenladen 2024"}
        </div>
      </div>
      <div className="cm-container">
        {profileCard}
        {statsBar}
        {tabs}
        {tabContent}
      </div>
      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 4 — Catalog Discussion (release page tab)
// ─────────────────────────────────────────────────────────────
function ReleaseScreen({ nav, mobile }) {
  const goProfile = (h) => nav("profile", { handle: h });

  const post = (m, time, body, owned, reactions, comments) => (
    <article className="cm-post" style={{ cursor: "pointer" }} onClick={() => nav("post")}>
      <div className="cm-post-head">
        <a onClick={(e) => { e.stopPropagation(); goProfile(m.handle); }} style={{ cursor: "pointer" }}>
          <Avatar name={m.name} tier={m.tier} size={48} />
        </a>
        <div className="cm-post-meta">
          <div className="cm-post-author">
            <span className="cm-post-name">{m.name}</span>
            <TierLabel tier={m.tier} />
            {owned && <span className="cm-owned-pill"><Icon name="check" size={9} /> Owned</span>}
            <span className="cm-post-loc">· {time}</span>
          </div>
        </div>
        <button className="cm-icon-btn" onClick={(e) => e.stopPropagation()}><Icon name="more" size={16} /></button>
      </div>
      <div className="cm-post-body" dangerouslySetInnerHTML={{ __html: body }} />
      <div className="cm-post-actions" onClick={(e) => e.stopPropagation()}>
        <Reactions counts={reactions} />
        <button className="cm-react"><Icon name="message" size={14} /> {comments}</button>
        <div className="cm-react-spacer" />
        <button className="cm-react"><Icon name="bookmark" size={14} /></button>
      </div>
    </article>
  );

  const releaseHeader = (
    <div className="cm-release-header">
      <div className="cm-release-header-cover">
        <div className="cm-release-cover is-vinyl" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 4 }} />
      </div>
      <div className="cm-release-header-info">
        <div className="cm-release-header-eyebrow">LP · Vinyl on Demand · ZKO 005</div>
        <h1 className="cm-release-header-title">Elemental Music</h1>
        <div className="cm-release-header-artist">Z'EV</div>
        <dl className="cm-release-header-meta">
          <dt>Original</dt><dd>1985</dd>
          <dt>Re-Issue</dt><dd>VOD 2019</dd>
          <dt>Format</dt><dd>LP, 180g</dd>
          <dt>Catalog</dt><dd>ZKO 005 / VOD 137</dd>
          <dt>Pressing</dt><dd>Limited 500 (numbered)</dd>
          <dt>Master</dt><dd>Cosey, 2018</dd>
        </dl>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button className="cm-btn cm-btn-primary cm-btn-lg">Place Bid · €120</button>
          <button className="cm-btn cm-btn-outline cm-btn-lg">Add to Wantlist</button>
        </div>
        <div style={{ font: "400 12px var(--font-sans)", color: "var(--muted-foreground)" }}>
          Currently in Block #41 · ends in 2 days, 14:30 CET
        </div>
      </div>
    </div>
  );

  const releaseTabs = (
    <div className="cm-release-tabs">
      <button className="cm-profile-tab" type="button">Details</button>
      <button className="cm-profile-tab" type="button">Tracklist</button>
      <button className="cm-profile-tab" type="button">Inventory</button>
      <button className="cm-profile-tab is-active" type="button">
        Discussion <span className="count">12</span>
      </button>
    </div>
  );

  const tabBody = (
    <>
      <div className="cm-stats-strip">
        <div className="cm-stats-strip-item">
          <div className="num">4</div>
          <div className="label">Reviews</div>
        </div>
        <div className="cm-stats-strip-rule" />
        <div className="cm-stats-strip-item">
          <div className="num"><span className="star">★</span> 4.2</div>
          <div className="label">Avg Rating</div>
        </div>
        <div className="cm-stats-strip-rule" />
        <div className="cm-stats-strip-item is-link">
          <div className="num">23</div>
          <div className="label">Own This</div>
        </div>
        <div className="cm-stats-strip-rule" />
        <div className="cm-stats-strip-item is-link">
          <div className="num">47</div>
          <div className="label">Want This</div>
        </div>
        <div className="cm-stats-strip-rule" />
        <div className="cm-stats-strip-item">
          <div className="num">12</div>
          <div className="label">Discussions</div>
        </div>
      </div>

      <div className="cm-composer" style={{ marginBottom: 32 }}>
        <Avatar name="DiscoveredZkoIn1989" tier="gold" size={40} />
        <div style={{ flex: 1 }}>
          <textarea className="cm-composer-input" placeholder="Share your thoughts on this release…" style={{ minHeight: 36 }} />
        </div>
      </div>

      <div className="cm-page-eyebrow">
        <span className="cm-page-eyebrow-text">Latest Review</span>
        <span className="cm-page-eyebrow-rule" />
        <a className="cm-page-eyebrow-link">Show all 4 reviews →</a>
      </div>
      <div className="cm-post" style={{ marginBottom: 40 }}>
        <div className="cm-post-head">
          <Avatar name="MaurizioForever" tier="platinum" size={48} />
          <div className="cm-post-meta">
            <div className="cm-post-author">
              <span className="cm-post-name">MaurizioForever</span>
              <TierLabel tier="platinum" />
              <span className="cm-owned-pill"><Icon name="check" size={9} /> Owned</span>
            </div>
            <div className="cm-post-time">★★★★½ · vor 3 Tagen</div>
          </div>
        </div>
        <div className="cm-post-body">
          <em>„Cleaner-by-design — und das ist nicht abwertend gemeint."</em> Cosey's 2018er Master holt Details aus der A-Side, die ich auf meiner 1985er-Pressung erst nach drei Hörsitzungen mit anderen Kopfhörern bemerkt habe…
        </div>
      </div>

      <div className="cm-page-eyebrow">
        <span className="cm-page-eyebrow-text">12 Discussions</span>
        <span className="cm-page-eyebrow-rule" />
        <a className="cm-page-eyebrow-link">Sort: Most recent</a>
      </div>
      <div className="cm-feed is-spacious">
        {post(D.members.tape, "vor 6 Tagen",
          "Habe heute meine VOD-Re-Issue mit der Original-1985er verglichen. <strong>Side B Track 3</strong> hat im Original ein Tape-Saturation-Artefakt, das die Re-Issue sauberer presst — bewusste Entscheidung oder anderer Master?",
          true, { fire: 8 }, 4)}
        {post(D.members.zko, "vor 5 Tagen",
          '<span class="cm-comment-mention">@TapeUndergroundDe</span> — die Re-Issue läuft auf Cosey\'s neuem Master. Frank hatte das im Newsletter erwähnt. Original ist halt Original, aber die Re-Issue ist <em>cleaner-by-design</em>, nicht versehentlich.',
          true, { fire: 11, hundred: 3 }, 0)}
        {post(D.members.noise, "vor 9 Tagen",
          "Side A klingt auf der Re-Issue eindeutig wärmer. Hat jemand schon mit dem japanischen Promo-Cut von 1986 verglichen? Soll laut Cosey nur 30 Stück gepresst worden sein.",
          true, { eyes: 6 }, 2)}
        {post(D.members.prague, "vor 12 Tagen",
          "Erste Frage: ist die VOD-Re-Issue tauschsicher oder nur als Sammler-Objekt zu betrachten? Ich höre meine Platten regelmäßig, vermeide aber bewusst die wertvolleren.",
          false, { thanks: 2 }, 5)}
      </div>
    </>
  );

  if (mobile) {
    return (
      <div className="cm-screen is-mobile" data-screen-label="04 Release Mobile">
        <MobileHeader title="Catalog" />
        <div className="cm-container">
          {releaseHeader}
          <div style={{ overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px" }}>
            {releaseTabs}
          </div>
          <div style={{ paddingTop: 24 }}>{tabBody}</div>
        </div>
        <BottomTabs active="community" layout="default" />
      </div>
    );
  }

  return (
    <div className="cm-screen" data-screen-label="04 Release Desktop">
      <Header active="catalog" onNav={(k) => k === "community" ? nav("hub") : null} />
      <div className="cm-container-narrow">
        <div style={{ paddingTop: 24, font: "400 12px var(--font-sans)", color: "var(--muted-foreground)" }}>
          Catalog · Industrial · Z'EV ›
        </div>
        {releaseHeader}
        {releaseTabs}
        <div style={{ padding: "32px 0 80px" }}>{tabBody}</div>
      </div>
      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Screen 5 — Members Directory
// ─────────────────────────────────────────────────────────────
function MembersScreen({ nav, mobile }) {
  const memberList = [
    { ...D.members.frank, posts: 217, followers: "4.2k" },
    { ...D.members.mb, posts: 184, followers: 612, bio: "Maurizio Bianchi-Bibliographie. Milano. Sammelt Pressungen vor 1985." },
    { ...D.members.zko, posts: 127, followers: 218, bio: "Industrial & Tape-Underground seit den 90ern. Schwerpunkt Z'EV, Maurizio Bianchi, frühe ZKO." },
    { ...D.members.tape, posts: 84, followers: 142, bio: "Tape-Underground West-Deutschland. Vergleicht Pressungen, dokumentiert Inner-Sleeves." },
    { ...D.members.noise, posts: 76, followers: 98, bio: "Wiener Noise-Szene-Archiv. Garrard 401 + originale Stylus-Sammlung." },
    { ...D.members.prague, posts: 31, followers: 27, bio: "Industrial Prag, seit 2018 dabei. Boyd Rice / NON-Schwerpunkt." },
  ];

  const card = (m) => (
    <a className="cm-member-card" key={m.handle} onClick={() => nav("profile", { handle: m.handle })}>
      <div className="cm-member-card-head">
        <Avatar name={m.name} tier={m.tier} size={48} />
        <div className="cm-member-card-meta">
          <div className="cm-member-card-name">{m.name}</div>
          <div className="cm-member-card-handle">
            <TierLabel tier={m.tier} /> · {m.location}
          </div>
        </div>
        {m.tier !== "curator" && <button className="cm-btn cm-btn-outline cm-btn-sm" onClick={(e) => e.stopPropagation()}>Follow</button>}
      </div>
      {m.bio && <div className="cm-member-card-bio">{m.bio}</div>}
      <div className="cm-member-card-stats">
        <span><strong>{m.posts}</strong> posts</span>
        <span><strong>{m.followers}</strong> followers</span>
        {m.since && <span>seit {m.since}</span>}
      </div>
    </a>
  );

  const head = (
    <div className="cm-page-head">
      <h1>Members</h1>
      <p>{memberList.length}{memberList.length === 6 ? " of 1,847" : ""} collectors. Sorted by recent activity.</p>
    </div>
  );

  const toolbar = (
    <div className="cm-members-toolbar">
      <button className="cm-members-filter is-active">All <span className="count">1,847</span></button>
      <button className="cm-members-filter">◆ Platinum <span className="count">14</span></button>
      <button className="cm-members-filter">★ Gold <span className="count">82</span></button>
      <button className="cm-members-filter">★ Silver <span className="count">416</span></button>
      <button className="cm-members-filter">Bronze <span className="count">1,335</span></button>
      <div style={{ flex: 1 }} />
      <button className="cm-members-filter"><Icon name="filter" size={12} /> By location</button>
    </div>
  );

  if (mobile) {
    return (
      <div className="cm-screen is-mobile" data-screen-label="05 Members Mobile">
        <MobileHeader title="Members" />
        <MobileSubNav active="members" />
        <div className="cm-container">
          {head}
          <div style={{ overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px 16px" }}>
            <div className="cm-members-toolbar" style={{ width: "max-content", borderBottom: 0 }}>
              <button className="cm-members-filter is-active">All</button>
              <button className="cm-members-filter">◆ Platinum</button>
              <button className="cm-members-filter">★ Gold</button>
              <button className="cm-members-filter">★ Silver</button>
              <button className="cm-members-filter">Bronze</button>
            </div>
          </div>
          <div className="cm-members-grid" style={{ paddingBottom: 32 }}>
            {memberList.map(card)}
          </div>
        </div>
        <BottomTabs active="community" layout="default" />
      </div>
    );
  }

  return (
    <div className="cm-screen" data-screen-label="05 Members Desktop">
      <Header active="community" onNav={(k) => k === "community" ? nav("hub") : null} />
      <SubNav active="members" onNav={(k) => k === "feed" ? nav("hub") : null} />
      <div className="cm-container">
        {head}
        {toolbar}
        <div className="cm-members-grid" style={{ paddingBottom: 64 }}>
          {memberList.map(card)}
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compose modal
// ─────────────────────────────────────────────────────────────
function ComposeModal({ onClose }) {
  return (
    <div className="cm-modal-backdrop" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cm-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name="DiscoveredZkoIn1989" tier="gold" size={32} />
            <div>
              <div style={{ font: "600 13px var(--font-sans)" }}>DiscoveredZkoIn1989</div>
              <div style={{ font: "400 11px var(--font-sans)", color: "var(--muted-foreground)" }}>
                Posting to Community Feed
              </div>
            </div>
          </div>
          <button className="cm-icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <div className="cm-modal-body">
          <input className="cm-modal-title-input" placeholder="An optional title…" />
          <textarea className="cm-modal-input" placeholder="Share an acquisition, a question, a comparison. @release:1234 will embed a release card." />
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px dashed var(--border)", borderRadius: 8 }}>
            <Icon name="disc" size={16} />
            <span style={{ font: "500 12px var(--font-sans)", color: "var(--muted-foreground)" }}>
              Linked release: <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>Z'EV — Elemental Music</strong>
            </span>
            <button className="cm-icon-btn" style={{ marginLeft: "auto" }}><Icon name="close" size={14} /></button>
          </div>
          <div className="cm-modal-tags">
            <span style={{ font: "700 9px var(--font-sans)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)", marginRight: 4, alignSelf: "center" }}>Tags</span>
            <Tag name="zko" /><Tag name="archive-find" />
            <button className="cm-tag" style={{ borderStyle: "dashed", color: "var(--primary)" }}>+ Add tag</button>
          </div>
        </div>
        <div className="cm-modal-foot">
          <div className="cm-modal-tools">
            <button className="cm-composer-tool"><Icon name="bold" size={14} /></button>
            <button className="cm-composer-tool"><Icon name="italic" size={14} /></button>
            <button className="cm-composer-tool"><Icon name="link" size={14} /></button>
            <button className="cm-composer-tool"><Icon name="image" size={14} /></button>
            <button className="cm-composer-tool"><Icon name="at" size={14} /></button>
            <button className="cm-composer-tool"><Icon name="hash" size={14} /></button>
            <button className="cm-composer-tool"><Icon name="disc" size={14} /></button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cm-btn cm-btn-ghost cm-btn-sm">Save Draft</button>
            <button className="cm-btn cm-btn-primary">Post to Feed</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HubScreen, PostScreen, ProfileScreen, ReleaseScreen, MembersScreen, ComposeModal });
