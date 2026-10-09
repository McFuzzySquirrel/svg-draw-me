# Changelog

All notable changes are documented here. This project follows Keep a Changelog conventions.

## [Unreleased]

### Planned

- Browser-level interaction coverage.
- Gradient strokes, shared paint resources, text-to-path conversion, and
  additional SVG path commands such as elliptical arcs.

### Added

- Select tool for artwork, text, references, and named layers, including
  marquee selection, transforms, flips, deletion, duplication, internal
  copy/cut/paste, grouping/ungrouping, grid snapping, keyboard movement, and a
  context menu. Groups reuse named layers and preserve supported transforms;
  animated groups must be unanimated before ungrouping.
- Dedicated top-level Undo icon for quick history access.
- Contextual Draw menu groups that show text, shape, and bucket settings only
  for the tools that use them.
- Category command menu with compact accessible icons, anchored popups, and
  keyboard/outside-click dismissal behavior.
- First-class line, rectangle, ellipse, polygon, and curved-line tools.
- Optional shape fills.
- Fill bucket for tolerant closed freehand loops.
- Whole-object eraser with undo support.
- Editable canvas dimensions and grid spacing; imported references automatically expand the canvas to fit.
- Eraser support for imported reference images and SVGs, with undo.
- Project-bound drawing and clipping, optional grid overlay, and a touch-friendly Pan tool.
- Save and reopen local `.svgdraw` project files to continue editing.
- Compact, accessible icon buttons for common toolbar actions.
- Validated object/layer animation metadata with preset preview playback,
  timing controls, reset, and reduced-motion support.
- Layer management controls, unsupported-SVG feature reporting, bounded
  editable metadata, and editable text objects with SVG export.
- Two-color linear or radial gradient fills for new filled shapes.
- Bounded blur effects and numeric SVG path-node editing for supported
  M/L/Q/C/Z commands, including imported path extraction.
- Object-to-layer assignment and generic sans-serif font fallback for text.

### Fixed

- Restored all toolbar commands in the category menu, including both reference
  imports, project open/save, exports, and labeled command subgroups.
- Kept command popups hidden on first load until their category is selected.
- Kept artwork and the grid visible above imported reference images.
- Restored visible drawing while keeping artwork clipped to the project canvas.

## [0.1.0] - 2026-10-08

### Added

- Responsive PixiJS drawing workspace.
- Mouse, touch, and pen/stylus stroke capture.
- Stroke-preserving project model with point, pressure, timing, pointer type, and style metadata.
- Raster reference image import.
- Crisp vector SVG reference import.
- Standard and editable SVG downloads.
- Undo, clear, zoom, pinch, wheel navigation, and panning.
- Unit tests and production build validation.

### Fixed

- Made shape fill controls explicit with separate **Fill shape** and **Fill color** labels.
- Pointer alignment when the responsive canvas is letterboxed.
- Invisible reference previews caused by unloaded URL textures.
- SVG import decoding for uploaded SVG files.
