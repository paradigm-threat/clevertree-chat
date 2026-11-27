# Clevertree iOS room (SPM)

Embeddable **IRC + SI** chat room for host apps — same rich UI as the web room ([`fronts/room`](../fronts/room/)) and Android AAR ([`android-room.md`](./android-room.md)).

| Piece | Path |
|---|---|
| SPM library | [`ios/ClevertreeRoom/`](../ios/ClevertreeRoom/) |
| Host app | [`ios/ClevertreeApp/`](../ios/ClevertreeApp/) |
| Mac handoff | [`ios/docs/HANDOFF.md`](../ios/docs/HANDOFF.md) |
| Asset sync | [`ios/scripts/sync-room-assets.sh`](../ios/scripts/sync-room-assets.sh) |

## Consume (SPM)

Local path dependency:

```swift
// Package.swift or Xcode → Package Dependencies
.package(path: "../clevertree-chat/ios/ClevertreeRoom")
// product: ClevertreeRoom
```

```swift
import ClevertreeRoom

ClevertreeRoomView(
    config: ClevertreeRoomConfig(
        apiBase: "https://intake.myproblem.app",
        channel: "#mp-general",
        title: "MyProblem"
    )
)
```

The library loads bundled `live.html` via a custom URL scheme (`clevertree-room://appassets.clevertree.local/...`) so the UI version matches the package (Android equivalent: `WebViewAssetLoader`).

Host apps must declare camera / microphone / photo library usage strings (see `ClevertreeApp/Resources/Info.plist`).

## Sync room UI

```bash
bash ios/scripts/sync-room-assets.sh
```

Mirrors Android Gradle `syncRoomAssets` (same `fronts/room` file set).

## Build / test (Mac)

```bash
cd ios/ClevertreeApp && xcodegen generate
xcodebuild -scheme ClevertreeApp -destination 'platform=iOS Simulator,name=iPhone 16' test
cd ../ClevertreeRoom && swift test
```

Linux scaffolds sources and the handoff zip only — no Simulator.

## Live embed (web)

Production shell: [`fronts/room/live.html`](../fronts/room/live.html)?`channel`&`api`&`title`&`collection`&`topic`&`theme`&`ai`.
