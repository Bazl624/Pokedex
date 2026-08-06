---
name: pokemon-card-camera-scan
description: >-
  Implement Pokemon card camera scanning with AVFoundation preview, Vision OCR,
  card-rectangle framing, and human-confirmed catalog match. Use when building
  Scan UI, OCR, card recognition, photo capture, or matching scanned text to
  set/collector number.
paths:
  - "**/Scan/**"
  - "**/*Camera*"
  - "**/*OCR*"
  - "**/*Vision*"
---

# Pokemon Card Camera Scan

## Goal

Let Corey point the iPhone at a card, extract identity hints on-device, propose matches from the local reference catalog, and **require confirmation** before saving to inventory.

## Pipeline (ordered)

```text
Camera frames
  → card rectangle / document detection (optional guide overlay)
  → freeze / shutter capture (high-res still preferred over live OCR spam)
  → Vision VNRecognizeTextRequest (accurate)
  → parse candidates: card name, set code, collector number (e.g. 025/165)
  → query CardReferenceStore
  → present ranked matches + “Enter manually”
  → on confirm: create CollectionItem (+ save photo)
```

## UX rules

1. Overlay a simple card-shaped guide; no floating badges or clutter.
2. One primary shutter control; optional torch toggle.
3. After capture, show a confirm screen with photo + match list.
4. Never auto-save without confirmation.
5. If OCR confidence is low, skip straight to manual search with any partial text prefilled.
6. Simulator: provide “Pick sample image / photo library” fallback so agents can test without a device.

## Technical approach

### Camera

- `AVCaptureSession` + `AVCaptureVideoPreviewLayer` wrapped in `UIViewRepresentable`
- Capture photo via `AVCapturePhotoOutput` for OCR (not continuous OCR every frame in MVP)
- Configure session on a background queue; hop to MainActor for UI

### Vision OCR

```swift
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false // card text / set codes
request.recognitionLanguages = ["en-US"]
```

Extract top candidates; prioritize lines that look like:

- Collector numbers: `\d{1,3}\s*/\s*\d{1,3}` or modern `GG##` / `SVP##` style codes
- All-caps / title-case names near center
- Set abbreviations near bottom (varies by era — keep parsers soft)

### Matching

Score reference cards by:

1. Exact collector number + set code
2. Fuzzy name + collector number
3. Name only (lowest confidence)

Return top 5. Expose match score to UI as Low / Medium / High, not raw floats.

### Photo storage

- Store JPEG/HEIC in app Documents or SwiftData external storage
- Keep a thumbnail for list cells
- Link path/id on `CollectionItem`

## Privacy & performance

- All OCR on-device in MVP; no upload of card images
- Tear down `AVCaptureSession` when leaving Scan
- Handle interrupted sessions (phone call, background)

## Failure modes

| Case | Behavior |
|---|---|
| Camera denied | Explain + link to Settings; offer photo library / manual add |
| No text found | Manual search |
| Multiple strong matches | List them; do not pick silently |
| Graded slab in case | OCR cert / label if visible; still ask for PSA grade confirmation |

## References

Load `references/vision-pipeline.md` when implementing OCR parsing or rectangle detection details.

## Verification

- [ ] Device: scan a common modern card → correct top match within top 3 often
- [ ] Confirm flow creates inventory item with photo
- [ ] Denied-camera path still allows cataloging
- [ ] Session stops when navigating away
---

# Related skills

- `collection-inventory-model` — what to save after confirm
- `ios-swiftui-scaffold` — Scan feature folder placement
- `pokemon-catalog-product` — MVP boundaries
