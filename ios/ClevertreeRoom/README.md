# ClevertreeRoom (iOS SPM)

Embeddable WKWebView shell over bundled [`fronts/room`](../../fronts/room/).

```swift
import ClevertreeRoom

ClevertreeRoomView(
  config: ClevertreeRoomConfig(
    apiBase: ClevertreeRoomConfig.defaultApiBase,
    channel: ClevertreeRoomConfig.universalChannel,
    title: "Clevertree Chat"
  )
)
```

Before build/test:

```bash
bash ../../ios/scripts/sync-room-assets.sh
# from repo root: bash ios/scripts/sync-room-assets.sh
```

Docs: [`docs/ios-room.md`](../../docs/ios-room.md).
