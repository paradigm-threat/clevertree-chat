# Clevertree Chat Android app

Standalone APK (`:clevertree-app`) built on the embeddable [`clevertree-room`](./android-room.md) AAR.

## Product shape

- **Home / first run:** universal room (`#web`) live transcript **above** one large text field + Submit.
- **After submit (or Skip):** full room UI on the same channel.
- Assigned product embeds (Paradigm Threat `#pt`, MyProblem `#mp-general`, …) stay channel-policy driven; the app default is universal.

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

MyProblem no longer ships a standalone APK. Web embeds Clevertree Chat; problem-solving is a Clevertree feature. Archived MyProblem APK source: git tag `archive/android-testmode-2026-11-27` on the myproblem repo.
