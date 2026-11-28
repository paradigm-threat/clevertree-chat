# Clevertree Chat Android app

Standalone APK (`:clevertree-app`) built on the embeddable [`clevertree-room`](./android-room.md) AAR.

## Product shape

- Fullscreen **universal room `#web`** — the **same channel** as [clevertree.chat/chat](https://clevertree.chat/chat).
- **No separate onboarding.** The room composer starts **expanded** (most of the screen) with suggestion chips / placeholder asks; after the first send it collapses to the bottom bar; tap to expand again.
- Guest forest nicknames mint on first post if the name field is empty — see [`nicks.md`](./nicks.md).
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

Do not auto-launch after install unless you intend to; use the launcher / Leanback row on TV.

## Android TV remote

The APK declares optional Leanback + `LEANBACK_LAUNCHER`. On television / leanback devices (or intent extra `tv=true`), the room loads with `tv=1`:

| Control | Action |
|---|---|
| D-pad Left / Right | Move between SI panel and chat/composer; within a cluster, step focusables |
| D-pad Up / Down | Move among focusables in the active cluster (carousel cards, playlist ▶, Dictate, Send, …) |
| Select / Center | Activate focused control |
| Back / Esc | Close menu or leave draft → return focus to SI |
| Media play/pause / next / prev | Drive `ClevertreeMediaController` / playlist transport |
| Search / Voice Assist (when delivered) or **Dictate** tool | On-device `SpeechRecognizer` → inject text into the composer (edit, then Send) |
| Record audio tool | Existing clip upload → host Whisper (queue / inbox; no intake bypass) |

Phone / touch builds omit `tv=1` and keep the previous composer autofocus behavior.

## MyProblem

MyProblem no longer ships a standalone APK. Web embeds Clevertree Chat. Archived MyProblem APK: git tag `archive/android-testmode-2026-11-27` on the myproblem repo.
