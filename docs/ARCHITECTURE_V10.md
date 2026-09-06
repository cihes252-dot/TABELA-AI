# TABELA AI V10 Architecture

```text
Mobile Field UI (PWA / WebView)
├─ Camera capture
├─ GPS
├─ Shape Engine
├─ OCR Engine
├─ Duplicate Engine
├─ Construction review
├─ Metric Bridge
├─ Local Storage + Sync Queue
├─ Map
└─ Report
        │
        ├─ iOS WKWebView ↔ ARKit bridge
        ├─ Android WebView ↔ ARCore bridge
        │
        └─ REST Backend
             ├─ signs
             ├─ stats
             └─ JSON persistence example

Admin Panel
├─ local records or REST API
├─ map
├─ search
├─ stats
└─ CSV
```

## Measurement contract
Native layer sends a payload only after real AR points are resolved:

```json
{
  "verified": true,
  "source": "ARKit-3D-iPhone",
  "shapeType": "horizontal-rectangle",
  "widthM": 5.2,
  "heightM": 1.1,
  "areaM2": 5.72,
  "distanceM": 7.4
}
```

The web Metric Engine rejects payloads without `verified=true`.

## Duplicate contract
Duplicate scoring uses:
- GPS distance
- normalized OCR similarity
- shape match
- sign type match

Strong duplicate candidates are blocked from normal save in the V10 field UI and surfaced for review.

## Data model
Each record contains ID, date/time, project, sign type, shape, OCR, OCR confidence, material selections, GPS + accuracy, measurement status, dimensions/area/distance, duplicate score and a small thumbnail.
