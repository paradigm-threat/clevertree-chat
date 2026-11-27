# Clevertree Android

Gradle project with:

| Module | Role |
|---|---|
| **`:clevertree-room`** | Embeddable IRC+SI room AAR (WebView over bundled [`fronts/room`](../fronts/room/)) |
| **`:clevertree-app`** | Standalone Clevertree Chat APK (universal-room onboarding → full room) |

```bash
cd android
./gradlew :clevertree-room:assembleRelease :clevertree-room:test
./gradlew :clevertree-app:assembleDebug
```

Docs: [`docs/android-room.md`](../docs/android-room.md) · [`docs/android-app.md`](../docs/android-app.md).

The legacy stub path `android/src/chat/clevertree/ClevertreeVoice.kt` moved into `:clevertree-room` (`chat.clevertree.ClevertreeVoice`).
