# App Atlas Collection & Display Conventions

Conventions for continuously collecting business logic / UI from the target App. Read this file before organizing any new screen.

## Text Language (LOCALIZATION)

- **UI-visible labels** (column headers, buttons, tabs, section names): use the App's real displayed text as it appears on screen (from localization resources / screenshots).
- **Business logic explanations** (logic.md, `note` fields): use your preferred documentation language.
- **Code names / fields / APIs / route constants**: keep original English as-is.

## Collection Flow (Interruptible, Resumable, Incrementally Updatable)

1. Pick a screen, read its VC/VM/Cell/Api source code.
2. Produce `data/modules/<module>/screens/<screenId>/manifest.json` + `logic.md`.
3. Unfinished positions use `status: "uncollected"` placeholder, displaying "uncollected / unorganized".
4. When reusing underlying components, check `data/components.json` (see component catalog).
5. Run `node --test` and `node tools/validate.mjs` to validate before updating registry.

## All Clickable / Interactive Elements Must Be Enumerated (INTERACTION-COVERAGE)

When collecting each screen, you must enumerate **all clickable, long-pressable, and interactive** elements, registering each as a `hotspot` (with `rect` if screenshot position is available, otherwise in the side list), or explicitly marking "uncollected". You must not only collect the obvious main buttons while missing secondary interactions. Enumeration scope must cover at least:

- **Buttons / Controls**: UIButton, UIBarButtonItem, navigation bar and toolbar buttons, floating buttons (top-right/bottom-right), switches/segmented controls (UISegmentedControl).
- **Custom Components**: category views, project-internal clickable views/cards, `addTarget`/closure callbacks, views bound with `addGestureRecognizer`.
- **List Cells**: `UITableViewCell` / `UICollectionViewCell` `didSelectRow`/`didSelect`, plus sub-buttons within cells, right-side accessories, icon columns.
- **ListKit**: IGListKit / custom list kit section/cell taps, header/footer interactions.
- **Gestures**: tap / longPress / swipe (swipe actions / custom swipe menus) / pan and other `UIGestureRecognizer`.
- **Row-body vs inline buttons must be registered separately**: within the same cell, "tap row body" and "tap an inline icon" often trigger different logic (e.g., search result tap row → detail, tap ♡+ → add to watchlist) — split into different hotspots.

Search techniques: search source for `addTarget` / `addGestureRecognizer` / `didSelect` / `onClick` / `tapHandler` / `@objc func .*Tap|Click|Press` / RxSwift `.tap` / closure properties (`on...Click`, `didSelect...`), then map each to its UI position as a hotspot.

## Business Logic Must Be Thorough (LOGIC-DEPTH)

**Hard requirement: logic.md is not a textual restatement of a screenshot; it is a "reconstruction of business behavior from reading source code."** Each screen's logic.md must contain at least the following structure, with each section written to the depth where "someone can understand cause and effect without reading source":

1. **Overview**: VC class name + inherited base class (determines push / half-sheet / drawer) + **entry point (which screen's which control, preferably with `file:line`)** + one-sentence summary of core interaction + key callbacks.
2. **Main Flow mermaid**: draw the main path and key forks.
3. **Branch Logic**: **every hotspot / interactive element must have a corresponding subsection**; anchor (`### xxx`) aligns with the hotspot's `logic_ref` (`#xxx`) in manifest. Each section must specify the **trigger chain**: `which control (with real control name/id) → calls what method → what condition check → what result`.
4. **Business Rules**: use bullets to list **invariants, constraints, boundaries** — specific values (maxCount, character limits, indices), gates (login / permission flags / market / account state), counter-intuitive behaviors.
5. **Related Code**: list involved source files + their responsibilities.
6. **To Be Completed**: honestly list unverified / pending items.

**Checklist for "is it detailed enough":**

- **Trigger chains must be specific to method/control names**: write "`doneBtn.rx.tap` → `viewModel.sortData()` → `dismiss`", not "tap done to save and close".
- **Gates must specify conditions**: which operations require login checks, what feature flags / permissions, which market / account state; behavior when conditions aren't met (show login / grey out / hide).
- **Never omit specific values**: group name limit 20 characters, maxCount varies by state, minimum visible fields is 3 — these hard constraints must be documented.
- **Reference real localization keys**: use actual key names for prompts/titles where applicable, not vague "shows a prompt".
- **Counter-intuitive / edge behaviors must be explicitly noted**: e.g., "background/pull-down dismiss doesn't trigger sort save", "drag reorder doesn't sync to server" — these are highest value as they're easiest to miss.
- **Distinguish "confirmed" from "pending verification"**: behaviors verified by reading source get marked "**confirmed** (VC line xxx)"; those inferred from screenshots/reports go in "To Be Completed" — do not present guesses as conclusions.
- **Row-body vs inline sub-elements explained separately**: when tapping the row body and tapping an icon in the same cell trigger different logic, use separate subsections.

**Source code search techniques** (aligned with INTERACTION-COVERAGE): after getting the VC, search `rx.tap` / `addTarget` / `didSelect` / login checks / router navigation / feature flag managers / analytics events / `maxCount`, etc., and reconstruct each interaction's trigger chain, gates, and numeric constraints.

## Component Reuse

Library-level UI (navbar / tabbar / segment / quote cell / index bar, etc.) should be captured in `data/components.json`.
Manifest layout blocks can use the `component` field to reference them, avoiding repetitive descriptions per screen and speeding up future screen rendering.
