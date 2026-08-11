# Source Sync Mechanism (Sync / Stale)

App Atlas data (manifest / logic.md) is a **point-in-time snapshot** collected from the App source code. As the App repository evolves, previously collected screens may drift from the latest source. The sync mechanism **detects** this drift and displays a "source changed" badge on the web UI, prompting re-verification of that screen.

## How It Works

Each screen records at collection time:

- `manifest.source.rev` — the App source commit at collection time (e.g., `76e5fad63e`)
- `manifest.source.files` — the source files that this screen's business logic depends on

During sync, for each "collecting / collected" screen:

```
git -C <appRepo> log <source.rev>..HEAD -- <source.files>
```

If these files have any commits after collection, the screen is marked `stale: true` and written back to `data/registry.json`. The web UI reads this field to render the badge.

- Uncollected screens (`uncollected`) have no collection baseline — skipped.
- `source.rev` equals current HEAD → directly deemed non-stale, no git call needed.
- `source.rev` not found in the App repo (incorrect record / repo reset) → cannot determine; **does not false-positive** as stale.
- Screen missing `source.files` → cannot determine; treated as non-stale, noted separately in the report.

Core logic lives in `lib/sync.mjs` (pure functions, git side-effects injected, unit-testable); CLI wrapper in `tools/sync.mjs`.

## Usage

```bash
cd <atlas-directory>

# Dry run: only report which screens are stale, no file writes
node tools/sync.mjs

# Write stale markers back to data/registry.json
node tools/sync.mjs --write

# Specify App source repo path (defaults to path in atlas.config.json)
node tools/sync.mjs --app /path/to/your/ios-project
```

Dry run output example:

```
App HEAD: 700556f45e...
Checking 10 collected/collecting screens, 7 stale.

Stale screens (source changed since collection):
  ⚠ watchlistMain
      ~ Modules/Watchlist/.../WatchlistMainController.swift
```

## Handling Stale Screens

When a screen is marked `stale`:

1. Use `git -C <appRepo> log <rev>..HEAD -- <file>` to see what changed in that file.
2. Re-verify manifest / logic.md, updating as necessary.
3. After updating, set the screen's `manifest.source.rev` and registry's `sourceRev` to the latest commit.
4. Run `node tools/sync.mjs --write` again — the screen's `stale` will automatically revert to `false`.

## Suggested Cadence

- Before starting a batch collection session, run a dry run to see which old screens need attention.
- After a collection sprint, run `--write` to make web badges reflect current state.
- This mechanism is **interruptible and repeatable**: running at any time just recalculates stale status without damaging existing data.
