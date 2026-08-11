# contactList — Contacts

## Overview
`ContactListViewController` (tab root). Shows all friends alphabetically with section index sidebar.

## Main Flow
```mermaid
flowchart TD
    A[Tab switch to Contacts] --> B[Load contacts from local DB]
    B --> C[Group by pinyin initial]
    C --> D[Display with section headers A-Z]
    D --> E{User action}
    E -->|Tap row| F[Push contactDetail]
    E -->|Tap +| G[Push AddFriendVC]
    E -->|Tap index bar| H[Scroll to section]
```

## Branch Logic
### add-friend
Trigger: `addBtn.rx.tap` → push `AddFriendViewController` (search by phone/ID).

### tap-contact
Trigger: `tableView(_:didSelectRowAt:)` → `Router.open("/contacts/detail", params: ["userId": id])`

## Business Rules
- Contacts sorted by pinyin; special characters grouped under "#"
- Friend request badge shown on "New Friends" entry at top
- Contact list cached locally, synced on app launch
