---
name: design-mihoyo-ui
description: "Design, implement, or review original web interfaces informed by miHoYo, HoYoverse, and Honkai: Star Rail official web patterns. Use when a user requests miHoYo/HoYoverse/HSR visual styling, a cinematic game website, a polished game-operations dashboard, a launch-command interface, or a restyle that should combine premium game presentation with usable product UI."
---

# Design miHoYo-Informed UI

Create an original interface with a cinematic brand shell and a disciplined product core. Preserve the user's product hierarchy; borrow design principles, never official artwork, logos, proprietary fonts, or exact page compositions.

## Start with evidence

Read [references/observed-patterns.md](references/observed-patterns.md) before choosing a direction. If the task needs current fidelity and internet access is available, re-check the relevant official site because campaigns and product pages change frequently.

State which mode drives the design:

- **Technology brand:** Use miHoYo corporate restraint—dark fields, oversized typography, cyan signal accents, and minimal controls.
- **Global portfolio:** Use HoYoverse structure—fixed dark navigation, immersive hero media, clear editorial grids, and blue active states.
- **Star Rail narrative:** Use full-bleed cosmic imagery, indigo panels, fine gold frames, clipped geometry, star/rail motifs, and asymmetric collage.
- **Operational product:** Use a restrained fusion. Apply the narrative language to the shell, priority event, and major transitions; keep tables, filters, evidence, and decisions utilitarian.

Default to **Technology brand** unless the user explicitly chooses another mode. For dashboards and internal tools, keep the technology-brand shell while applying the operational-product rules to dense data and decision surfaces.

## Build the visual system

Create project-specific tokens before components. Use this original working palette as a starting point, then tune it to the content:

```css
:root {
  --void-950: #080a14;
  --rail-900: #15182f;
  --rail-800: #24264a;
  --nebula-500: #7567c9;
  --signal-400: #67d8f2;
  --starlight-50: #f7f5fc;
  --antique-400: #c8ad72;
  --risk-500: #df6477;
}
```

Use color by role:

- Reserve cyan for active navigation, live states, and system intelligence.
- Reserve antique gold for hierarchy, provenance, selected narrative objects, and fine framing.
- Use violet as atmosphere or secondary emphasis, not every surface.
- Keep evidence and long-form content on quiet near-white or deep-navy surfaces.
- Use red only for actionable risk; never make ordinary decoration look like an alert.

Choose open or licensed substitutes instead of proprietary site fonts:

- Display Latin: `Barlow Condensed`, `Oxanium`, or another technical condensed sans.
- Body Latin: `Space Grotesk` or a readable humanist sans.
- Chinese: `Noto Sans SC` / `Source Han Sans SC`.
- Japanese: `Noto Sans JP` / `Source Han Sans JP`.
- Data: `IBM Plex Mono` or tabular numerals from the body family.

Use uppercase Latin sparingly for section labels and system states. Keep Chinese and Japanese labels in natural case and add tracking only when readability survives.

## Compose the page

Make the hero communicate the product's world and its single job. For an operational UI, let the highest-priority event or live global state be the hero—not a decorative marketing slogan.

Use this hierarchy:

1. Place a slim persistent navigation layer over or beside the scene.
2. Give one dominant object 40–60% of the first viewport.
3. Anchor secondary status, Agent state, or carousel controls along one edge.
4. Transition from cinematic context into calmer evidence and action surfaces.
5. End with a clear human decision or next monitoring state.

Prefer asymmetric composition. Balance a large visual or event core with a narrower intelligence rail. Avoid generic equal-width card grids in the first viewport.

For dense dashboards, use the pattern:

```text
┌──────── global status / version phase ─────────────────────┐
│ event stream │ dominant incident / orbit │ agent rail      │
├───────────────┴───────────────────────────┴─────────────────┤
│ evidence, regional comparison, simulation, or decision     │
└──────────────── human approval / next review ──────────────┘
```

## Shape components

- Use 1px rules, offset corners, small gold nodes, and occasional clipped panels to imply rail hardware or navigational instruments.
- Limit clipping to hero frames, selected states, and decision cards. Keep text-heavy surfaces rectangular.
- Use 6–12px radii for product surfaces; avoid turning every element into a pill.
- Build active tabs with an underline, notch, glow, or moving rail marker rather than a filled rounded rectangle.
- Use ghost outline buttons for exploration and solid high-contrast buttons for approval or deployment.
- Give selected characters, regions, or scenarios a portrait/medallion or compact emblem only when it conveys identity.
- Pair large imagery with small structured labels: region, version phase, evidence count, confidence, and last update.
- Place decorative stars, diamonds, scanlines, or grain on pseudo-elements so they do not pollute semantic markup.

Keep ornament subordinate to data. If a border, flare, or pattern competes with a risk value or action button, remove it.

## Direct imagery

Use user-provided, licensed, or newly generated imagery. Prefer one strong full-bleed composition with layered foreground and restrained atmospheric texture over a collage of unrelated game screenshots.

When no hero art is available, create the mood with original abstract materials:

- orbital paths and route lines;
- soft nebula fields;
- paper-white map cutouts;
- glassy indigo instrument panels;
- sparse star points and rail ticks.

Do not download or bundle official character art, logos, screenshots, or embedded fonts. Do not imply that the result is an official miHoYo or HoYoverse product.

## Choreograph motion

Spend motion on one coordinated moment:

- Stage the hero, title, and primary status on entry.
- Use slow parallax or drift only for atmospheric layers.
- Use 160–240ms transitions for controls and 500–800ms transitions for scene changes.
- Use directional wipes, rail movement, or masked reveals instead of indiscriminate fades.
- Stop ambient motion when the tab is hidden when practical.
- Honor `prefers-reduced-motion` and keep every workflow usable without animation.

## Adapt across devices

- Preserve the dominant event and decision action on mobile; collapse supporting rails below them.
- Replace wide orbit diagrams with a vertical event path or swipeable region strip.
- Keep controls at least 44px in touch dimension.
- Avoid fixed pixel canvases and horizontal overflow.
- Test Chinese, English, and Japanese strings because expansion and line breaking differ.
- Keep text contrast at WCAG AA or better, including over artwork.

## Review before delivery

Check all of the following:

- The page has one unmistakable focal point.
- The brand shell feels cinematic while core workflows stay easy to scan.
- Cyan, gold, violet, and red each have distinct semantic roles.
- Ornament encodes hierarchy or state instead of filling space.
- The layout remains useful with background media disabled.
- Keyboard focus is visible and navigation order is logical.
- Reduced motion, mobile widths, and multilingual copy work.
- No official asset, logo, font, or exact composition was copied without permission.
- The result does not claim official affiliation.
