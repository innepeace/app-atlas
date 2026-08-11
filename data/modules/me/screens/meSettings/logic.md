# meSettings — Settings

## Overview
`SettingsViewController` (push). General app settings with logout.

## Branch Logic
### back
Pop to meProfile.

### about
Trigger: tap → push `AboutVC` (version, terms, licenses).

### storage
Trigger: tap → push `StorageVC` showing cache breakdown (images, videos, files).
- "Clear Cache" button → confirm alert → `CacheManager.clearAll()` → refresh size display.

### logout
Trigger: `logoutBtn.rx.tap` → `UIAlertController` confirm.
- Confirm: `AuthManager.logout()` → clear token + local data → present `LoginVC` as root.
- Cancel: dismiss alert.

## Business Rules
- Cache size calculated asynchronously on enter
- Logout clears keychain token and resets root to login flow
- "About" shows: version, build number, terms of service link, open-source licenses
