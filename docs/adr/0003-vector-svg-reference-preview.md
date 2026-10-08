# ADR-0003: Use Vector Parsing for SVG Reference Previews

- **Status:** Accepted
- **Deciders:** SVG Draw Me maintainers
- **Date:** 2026-10-08

**Technical Story:** Imported SVG references must remain useful for game-asset work

## Context and Problem Statement

Imported SVGs should remain crisp when zoomed and should retain their original markup for export. Should previews be rasterized into fixed-resolution textures or parsed as vector graphics?

## Decision Drivers

- Crisp scaling for small game assets.
- Compatibility with the project’s vector-oriented workflow.
- Preserve original SVG markup independently of preview rendering.
- Keep unsupported-feature behavior explicit.

## Considered Options

- Rasterize every imported SVG into a texture.
- Parse imported SVGs into PixiJS graphics contexts.
- Render imported SVGs directly as DOM/SVG overlays.

## Decision Outcome

Chosen option: “Parse imported SVGs into PixiJS graphics contexts”, because it keeps previews crisp across the supported SVG subset and shares the same transformed viewport as user strokes.

### Positive Consequences

- Small assets remain sharp at high zoom.
- Preview geometry participates in the PixiJS scene and shared project transform.
- Original markup remains available for export.

### Negative Consequences

- Filters, masks, advanced CSS, and external references may not preview identically.
- Parser failures must be surfaced to users.
- DOM-level SVG fidelity is not guaranteed.

## Pros and Cons of the Options

### Rasterized texture preview

- Good, because browser image decoding can support more visual effects.
- Bad, because fixed raster resolution can blur when zoomed.

### PixiJS vector graphics context

- Good, because supported geometry stays crisp and transformable.
- Bad, because the supported SVG subset is narrower than full browser SVG.

### DOM/SVG overlay

- Good, because it delegates rendering to the browser's SVG implementation.
- Bad, because it complicates scene transforms, input routing, and canvas export.

## Links

- Implemented by [src/main.ts](../../src/main.ts)
- Implemented by [src/imports.ts](../../src/imports.ts)
- Tested by [tests/imports.test.ts](../../tests/imports.test.ts)
