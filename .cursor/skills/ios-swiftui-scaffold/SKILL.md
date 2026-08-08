---
name: ios-swiftui-scaffold
description: >-
  Scaffold and evolve the Pokemon collection iOS app with SwiftUI, SwiftData,
  and a clear feature-module layout. Use when creating the Xcode project,
  adding screens, navigation, app entry, Info.plist permissions, or folder
  structure for Pokedex.
paths:
  - "**/*.swift"
  - "**/*.xcodeproj/**"
  - "**/Info.plist"
  - "**/project.pbxproj"
---

# iOS SwiftUI Scaffold (Pokedex)

## Stack

| Layer | Choice |
|---|---|
| UI | SwiftUI |
| Persistence | SwiftData |
| Concurrency | Swift async/await; `@MainActor` for UI models |
| Camera | AVFoundation + Vision (see `pokemon-card-camera-scan`) |
| Min target | iOS 17+ (SwiftData + modern Observation) |

## Target folder layout

Create an Xcode app target `Pokedex` (or keep repo name) with:

```text
Pokedex/
├── App/
│   ├── PokedexApp.swift
│   └── RootTabView.swift
├── Features/
│   ├── Collection/
│   │   ├── CollectionListView.swift
│   │   ├── CardDetailView.swift
│   │   └── AddEditCardView.swift
│   ├── Scan/
│   │   ├── ScanView.swift
│   │   ├── CameraPreview.swift
│   │   └── CardMatchConfirmView.swift
│   └── Settings/
│       └── SettingsView.swift
├── Models/
│   ├── CollectionItem.swift          # SwiftData @Model
│   ├── RawCondition.swift
│   ├── GradingInfo.swift
│   └── CardIdentity.swift
├── Services/
│   ├── CardReferenceStore.swift      # local card catalog lookup
│   ├── CardOCRService.swift
│   └── Valuation/
│       ├── ValuationProviding.swift  # protocol
│       └── ManualValuationProvider.swift
├── Resources/
│   └── CardReference/                # optional bundled JSON subsets
└── Supporting/
    └── Info.plist permissions usage strings
```

## App entry pattern

```swift
@main
struct PokedexApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(for: CollectionItem.self)
    }
}
```

Tabs: **Collection** | **Scan** | **Settings**.

## Navigation rules

- Collection: `NavigationStack` + list → detail → edit sheet/push
- Scan: full-screen camera flow → confirm sheet → save → pop to Collection detail
- Prefer value types for view state; persist only via SwiftData models
- Do not introduce UIKit view controllers except as `UIViewRepresentable` bridges for camera preview

## Permissions (Info.plist)

Required usage strings:

- `NSCameraUsageDescription` — scanning cards into the collection
- `NSPhotoLibraryUsageDescription` — attaching card photos from library (if used)

Request camera access only when entering Scan.

## Implementation workflow

1. Read `pokemon-catalog-product` for MVP boundaries.
2. Ensure models match `collection-inventory-model` before UI polish.
3. Wire empty Collection list + Add manual card first (no camera).
4. Add Scan behind the working manual path.
5. Keep valuation as a stub protocol with manual entry only.

## Do / Don't

**Do**

- Use `#Preview` with in-memory `ModelContainer` for every major screen
- Keep feature folders self-contained
- Fail soft when reference catalog miss: allow manual identity entry

**Don't**

- Add Firebase / Realm / Core Data unless Corey explicitly asks
- Ship networking for pricing in scaffold phase
- Put business logic in View bodies — use small observable view models or plain functions

## Verification

- Build for iPhone 16 Simulator
- Create one manual card, kill app, relaunch, confirm persistence
- Previews compile for Collection list and detail
---

# Related skills

- `collection-inventory-model`
- `pokemon-card-camera-scan`
- `ios-xcode-build`
