# discoverMain — Discover

## Overview
`DiscoverViewController` (tab root). Static list of feature entries: Moments, Scan, Shake, Mini Programs.

## Branch Logic
### moments
Trigger: `tableView(_:didSelectRowAt:)` row 0 → `Router.open("/discover/moments")`

### scan
Trigger: row 1 tap → request camera permission → present `ScannerVC`.
- On success: parse QR content, handle URL/contact/payment.
- On denied: show settings alert.

### shake
Trigger: row 2 tap → present `ShakeVC` → detect shake motion → show nearby users.

### mini-programs
Trigger: row 3 tap → push `MiniProgramListVC` → show recently used + search.

## Business Rules
- Moments shows red dot if friends have new posts since last visit
- Scan supports QR codes and barcodes
- Mini Programs sorted by "recently used" first
