# chatInfo — Chat Info

## Overview
`ChatInfoViewController` (push). Shows chat-level settings: mute, pin, clear history.

## Branch Logic
### back
Pop to chatRoom.

### mute
Trigger: `muteSwitch.rx.isOn` → `ChatService.setMute(conversationId, muted:)`

### clear
Trigger: tap → `UIAlertController` confirm → `ChatDBManager.clearMessages(conversationId:)` → pop back.

## Business Rules
- Clear history is local only; does not affect the other party
- Mute state synced to server
