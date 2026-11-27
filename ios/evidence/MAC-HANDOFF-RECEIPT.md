# Mac handoff ingest receipt

**Checked:** 2026-11-27 via NobiServ Public `dev/clevertree-ios-handoff/`

## On Nobi (complete return)

| Artifact | Role |
|---|---|
| `clevertree-ios-handoff.zip` | Original Linux → Mac outbound |
| `clevertree-ios-handoff-validated.zip` | First Mac validation return |
| `clevertree-ios-handoff-ios15.zip` | iOS 15 compatibility revision (canonical Mac return) |
| `clevertree-ios-handoff/` | Unzipped working tree + **Simulator Evidence** |

## Ingested into this repo

- Swift / XcodeGen / UITest / scheme-handler / iOS 15 target → `ios/`
- Generated `ClevertreeApp.xcodeproj` → `ios/ClevertreeApp/`
- `ios/docs/SIMULATOR-VALIDATION.md`, `DEVELOPER-FOLLOW-UP.md`, updated `HANDOFF.md`
- Screenshots + logs → `ios/evidence/simulator-evidence/` (26 files)
- Provenance zips → `ios/evidence/from-mac/`
- Room WebView Mac patches (keyboard landscape gate, MP4/M4A recorder, `dvh` fallback) merged into `fronts/room/` and re-synced

## Safe to delete on the Mac

Everything related to this handoff on that laptop:

- Unzipped `clevertree-ios-handoff*` folders (Desktop / Downloads / Documents)
- The three zips if still local copies (`…handoff.zip`, `…validated.zip`, `…ios15.zip`)
- Xcode DerivedData / local Simulator screenshots for ClevertreeApp from this pass

NobiServ `Public/dev/clevertree-ios-handoff/` already has the full return; this Linux repo now has the source merge + evidence. After a git commit, Nobi is optional archive only — not required for the Mac wipe.
