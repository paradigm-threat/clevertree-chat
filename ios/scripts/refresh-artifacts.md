# Refreshing iOS handoff artifacts individually

Artifacts live under `ios/` and can be updated without regenerating everything.

## A — Sources only

```bash
# After editing Swift / project.yml / Info.plist:
bash ios/scripts/sync-room-assets.sh   # if fronts/room changed
# Then either re-zip all, or copy A-sources from staging after:
bash ios/scripts/package-handoff.sh
# Replace only A-sources/ inside an existing unzipped handoff folder if preferred.
```

## B — Docs only

Edit and copy:

- `ios/docs/HANDOFF.md`
- `ios/README.md`
- `docs/ios-room.md`

```bash
cp ios/docs/HANDOFF.md ios/dist/staging/B-docs/HANDOFF.md
cp ios/README.md ios/dist/staging/B-docs/README.md
cp docs/ios-room.md ios/dist/staging/B-docs/ios-room.md
# Re-zip B only if you maintain a partial package, or run package-handoff.sh
```

## C — Scripts only

```bash
cp ios/scripts/*.sh ios/dist/staging/C-scripts/
cp ios/scripts/refresh-artifacts.md ios/dist/staging/C-scripts/
```

## Full zip

```bash
bash ios/scripts/package-handoff.sh
# → ios/dist/clevertree-ios-handoff.zip
```

## Room UI assets (shared with Android)

Whenever `fronts/room/` changes:

```bash
bash ios/scripts/sync-room-assets.sh
# Android picks this up via Gradle syncRoomAssets on build.
```
