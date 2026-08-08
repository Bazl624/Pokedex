# Vision pipeline details

## Capture still for OCR

Prefer a single high-resolution still over running `VNRecognizeTextRequest` on every preview frame.

1. User frames card in guide.
2. Shutter → `AVCapturePhoto`.
3. Convert to `CGImage` / `CIImage`.
4. Optionally downscale longest edge to ~1600–2000px before Vision for speed.
5. Run OCR; keep original for display/storage.

## Optional rectangle assist

`VNDetectRectanglesRequest` can help with:

- Drawing the guide highlight when a card-like rectangle is stable
- Perspective-correcting the crop before OCR

MVP may skip auto-warp and rely on the user holding the card flat. Add warp only if OCR quality is poor in testing.

## Parsing heuristics (Pokemon TCG)

Collectors numbers appear in many formats across eras:

| Era / style | Examples |
|---|---|
| Classic | `4/102`, `58/62` |
| XY–SV style | `025/165`, `193/182` |
| Trainer Gallery / special | `TG01/TG30`, `GG14/GG70` |
| Promo | `SWSH001`, `SVP012` |

Regex starters (tune in tests):

```text
(?i)\b(\d{1,3})\s*/\s*(\d{1,3})\b
(?i)\b((?:TG|GG|SVP|SWSH|SM|XY)\s?\d{1,3})\b
```

Names: take the highest-confidence line that is not a number-only line and not a common footer word (`Illus.`, `©`, energy symbols OCR garbage).

Set names/logos OCR poorly — prefer number + fuzzy name.

## Graded slabs (PSA)

When the frame is a slab:

- Prefer OCR of the PSA label grade (`GEM MT 10`, `MINT 9`, etc.) and cert number
- Still require user confirmation of grade + company
- Store slab photo; identity match may still use the card face visible through the slab

## Testing without hardware

- Fixture images under `PokedexTests/Fixtures/Cards/`
- Unit-test parsers with known OCR string dumps
- UI test with photo library injection where possible

## Accuracy expectations

On-device OCR will miss foil glare and soft focus. Design for assistive scanning, not autonomous ingestion of binders.
