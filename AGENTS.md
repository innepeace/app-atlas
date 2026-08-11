# AGENTS.md — App Atlas Collection Agent Handbook

> This file is for **all AI assistants** (Claude Code / Kiro / Cursor / Copilot / Windsurf, etc.).
> Before executing any collection, modification, or validation task in this directory, read this file in full.

---

## Project Identity

**App Atlas** is a "business map" for an iOS App — a purely static, data-driven web page that visualizes every screen's UI structure, interaction hotspots, business logic chains, and state transitions.

- **Atlas Repository (this directory)**: the current working directory
- **Target App Source (read-only reference)**: configured in `atlas.config.json` → `sourceProject`
- **Tech Stack**: zero npm runtime dependencies, no build step, native ES Modules (browser + Node)
- **Tests**: `node --test`
- **Validation**: `node tools/validate.mjs`

---

## Core References (Must Read)

| File | Content |
|------|---------|
| `rules.md` | **Rules Master**: all hard rules (preview port, hotspot collection, multi-tab system, prohibited operations) — must read on entry |
| `docs/CONVENTIONS.md` | **Collection Conventions**: text language, interaction coverage (INTERACTION-COVERAGE), logic depth (LOGIC-DEPTH) requirements |
| `data/components.json` | Component catalog; layout blocks may reference via `component` field |
| `data/modules/<module>/screens/<screenId>/manifest.json` | manifest schema example |
| `data/modules/<module>/screens/<screenId>/logic.md` | logic.md structure example |

**Before every collection task, read `rules.md` and `docs/CONVENTIONS.md`.** The former summarizes all hard rules; the latter defines minimum depth standards for logic.md.

---

## Collection Workflow

### Command Format

When the user says "collect module X" or "collect screen Y", execute the following workflow:

### Workflow

1. **Locate source**: In the target App source (path from `atlas.config.json` → `sourceProject`) find the corresponding module directory.
2. **Read VC/VM/View/Cell/Api source line by line**: search for `addTarget` / `rx.tap` / `didSelect` / `addGestureRecognizer` / `Router.open` / login gates / feature flags, etc.
3. **Produce files**:
   - `data/modules/<module>/screens/<screenId>/manifest.json`
   - `data/modules/<module>/screens/<screenId>/logic.md`
4. **Update registry**: set `status` → `collected` in `data/registry.json` for the screen; fill `updatedAt` / `sourceRev`; update module `coverage`.
5. **Validate**:
   - `node tools/validate.mjs` — must pass
   - `node --test` — must be all green
6. **Dangling goto handling**: if goto/links reference a screen that doesn't exist yet, add an `uncollected` skeleton entry in the registry.

### Interruptible Principle

- Uncollected screens use `status: "uncollected"` as placeholder.
- If logic.md cannot be completed, add a "## To Be Completed" section listing outstanding items honestly.
- You can collect one screen or one module at a time, then continue later.

---

## manifest.json Specification

```jsonc
{
  "screen": { "id": "", "module": "", "title": "", "route": "", "description": "" },
  "source": { "vc": "", "vm": null, "files": [], "rev": "<git short SHA>" },
  // image field is optional (only present after screenshot)
  "layout": [ /* type/id/label/note/component/goto/children */ ],
  "states": [ /* id/label/note/layout?/hotspots?/viewId? */ ],
  "hotspots": [ /* id/label/kind/logic_ref/rect?/branches */ ],
  "links": { "prev": [], "next": [] },
  "status": "collected"
}
```

**Key Constraints**:
- `hotspot.logic_ref: "#xxx"` must exactly match the `### xxx` anchor in logic.md.
- Layout block types: `navbar` / `tabbar` / `segment` / `list` / `cell` / `card` / `input` / `button` / `image` / `toast-anchor` / `spacer` / `banner` / `selector` / `toolbar` / `header` / `webview` / `dialog` or custom.
- `source.rev` should be the target App's current HEAD short SHA (run `git -C <sourceProject> rev-parse --short HEAD`).

---

## logic.md Specification

Minimum structure (LOGIC-DEPTH hard requirement):

```markdown
## Overview
VC class name + base class + entry point + core interactions + key callbacks

## Main Flow
(mermaid flowchart)

## Data Sources (API / Field Parsing)
(table: data / source / key parameters / field parsing)

## Branch Logic
### hotspot-anchor-1
Trigger chain: control(real name) → method → condition → result
### hotspot-anchor-2
...

## Business Rules
- Invariants, constraints, numeric values, gates...

## Related Code
| File | Responsibility |

## To Be Completed
- Honestly list unverified / pending items
```

**Depth Requirements**:
- Trigger chains must be specific to method/control names
- Gates must specify conditions (login / feature flags / market / account state)
- Never omit specific values (maxCount, character limits, etc.)
- Reference real localization keys where applicable
- Distinguish "confirmed (VC line xxx)" from "pending verification"
- Explain row-body vs inline sub-elements separately

---

## Text Language

- **UI labels**: use the App's real displayed text (from localization resources / screenshots)
- **Business explanations** (logic.md / note): use your preferred documentation language
- **Code names / fields / APIs / routes**: keep original English as-is

