# Clevertree iOS

Embeddable IRC+SI room (SPM) + Clevertree Chat host app — parity with Android `:clevertree-room` / `:clevertree-app`.

| Piece | Path | Role |
|---|---|---|
| **ClevertreeRoom** | `ClevertreeRoom/` | Swift Package — WKWebView over bundled [`fronts/room`](../fronts/room/) |
| **ClevertreeApp** | `ClevertreeApp/` | Host app (`#web`, `api.clevertree.chat`) |
| **Scripts** | `scripts/` | Asset sync + handoff zip |
| **Mac guide** | [`docs/HANDOFF.md`](docs/HANDOFF.md) | Signing, Simulator, tests |

## Linux / CI-friendly

```bash
bash ios/scripts/sync-room-assets.sh
bash ios/scripts/package-handoff.sh   # → ios/dist/clevertree-ios-handoff.zip
```

Room assets are copied into the SPM target (same file set as Android `syncRoomAssets`).

## Mac

See [`docs/HANDOFF.md`](docs/HANDOFF.md). Short path:

```bash
bash ios/scripts/sync-room-assets.sh
cd ios/ClevertreeApp && xcodegen generate && open ClevertreeApp.xcodeproj
```

## Embed (SwiftUI)

```swift
import ClevertreeRoom

ClevertreeRoomView(
  config: ClevertreeRoomConfig(
    apiBase: "https://api.clevertree.chat",
    channel: "#web",
    title: "Clevertree Chat"
  )
)
```

Docs: [`docs/ios-room.md`](../docs/ios-room.md) · Android: [`docs/android-room.md`](../docs/android-room.md).

## Mac validation return

See [`evidence/`](evidence/) (screenshots, logs, provenance zips) and [`docs/SIMULATOR-VALIDATION.md`](docs/SIMULATOR-VALIDATION.md).
