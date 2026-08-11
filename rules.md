# rules.md — App Atlas Rules Master

> This file **summarizes all hard rules for App Atlas** and serves as the rule index and supplement to `AGENTS.md` / `docs/CONVENTIONS.md`.
> Any AI assistant (Claude Code / Kiro / Cursor / Copilot, etc.) entering this directory must read this file in addition to `AGENTS.md`.
> If rules conflict, the stricter one prevails; see referenced documents for details.

---

## 0. Rule Sources & Priority

| Level | File | Purpose |
|-------|------|---------|
| Operations Handbook | `AGENTS.md` | Collection workflow, directory structure, prohibited operations, preview service |
| Collection Conventions | `docs/CONVENTIONS.md` | Text language, INTERACTION-COVERAGE, LOGIC-DEPTH |
| **Rules Master** | `rules.md` (this file) | Summarizes all rules, including hotspot collection rules |

---

## 1. Local Preview Service (Fixed Port 37421)

- Preview port is **fixed at 37421**. No assistant may change it (avoids 8080/8000/3000/5000/8888 and the 809x range).
- **Do not proactively kill / restart / start the service.** Only when the user explicitly says "restart/start service", and must reuse 37421.
- The static server reads from disk on every request, no caching. If the user "can't see updates", troubleshoot browser cache first (hard refresh / incognito window) — do not blindly restart.
- Access URL: `http://localhost:37421/web/`.
- See `AGENTS.md` section "Local Preview Service (Fixed Port 37421)" for details.

---

## 2. Screenshots (opt-in)

- **Never take screenshots automatically.** Only execute `xcrun simctl io booted screenshot <path>` when the user explicitly says "screenshot".
- Save screenshots to the current screen's data directory: `data/modules/<module>/screens/<screenId>/screenshot-<viewId>.png`.
- **New or replaced screenshot → must auto-rescan hotspots** (see §3.2 trigger rule) — no need for the user to remind again.

---

## 3. Hotspot Collection — Two Independent Mechanisms

Hotspots have **wireframe hotspots** and **screenshot hotspots** as two independent positioning mechanisms. Both are independent; a screen isn't complete without both.

### 3.1 Wireframe Hotspots (Rule A: Structural, No Coordinates)

> **Principle: Wireframe hotspots do not depend on any screenshot or pixel coordinates. They are structural and must always be functional.**

- **Implementation**: layout blocks and hotspots are bound via **block id ↔ hotspot association**; when rendered, the block itself becomes a clickable hotspot that triggers branch logic (popup / goto).
- Layout blocks support **recursive `children`**; child blocks (buttons/cells) also render individually and can be associated with hotspots.
- **Independent of screenshots**: even if a screen has no screenshots, wireframe hotspots must be clickable, navigable, and able to trigger branches.
- **Collection requirement**: when collecting/organizing a screen, you must establish `block ↔ hotspot` associations for all interactive layout blocks, ensuring wireframe hotspot completeness; you must not leave wireframe hotspots empty citing "no screenshot".
- Hotspots that cannot map to a specific block (pure gestures like pull-to-refresh; or secondary actions) go into the "Other Triggers" list beside the screenshot.

### 3.2 Screenshot Hotspots (rect: Per-View Percentage Coordinates)

- Each `view`'s `hotspots` **only includes controls actually visible in that screenshot**, each with percentage coordinate box `rect: { x, y, w, h }` (relative to image width/height as %).
- **Different chrome layouts have different coordinates; never reuse coordinates across views.** For example, a detail page may have different layouts:
  - Expanded header (large price + chart, segment below)
  - Collapsed header (price inline with nav bar, segment above)
  - Modal overlay (sheet covering the page)
  - Fullscreen (landscape chart + separate bottom toolbar)
- Pure gesture hotspots (e.g., pull-to-refresh) have no rect; list them in the "Other Triggers" section.

#### Auto-Rescan Trigger Rule (Hard)

> **Trigger condition**: Any time a `screenshot-*.png` is **added or replaced** in `data/modules/<module>/screens/<screenId>/` (whether via `serve.mjs` `/api/view`, CLI, or manual copy).

- The responsible AI assistant must **proactively complete** the hotspot rect collection/verification for that view in the same turn: examine the new screenshot, determine percentage coordinate boxes for each control, write to the corresponding `view.hotspots[].rect`.
- **Do not wait for the user to remind you**; "new screenshot = immediately rescan hotspots" is the default action.
- After collection, run `node tools/validate.mjs` + `node --test` to ensure all green.

---

## 4. Multi-Tab Screenshot System (Second-Level Tab Grouping, Universal)

> **Any screen with multiple tabs must use this system; do not mix multiple screenshots flat together.**

- Data model: manifest **top-level `views` array**, each view has fields:
  `id` (unique), `tab` (owning tab name), `primary` (optional, marks main image), `label` (variant name within tab), `kind`, `file`, `hotspots`.
- Group rendering: views with the same `tab` group together; within a group, the one marked `primary:true` is the main image (otherwise the first).
  - First row tab chips: main image groups get a "primary" badge; multi-variant groups get a count badge.
  - Second row variant strip: only appears when the current tab has multiple screenshots.
- Main `image.file` syncs to point at the `primary` view.
- Compatibility: old data without `tab` field degrades to a flat switcher; data with only `image.file` and no `views` synthesizes a single default view.
- Pure logic in `lib/screenshot.mjs` (`normalizeViews` / `groupViews` / `defaultView`); rendering in `web/render.mjs` (`renderViewSwitcher`).

---

## 5. manifest / logic.md / registry (References AGENTS.md & CONVENTIONS.md)

- `hotspot.logic_ref: "#xxx"` must exactly match the `### xxx` anchor in logic.md.
- `source.rev` should be the target App's current HEAD short SHA.
- After collection, update `data/registry.json`: `status` / `updatedAt` / `sourceRev` and module `coverage`.
- Dangling goto: when pointing to an uncollected screen, add a `status:"uncollected"` skeleton entry in registry; never delete a correct goto.
- Text: UI uses the App's real displayed text; business explanations use your documentation language; code names/fields/APIs/routes keep original English.

---

## 6. Validation & Tests (Must Run After Every Change)

| Purpose | Command | Requirement |
|---------|---------|-------------|
| Validate manifest + registry | `node tools/validate.mjs` | Must pass |
| Run tests | `node --test` | Must be all green |

---

## 7. Prohibited Operations (Summary; see AGENTS.md for details)

| Prohibited | Reason |
|-----------|--------|
| `git commit` / `git add` | User commits manually |
| Change preview port / arbitrarily start/stop service | Port fixed at 37421; no start/stop unless explicitly requested |
| Auto/unsolicited screenshots | Only when user explicitly says "screenshot" |
| Reuse screenshot hotspot coordinates across views | Different layouts have different coordinates; must collect per-view |
| Leave wireframe hotspots empty citing "no screenshot" | Wireframe hotspots are structural, no coordinates needed; must always be functional |
| Have new screenshot but wait for user to prompt rescan | New screenshot = immediately auto-rescan hotspots |
| Fabricate API fields | Mark fields not found in source as "pending API verification" |
