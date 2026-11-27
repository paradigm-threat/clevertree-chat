# Clevertree Chat iOS — Mac handoff

Linux scaffolded the embeddable room + host app sources. This guide is everything that **requires a Mac** (Xcode, Simulator, signing, UI tests).

Android SoT for behavior: `docs/android-room.md` · `android/clevertree-room/`.

---

## Prerequisites

| Tool | Expectation |
|---|---|
| macOS | Recent stable (Sonoma / Sequoia OK) |
| Xcode | Xcode 26.3 verified. iOS and iPadOS 15.0 deployment target. |
| XcodeGen | `brew install xcodegen` (generates `.xcodeproj` from `project.yml`) |
| Optional | Safari Technology Preview for Web Inspector |

Confirm:

```bash
xcodebuild -version
xcodegen --version
```

---

## 1. Open the project

From the **repo** (or unzipped `A-sources/`):

```bash
# Sync room UI from fronts/room (also run after any room HTML/JS/CSS change)
bash ios/scripts/sync-room-assets.sh

cd ios/ClevertreeApp
xcodegen generate
open ClevertreeApp.xcodeproj
```

Xcode will resolve the local SPM package `../ClevertreeRoom`.

**Alternate:** open `ios/ClevertreeRoom/Package.swift` alone to iterate on the library; the app still needs the XcodeGen project for the host target.

### App icon

If the AppIcon slot is empty, copy from design kit:

`design/clevertree-chat-kit/platform/ios/AppIcon.appiconset/`  
→ `ClevertreeApp/Resources/Assets.xcassets/AppIcon.appiconset/`  
(Handoff zip includes `A-sources/design-icons/` as a spare.)

---

## 2. Signing / bundle ID

Placeholders (change only if your org requires different IDs):

| Setting | Value |
|---|---|
| Bundle ID | `chat.clevertree.app` |
| Display name | Clevertree Chat |
| Team | **set in Xcode → Signing & Capabilities** (`DEVELOPMENT_TEAM` in `project.yml` is empty on purpose) |
| Code sign | Automatic |

No paid Apple Developer membership is required for Simulator. Device / TestFlight need a team.

---

## 3. Simulator matrix

Minimum smoke set:

1. **iPhone 16** (or latest) — iOS 18.x
2. **iPhone SE (3rd gen)** — small screen + keyboard
3. **iPad (10th gen)** — optional orientation check

```bash
xcrun simctl list devices available
cd ios/ClevertreeApp
xcodebuild -scheme ClevertreeApp -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -scheme ClevertreeApp -destination 'platform=iOS Simulator,name=iPhone 16' test
```

---

## 4. Harden (Info.plist / ATS / permissions)

Already stubbed in `ClevertreeApp/Resources/Info.plist`:

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription`
- ATS on (`NSAllowsArbitraryLoads` = false) — API is `https://api.clevertree.chat`

Mac checklist:

- [ ] Confirm usage strings match App Store tone
- [ ] If debugging against `http://localhost`, add a **temporary** ATS exception — do not ship it
- [ ] Background modes: **none** required for v0.1 (no push / audio background yet)
- [ ] Privacy Nutrition Labels when you create the App Store Connect record
- [ ] Verify WKWebView media grant path prompts the system dialog once

---

## 5. Keyboard / safe area verification

Parity intent with Android `imePadding()` + `navigationBarsPadding()` + status bar padding:

1. Launch app → room fills below status bar
2. Tap composer → keyboard opens
3. Composer + send control stay **above** the keyboard (WebView bottom pinned to `keyboardLayoutGuide`)
4. Dismiss keyboard → layout restores
5. Home indicator does not cover the attach / speak controls

If broken: inspect `ClevertreeRoomWebViewController` constraints; prefer `keyboardLayoutGuide` over manual notifications on iOS 15+.

---

## 6. Safari Web Inspector (debug)

1. Simulator or device: Settings → Safari → Advanced → Web Inspector **On**
2. Mac Safari → Develop → [Simulator / Device] → select the Clevertree page
3. DEBUG builds set `webView.isInspectable = true` (iOS 16.4+)

---

## 7. Regression tests to flesh out

### Unit (SPM — can run on Mac without app signing)

```bash
cd ios/ClevertreeRoom
swift test   # or: xcodebuild test -scheme ClevertreeRoom …
```

Existing: `ClevertreeRoomConfigTests` (URL / query parity with Android).

### Host unit stubs

`ClevertreeApp/Tests/` — expand with config wiring smoke.

### UI tests (Simulator required)

`ClevertreeApp/UITests/ClevertreeAppUITests.swift` — stubs only. Add:

| Test | Assert |
|---|---|
| Room load | `XCUIApplication().webViews.firstMatch` exists within 10s |
| Channel | Text/query for `#web` in channel chip |
| Composer + keyboard | Tap text field → keyboard `hittable`; composer still on-screen |
| Channel menu | Tap channel switch → menu / listbox appears |

```bash
xcodebuild -scheme ClevertreeApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:ClevertreeAppUITests \
  test
```

---

## 8. When green — what to return

1. Note Xcode version + simulator models used
2. Paste failing→fixed checklist items from §4–§7
3. If you changed sources, either:
   - PR against `clevertree-chat` `ios/`, or
   - Refresh the handoff zip for others:

```bash
bash ios/scripts/package-handoff.sh
# → ios/dist/clevertree-ios-handoff.zip
```

4. Refresh **individually** (sources vs docs vs scripts): see `C-scripts/refresh-artifacts.md` / `ios/scripts/refresh-artifacts.md`

---

## Layout reminder

```
ios/
  ClevertreeRoom/     # SPM library (WKWebView + bundled fronts/room)
  ClevertreeApp/      # Host app (XcodeGen project.yml)
  scripts/            # sync-room-assets.sh, package-handoff.sh
  docs/HANDOFF.md     # this file
  dist/               # zip + staging (gitignored recommended)
```

Cannot do on Linux: `xcodebuild`, Simulator, TestFlight, real signing, XCUITest against WebView.