---

## Component Discovery

When collecting, if you discover new **library-level reusable UI components** (navbar / tabbar / segment / quote cell / index bar / announcement banner, etc.), add them to `data/components.json` and record the first `screenId` where they appear in the `seenIn` field.

---

## Screenshots (opt-in)

**Screenshots are a manual on-demand action; never take screenshots automatically.** Only execute when the user explicitly says "screenshot":

```bash
xcrun simctl io booted screenshot <path>
```

Capture the current booted simulator screen, save to the current Atlas screen data directory (`data/modules/<module>/screens/<screenId>/screenshot-<viewId>.png`).

---

## Dangling Goto Handling

`node tools/validate.mjs` checks that hotspot `branches[].goto` and `links.prev/next` reference screenIds that exist in the registry. If they point to uncollected screens:

1. Add a `status: "uncollected"` skeleton entry in `data/registry.json` under the appropriate module (only needs id/title/route/status fields).
2. Re-run validate until it passes.
3. **Do not** remove correct goto references just to pass validation.

---

## Prohibited Operations

| Prohibited | Reason |
|-----------|--------|
| `git commit` / `git add` | User commits manually |
| Modify `lib/*.mjs` / `web/*.mjs` / `tools/*.mjs` | Unless the task explicitly requires changing render/tool code |
| Fabricate API fields | Mark fields not found in source as "pending API verification" |
| Skip INTERACTION-COVERAGE | Every interactive element on each screen must be checked |
| Auto/unsolicited screenshots | Only when user explicitly says "screenshot" |
| Change the preview port | Fixed at **37421**; do not change (see "Local Preview Service" section) |
| Arbitrarily kill / restart / start preview service | Only when user explicitly requests "restart/start service"; must reuse port 37421 |

---

## Tool Commands

| Purpose | Command |
|---------|---------|
| Validate manifest + registry | `node tools/validate.mjs` |
| Run tests | `node --test` |
| Local preview service | `node tools/serve.mjs 37421` (fixed port 37421, see below) |
| Staleness detection (dry run) | `node tools/sync.mjs` |
| Write stale markers | `node tools/sync.mjs --write` |

---

## Local Preview Service (Fixed Port 37421)

> **Port is fixed at 37421. No AI assistant may change it.** 37421 is not a commonly used dev port (avoids 8080/8000/3000/5000/8888 and the 809x range), placing it in a low-conflict zone.

### Start Options

| Scenario | Command (run in atlas directory) | Access URL |
|----------|----------------------------------|-----------|
| Static preview (default) | `python3 -m http.server 37421` | `http://localhost:37421/web/` |
| With "AI collect" capability | `node tools/serve.mjs 37421` | `http://127.0.0.1:37421/` |

- `tools/serve.mjs` takes the port from the first CLI argument (`Number(process.argv[2]) || 8080`). **You must explicitly pass `37421`** when starting, otherwise it defaults to 8080.
- `serve.mjs` only listens on `127.0.0.1` — a local dev tool, not exposed to the network.

### Start/Stop Rules (Hard)

1. **Do not proactively kill / restart / start the service.** Only when the user explicitly says "restart service / start service".
2. Before restarting, check process and port usage:
   ```bash
   ps aux | grep -E 'serve\.mjs|http\.server' | grep -v grep
   lsof -iTCP:37421 -sTCP:LISTEN -n -P
   ```
3. Always **reuse port 37421** when restarting — do not switch ports to "avoid conflicts". Release 37421 first, then restart on it.
4. **The static server reads from disk on every request, no caching.** If the user "can't see updates", troubleshoot browser cache first (hard refresh `Cmd+Shift+R` / incognito window), do not blindly restart.

---

## Common Collection Patterns

### Single Module Collection

```
User: collect the ETF module
AI:
  1. Locate <sourceProject>/Modules/ETF/
  2. Read registry to determine which screens exist
  3. Read source for each screen, produce manifest + logic
  4. Update registry, run validate + test
```

### Single Screen Supplement

```
User: supplement the fundDetail logic.md
AI:
  1. Read existing manifest to confirm hotspot list
  2. Go back to source to fill out logic.md hotspot sections
  3. Run validate
```

### Batch Collection

```
User: collect fund, ipo, order modules
AI: can parallelize (modules don't share files); run unified registry update + validate at end
```

---

## Directory Structure

```
app-atlas/
├── data/
│   ├── registry.json          # Full screen registry
│   ├── components.json        # Reusable component catalog
│   └── modules/<module>/screens/<screenId>/
│       ├── manifest.json      # UI structure + hotspots + states
│       └── logic.md           # Business logic documentation
├── lib/                       # Pure logic (browser+Node shared)
├── web/                       # Frontend UI (HTML/CSS/JS)
├── tools/                     # CLI tools (serve/validate/sync/screenshot)
├── test/                      # node --test test cases
└── docs/
    ├── CONVENTIONS.md          # Collection conventions (must read)
    └── SYNC.md                 # Source sync documentation
```
