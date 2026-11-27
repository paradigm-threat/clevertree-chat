# Clevertree iOS (follow-up)

Android ships first (`:clevertree-app` + `clevertree-room` AAR). iOS is **planned**, not in this pass:

- WKWebView shell over the same bundled `fronts/room/live.html` (or hosted live embed).
- Universal channel `#web` onboarding: live room above one text field + Submit, then full room.
- Swift Package / XCFramework artifact parallel to the Android AAR when CI is ready.

Do not block Android releases on iOS.
