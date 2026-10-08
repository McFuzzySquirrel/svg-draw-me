# ADR-0002: Keep a Stroke-Preserving Document Model

- **Status:** Accepted
- **Deciders:** SVG Draw Me maintainers
- **Date:** 2026-10-08

**Technical Story:** Requirement to preserve how artwork was drawn

## Context and Problem Statement

The product must export game or standard SVG assets without losing how the image was created. Should the app store only rendered pixels/paths, or retain ordered editable stroke and shape records?

## Decision Drivers

- Preserve stroke order and boundaries.
- Retain pointer type, pressure, timing, and style metadata.
- Keep exports reproducible.
- Allow viewport zoom and pan without changing document coordinates.

## Considered Options

- Store only a flattened raster image.
- Store only final SVG geometry.
- Store a versioned project model containing ordered strokes, first-class shapes, and reference layers.

## Decision Outcome

Chosen option: “Store a versioned project model containing ordered strokes, first-class shapes, and reference layers”, because it preserves the drawing process while still allowing standard SVG geometry to be generated.

### Positive Consequences

- Individual strokes and shapes remain available for future editing and analysis.
- Standard and editable exports can be generated from one canonical model.
- Zoom, pan, and rendering changes do not rewrite saved artwork coordinates.

### Negative Consequences

- Project metadata is larger and more complex than a flattened image.
- Standard SVG has no universal stroke-history format, so editable export uses metadata.
- Version migrations will be needed if the model changes.

## Pros and Cons of the Options

### Flattened raster image

- Good, because it is simple to display and share.
- Bad, because stroke order and editability are lost.

### Final SVG geometry only

- Good, because it is a portable vector output.
- Bad, because separate stroke history and input metadata may be lost.

### Versioned stroke-and-shape-preserving project model

- Good, because it supports editing history, editable shapes, and ordinary SVG export.
- Bad, because it requires serialization validation and future schema maintenance.

## Links

- Implemented by [src/types.ts](../../src/types.ts)
- Implemented by [src/document.ts](../../src/document.ts)
- Implemented by [src/svg.ts](../../src/svg.ts)
- Tested by [tests/document.test.ts](../../tests/document.test.ts)
