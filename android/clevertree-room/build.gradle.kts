plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("maven-publish")
}

group = "chat.clevertree"
version = project.findProperty("clevertree.room.version")?.toString() ?: "0.1.0"

android {
    namespace = "chat.clevertree.room"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.isReturnDefaultValues = true
    }
}

val roomFronts = rootProject.projectDir.parentFile.resolve("fronts/room")
val bundledAssetsRoot = layout.buildDirectory.dir("generated/assets")

val syncRoomAssets by tasks.registering(Copy::class) {
    description = "Bundle fronts/room into AAR assets so UI version matches the library."
    from(roomFronts) {
        include(
            "live.html",
            "embed.html",
            "tokens.css",
            "clevertree-room.css",
            "clevertree-room.js",
            "context-tags.js",
            "channel-route.js",
            "channel-policy.json",
            "chat-launcher.js",
            "clevertree-ces.js",
            "media-controller.js",
            "ct-builtins.js",
            "themes/**",
        )
    }
    into(bundledAssetsRoot.map { it.dir("clevertree-room") })
}

android.sourceSets.getByName("main").assets.srcDir(bundledAssetsRoot)

tasks.named("preBuild").configure {
    dependsOn(syncRoomAssets)
}


dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.0.21")
    testImplementation("org.robolectric:robolectric:4.14.1")
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                groupId = "chat.clevertree"
                artifactId = "clevertree-room"
                version = project.version.toString()
                pom {
                    name.set("Clevertree Room")
                    description.set(
                        "Embeddable Clevertree IRC+SI chat room (WebView shell over fronts/room).",
                    )
                    url.set("https://clevertree.chat")
                }
            }
        }
        repositories {
            maven {
                name = "GitHubPackages"
                url = uri("https://maven.pkg.github.com/paradigm-threat/clevertree-chat")
                credentials {
                    username = project.findProperty("gpr.user") as String?
                        ?: System.getenv("GITHUB_ACTOR")
                    password = project.findProperty("gpr.key") as String?
                        ?: System.getenv("GITHUB_TOKEN")
                }
            }
        }
    }
}
