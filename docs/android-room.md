# Clevertree Android room AAR

Embeddable **IRC + SI** chat room for host apps (Clevertree Chat APK and third-party embeds). Same rich UI as the web room ([`fronts/room`](../fronts/room/)): attach/record, video/audio playback, protective covers, SI panel.

Standalone app: [`android-app.md`](./android-app.md) (`:clevertree-app`).

## Artifact

| Coordinate | Value |
|---|---|
| Group | `chat.clevertree` |
| Artifact | `clevertree-room` |
| Default version | `0.1.0` |
| GitHub Packages | `https://maven.pkg.github.com/paradigm-threat/clevertree-chat` |

Build locally:

```bash
cd android
./gradlew :clevertree-room:assembleRelease :clevertree-room:test
./gradlew :clevertree-room:publishToMavenLocal
```

CI publishes to GitHub Packages on pushes to `main` (and version tags).

## Consume (Gradle)

```kotlin
// settings.gradle.kts — repositories
maven {
    url = uri("https://maven.pkg.github.com/paradigm-threat/clevertree-chat")
    credentials {
        username = providers.gradleProperty("gpr.user").orElse(providers.environmentVariable("GITHUB_ACTOR")).get()
        password = providers.gradleProperty("gpr.key").orElse(providers.environmentVariable("GITHUB_TOKEN")).get()
    }
}
mavenLocal() // optional: after publishToMavenLocal

// app/build.gradle.kts
implementation("chat.clevertree:clevertree-room:0.1.0")
```

Sibling checkout (optional composite, no Packages needed):

```kotlin
val clevertreeAndroid = file("../../../clevertree-chat/android")
if (clevertreeAndroid.resolve("settings.gradle.kts").exists()) {
    includeBuild(clevertreeAndroid) {
        dependencySubstitution {
            substitute(module("chat.clevertree:clevertree-room"))
                .using(project(":clevertree-room"))
        }
    }
}
```

## Compose usage

```kotlin
ClevertreeRoom(
    config = ClevertreeRoomConfig(
        apiBase = "https://intake.myproblem.app",
        channel = "#mp-general",
        title = "MyProblem",
    ),
    modifier = Modifier.fillMaxSize(),
)
```

The library loads bundled [`fronts/room/live.html`](../fronts/room/live.html) via `WebViewAssetLoader` (`https://appassets.androidplatform.net/assets/...`) so UI version matches the AAR. Mic/camera permissions and file attach are handled inside the composable; declare `CAMERA`, `RECORD_AUDIO`, and `INTERNET` on the host.

## Live embed (web)

Production shell (no demo seeds): [`fronts/room/live.html`](../fronts/room/live.html)?`channel`&`api`&`title`&`collection`&`topic`&`theme`&`ai`.
