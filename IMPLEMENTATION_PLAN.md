# SVG Draw Me Implementation Plan

## Product goal

Create a responsive browser app where users can draw with a mouse, touch screen, or stylus; upload a hand-drawn raster image as a tracing reference; import existing SVG artwork; and export vector artwork while preserving how the drawing was made.

“Preserving how it was made” means retaining individual stroke boundaries, stroke order, point sequence, timing/order metadata, pointer type, pressure when available, and style data. It does not mean recording a video or every raw browser event.

## Execution status

- [x] **Phase 1 — Foundation and document model**
- [x] **Phase 2 — Interactive drawing**
- [x] **Phase 3 — Reference and SVG imports**
- [x] **Phase 4 — Exports**
- [x] **Phase 5 — Hardening and product polish**

Work should stop at the end of each phase for verification and user approval before continuing.

## Follow-up fix — Pointer alignment (complete)

The pointer conversion now subtracts the same centered letterbox offsets used to render the project before converting screen pixels into document coordinates. This keeps the first point of each stroke under the cursor while preserving the project aspect ratio.

Covered by `tests/coordinates.test.ts`.

## Follow-up fix — Reference previews (complete)

Raster and SVG references now load through PixiJS v8 `Assets.load`, with errors reported in the status area. Preview sprites are kept in a dedicated container behind the drawing layer and share the same centered project-space transform as user strokes.

## Follow-up fix — SVG decode failure (complete)

Uploaded SVG markup now loads through an `image/svg+xml` Blob URL and PixiJS’s vector SVG parser. The preview remains crisp when scaled, the temporary URL is revoked after loading, and the original markup remains stored for export.

## Phase 1 — Foundation and document model

### Scope

- Create the TypeScript/Vite/PixiJS package and responsive application shell.
- Add accessible toolbar and canvas-host controls.
- Define versioned project, stroke, point, style, raster-reference, and imported-SVG types.
- Implement project serialization/deserialization and baseline SVG serialization helpers.
- Add focused unit tests.

### Exit criteria

- `npm test` passes.
- `npm run build` passes.
- Ordered stroke metadata round-trips through serialization.
- The project has a stable coordinate-space and document model for future phases.

### Delivered

- `src/types.ts` contains the versioned document types.
- `src/document.ts` provides project creation, cloning, serialization, deserialization, and stroke appending.
- `src/svg.ts` provides standard and editable SVG output helpers.
- `src/main.ts` provides the initial responsive PixiJS application shell and controls.
- `tests/document.test.ts` covers metadata round-tripping and SVG path output.

## Phase 2 — Interactive drawing (complete)

### Scope

- Add PixiJS canvas setup and responsive document-to-screen coordinate mapping.
- Capture mouse, touch, and stylus pointer input.
- Render strokes with style controls and pressure metadata.
- Add undo, clear, and redraw behavior.

### Exit criteria

- A user can draw with mouse, touch, and stylus-compatible pointer events.
- Strokes remain separate and ordered in the document model.
- Undo and clear do not flatten or discard recoverable stroke history.

## Phase 3 — Reference and SVG imports (complete)

### Scope

- Import PNG/JPG files as non-destructive tracing references.
- Import SVG files as separate retained vector layers.
- Add visibility, opacity, positioning, and inclusion behavior for reference layers.

### Exit criteria

- Imported references remain separate from user strokes.
- Raster and SVG references can be previewed without changing the canonical stroke history.
- Invalid or unsupported files produce a visible user-facing error.

## Phase 4 — Exports (complete)

### Scope

- Generate standard visual SVG with correct geometry, styles, dimensions, and layer order.
- Generate an editable stroke-preserving SVG/project artifact with versioned metadata.
- Add explicit export options for including reference layers.

### Exit criteria

- Standard SVG opens in common viewers.
- Editable output round-trips without losing stroke order or metadata.
- Reference inclusion is explicit and deterministic.

## Phase 5 — Hardening and product polish (complete)

### Scope

- Add browser-level interaction coverage where practical.
- Improve validation and user-facing errors for malformed imports and unsupported SVG content.
- Verify responsive behavior, accessibility, and production build output.

### Exit criteria

- Targeted tests, type checking, build, and manual smoke checks pass for the complete first release.

## Commands

```bash
npm install
npm test
npm run build
npm run dev
```
