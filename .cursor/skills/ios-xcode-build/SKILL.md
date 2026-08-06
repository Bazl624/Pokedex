---
name: ios-xcode-build
description: >-
  Build, test, and validate the Pokedex iOS app with xcodebuild, Simulator, and
  device considerations for camera features. Use when compiling, fixing build
  errors, running tests, checking schemes, or preparing an archive.
paths:
  - "**/*.swift"
  - "**/*.xcodeproj/**"
  - "**/*.xcworkspace/**"
  - "**/Package.swift"
  - "**/*.xctestplan"
---

# iOS Xcode Build Workflow (Pokedex)

## Environment reality

Cloud agents often lack a full macOS + Xcode toolchain. When `xcodebuild` is unavailable:

1. Still produce correct SwiftUI/SwiftData project structure and source.
2. Run any host-side checks that exist (SwiftFormat, JSON fixture tests, parser unit tests if portable).
3. Document exact local commands Corey should run on a Mac.

Never pretend a Simulator build succeeded if Xcode is missing.

## Preferred local commands

Discover schemes:

```bash
xcodebuild -list -project Pokedex.xcodeproj
```

Build for Simulator:

```bash
xcodebuild \
  -project Pokedex.xcodeproj \
  -scheme Pokedex \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -quiet \
  build
```

Test:

```bash
xcodebuild \
  -project Pokedex.xcodeproj \
  -scheme Pokedex \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  test
```

## Camera feature testing matrix

| Path | Where |
|---|---|
| Manual add / edit / SwiftData | Simulator |
| OCR parsers / fixtures | Unit tests (any) |
| Live camera + torch | Physical iPhone |
| Permission denied UX | Simulator (deny in Settings) or device |

## Agent checklist before calling a change “done”

1. Project opens conceptually: correct targets, Info.plist usage strings present
2. No force-unwraps in scan/session teardown paths
3. SwiftData models compile with the app entry `.modelContainer`
4. Tests or fixture parsers added for OCR number regex when that code changes
5. If Xcode present: `build` (and `test` when feasible) green
6. If Xcode absent: state that clearly and give Corey the commands above

## Signing & shipping (later)

- Development team + bundle id owned by Corey
- Archive only when asked
- Privacy Nutrition Labels will need camera + photos disclosures

## Related skills

- `ios-swiftui-scaffold`
- `pokemon-card-camera-scan`
