# meProfile — Me

## Overview
`MeViewController` (tab root). User's own profile with shortcuts to favorites, wallet, and settings.

## Branch Logic
### edit-profile
Trigger: tap profile card → push `ProfileEditVC` (change avatar, name, status).

### favorites
Trigger: tap row → push `FavoritesVC` (saved messages, links, files).

### wallet
Trigger: tap row → `AuthManager.verifyIdentity()` → on success push `WalletVC`.
- If not verified: show Face ID / passcode prompt.

### settings
Trigger: tap row → `Router.open("/me/settings")`

## Business Rules
- Avatar loaded from cache, refreshed on viewWillAppear
- Wallet requires biometric or passcode authentication
- QR code in profile header is user's friend-add QR
