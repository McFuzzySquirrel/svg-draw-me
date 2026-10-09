# Advanced SVG and Animation Feature Plan

## Status

Phase 1 has a versioned project-schema foundation and applies stored object and
layer transforms in PixiJS previews and SVG exports. This roadmap describes
future work; animation playback and layer editing controls are not shipped
application behavior.

## Problem and proposed approach

SVG Draw Me currently has a versioned project model for strokes, shapes, and
reference layers, but rendering and export are static. The project needs a
future-proof advanced-SVG foundation that can add predefined animations without
forcing immediate support for a full timeline editor or animated standard-SVG
export.

The recommended approach is to extend the project model in compatible phases:
introduce named layers/groups, stable object identifiers, transforms, and
animation definitions first; render those definitions through a centralized
PixiJS animation controller; expose a small preset-based control surface; and
preserve the animation configuration in editable SVG metadata. Standard SVG
export remains a static snapshot in the first release. Additional SVG
authoring features should build on the same object/layer model rather than
adding independent one-off representations.

## Confirmed scope and decisions

- Animations apply to both individual objects and named layers/groups.
- The first editor UI uses predefined animation presets with duration, delay,
  and loop/playback controls; it does not require a visual timeline.
- Downloaded editable SVG preserves animation metadata, but standard SVG export
  is static in the first release.
- The broader advanced-SVG roadmap includes layers, transforms, gradients,
  filters/effects, text, path editing, SVG compatibility/fallback handling, and
  accessibility/reduced-motion behavior.

## Phased implementation plan

### Phase 1: Model and compatibility foundation

- Define a versioned scene/object model that gives strokes, shapes, imported
  SVGs, and future text objects stable IDs and optional layer membership.
- Add named layers/groups with ordering, visibility, opacity, and parent/group
  relationships; preserve the current flat project as a valid migration input.
- Add transform state using a consistent project-space representation and
  centralize transform application for PixiJS rendering and SVG serialization.
  Translation uses project-space units, rotation uses radians, and scale uses
  dimensionless x/y factors.
- Define validated animation data: preset type, target object/layer ID, duration,
  delay, iteration/loop mode, direction, easing, and enabled state.
- Add deserialization migration and invalid-data handling so older version-1
  projects still load without silently accepting malformed animation values.

### Phase 2: Runtime animation engine

- Build a pure animation evaluator/controller that maps elapsed time to
  property values without coupling the project model to PixiJS display objects.
- Implement a deliberately small initial preset set, such as fade, move,
  scale, rotate, draw/reveal, pulse, and color/opacity emphasis.
- Support animation targets at object and layer scope, deterministic start/stop,
  looping, delay, reverse/alternate direction, and a global play/pause/reset
  state.
- Drive updates from the PixiJS ticker while keeping static rendering and export
  deterministic when animation is paused or reset.
- Respect `prefers-reduced-motion` by default and provide a user-visible motion
  toggle; avoid animation-only status or interaction failures.

### Phase 3: Preset-based editor controls

- Add a compact animation panel with target selection, preset selection,
  duration, delay, loop mode, easing, enable/disable, play, pause, and reset.
- Add layer/object selection and ordering controls so animation targets can be
  chosen without editing raw metadata.
- Define behavior for deleting targets, undo/redo, clearing the canvas, and
  importing/exporting projects with animations.
- Keep controls keyboard accessible and expose animation state through labels,
  status text, and non-motion alternatives.

### Phase 4: Editable SVG and compatibility behavior

- Extend editable SVG metadata to preserve layers, transforms, text/effects,
  and animation definitions while keeping metadata escaped and bounded.
- Keep standard SVG export as a static snapshot with transforms and visual
  styles applied; document that animation metadata is available only in the
  editable artifact initially.
- Establish an SVG compatibility policy for unsupported imported features:
  preserve original markup where possible, render a safe fallback/reference,
  and report unsupported filters, masks, CSS, external assets, or animation
  constructs explicitly rather than silently claiming fidelity.
- Add import/export round-trip fixtures for supported and unsupported cases.

### Phase 5: Advanced SVG authoring surfaces

- Add gradient fills and strokes through a shared paint model that exports
  portable SVG definitions.
- Add filter/effect definitions with a constrained supported subset and clear
  performance/resource limits.
- Add text objects with font family, size, alignment, fill/stroke, and a policy
  for missing fonts and text-to-path conversion.
- Add path/object selection and point editing built on stable IDs and the
  existing geometry helpers.
- Add layer/group duplication, reordering, isolation, visibility, and opacity
  controls.
- Reuse transforms, layers, and stable IDs across all new object types.

### Phase 6: Verification and documentation

- Add unit tests for schema migration, validation, animation interpolation,
  preset behavior, reduced-motion defaults, layer targeting, and static versus
  editable export.
- Add browser-level interaction coverage for animation controls, selection,
  playback, reset, and keyboard accessibility when the project’s test setup
  supports it.
- Update the user guide, README feature/architecture sections, administrator
  guidance where performance or browser support changes, and relevant ADRs.
- Record a release note and document explicit limitations for unsupported SVG
  features and standard-export animation behavior.

## Important considerations

- Do not make the first animation release depend on SMIL or CSS animation
  serialization; the editable metadata path avoids committing to a browser
  interoperability choice before the runtime model is proven.
- Keep animation state separate from canonical geometry so pausing or previewing
  never mutates saved coordinates or stroke history.
- Use explicit limits for filter complexity, object count, animation duration,
  and nested groups to protect browser performance.
- Treat imported SVG markup and external references as untrusted input; preserve
  data only after validating the supported surface and clearly reporting
  fallbacks.
- The broad adjacent-feature list should be delivered incrementally. Layers,
  transforms, and compatibility are prerequisites for animation; gradients,
  filters, text, and path editing can follow on the shared model.

## Relevant implementation surfaces

- [Project model types](../../src/types.ts)
- [Project serialization and migration](../../src/document.ts)
- [PixiJS rendering and controls](../../src/main.ts)
- [SVG export](../../src/svg.ts)
- [Project-model tests](../../tests/document.test.ts)
- [User guide](../user-guide.md)
- [Rendering ADR](../adr/0001-pixi-client-rendering.md)
- [Document-model ADR](../adr/0002-stroke-preserving-document-model.md)
- [SVG-reference ADR](../adr/0003-vector-svg-reference-preview.md)
