# Changelog

All notable changes are documented here. This project follows Keep a Changelog conventions.

## [Unreleased]

### Planned

- Layer management and more advanced editing controls.
- Browser-level interaction coverage.

### Added

- First-class line, rectangle, ellipse, polygon, and curved-line tools.
- Optional shape fills.
- Fill bucket for tolerant closed freehand loops.
- Collapsible mobile toolbar menu.
- Whole-object eraser with undo support.
- Editable canvas dimensions and grid spacing; imported references automatically expand the canvas to fit.
- Eraser support for imported reference images and SVGs, with undo.
- Project-bound drawing and clipping, optional grid overlay, and a touch-friendly Pan tool.
- Save and reopen local `.svgdraw` project files to continue editing.
- Compact, accessible icon buttons for common toolbar actions.

### Fixed

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
