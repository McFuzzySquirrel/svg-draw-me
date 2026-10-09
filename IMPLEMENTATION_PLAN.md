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

## Follow-up feature — Zoom and navigation (complete)

The viewport now keeps document coordinates stable while providing 25%–800% zoom, visible zoom controls, pointer-centered wheel zoom, two-finger pinch zoom, and Space/middle-mouse panning. Drawing strokes and imported references share the same transformed project-space viewport.

## Follow-up feature — GitHub Pages deployment (complete)

The Vite app now uses relative asset paths and includes a GitHub Actions workflow that runs tests, builds the production bundle, uploads `dist/`, and deploys it to GitHub Pages on pushes to `main` or manual workflow dispatch.

## Follow-up feature — Mobile menu and freehand fill bucket (complete)

The toolbar can now collapse on narrow screens through an accessible Menu/Hide menu toggle. A Fill bucket tool fills tolerant closed freehand loops while preserving the original stroke points and metadata; filled loops render, export, and undo as editable stroke objects.

## Follow-up feature — Eraser and first-class shape tools (complete)

The document model now stores first-class lines, rectangles, ellipses, polygons, and quadratic curved lines alongside freehand strokes. The toolbar exposes Pen, Eraser, shape selection, outline controls, and optional fills. The eraser removes a complete touched object and participates in undo. Shape geometry is rendered through PixiJS and exported to standard and editable SVG.

## Follow-up feature — Project bounds, save/reopen, grid, and mobile navigation (complete)

Drawing input is clamped to the project dimensions, while the viewport mask and SVG clip path keep artwork and references within the canvas. Users can toggle a non-exported alignment grid, save and reopen the complete project as a local `.svgdraw` file, and pan with a touch-friendly Pan tool. Two-finger pinch gestures now pan and zoom together, and common toolbar actions use compact accessible icon buttons.

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
