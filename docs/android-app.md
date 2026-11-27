# Clevertree Chat Android app

Standalone APK (`:clevertree-app`) built on the embeddable [`clevertree-room`](./android-room.md) AAR.

## Product shape

- Fullscreen **universal room `#web`** — the **same channel** as [clevertree.chat/chat](https://clevertree.chat/chat).
- **No separate onboarding.** The room composer starts **expanded** (most of the screen) with suggestion chips / placeholder asks; after the first send it collapses to the bottom bar; tap to expand again.
- Assigned product embeds (Paradigm Threat `#pt`, MyProblem `#mp-general`, …) stay channel-policy driven; Clevertree Chat site + app always use `#web`.

## Build

```bash
cd android
./gradlew :clevertree-app:assembleDebug
./gradlew :clevertree-app:assembleRelease
```

Outputs: `clevertree-app/build/outputs/apk/{debug,release}/`.

CI job **Android room AAR** also assembles the APK and uploads artifact `clevertree-chat-apk`.

## Install (device)

```bash
adb install -r android/clevertree-app/build/outputs/apk/debug/clevertree-app-debug.apk
```

## MyProblem

MyProblem no longer ships a standalone APK. Web embeds Clevertree Chat. Archived MyProblem APK: git tag `archive/android-testmode-2026-11-27` on the myproblem repo.
