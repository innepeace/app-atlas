# contactDetail — Contact Detail

## Overview
`ContactDetailViewController` (push). Shows friend's profile and provides message/call actions.

## Branch Logic
### back
Pop to contactList.

### send-msg
Trigger: `messageBtn.rx.tap` → `ChatService.getOrCreateConversation(userId:)` → push chatRoom with conversationId.

### voice-call
Trigger: `voiceCallBtn.rx.tap` → `CallManager.startCall(userId:, type: .voice)` → present CallVC.

### video-call
Trigger: `videoCallBtn.rx.tap` → `CallManager.startCall(userId:, type: .video)` → present CallVC.

## Business Rules
- If no existing conversation, one is created on "Send Message"
- Call requires microphone permission (voice) or camera+mic (video)
- Shows "Friend since [date]" at bottom
