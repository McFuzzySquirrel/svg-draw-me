# Changelog

All notable changes are documented here. This project follows Keep a Changelog conventions.

## [Unreleased]

### Planned

- Project save/reopen workflow.
- Layer management and more advanced editing controls.
- Browser-level interaction coverage.

### Added

- First-class line, rectangle, ellipse, polygon, and curved-line tools.
- Optional shape fills.
- Whole-object eraser with undo support.

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
