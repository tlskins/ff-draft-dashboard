# Phase 14A visual reference

Status: human-approved design reference; implementation acceptance is still
pending.

`draft-desk-reference.html` is the repository-owned source of truth for the
Phase 14A visual-fidelity correction. `draft-desk-reference-1440x900.png` is
the corresponding exact CSS-viewport baseline.

The player names, ranks, projections, probabilities, roster contents, and
status copy are illustrative fixture data. They are not application defaults
or calculation requirements. The layout, density, hierarchy, shared player
identity treatment, color system, pane proportions, and dock composition are
the visual contract.

## Inspect the reference

Do not open the HTML with a `file://` URL. Some browser-control environments
block local files. Serve this directory over localhost instead:

```sh
python3 -m http.server 4173 \
  --bind 127.0.0.1 \
  --directory docs/design/phase14a
```

Then open:

```text
http://127.0.0.1:4173/draft-desk-reference.html
```

The reference has working controls for:

- Position versus ADP-round rankings;
- RB + WR versus QB + TE positional pairs;
- desktop Rankings, Profile, and Decision panes;
- mobile single-pane switching; and
- Current round, Your roster, and League needs dock modes.

Exercise the Position and ADP-round states and all three dock modes before
making product styling decisions.

## Fidelity workflow

1. Render the reference and the product fixture at the same exact CSS viewport.
2. Compare them side by side before changing product CSS.
3. Work in bounded checkpoints: shell/dock, rankings/profile, then insight.
4. Record `window.innerWidth` and `window.innerHeight` with every screenshot.
5. Do not claim visual convergence from overflow measurements alone.

The primary baseline is 1440 x 900. The compact desktop target is 1280 x 720.
Below 1280, Drafty uses its task-focused single-pane presentation.

## Required populated product fixture

Visual acceptance must use a deterministic mid-draft state containing:

- one focused player with profile, status, and historical data;
- populated RB + WR rankings with visible tiers;
- populated Best by ADP Round and target controls;
- six recent picks;
- a partially filled user roster and nonzero league needs;
- connected operational status; and
- a populated cross-position analysis surface with its existing chart evidence.

An empty first-pick screenshot is useful for fallback coverage but cannot prove
visual fidelity to this reference.
