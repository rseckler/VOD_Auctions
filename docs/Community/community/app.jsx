/* global React, ReactDOM, window */
// VOD Community — main app: design canvas wrapping all artboards.

const { useState, useCallback } = React;
const {
  DesignCanvas, DCSection, DCArtboard, DCPostIt,
  TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakToggle,
  HubScreen, PostScreen, ProfileScreen, ReleaseScreen, MembersScreen, ComposeModal,
} = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "hubLayout": "2col",
  "density": "spacious",
  "frankTreatment": "distinct",
  "tierProminence": "both",
  "mobileTabs": "default",
  "showCompose": false
}/*EDITMODE-END*/;

// One Artboard wraps one screen. Local nav state per artboard so each
// can be navigated independently.
function ArtboardScreen({ initialView, initialParams, mobile, tweaks, label }) {
  const [view, setView] = useState(initialView);
  const [params, setParams] = useState(initialParams || {});
  const [composeOpen, setComposeOpen] = useState(false);

  const nav = useCallback((v, p) => {
    setView(v);
    setParams(p || {});
    // scroll the screen back to top
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-ab="${label}"] .cm-screen`);
      if (el) el.scrollTop = 0;
    });
  }, [label]);

  const openModal = () => setComposeOpen(true);
  const closeModal = () => setComposeOpen(false);

  let screen;
  switch (view) {
    case "post":
      screen = <PostScreen nav={nav} mobile={mobile} tweaks={tweaks} />;
      break;
    case "profile":
      screen = <ProfileScreen nav={nav} mobile={mobile} params={params} />;
      break;
    case "release":
      screen = <ReleaseScreen nav={nav} mobile={mobile} />;
      break;
    case "members":
      screen = <MembersScreen nav={nav} mobile={mobile} />;
      break;
    case "hub":
    default:
      screen = (
        <HubScreen
          nav={nav}
          mobile={mobile}
          tweaks={tweaks}
          openModal={openModal}
          mobileTabsLayout={tweaks.mobileTabs}
        />
      );
  }

  return (
    <div data-ab={label} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {screen}
      {composeOpen && <ComposeModal onClose={closeModal} />}
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // tweak-driven body classes for cosmetics that can't be inlined
  React.useEffect(() => {
    document.body.dataset.frank = t.frankTreatment;
    document.body.dataset.tier = t.tierProminence;
    document.body.dataset.density = t.density;
  }, [t.frankTreatment, t.tierProminence, t.density]);

  // Desktop = 1440x900 viewport; Mobile = 390x844 (iPhone-ish)
  const D_W = 1440, D_H = 900;
  const M_W = 390, M_H = 844;

  const screens = [
    { id: "hub", label: "01 · Community Hub", view: "hub" },
    { id: "post", label: "02 · Single Post (Frank Editorial)", view: "post" },
    { id: "profile", label: "03 · Member Profile", view: "profile", params: { handle: "DiscoveredZkoIn1989" } },
    { id: "release", label: "04 · Catalog · Discussion Tab", view: "release" },
    { id: "members", label: "05 · Members Directory", view: "members" },
  ];

  return (
    <>
      <DesignCanvas>
        <DCSection
          id="desktop"
          title="Desktop · 1440 × 900"
          subtitle="The five Community screens, full-bleed. Click anywhere to navigate — feed cards open posts, member names open profiles, sub-nav routes work."
        >
          {screens.map((s) => (
            <DCArtboard key={s.id} id={s.id} label={s.label} width={D_W} height={D_H}>
              <ArtboardScreen
                initialView={s.view}
                initialParams={s.params}
                mobile={false}
                tweaks={t}
                label={`d-${s.id}`}
              />
            </DCArtboard>
          ))}
        </DCSection>

        <DCSection
          id="mobile"
          title="Mobile · 390 × 844"
          subtitle="Same hierarchy, condensed for one-thumb. Bottom-tab layout is tweakable."
        >
          {screens.map((s) => (
            <DCArtboard key={s.id} id={`m-${s.id}`} label={s.label} width={M_W} height={M_H}>
              <ArtboardScreen
                initialView={s.view}
                initialParams={s.params}
                mobile={true}
                tweaks={t}
                label={`m-${s.id}`}
              />
            </DCArtboard>
          ))}
        </DCSection>

        <DCSection
          id="explorations"
          title="Explorations"
          subtitle="Compose modal trigger state · alternative Hub layouts · mobile bottom-tab variations."
        >
          <DCArtboard id="compose" label="Compose Modal · Trigger State" width={D_W} height={D_H}>
            <ArtboardScreen
              initialView="hub"
              mobile={false}
              tweaks={{ ...t, _forceCompose: true }}
              label="x-compose"
            />
            <ForceCompose target="x-compose" />
          </DCArtboard>

          <DCArtboard id="hub-1col" label="Hub · Single-column reading mode" width={D_W} height={D_H}>
            <ArtboardScreen
              initialView="hub"
              mobile={false}
              tweaks={{ ...t, hubLayout: "1col" }}
              label="x-1col"
            />
          </DCArtboard>

          <DCArtboard id="hub-3col" label="Hub · Three-column with rail" width={D_W} height={D_H}>
            <ArtboardScreen
              initialView="hub"
              mobile={false}
              tweaks={{ ...t, hubLayout: "3col" }}
              label="x-3col"
            />
          </DCArtboard>

          <DCArtboard id="m-tabs-fab" label="Mobile · Center-FAB tab bar" width={M_W} height={M_H}>
            <ArtboardScreen
              initialView="hub"
              mobile={true}
              tweaks={{ ...t, mobileTabs: "centerFab" }}
              label="x-tabsfab"
            />
          </DCArtboard>

          <DCArtboard id="m-tabs-min" label="Mobile · 4-slot minimal tabs" width={M_W} height={M_H}>
            <ArtboardScreen
              initialView="hub"
              mobile={true}
              tweaks={{ ...t, mobileTabs: "minimal" }}
              label="x-tabsmin"
            />
          </DCArtboard>

          <DCArtboard id="profile-curator" label="Profile · Frank (Curator variant)" width={D_W} height={D_H}>
            <ArtboardScreen
              initialView="profile"
              initialParams={{ handle: "FrankMaier" }}
              mobile={false}
              tweaks={t}
              label="x-curator"
            />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Community · Tweaks" noDeckControls={true}>
        <TweakSection label="Hub layout">
          <TweakRadio
            label="Layout"
            value={t.hubLayout}
            options={[
              { value: "2col", label: "2-col (default)" },
              { value: "3col", label: "3-col + rail" },
              { value: "1col", label: "Single column" },
            ]}
            onChange={(v) => setTweak("hubLayout", v)}
          />
          <TweakRadio
            label="Feed density"
            value={t.density}
            options={[
              { value: "spacious", label: "Spacious" },
              { value: "medium", label: "Medium" },
              { value: "dense", label: "Dense" },
            ]}
            onChange={(v) => setTweak("density", v)}
          />
        </TweakSection>

        <TweakSection label="Frank · editorial treatment">
          <TweakRadio
            label="Distinctness"
            value={t.frankTreatment}
            options={[
              { value: "distinct", label: "Distinct" },
              { value: "subtle", label: "Subtle" },
              { value: "uniform", label: "Uniform" },
            ]}
            onChange={(v) => setTweak("frankTreatment", v)}
          />
        </TweakSection>

        <TweakSection label="Tier badges">
          <TweakRadio
            label="Prominence"
            value={t.tierProminence}
            options={[
              { value: "both", label: "Pin + label" },
              { value: "label", label: "Label only" },
              { value: "pin", label: "Pin only" },
            ]}
            onChange={(v) => setTweak("tierProminence", v)}
          />
        </TweakSection>

        <TweakSection label="Mobile bottom tabs">
          <TweakSelect
            label="Layout"
            value={t.mobileTabs}
            options={[
              { value: "default", label: "5-slot (Home / Auctions / Community / Cart / Account)" },
              { value: "centerFab", label: "Center FAB (Compose lifted to center)" },
              { value: "minimal", label: "4-slot minimal" },
            ]}
            onChange={(v) => setTweak("mobileTabs", v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// Helper that opens the compose modal in the artboard labelled `target`.
// Mounts an effect that finds the FAB inside that artboard and clicks it.
function ForceCompose({ target }) {
  React.useEffect(() => {
    const id = setTimeout(() => {
      const ab = document.querySelector(`[data-ab="${target}"]`);
      if (!ab) return;
      const fab = ab.querySelector(".cm-fab");
      if (fab) fab.click();
    }, 200);
    return () => clearTimeout(id);
  }, [target]);
  return null;
}

// Two body-level CSS rules that read from the data attrs we set above.
// Frank treatment + tier prominence are pure visual tweaks — easier to switch
// here than to thread through every component as props.
const liveStyles = document.createElement("style");
liveStyles.textContent = `
  /* Frank · subtle = no gold rule, no gold radial, just curator badge */
  body[data-frank="subtle"] .cm-editorial { background: var(--card); border-color: var(--border); }
  body[data-frank="subtle"] .cm-editorial::before { display: none; }
  body[data-frank="subtle"] .cm-editorial-eyebrow { color: var(--muted-foreground); }
  body[data-frank="subtle"] .cm-editorial-eyebrow > span:first-child { color: var(--primary); }
  body[data-frank="subtle"] .cm-editorial-title { font-size: 22px; }
  body[data-frank="subtle"] .cm-editorial-foot { background: transparent; }

  /* Frank · uniform = render Frank in the regular post chrome */
  body[data-frank="uniform"] .cm-editorial {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 24px 26px;
  }
  body[data-frank="uniform"] .cm-editorial::before { display: none; }
  body[data-frank="uniform"] .cm-editorial-eyebrow { padding: 0; margin-bottom: 8px; }
  body[data-frank="uniform"] .cm-editorial-body { padding: 0; }
  body[data-frank="uniform"] .cm-editorial-title { font-size: 18px; font-family: var(--font-sans); font-weight: 600; line-height: 1.35; margin-bottom: 8px; }
  body[data-frank="uniform"] .cm-editorial-lede { font-size: 14px; line-height: 1.55; }
  body[data-frank="uniform"] .cm-editorial-foot { padding: 14px 0 0; margin-top: 14px; background: transparent; border-top: 1px solid var(--fg-04); }

  /* Tier prominence */
  body[data-tier="label"] .cm-avatar-pin { display: none; }
  body[data-tier="label"] .cm-avatar.tier-gold .cm-avatar-inner,
  body[data-tier="label"] .cm-avatar.tier-platinum .cm-avatar-inner,
  body[data-tier="label"] .cm-avatar.tier-silver .cm-avatar-inner,
  body[data-tier="label"] .cm-avatar.tier-curator .cm-avatar-inner {
    box-shadow: inset 0 0 0 1px var(--fg-12);
  }
  body[data-tier="pin"] .cm-tier-label { display: none; }
  /* keep curator label always */
  body[data-tier="pin"] .cm-tier-label.is-curator { display: inline-flex; }
  body[data-tier="pin"] .cm-profile-tier-text { display: inline-flex; }
`;
document.head.appendChild(liveStyles);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
