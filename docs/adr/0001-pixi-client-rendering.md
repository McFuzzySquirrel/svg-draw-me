# ADR-0001: Use PixiJS for Client-Side Rendering

- **Status:** Accepted
- **Deciders:** SVG Draw Me maintainers
- **Date:** 2026-10-08

**Technical Story:** Initial application implementation

## Context and Problem Statement

The application needs a responsive interactive canvas for mouse, touch, and pen input, imported reference layers, zoom, pan, and vector-oriented rendering. Which rendering boundary should the first implementation use?

## Decision Drivers

- Responsive pointer interaction.
- Shared transforms for drawing and reference layers.
- Browser-only deployment with no rendering service.
- A path toward game-asset workflows.

## Considered Options

- PixiJS client-side rendering.
- Native SVG/DOM rendering.
- Canvas 2D with a custom scene and input layer.

## Decision Outcome

Chosen option: “PixiJS client-side rendering”, because it provides an interactive scene graph, pointer event support, transforms, and SVG parsing in a browser-only package.

### Positive Consequences

- A single viewport transform can move drawing and reference layers together.
- Pointer, touch, and pen events can be handled without a backend.
- The renderer can evolve toward game-asset previews.

### Negative Consequences

- PixiJS adds bundle size and a specialized rendering API.
- Some SVG features do not map perfectly to PixiJS's vector parser.
- Browser-level rendering behavior still needs manual compatibility checks.

## Pros and Cons of the Options

### PixiJS client-side rendering

- Good, because it supports the required interactive viewport and scene layering.
- Bad, because it introduces a rendering dependency and parser-specific SVG limitations.

### Native SVG/DOM rendering

- Good, because browser SVG rendering has broad markup compatibility.
- Bad, because high-frequency interaction, transforms, and mixed reference layers would require more custom coordination.

### Canvas 2D with custom scene management

- Good, because it is broadly available and has a small conceptual API.
- Bad, because vector import and retained scene behavior would need more custom implementation.

## Links

- Implemented by [src/main.ts](../../src/main.ts)
- Implemented by [src/imports.ts](../../src/imports.ts)
- Related: [ADR-0003](0003-vector-svg-reference-preview.md)
