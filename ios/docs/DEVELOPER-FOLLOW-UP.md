# Clevertree Chat developer follow-up

November 27, 2026

Open `A-sources/ClevertreeApp/ClevertreeApp.xcodeproj` and select the **ClevertreeApp** scheme. The app and its local Swift package target iOS and iPadOS 15.0. The unsigned Release archive confirmed that minimum. The iPhone SE simulator suite and local WebKit recording and playback checks passed on iOS 26.3.1. See [Simulator validation](SIMULATOR-VALIDATION.md) for the evidence and runtime installation results.

## Finish iPhone and iPad validation

- [ ] Select the project’s Apple Developer team and run a development-signed build on a physical iPhone running iOS 15. Confirm cold launch, room and channel loading, attachment picker, portrait layout, keyboard dismissal, and that the transcript and Send remain usable with the keyboard open. Repeat the core flow on a current iPhone and confirm portrait and landscape behavior on iPad.
- [ ] Point a test build at an isolated service. Check microphone and camera permission grant, denial, and recovery. Record short audio and video clips, attach a sample file, and test an interrupted connection. After the capture changes below, verify preview and discard before upload. Verify that the service accepts `audio/mp4` (.m4a) and `video/mp4` (.mp4), applies its review rules, and returns media that plays on the iOS 15 device. The local tests verified encoding and playback with synthetic inputs. Production acceptance and physical recording are still open.
- [ ] Bring the bundled WebView changes into the upstream `fronts/room` source before running the room asset sync from the full repository. Keep the deployment target in both `project.yml` and `Package.swift`, and rerun the package and simulator suites after syncing.

## Prepare for App Review

- [ ] **Public chat and media.** Confirm that the app and its service filter objectionable text and media, let people report content and block abusive users, and publish a support contact. Assign someone to handle reports and test the response path. Review the default public IRC room and user identity model against Apple’s treatment of apps used primarily for random or anonymous chat. [App Review Guidelines §1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)
- [ ] **Capture and upload.** In the current build the WKWebView permission delegate grants capture requests without checking origin or frame, and Stop immediately starts a media upload. Restrict capture to the trusted main room frame, require a deliberate user action, use the platform permission prompt where appropriate, and test the visible recording indicator. Add a local preview and discard path with explicit confirmation before media leaves the device. Include file attachments in the same review. [App Review Guidelines §§2.5.14 and 5.1](https://developer.apple.com/app-store/review/guidelines/)
- [ ] **Privacy and data handling.** List the data the app, WebView and backend actually receive, including chat, recordings, uploaded files, transcripts, identifiers and diagnostics where applicable. Identify any transcription or AI provider that receives user content and verify the associated consent and disclosures. Confirm who receives each item, what becomes public, retention, and how users can request deletion. Link the privacy policy in the app and prepare its public URL, App Store disclosures, and any applicable privacy manifest and required-reason API entries. [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) · [Privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [ ] **Minimum functionality and submission materials.** Assess whether the iPhone app delivers sufficient utility beyond the website. Describe the iOS-specific features that actually ship and give the reviewer steps to exercise them with sample content. Prepare the signing configuration, Release archive using Apple’s current submission toolchain, support URL, age rating, export compliance answers, and screenshots for the supported iPhone and iPad sizes, using staged conversations. Obtain release approval before uploading a build or changing the App Store listing. [App Review Guidelines §4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality) · [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

## Icons and design assets

| Asset | Current state | Follow-up |
| --- | --- | --- |
| iPhone and iPad app icon | The active asset catalog contains a universal 1024 × 1024 PNG with no alpha channel. | Use the existing icon if branding is approved. Verify it in the signed archive and on the Home Screen. |
| Dark and tinted iOS icons | 1024 × 1024 PNGs are included in `A-sources/design-icons/AppIcon.appiconset/`. | If design approves the variants, add them to the active catalog and verify rendering on supported iOS versions. |
| Store screenshots | The simulator captures were taken for QA. | Capture iPhone and iPad screenshots for the listing using fictional chat and recordings. |
| Apple Watch icon and screenshots | The ZIP currently contains iOS artwork. | When the Watch target is planned, adapt the Clevertree artwork for circular masking and prepare Watch screenshots. Review the record, stop, queue, and transfer indicators for legibility and accessibility at Watch sizes. |

[Apple app icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons/)

## Future Apple Watch companion

- Capture audio on the Watch and keep recordings in a durable local queue while the iPhone is unavailable. The iPhone owns preview, disposition, upload, and server communication. Confirm the minimum watchOS version and the required iPhone pairing before setting a release target.
- Prototype background file transfer with Watch Connectivity. Give each recording a stable ID, persist it on the phone before acknowledging receipt, deduplicate retries, and track when the Watch can safely delete its copy. Keep device transfer and server upload as distinct states. [Watch Connectivity file transfer](https://developer.apple.com/documentation/watchconnectivity/wcsession/transferfile%28_%3Ametadata%3A%29)
- Decide which app shows queue status, when users can discard a recording, what limits apply to duration and storage, and whether iPhone upload waits for confirmation. Confirm how the destination room is chosen before enabling upload.
- Validate on a physically paired Watch and iPhone. Cover microphone denial, recording interruption, offline recording, reconnection, transfer retry, low storage, duplicate delivery, and iPhone preview and deletion. Apply the same privacy and recording disclosures to the Watch flow.

Watch support is future work. The current developer handoff is for the iPhone and iPad app.
