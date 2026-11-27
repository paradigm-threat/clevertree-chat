# Clevertree Chat iOS simulator validation

## iOS 15 compatibility revision

The app and Swift package target iOS and iPadOS 15.0. An unsigned Release archive built with Xcode 26.3 and the iOS 26.2 SDK declares iOS 15.0 in both the app plist and the Mach-O load command.

- The room keeps its stacked layout on narrow portrait screens when the keyboard shortens the WebView. The composer keeps its controls visible at compact viewport heights. Older WebKit uses a standard viewport height where dynamic units are unavailable.
- The recorder picks a supported format. It can use AAC in M4A or video in MP4 when WebM is unavailable. The Attach file control remains available when recording fails.
- The final iPhone SE (3rd generation, iOS 26.3.1) suite passed six tests. The iPad-only orientation test was skipped by design. Targeted checks also passed for the iPhone 17 Pro keyboard and for the iPad keyboard and both orientations. The Swift package passed five tests.
- Twelve simulated recorder cases passed locally, including MP4 audio and video, WebM, default format selection, permission denial, and capture failure. The local 320 × 280, 375 × 330, and 667 × 375 layout probes verified that the draft and toolbar fit and that the layout switches at the intended widths.
- Xcode’s download command could not install the iOS 15.0 or 15.5 runtime. The official iOS 15.0 legacy package declares roughly 11.5 GB for the installed runtime alone. The workstation lacked enough headroom to install and boot it, and Xcode detected no physical iPhone. Physical iOS 15 launch, camera and microphone permissions, and server acceptance of the fallback formats still need verification.

### Offline recording follow-up

On the iPhone 17 Pro simulator running iOS 26.3.1, the normal recording controls produced playable M4A and MP4 files through WebKit’s real recorder. The test supplied synthetic audio and video, limited format detection to MP4, and inspected the multipart file fields in a local upload stub. Both files had MP4 container headers, matching MIME types and extensions, and advancing playback. The stub kept media on the workstation.

Xcode downloaded the official 6.28 GB iOS 16.0 Simulator image. CoreSimulator refused to register the image, reporting insufficient disk space for its copy. Recovery did not register the runtime, and CoreSimulator cleared its staging file.

### Physical-device verification

1. On a trusted iPhone running iOS 15, select a development signing team for ClevertreeApp and run the Debug scheme from Xcode.
2. Open the room and channel menu. Type an unsent draft, verify that the transcript and composer remain visible above the software keyboard, and dismiss it. Open the attachment picker and verify the available sources.
3. Use an isolated test service for attachment and recording checks. Allow and deny microphone and camera access, then verify recovery and capture. Confirm that the service accepts M4A and MP4 and that each file plays back on the iPhone. The live room uploads a recording when Stop is tapped.


See [Apple's Xcode compatibility table](https://developer.apple.com/xcode/system-requirements) and [WebKit's MediaRecorder documentation](https://webkit.org/blog/11353/mediarecorder-api/).

## Initial handoff validation

November 27, 2026. Xcode 26.3 (17C529), XcodeGen 2.49.0, iOS Simulator 26.3.1 (23D8133). The Debug app opened the live public #web room using the bundled WebView assets.

| Target | Result |
| --- | --- |
| ClevertreeRoom Swift package on macOS | 5 passed |
| iPhone 17 Pro | 6 passed. The iPad orientation check was skipped by design. |
| iPhone SE (3rd generation) | 6 passed. The iPad orientation check was skipped by design. |
| iPad (10th generation) | 7 passed, including portrait and landscape. |

The simulator suite verified the host bundle ID, room launch, default channel, channel list, attachment menu with a Photo Library option, and the composer. Draft entry, keyboard dismissal, and placement of Send above the on-screen keyboard were exercised. Screenshots show the room inside the safe area with the attachment and audio controls visible. The draft remained unsent.

The initial iPhone SE run found that opening the keyboard switched the room to a landscape-style split layout and narrowed the transcript. The iOS 15 compatibility revision above addresses that behavior.

Web Inspector connected to the Debug WKWebView and confirmed the bundled room URL, #web channel, and composer name. Simulator WebKit supplied audio and video tracks in separate probes. Each track was stopped immediately. Native permission prompt appearance and physical-device recording remain to be verified on a real device. The attachment test opened the picker options and stopped before selecting a photo. The built plist retains all four media usage descriptions and ATS keeps arbitrary loads disabled. Device signing and App Store disclosure belong to a device release.

## Changes needed to run the handoff

- The app now uses Swift language mode 5 and the shipped Info.plist. XcodeGen no longer regenerates that plist. The hosted test points at the ClevertreeChat executable.
- The package uses its resource bundle inside the method and initializer bodies. The scheme handler implements the WebKit start and stop delegate signatures.
- The host and UI test stubs now exercise the behaviors above. The channel control is found by its accessibility label because WebKit exposes it to XCTest as an Other element.

Run XcodeGen from A-sources/ClevertreeApp before building. The updated handoff includes the regenerated Xcode project and the bundled room assets. The consolidated logs, screenshots, and Xcode test summary are in Simulator Evidence beside this handoff's source and documentation directories on the test Mac.
