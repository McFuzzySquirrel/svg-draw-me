import { Application, Assets, BlurFilter, Container, FillGradient, Graphics, Sprite, Text as PixiText } from "pixi.js";
import { evaluateAnimation } from "./animation";
import { clampProjectPoint, viewportToProject, zoomTransformAtPoint } from "./coordinates";
import { appendShape, appendStroke, applyFill, cloneProject, createProject, deserializeProject, dimensionsForBounds, serializeProject } from "./document";
import { createSvgBlob, findUnsupportedSvgFeatures, getSvgDimensions } from "./imports";
import { projectToEditableSvg, projectToSvg } from "./svg";
import { findFillTarget, inverseTransformPoint, isClosedStroke, pointHitsReference, pointHitsShape, pointHitsStroke } from "./geometry";
import { parseEditablePath } from "./path";
import { applyProjectTransform, createProjectLayerContainers } from "./transforms";
import type { DrawingProject, GradientPaint, PathCommand, PointerKind, Shape, ShapeDraft, ShapeKind, Stroke, StrokePoint, StrokeStyle, TextObject } from "./types";
import "./styles.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("App root is missing.");

const project = createProject();
const history: DrawingProject[] = [];
let currentStyle: StrokeStyle = {
  color: "#1e293b",
  width: 8,
  opacity: 1,
  lineCap: "round",
  lineJoin: "round",
};
let activeTool: "pen" | "eraser" | "fill" | "pan" | "text" | ShapeKind = "pen";
let fillEnabled = false;
let fillColor = "#93c5fd";
let gradientEnabled = false;
let gradientEndColor = "#2563eb";
let blurEnabled = false;
let blurStrength = 4;
let fillMode: "color" | "none" = "color";
let activePoints: StrokePoint[] = [];
let activePointer: { id: number; type: PointerKind; startedAt: number } | null = null;
let drawingLayer: Container;
let previewLayer: Graphics;
let referencesLayer: Container;
let viewportLayer: Container;
let gridLayer: Graphics;
let viewportMask: Graphics;
let gridEnabled = false;
let gridSize = 50;
let canvasScale = 1;
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let fitScale = 1;
let zoom = 1;
let panX = 0;
let panY = 0;
let spacePressed = false;
let panPointer: { id: number; x: number; y: number } | null = null;
const pointers = new Map<number, { x: number; y: number; type: string }>();
let pinchStart: { distance: number; zoom: number; x: number; y: number; panX: number; panY: number } | null = null;
let referenceBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
let referenceRenderVersion = 0;
let animationElapsed = 0;
let animationPlaying = false;
let animationAddEnabled = true;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const animatedDisplays: Array<{
  display: Container;
  targetType: "object" | "layer";
  targetId: string;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  alpha: number;
}> = [];

const updateAnimatedDisplays = (): boolean => {
  let active = false;
  for (const item of animatedDisplays) {
    const sample = {
      translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    };
    for (const animation of project.animations) {
      if (animation.targetType !== item.targetType || animation.targetId !== item.targetId) continue;
      const next = evaluateAnimation(animation, animationElapsed, reducedMotion);
      sample.translateX += next.translateX;
      sample.translateY += next.translateY;
      sample.scaleX *= next.scaleX;
      sample.scaleY *= next.scaleY;
      sample.rotation += next.rotation;
      sample.opacity *= next.opacity;
      active ||= next.active || animation.enabled && !reducedMotion &&
        (animation.iterations === "infinite" ||
          animationElapsed < animation.delay + animation.duration * animation.iterations);
    }
    item.display.position.set(item.position.x + sample.translateX, item.position.y + sample.translateY);
    item.display.scale.set(item.scale.x * sample.scaleX, item.scale.y * sample.scaleY);
    item.display.rotation = item.rotation + sample.rotation;
    item.display.alpha = item.alpha * sample.opacity;
  }
  return active;
};

const controls = document.createElement("section");
controls.className = "controls";
controls.innerHTML = `
  <button id="menu-toggle" class="menu-toggle" type="button" aria-expanded="true" aria-controls="drawing-controls" aria-label="Hide menu" title="Hide menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
  <span id="drawing-controls" class="toolbar-controls">
  <div class="brand"><strong>SVG Draw Me</strong><span>stroke-preserving sketchbook</span></div>
  <label>Color <input id="color" type="color"></label>
  <label>Width <input id="width" type="range" min="1" max="60"><output id="width-value"></output></label>
  <label>Canvas width <input id="canvas-width" type="number" min="1" step="1"></label>
  <label>Canvas height <input id="canvas-height" type="number" min="1" step="1"></label>
  <label>Grid size <input id="grid-size" type="number" min="1" step="1"></label>
  <label>Tool <select id="tool"><option value="pen">Pen</option><option value="pan">Pan</option><option value="eraser">Eraser</option><option value="fill">Fill bucket</option><option value="text">Text</option><option value="line">Line</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option><option value="curve">Curved line</option><option value="path">Path</option></select></label>
  <label>Text <input id="text-content" type="text" maxlength="10000" value="Text"></label>
  <label>Text size <input id="text-size" type="number" min="1" step="1" value="32"></label>
  <label>Font <input id="text-font" type="text" value="Inter, sans-serif"></label>
  <span class="control-group" aria-label="Shape fill controls">
    <label for="fill-enabled"><input id="fill-enabled" type="checkbox"> Fill shape</label>
    <label for="fill-color">Fill color <input id="fill-color" type="color"></label>
    <label for="fill-mode">Bucket action
      <select id="fill-mode">
        <option value="color">Apply color</option>
        <option value="none">No fill</option>
      </select>
    </label>
    <label for="gradient-fill"><input id="gradient-fill" type="checkbox"> Linear gradient</label>
    <label for="gradient-type">Gradient type
      <select id="gradient-type"><option value="linear">Linear</option><option value="radial">Radial</option></select>
    </label>
    <label for="gradient-end">Gradient end <input id="gradient-end" type="color"></label>
    <label for="blur-effect"><input id="blur-effect" type="checkbox"> Blur effect</label>
    <label for="blur-strength">Blur <input id="blur-strength" type="number" min="0.1" max="50" step="0.1"></label>
    <button id="clear-fill" type="button" aria-label="Clear fill" title="Clear fill"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.5 13.5 7l5.5 5.5-10.5 10.5H3zM14 6l2-2 5.5 5.5-2 2"/></svg></button>
  </span>
  <button id="undo" type="button" aria-label="Undo" title="Undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/></svg></button>
  <button id="clear" type="button" aria-label="Clear canvas" title="Clear canvas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></button>
  <button id="grid-toggle" type="button" aria-pressed="false" aria-label="Show grid" title="Show grid"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16"/></svg></button>
  <span class="zoom-controls" aria-label="Zoom controls">
    <button id="zoom-out" type="button" aria-label="Zoom out" title="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
    <output id="zoom-value">100%</output>
    <button id="zoom-in" type="button" aria-label="Zoom in" title="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14"/></svg></button>
    <button id="zoom-reset" type="button" aria-label="Reset zoom" title="Reset zoom"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 1 1 1 8M4 4v5h5"/></svg></button>
  </span>
  <label class="file-button">Reference image<input id="raster" type="file" accept="image/png,image/jpeg"></label>
  <label class="file-button">Import SVG<input id="svg" type="file" accept="image/svg+xml,.svg"></label>
  <button id="load-project" class="file-button" type="button">Open project</button><input id="project-file" type="file" accept="application/json,.json,.svgdraw" hidden>
  <button id="save-project" type="button" aria-label="Save project" title="Save project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8"/></svg></button>
  <button id="export-svg" type="button" aria-label="Download SVG" title="Download SVG"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg></button>
  <button id="export-editable" type="button" aria-label="Download editable SVG" title="Download editable SVG"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4M7 3h10"/></svg></button>
  <details class="animation-panel">
    <summary>Animation</summary>
    <label>Target <select id="animation-target"></select></label>
    <label>Existing <select id="animation-existing"></select></label>
    <label><input id="animation-enabled" type="checkbox" checked> Enabled</label>
    <label>Preset <select id="animation-preset">
      <option value="fade">Fade</option><option value="move">Move</option><option value="scale">Scale</option>
      <option value="rotate">Rotate</option><option value="draw">Draw</option><option value="pulse">Pulse</option><option value="emphasis">Emphasis</option>
    </select></label>
    <label>Duration <input id="animation-duration" type="number" min="1" step="1" value="1000"></label>
    <label>Delay <input id="animation-delay" type="number" min="0" step="1" value="0"></label>
    <label>Iterations <input id="animation-iterations" type="number" min="1" step="1" value="1"></label>
    <label>Direction <select id="animation-direction"><option value="normal">Normal</option><option value="reverse">Reverse</option><option value="alternate">Alternate</option><option value="alternate-reverse">Alternate reverse</option></select></label>
    <label>Easing <select id="animation-easing"><option value="linear">Linear</option><option value="ease">Ease</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in-out</option></select></label>
    <button id="animation-add" type="button">Add animation</button>
    <button id="animation-delete" type="button">Delete selected</button>
    <button id="animation-play" type="button" aria-pressed="false">Play</button>
    <button id="animation-reset" type="button">Reset</button>
    <label><input id="reduced-motion" type="checkbox"> Reduce motion</label>
  </details>
  <details class="layers-panel">
    <summary>Layers</summary>
    <label>Layer <select id="layer-selected"></select></label>
    <label>Object <select id="object-layer-target"></select></label>
    <label>Assign to <select id="object-layer-value"></select></label>
    <button id="object-layer-save" type="button">Assign object</button>
    <label>Name <input id="layer-name" type="text" value=""></label>
    <label>Opacity <input id="layer-opacity" type="number" min="0" max="1" step="0.05" value="1"></label>
    <label><input id="layer-visible" type="checkbox" checked> Visible</label>
    <button id="layer-add" type="button">Add layer</button>
    <button id="layer-save" type="button">Save layer</button>
    <button id="layer-up" type="button">Move up</button>
    <button id="layer-down" type="button">Move down</button>
    <button id="layer-delete" type="button">Delete layer</button>
  </details>
  <details class="path-editor-panel">
    <summary>Edit paths</summary>
    <label>Path <select id="path-selected"></select></label>
    <label>Node <select id="path-node"></select></label>
    <label>Command <select id="path-command"><option value="M">Move</option><option value="L">Line</option><option value="Q">Quadratic</option><option value="C">Cubic</option><option value="Z">Close</option></select></label>
    <label>x <input id="path-x" type="number" step="1"></label>
    <label>y <input id="path-y" type="number" step="1"></label>
    <label>x1 <input id="path-x1" type="number" step="1"></label>
    <label>y1 <input id="path-y1" type="number" step="1"></label>
    <label>x2 <input id="path-x2" type="number" step="1"></label>
    <label>y2 <input id="path-y2" type="number" step="1"></label>
    <button id="path-save" type="button">Save node</button>
  </details>
  <p id="status" role="status">Draw with a mouse, finger, or stylus.</p>
  </span>
`;
controls.querySelector<HTMLInputElement>("#color")!.value = currentStyle.color;
controls.querySelector<HTMLInputElement>("#width")!.value = String(currentStyle.width);
controls.querySelector<HTMLOutputElement>("#width-value")!.value = `${currentStyle.width}px`;
controls.querySelector<HTMLInputElement>("#canvas-width")!.value = String(project.width);
controls.querySelector<HTMLInputElement>("#canvas-height")!.value = String(project.height);
controls.querySelector<HTMLInputElement>("#grid-size")!.value = String(gridSize);
controls.querySelector<HTMLInputElement>("#fill-color")!.value = fillColor;
controls.querySelector<HTMLInputElement>("#gradient-end")!.value = gradientEndColor;
controls.querySelector<HTMLInputElement>("#blur-strength")!.value = String(blurStrength);
appRoot.append(controls);
const menuToggle = controls.querySelector<HTMLButtonElement>("#menu-toggle");
const toolbarControls = controls.querySelector<HTMLSpanElement>("#drawing-controls");
const setMenuOpen = (open: boolean): void => {
  controls.classList.toggle("menu-collapsed", !open);
  menuToggle?.setAttribute("aria-expanded", String(open));
  menuToggle?.setAttribute("aria-label", open ? "Hide menu" : "Show menu");
  menuToggle?.setAttribute("title", open ? "Hide menu" : "Show menu");
  toolbarControls?.setAttribute("aria-hidden", String(!open));
};
setMenuOpen(!window.matchMedia("(max-width: 640px)").matches);
menuToggle?.addEventListener("click", () => setMenuOpen(controls.classList.contains("menu-collapsed")));

const syncAnimationTargetOptions = (): void => {
  const select = controls.querySelector<HTMLSelectElement>("#animation-target");
  if (!select) return;
  const current = select.value;
  const options = [
    ...project.layers.map((layer) => ({ id: layer.id, label: `Layer: ${layer.name}`, type: "layer" as const })),
    ...project.strokes.map((stroke, index) => ({ id: stroke.id, label: `Stroke ${index + 1}`, type: "object" as const })),
    ...project.shapes.map((shape, index) => ({ id: shape.id, label: `${shape.kind} ${index + 1}`, type: "object" as const })),
    ...project.texts.map((text, index) => ({ id: text.id, label: `Text ${index + 1}: ${text.text.slice(0, 20)}`, type: "object" as const })),
  ];
  select.replaceChildren(...options.map((option) => {
    const element = document.createElement("option");
    element.value = `${option.type}:${option.id}`;
    element.textContent = option.label;
    return element;
  }));
  if (options.some((option) => `${option.type}:${option.id}` === current)) select.value = current;
};

const createGradientPaint = (): GradientPaint => {
  const type = controls.querySelector<HTMLSelectElement>("#gradient-type")?.value;
  return type === "radial"
    ? { type: "radial", startColor: fillColor, endColor: gradientEndColor }
    : { type: "linear", startColor: fillColor, endColor: gradientEndColor, angle: 0 };
};

const syncAnimationList = (): void => {
  const select = controls.querySelector<HTMLSelectElement>("#animation-existing");
  const enabled = controls.querySelector<HTMLInputElement>("#animation-enabled");
  if (!select) return;
  const current = select.value;
  select.replaceChildren(...project.animations.map((animation, index) => {
    const option = document.createElement("option");
    option.value = animation.id;
    option.textContent = `${index + 1}. ${animation.preset} (${animation.targetType})`;
    return option;
  }));
  if (project.animations.some((animation) => animation.id === current)) select.value = current;
  const selected = project.animations.find((animation) => animation.id === select.value);
  if (enabled) enabled.checked = selected ? selected.enabled : animationAddEnabled;
};

const syncLayerControls = (): void => {
  const select = controls.querySelector<HTMLSelectElement>("#layer-selected");
  const name = controls.querySelector<HTMLInputElement>("#layer-name");
  const opacity = controls.querySelector<HTMLInputElement>("#layer-opacity");
  const visible = controls.querySelector<HTMLInputElement>("#layer-visible");
  if (!select) return;
  const current = select.value;
  select.replaceChildren(...project.layers.slice().sort((a, b) => a.order - b.order).map((layer) => {
    const option = document.createElement("option");
    option.value = layer.id;
    option.textContent = layer.name;
    return option;
  }));
  if (project.layers.some((layer) => layer.id === current)) select.value = current;
  const selected = project.layers.find((layer) => layer.id === select.value);
  if (name) name.value = selected?.name ?? "";
  if (opacity) opacity.value = String(selected?.opacity ?? 1);
  if (visible) visible.checked = selected?.visible ?? false;
  const objectTarget = controls.querySelector<HTMLSelectElement>("#object-layer-target");
  const objectLayer = controls.querySelector<HTMLSelectElement>("#object-layer-value");
  if (objectTarget && objectLayer) {
    const currentObject = objectTarget.value;
    const objects = [
      ...project.strokes.map((object, index) => ({ id: object.id, label: `Stroke ${index + 1}`, layerId: object.layerId })),
      ...project.shapes.map((object, index) => ({ id: object.id, label: `${object.kind} ${index + 1}`, layerId: object.layerId })),
      ...project.texts.map((object, index) => ({ id: object.id, label: `Text ${index + 1}`, layerId: object.layerId })),
      ...project.rasterReferences.map((object) => ({ id: object.id, label: `Raster: ${object.name}`, layerId: object.layerId })),
      ...project.importedSvgs.map((object) => ({ id: object.id, label: `SVG: ${object.name}`, layerId: object.layerId })),
    ];
    objectTarget.replaceChildren(...objects.map((object) => {
      const option = document.createElement("option");
      option.value = object.id;
      option.textContent = object.label;
      return option;
    }));
    if (objects.some((object) => object.id === currentObject)) objectTarget.value = currentObject;
    objectLayer.replaceChildren(...[
      { id: "", label: "Root" },
      ...project.layers.slice().sort((a, b) => a.order - b.order).map((layer) => ({ id: layer.id, label: layer.name })),
    ].map((layer) => {
      const option = document.createElement("option");
      option.value = layer.id;
      option.textContent = layer.label;
      return option;
    }));
    const selectedObject = objects.find((object) => object.id === objectTarget.value);
    objectLayer.value = selectedObject?.layerId ?? "";
  }
};

const syncPathEditor = (): void => {
  const select = controls.querySelector<HTMLSelectElement>("#path-selected");
  if (!select) return;
  const current = select.value;
  const paths = project.shapes.filter((shape) => shape.kind === "path");
  select.replaceChildren(...paths.map((shape, index) => {
    const option = document.createElement("option");
    option.value = shape.id;
    option.textContent = `Path ${index + 1}`;
    return option;
  }));
  if (paths.some((shape) => shape.id === current)) select.value = current;
  const selected = paths.find((shape) => shape.id === select.value);
  const nodeSelect = controls.querySelector<HTMLSelectElement>("#path-node");
  if (!selected || !nodeSelect) return;
  const nodeIndex = Math.min(Number(nodeSelect.value) || 0, selected.geometry.commands.length - 1);
  nodeSelect.replaceChildren(...selected.geometry.commands.map((command, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}: ${command.type}`;
    return option;
  }));
  nodeSelect.value = String(nodeIndex);
  const command = selected.geometry.commands[nodeIndex];
  if (!command) return;
  const commandSelect = controls.querySelector<HTMLSelectElement>("#path-command");
  if (commandSelect) commandSelect.value = command.type;
  for (const key of ["x", "y", "x1", "y1", "x2", "y2"]) {
    const input = controls.querySelector<HTMLInputElement>(`#path-${key}`);
    const value = key in command ? command[key as keyof typeof command] : undefined;
    if (input) input.value = typeof value === "number" ? String(value) : "";
    input?.toggleAttribute("disabled", !(key in command));
  }
};

const workspace = document.createElement("main");
workspace.className = "workspace";
const canvasHost = document.createElement("div");
canvasHost.className = "canvas-host";
canvasHost.setAttribute("aria-label", "Drawing canvas");
workspace.append(canvasHost);
appRoot.append(workspace);

const initialize = async (): Promise<void> => {
const pixi = new Application();
await pixi.init({ background: "#ffffff", antialias: true, resizeTo: canvasHost });
canvasHost.appendChild(pixi.canvas);
pixi.stage.eventMode = "static";
pixi.stage.hitArea = pixi.screen;
viewportLayer = new Container();
referencesLayer = new Container();
gridLayer = new Graphics();
drawingLayer = new Container();
previewLayer = new Graphics();
drawingLayer.addChild(previewLayer);
viewportLayer.addChild(referencesLayer, gridLayer, drawingLayer);
pixi.stage.addChild(viewportLayer);
viewportMask = new Graphics().rect(0, 0, project.width, project.height).fill("#ffffff");
viewportMask.renderable = false;
viewportLayer.mask = viewportMask;

const redraw = (): void => {
  animatedDisplays.length = 0;
  syncAnimationTargetOptions();
  syncAnimationList();
  syncLayerControls();
  syncPathEditor();
  gridLayer.clear();
  if (gridEnabled) {
    const gridStep = Math.max(gridSize, Math.ceil(Math.max(project.width, project.height) / 2000 / gridSize) * gridSize);
    for (let x = 0; x <= project.width; x += gridStep) {
      gridLayer.moveTo(x, 0).lineTo(x, project.height).stroke({ color: x % (gridSize * 2) === 0 ? "#94a3b8" : "#cbd5e1", alpha: x % (gridSize * 2) === 0 ? 0.5 : 0.28, width: x % (gridSize * 2) === 0 ? 1.5 : 1 });
    }
    for (let y = 0; y <= project.height; y += gridStep) {
      gridLayer.moveTo(0, y).lineTo(project.width, y).stroke({ color: y % (gridSize * 2) === 0 ? "#94a3b8" : "#cbd5e1", alpha: y % (gridSize * 2) === 0 ? 0.5 : 0.28, width: y % (gridSize * 2) === 0 ? 1.5 : 1 });
    }
  }
  drawingLayer.removeChildren().forEach((child) => {
    if (child !== previewLayer) child.destroy({ children: true });
  });
  previewLayer.clear();
  const layerContainers = createProjectLayerContainers(drawingLayer, project.layers);
  let animationActive = false;
  const sampleFor = (targetType: "object" | "layer", targetId: string) => {
    const sample = {
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    };
    for (const animation of project.animations) {
      if (animation.targetType !== targetType || animation.targetId !== targetId) continue;
      if (animation.enabled && !reducedMotion &&
          (animation.iterations === "infinite" ||
            animationElapsed < animation.delay + animation.duration * animation.iterations)) {
        animationActive = true;
      }
      const next = evaluateAnimation(animation, animationElapsed, reducedMotion);
      animationActive ||= next.active;
      sample.translateX += next.translateX;
      sample.translateY += next.translateY;
      sample.scaleX *= next.scaleX;
      sample.scaleY *= next.scaleY;
      sample.rotation += next.rotation;
      sample.opacity *= next.opacity;
    }
    return sample;
  };
  const applySample = (
    displayObject: Container,
    sample: ReturnType<typeof sampleFor>,
  ): void => {
    displayObject.position.x += sample.translateX;
    displayObject.position.y += sample.translateY;
    displayObject.scale.x *= sample.scaleX;
    displayObject.scale.y *= sample.scaleY;
    displayObject.rotation += sample.rotation;
    displayObject.alpha *= sample.opacity;
  };
  for (const layer of project.layers) {
    const container = layerContainers.get(layer.id);
    if (container) {
      animatedDisplays.push({
        display: container,
        targetType: "layer",
        targetId: layer.id,
        position: { x: container.position.x, y: container.position.y },
        scale: { x: container.scale.x, y: container.scale.y },
        rotation: container.rotation,
        alpha: container.alpha,
      });
      applySample(container, sampleFor("layer", layer.id));
    }
  }
  previewLayer.zIndex = Number.MAX_SAFE_INTEGER;
  const parentFor = (layerId: string | undefined): Container => {
    const parent = layerId === undefined ? undefined : layerContainers.get(layerId);
    return parent ?? drawingLayer;
  };
  for (const stroke of project.strokes) {
    const graphic = new Graphics();
    applyProjectTransform(graphic, stroke.transform);
    animatedDisplays.push({
      display: graphic, targetType: "object", targetId: stroke.id,
      position: { x: graphic.position.x, y: graphic.position.y },
      scale: { x: graphic.scale.x, y: graphic.scale.y },
      rotation: graphic.rotation, alpha: graphic.alpha,
    });
    applySample(graphic, sampleFor("object", stroke.id));
    if (stroke.layerId === undefined) graphic.zIndex = Number.MAX_SAFE_INTEGER;
    drawRecordedStroke(graphic, stroke);
    parentFor(stroke.layerId).addChild(graphic);
  }
  for (const shape of project.shapes) {
    const graphic = new Graphics();
    applyProjectTransform(graphic, shape.transform);
    animatedDisplays.push({
      display: graphic, targetType: "object", targetId: shape.id,
      position: { x: graphic.position.x, y: graphic.position.y },
      scale: { x: graphic.scale.x, y: graphic.scale.y },
      rotation: graphic.rotation, alpha: graphic.alpha,
    });
    applySample(graphic, sampleFor("object", shape.id));
    if (shape.layerId === undefined) graphic.zIndex = Number.MAX_SAFE_INTEGER;
    drawShape(graphic, shape);
    if (shape.style.effect?.type === "blur") {
      graphic.filters = [new BlurFilter({ strength: shape.style.effect.strength, quality: 2 })];
    }
    parentFor(shape.layerId).addChild(graphic);
  }
  for (const text of project.texts) {
    const textNode = new PixiText({
      text: text.text,
      style: {
        fontFamily: text.fontFamily,
        fontSize: text.fontSize,
        fill: text.color,
        align: text.align,
      },
    });
    textNode.anchor.set(text.align === "left" ? 0 : text.align === "center" ? 0.5 : 1, 1);
    applyProjectTransform(textNode, text.transform, { x: text.x, y: text.y });
    textNode.alpha = text.opacity;
    animatedDisplays.push({
      display: textNode, targetType: "object", targetId: text.id,
      position: { x: textNode.position.x, y: textNode.position.y },
      scale: { x: textNode.scale.x, y: textNode.scale.y },
      rotation: textNode.rotation, alpha: textNode.alpha,
    });
    applySample(textNode, sampleFor("object", text.id));
    if (text.layerId === undefined) textNode.zIndex = Number.MAX_SAFE_INTEGER;
    parentFor(text.layerId).addChild(textNode);
  }
  drawingLayer.addChild(previewLayer);
  if (animationPlaying && !animationActive) {
    animationPlaying = false;
    const button = controls.querySelector<HTMLButtonElement>("#animation-play");
    button?.setAttribute("aria-pressed", "false");
    if (button) button.textContent = "Play";
  }
};

const drawStroke = (graphics: Graphics, points: StrokePoint[], style: StrokeStyle): void => {
  if (points.length < 2) return;
  const [first, ...rest] = points;
  graphics.moveTo(first.x, first.y);
  for (const point of rest) graphics.lineTo(point.x, point.y);
  graphics.stroke({
    width: style.width,
    color: style.color,
    alpha: style.opacity,
    cap: style.lineCap,
    join: style.lineJoin,
  });
};

const drawRecordedStroke = (graphics: Graphics, stroke: Stroke): void => {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  for (const point of rest) graphics.lineTo(point.x, point.y);
  if (stroke.fill && isClosedStroke(stroke)) graphics.closePath().fill(stroke.fill);
  graphics.stroke({
    width: stroke.style.width,
    color: stroke.style.color,
    alpha: stroke.style.opacity,
    cap: stroke.style.lineCap,
    join: stroke.style.lineJoin,
  });
};

const drawShape = (graphics: Graphics, shape: Shape): void => {
  const fill = shape.style.gradient
    ? shape.style.gradient.type === "radial"
      ? new FillGradient({
        type: "radial",
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.75,
        colorStops: [
          { offset: 0, color: shape.style.gradient.startColor },
          { offset: 1, color: shape.style.gradient.endColor },
        ],
      })
      : new FillGradient({
        end: { x: Math.cos(shape.style.gradient.angle), y: Math.sin(shape.style.gradient.angle) },
        colorStops: [
          { offset: 0, color: shape.style.gradient.startColor },
          { offset: 1, color: shape.style.gradient.endColor },
        ],
      })
    : shape.style.fill ?? undefined;
  const stroke = { width: shape.style.stroke.width, color: shape.style.stroke.color, alpha: shape.style.stroke.opacity, cap: shape.style.stroke.lineCap, join: shape.style.stroke.lineJoin };
  if (shape.kind === "line") {
    const g = shape.geometry;
    graphics.moveTo(g.x1, g.y1).lineTo(g.x2, g.y2).stroke(stroke);
  }
  if (shape.kind === "rectangle") {
    const g = shape.geometry;
    graphics.rect(g.x, g.y, g.width, g.height);
    if (fill) graphics.fill(fill);
    graphics.stroke(stroke);
  }
  if (shape.kind === "ellipse") {
    const g = shape.geometry;
    graphics.ellipse(g.cx, g.cy, g.rx, g.ry);
    if (fill) graphics.fill(fill);
    graphics.stroke(stroke);
  }
  if (shape.kind === "polygon") {
    const g = shape.geometry;
    graphics.poly(g.points.flatMap((point) => [point.x, point.y]), true);
    if (fill) graphics.fill(fill);
    graphics.stroke(stroke);
  }
  if (shape.kind === "curve") {
    const g = shape.geometry;
    graphics.moveTo(g.x1, g.y1).quadraticCurveTo(g.cx, g.cy, g.x2, g.y2).stroke(stroke);
  }
  if (shape.kind === "path") {
    for (const command of shape.geometry.commands) {
      if (command.type === "M") graphics.moveTo(command.x, command.y);
      if (command.type === "L") graphics.lineTo(command.x, command.y);
      if (command.type === "Q") graphics.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
      if (command.type === "C") graphics.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
      if (command.type === "Z") graphics.closePath();
    }
    if (fill) graphics.fill(fill);
    graphics.stroke(stroke);
  }
};

const shapeFromPoints = (kind: ShapeKind, start: StrokePoint, end: StrokePoint): ShapeDraft => {
  const style = {
    stroke: currentStyle,
    fill: fillEnabled && !gradientEnabled && kind !== "line" && kind !== "curve" ? fillColor : null,
    ...(fillEnabled && gradientEnabled && kind !== "line" && kind !== "curve"
      ? { gradient: createGradientPaint() }
      : {}),
    ...(blurEnabled && kind !== "line" && kind !== "curve"
      ? { effect: { type: "blur" as const, strength: blurStrength } }
      : {}),
  };
  const meta = { style, pointerType: activePointer?.type ?? "mouse", startedAt: activePointer?.startedAt ?? start.time, endedAt: end.time };
  if (kind === "line") return { ...meta, kind, geometry: { x1: start.x, y1: start.y, x2: end.x, y2: end.y } };
  if (kind === "rectangle") return { ...meta, kind, geometry: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) } };
  if (kind === "ellipse") return { ...meta, kind, geometry: { cx: (start.x + end.x) / 2, cy: (start.y + end.y) / 2, rx: Math.abs(end.x - start.x) / 2, ry: Math.abs(end.y - start.y) / 2 } };
  if (kind === "curve") return { ...meta, kind, geometry: { x1: start.x, y1: start.y, cx: (start.x + end.x) / 2, cy: Math.min(start.y, end.y) - Math.abs(end.x - start.x) / 3, x2: end.x, y2: end.y } };
  if (kind === "path") return { ...meta, kind, geometry: { commands: [{ type: "M", x: start.x, y: start.y }, { type: "L", x: end.x, y: end.y }] } };
  return { ...meta, kind: "polygon", geometry: { points: [start, end] } };
};

const shapeFromPointList = (kind: ShapeKind, points: StrokePoint[]): ShapeDraft => {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (kind === "polygon") {
    return {
      kind,
      style: {
        stroke: currentStyle,
        fill: fillEnabled && !gradientEnabled ? fillColor : null,
        ...(gradientEnabled && fillEnabled
          ? { gradient: createGradientPaint() }
          : {}),
        ...(blurEnabled
          ? { effect: { type: "blur" as const, strength: blurStrength } }
          : {}),
      },
      pointerType: activePointer?.type ?? "mouse",
      startedAt: activePointer?.startedAt ?? first.time,
      endedAt: last.time,
      geometry: { points: points.map(({ x, y }) => ({ x, y })) },
    };
  }
  if (kind === "path") {
    return {
      kind,
      style: {
        stroke: currentStyle,
        fill: fillEnabled && !gradientEnabled ? fillColor : null,
        ...(fillEnabled && gradientEnabled ? { gradient: createGradientPaint() } : {}),
        ...(blurEnabled ? { effect: { type: "blur" as const, strength: blurStrength } } : {}),
      },
      pointerType: activePointer?.type ?? "mouse",
      startedAt: first.time,
      endedAt: last.time,
      geometry: { commands: points.map((point, index) => index === 0 ? { type: "M" as const, x: point.x, y: point.y } : { type: "L" as const, x: point.x, y: point.y }) },
    };
  }
  return shapeFromPoints(kind, first, last);
};

const localObjectPoint = (object: { layerId?: string; transform?: import("./types").ProjectTransform }, point: { x: number; y: number }): { x: number; y: number } => {
  let local = inverseTransformPoint(point, object.transform);
  const layers: import("./types").ProjectLayer[] = [];
  let layer = project.layers.find((candidate) => candidate.id === object.layerId);
  while (layer) {
    layers.push(layer);
    layer = project.layers.find((candidate) => candidate.id === layer?.parentId);
  }
  for (const ancestor of layers) local = inverseTransformPoint(local, ancestor.transform);
  return local;
};

const eraseAt = (point: { x: number; y: number }): void => {
  const radius = Math.max(currentStyle.width * 1.5, 8);
  let strokeIndex = -1;
  for (let index = project.strokes.length - 1; index >= 0; index -= 1) {
    if (pointHitsStroke(localObjectPoint(project.strokes[index]!, point), project.strokes[index]!, radius)) {
      strokeIndex = index;
      break;
    }
  }
  let shapeIndex = -1;
  for (let index = project.shapes.length - 1; index >= 0; index -= 1) {
    if (pointHitsShape(localObjectPoint(project.shapes[index]!, point), project.shapes[index]!, radius)) {
      shapeIndex = index;
      break;
    }
  }
  if (strokeIndex >= 0 || shapeIndex >= 0) {
    history.push(cloneProject(project));
    const removedId = shapeIndex > strokeIndex
      ? project.shapes.splice(shapeIndex, 1)[0]?.id
      : project.strokes.splice(strokeIndex, 1)[0]?.id;
    if (removedId) project.animations = project.animations.filter((animation) =>
      animation.targetType !== "object" || animation.targetId !== removedId);
  } else {
    const textIndex = project.texts.findIndex((text) =>
      point.x >= text.x - (text.align === "right" ? text.text.length * text.fontSize * 0.6 : 0) &&
      point.x <= text.x + (text.align === "left" ? text.text.length * text.fontSize * 0.6 : 0) &&
      point.y >= text.y - text.fontSize && point.y <= text.y + radius);
    if (textIndex >= 0) {
      history.push(cloneProject(project));
      const removedId = project.texts.splice(textIndex, 1)[0]?.id;
      if (removedId) project.animations = project.animations.filter((animation) =>
        animation.targetType !== "object" || animation.targetId !== removedId);
      redraw();
      setStatus("Object erased.");
      return;
    }
    let topmostSvgIndex = -1;
    for (let index = project.importedSvgs.length - 1; index >= 0; index -= 1) {
      const reference = project.importedSvgs[index]!;
      const bounds = referenceBounds.get(reference.id);
      if (reference.visible && bounds && pointHitsReference(point, bounds, radius)) {
        topmostSvgIndex = index;
        break;
      }
    }
    let topmostRasterIndex = -1;
    for (let index = project.rasterReferences.length - 1; index >= 0; index -= 1) {
      const reference = project.rasterReferences[index]!;
      const bounds = referenceBounds.get(reference.id) ?? reference;
      if (reference.visible && pointHitsReference(point, bounds, radius)) {
        topmostRasterIndex = index;
        break;
      }
    }
    if (topmostSvgIndex < 0 && topmostRasterIndex < 0) {
      setStatus("Nothing to erase.");
      return;
    }
    history.push(cloneProject(project));
    if (topmostSvgIndex >= 0) {
      const [removed] = project.importedSvgs.splice(topmostSvgIndex, 1);
      if (removed) referenceBounds.delete(removed.id);
    } else {
      const [removed] = project.rasterReferences.splice(topmostRasterIndex, 1);
      if (removed) referenceBounds.delete(removed.id);
    }
    void refreshReferenceLayer(project).catch((error: unknown) => {
      setStatus(`Could not update references: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }
  redraw();
  setStatus("Object erased.");
};

const fillAt = (point: { x: number; y: number }): void => {
  const target = findFillTarget(project, point, Math.max(currentStyle.width * 1.5, 8), localObjectPoint);
  if (!target) {
    setStatus("Tap inside a fillable shape or closed hand-drawn loop.");
    return;
  }
  const fill = fillMode === "color" ? fillColor : null;
  const next = applyFill(project, target, fill);
  if (next === project) {
    setStatus(fill === null ? "That object already has no fill." : "That object already uses this fill color.");
    return;
  }
  history.push(cloneProject(project));
  Object.assign(project, next);
  redraw();
  setStatus(fill === null ? "Fill cleared." : "Fill applied.");
};

const toProjectPoint = (event: PointerEvent): StrokePoint => {
  const rect = pixi.canvas.getBoundingClientRect();
  const point = viewportToProject(event.clientX, event.clientY, rect, {
    scale: canvasScale,
    offsetX: canvasOffsetX,
    offsetY: canvasOffsetY,
  });
  const boundedPoint = clampProjectPoint(point.x, point.y, project.width, project.height);
  return {
    x: boundedPoint.x,
    y: boundedPoint.y,
    pressure: event.pressure || (event.pointerType === "mouse" ? 0.5 : 1),
    time: performance.now(),
  };
};

const pointerKind = (event: PointerEvent): PointerKind =>
  event.pointerType === "pen" ? "pen" : event.pointerType === "touch" ? "touch" : "mouse";

const isShapeTool = (tool: typeof activeTool): tool is ShapeKind =>
  tool !== "pen" && tool !== "eraser" && tool !== "fill" && tool !== "pan" && tool !== "text";

const viewportPoint = (event: PointerEvent): { x: number; y: number } => {
  const rect = pixi.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

const syncViewport = (): void => {
  canvasScale = fitScale * zoom;
  const centeredX = (pixi.screen.width - project.width * canvasScale) / 2;
  const centeredY = (pixi.screen.height - project.height * canvasScale) / 2;
  canvasOffsetX = centeredX + panX;
  canvasOffsetY = centeredY + panY;
  viewportLayer.position.set(canvasOffsetX, canvasOffsetY);
  viewportLayer.scale.set(canvasScale);
  viewportMask.position.set(canvasOffsetX, canvasOffsetY);
  viewportMask.scale.set(canvasScale);
  const value = document.querySelector<HTMLOutputElement>("#zoom-value");
  if (value) value.value = `${Math.round(zoom * 100)}%`;
  redraw();
};

const zoomAtProjectPoint = (nextZoom: number, projectPoint: { x: number; y: number }, point: { x: number; y: number }): void => {
  const boundedZoom = Math.max(0.25, Math.min(8, nextZoom));
  const nextScale = fitScale * boundedZoom;
  const nextTransform = zoomTransformAtPoint(
    { scale: canvasScale, offsetX: canvasOffsetX, offsetY: canvasOffsetY },
    projectPoint,
    point,
    nextScale,
  );
  zoom = boundedZoom;
  panX = nextTransform.offsetX - (pixi.screen.width - project.width * nextScale) / 2;
  panY = nextTransform.offsetY - (pixi.screen.height - project.height * nextScale) / 2;
  syncViewport();
};

const zoomAt = (nextZoom: number, point: { x: number; y: number }): void => {
  const projectPoint = viewportToProject(
    point.x,
    point.y,
    { left: 0, top: 0 },
    { scale: canvasScale, offsetX: canvasOffsetX, offsetY: canvasOffsetY },
  );
  zoomAtProjectPoint(nextZoom, projectPoint, point);
};

const distanceBetween = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    spacePressed = true;
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") spacePressed = false;
});

pixi.canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pixi.canvas.setPointerCapture(event.pointerId);
  const point = viewportPoint(event);
  pointers.set(event.pointerId, { ...point, type: event.pointerType });
  if (event.button === 1 || spacePressed || (activeTool === "pan" && pointers.size < 2)) {
    panPointer = { id: event.pointerId, ...point };
    return;
  }
  if (event.pointerType === "touch" && pointers.size === 2) {
    panPointer = null;
    activePointer = null;
    activePoints = [];
    const [first, second] = [...pointers.values()];
    pinchStart = {
      distance: distanceBetween(first, second),
      zoom,
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      panX,
      panY,
    };
    return;
  }
  if (activeTool === "eraser") {
    eraseAt(toProjectPoint(event));
    return;
  }
  if (activeTool === "fill") {
    fillAt(toProjectPoint(event));
    return;
  }
  if (activeTool === "text") {
    const point = toProjectPoint(event);
    const content = controls.querySelector<HTMLInputElement>("#text-content")?.value.trim() ?? "";
    const fontSize = Number(controls.querySelector<HTMLInputElement>("#text-size")?.value);
    if (!content || !Number.isFinite(fontSize) || fontSize <= 0) {
      setStatus("Enter text and a positive text size.");
      return;
    }
    history.push(cloneProject(project));
    project.texts.push({
      id: crypto.randomUUID(),
      text: content,
      x: point.x,
      y: point.y,
      fontFamily: controls.querySelector<HTMLInputElement>("#text-font")?.value.trim() || "sans-serif",
      fontSize,
      color: currentStyle.color,
      opacity: currentStyle.opacity,
      align: "left",
    });
    redraw();
    setStatus("Text object added.");
    return;
  }
  activePointer = { id: event.pointerId, type: pointerKind(event), startedAt: performance.now() };
  activePoints = [toProjectPoint(event)];
});
pixi.canvas.addEventListener("pointermove", (event) => {
  const point = viewportPoint(event);
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { ...point, type: event.pointerType });
  if (panPointer?.id === event.pointerId) {
    panX += point.x - panPointer.x;
    panY += point.y - panPointer.y;
    panPointer = { id: event.pointerId, ...point };
    syncViewport();
    return;
  }
  if (pinchStart && pointers.size >= 2) {
    const [first, second] = [...pointers.values()];
    const distance = distanceBetween(first, second);
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const startScale = fitScale * pinchStart.zoom;
    const startOffsetX = (pixi.screen.width - project.width * startScale) / 2 + pinchStart.panX;
    const startOffsetY = (pixi.screen.height - project.height * startScale) / 2 + pinchStart.panY;
    const projectPoint = viewportToProject(pinchStart.x, pinchStart.y, { left: 0, top: 0 }, {
      scale: startScale,
      offsetX: startOffsetX,
      offsetY: startOffsetY,
    });
    zoomAtProjectPoint(pinchStart.zoom * (distance / pinchStart.distance), projectPoint, midpoint);
    return;
  }
  if (!activePointer || activePointer.id !== event.pointerId) return;
  const nextPoint = toProjectPoint(event);
  if (activeTool === "pen") activePoints.push(nextPoint);
  else if (activeTool === "polygon" || activeTool === "path") activePoints.push(nextPoint);
  else activePoints = [activePoints[0]!, nextPoint];
  redraw();
  if (activeTool === "pen") drawStroke(previewLayer, activePoints, currentStyle);
  else if (activePoints.length > 1 && isShapeTool(activeTool)) drawShape(previewLayer, { ...shapeFromPointList(activeTool, activePoints), id: "preview" } as Shape);
});
const finishStroke = (event: PointerEvent): void => {
  pointers.delete(event.pointerId);
  if (panPointer?.id === event.pointerId) {
    panPointer = null;
    return;
  }
  if (pointers.size < 2) pinchStart = null;
  if (!activePointer || activePointer.id !== event.pointerId) return;
  const endedAt = performance.now();
  history.push(cloneProject(project));
  if (activeTool === "pen") {
    const next = appendStroke(project, activePoints, currentStyle, activePointer.type, activePointer.startedAt, endedAt);
    Object.assign(project, next);
  } else if (activePoints.length > 1 && isShapeTool(activeTool)) {
    const next = appendShape(project, shapeFromPointList(activeTool, activePoints));
    Object.assign(project, next);
  }
  activePointer = null;
  activePoints = [];
  redraw();
  setStatus(`${project.strokes.length + project.shapes.length} object${project.strokes.length + project.shapes.length === 1 ? "" : "s"} recorded.`);
};
pixi.canvas.addEventListener("pointerup", finishStroke);
pixi.canvas.addEventListener("pointercancel", finishStroke);
pixi.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = { x: event.offsetX, y: event.offsetY };
  zoomAt(zoom * (event.deltaY < 0 ? 1.1 : 0.9), point);
}, { passive: false });

const setStatus = (message: string): void => {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  if (status) status.textContent = message;
};

controls.querySelector<HTMLButtonElement>("#animation-add")?.addEventListener("click", () => {
  const target = controls.querySelector<HTMLSelectElement>("#animation-target")?.value;
  if (!target) return setStatus("Add a stroke, shape, or layer before creating an animation.");
  const separator = target.indexOf(":");
  const targetType = target.slice(0, separator);
  const targetId = target.slice(separator + 1);
  const duration = Number(controls.querySelector<HTMLInputElement>("#animation-duration")?.value);
  const delay = Number(controls.querySelector<HTMLInputElement>("#animation-delay")?.value);
  const iterations = Number(controls.querySelector<HTMLInputElement>("#animation-iterations")?.value);
  const enabled = controls.querySelector<HTMLInputElement>("#animation-enabled")?.checked ?? animationAddEnabled;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(delay) || delay < 0 ||
      !Number.isSafeInteger(iterations) || iterations < 1) {
    return setStatus("Animation duration, delay, and iterations must be valid numbers.");
  }
  history.push(cloneProject(project));
  project.animations.push({
    id: crypto.randomUUID(),
    preset: controls.querySelector<HTMLSelectElement>("#animation-preset")?.value as DrawingProject["animations"][number]["preset"],
    targetType: targetType === "layer" ? "layer" : "object",
    targetId,
    duration,
    delay,
    iterations,
    direction: controls.querySelector<HTMLSelectElement>("#animation-direction")?.value as DrawingProject["animations"][number]["direction"],
    easing: controls.querySelector<HTMLSelectElement>("#animation-easing")?.value as DrawingProject["animations"][number]["easing"],
    enabled,
  });
  animationElapsed = 0;
  redraw();
  setStatus("Animation added to the selected target.");
});
controls.querySelector<HTMLSelectElement>("#animation-existing")?.addEventListener("change", () => {
  syncAnimationList();
});
controls.querySelector<HTMLInputElement>("#animation-enabled")?.addEventListener("change", (event) => {
  const id = controls.querySelector<HTMLSelectElement>("#animation-existing")?.value;
  const animation = project.animations.find((candidate) => candidate.id === id);
  if (!animation) {
    animationAddEnabled = (event.target as HTMLInputElement).checked;
    return;
  }
  history.push(cloneProject(project));
  animation.enabled = (event.target as HTMLInputElement).checked;
  redraw();
  setStatus(animation.enabled ? "Animation enabled." : "Animation disabled.");
});
controls.querySelector<HTMLButtonElement>("#animation-delete")?.addEventListener("click", () => {
  const id = controls.querySelector<HTMLSelectElement>("#animation-existing")?.value;
  const index = project.animations.findIndex((animation) => animation.id === id);
  if (index < 0) return setStatus("No animation selected.");
  history.push(cloneProject(project));
  project.animations.splice(index, 1);
  redraw();
  setStatus("Animation deleted.");
});
controls.querySelector<HTMLButtonElement>("#animation-play")?.addEventListener("click", (event) => {
  animationPlaying = !animationPlaying;
  const button = event.currentTarget as HTMLButtonElement;
  button.setAttribute("aria-pressed", String(animationPlaying));
  button.textContent = animationPlaying ? "Pause" : "Play";
  setStatus(animationPlaying ? "Animation playback started." : "Animation playback paused.");
});
controls.querySelector<HTMLButtonElement>("#animation-reset")?.addEventListener("click", () => {
  animationPlaying = false;
  animationElapsed = 0;
  const button = controls.querySelector<HTMLButtonElement>("#animation-play");
  button?.setAttribute("aria-pressed", "false");
  if (button) button.textContent = "Play";
  redraw();
  setStatus("Animation playback reset.");
});
controls.querySelector<HTMLInputElement>("#reduced-motion")?.addEventListener("change", (event) => {
  reducedMotion = (event.target as HTMLInputElement).checked;
  redraw();
  setStatus(reducedMotion ? "Reduced motion enabled." : "Reduced motion disabled.");
});
const reducedMotionInput = controls.querySelector<HTMLInputElement>("#reduced-motion");
if (reducedMotionInput) reducedMotionInput.checked = reducedMotion;

controls.querySelector<HTMLSelectElement>("#layer-selected")?.addEventListener("change", syncLayerControls);
controls.querySelector<HTMLButtonElement>("#layer-add")?.addEventListener("click", () => {
  history.push(cloneProject(project));
  const order = project.layers.reduce((maximum, layer) => Math.max(maximum, layer.order), -1) + 1;
  project.layers.push({
    id: crypto.randomUUID(),
    name: `Layer ${project.layers.length + 1}`,
    order,
    visible: true,
    opacity: 1,
    parentId: null,
  });
  redraw();
  setStatus("Layer added.");
});
controls.querySelector<HTMLButtonElement>("#object-layer-save")?.addEventListener("click", () => {
  const id = controls.querySelector<HTMLSelectElement>("#layer-selected")?.value;
  const layer = project.layers.find((candidate) => candidate.id === id);
  if (!layer) return setStatus("No layer selected.");
  const name = controls.querySelector<HTMLInputElement>("#layer-name")?.value.trim() ?? "";
  const opacity = Number(controls.querySelector<HTMLInputElement>("#layer-opacity")?.value);
  if (!name || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    return setStatus("Layer name and opacity must be valid.");
  }
  history.push(cloneProject(project));
  layer.name = name;
  layer.opacity = opacity;
  layer.visible = controls.querySelector<HTMLInputElement>("#layer-visible")?.checked ?? true;
  redraw();
  setStatus("Layer updated.");
});
const moveLayer = (direction: -1 | 1): void => {
  const id = controls.querySelector<HTMLSelectElement>("#layer-selected")?.value;
  const layer = project.layers.find((candidate) => candidate.id === id);
  if (!layer) return setStatus("No layer selected.");
  const siblings = project.layers
    .filter((candidate) => candidate.parentId === layer.parentId)
    .sort((a, b) => a.order - b.order);
  const index = siblings.indexOf(layer);
  const other = siblings[index + direction];
  if (!other) return setStatus("Layer is already at that edge.");
  history.push(cloneProject(project));
  [layer.order, other.order] = [other.order, layer.order];
  redraw();
  setStatus("Layer order updated.");
};
controls.querySelector<HTMLButtonElement>("#layer-up")?.addEventListener("click", () => moveLayer(-1));
controls.querySelector<HTMLButtonElement>("#layer-down")?.addEventListener("click", () => moveLayer(1));
controls.querySelector<HTMLButtonElement>("#layer-delete")?.addEventListener("click", () => {
  const id = controls.querySelector<HTMLSelectElement>("#layer-selected")?.value;
  const index = project.layers.findIndex((layer) => layer.id === id);
  if (index < 0) return setStatus("No layer selected.");
  history.push(cloneProject(project));
  project.layers.splice(index, 1);
  for (const layer of project.layers) {
    if (layer.parentId === id) layer.parentId = null;
  }
  for (const object of [...project.strokes, ...project.shapes, ...project.rasterReferences, ...project.importedSvgs, ...project.texts]) {
    if (object.layerId === id) delete object.layerId;
  }
  project.animations = project.animations.filter((animation) => !(animation.targetType === "layer" && animation.targetId === id));
  redraw();
  setStatus("Layer deleted; its objects were moved to the root.");
});
controls.querySelector<HTMLSelectElement>("#object-layer-target")?.addEventListener("change", syncLayerControls);
controls.querySelector<HTMLButtonElement>("#layer-save")?.addEventListener("click", () => {
  const objectId = controls.querySelector<HTMLSelectElement>("#object-layer-target")?.value;
  const layerId = controls.querySelector<HTMLSelectElement>("#object-layer-value")?.value;
  const objects = [...project.strokes, ...project.shapes, ...project.texts, ...project.rasterReferences, ...project.importedSvgs];
  const object = objects.find((candidate) => candidate.id === objectId);
  if (!object) return;
  history.push(cloneProject(project));
  if (layerId) object.layerId = layerId;
  else delete object.layerId;
  redraw();
  setStatus("Object layer assignment updated.");
});
controls.querySelector<HTMLSelectElement>("#path-selected")?.addEventListener("change", syncPathEditor);
controls.querySelector<HTMLSelectElement>("#path-node")?.addEventListener("change", syncPathEditor);
controls.querySelector<HTMLSelectElement>("#path-command")?.addEventListener("change", (event) => {
  const command = (event.target as HTMLSelectElement).value as PathCommand["type"];
  const nodeIndex = Number(controls.querySelector<HTMLSelectElement>("#path-node")?.value);
  if (nodeIndex === 0 && command !== "M") {
    (event.target as HTMLSelectElement).value = "M";
    return;
  }
  const keys = command === "Z" ? [] : command === "M" || command === "L" ? ["x", "y"]
    : command === "Q" ? ["x", "y", "x1", "y1"] : ["x", "y", "x1", "y1", "x2", "y2"];
  for (const key of ["x", "y", "x1", "y1", "x2", "y2"]) {
    controls.querySelector<HTMLInputElement>(`#path-${key}`)?.toggleAttribute("disabled", !keys.includes(key));
  }
});
controls.querySelector<HTMLButtonElement>("#path-save")?.addEventListener("click", () => {
  const id = controls.querySelector<HTMLSelectElement>("#path-selected")?.value;
  const shape = project.shapes.find((candidate) => candidate.id === id);
  if (!shape || shape.kind !== "path") return setStatus("No editable path selected.");
  const nodeIndex = Number(controls.querySelector<HTMLSelectElement>("#path-node")?.value);
  const type = controls.querySelector<HTMLSelectElement>("#path-command")?.value as PathCommand["type"];
  const numberValue = (key: string): number => Number(controls.querySelector<HTMLInputElement>(`#path-${key}`)?.value);
  const x = numberValue("x");
  const y = numberValue("y");
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= shape.geometry.commands.length) {
    return setStatus("No path node selected.");
  }
  if (nodeIndex === 0 && type !== "M") return setStatus("The first path node must be a move command.");
  let command: PathCommand;
  if (type === "Z") command = { type: "Z" };
  else if (type === "M" || type === "L") command = { type, x, y };
  else if (type === "Q") command = { type, x1: numberValue("x1"), y1: numberValue("y1"), x, y };
  else command = { type: "C", x1: numberValue("x1"), y1: numberValue("y1"), x2: numberValue("x2"), y2: numberValue("y2"), x, y };
  const values = Object.values(command).filter((value) => typeof value === "number");
  if (values.some((value) => !Number.isFinite(value))) return setStatus("All path coordinates must be finite numbers.");
  history.push(cloneProject(project));
  shape.geometry.commands[nodeIndex] = command;
  redraw();
  setStatus("Path node updated.");
});

const download = (filename: string, content: string, type = "image/svg+xml"): void => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

document.querySelector<HTMLInputElement>("#color")?.addEventListener("input", (event) => {
  currentStyle = { ...currentStyle, color: (event.target as HTMLInputElement).value };
});
document.querySelector<HTMLSelectElement>("#tool")?.addEventListener("change", (event) => {
  activeTool = (event.target as HTMLSelectElement).value as typeof activeTool;
  setStatus(`${activeTool} tool selected.`);
});
document.querySelector<HTMLInputElement>("#fill-enabled")?.addEventListener("change", (event) => {
  fillEnabled = (event.target as HTMLInputElement).checked;
});
document.querySelector<HTMLInputElement>("#fill-color")?.addEventListener("input", (event) => {
  fillColor = (event.target as HTMLInputElement).value;
});
document.querySelector<HTMLInputElement>("#gradient-fill")?.addEventListener("change", (event) => {
  gradientEnabled = (event.target as HTMLInputElement).checked;
});
document.querySelector<HTMLInputElement>("#gradient-end")?.addEventListener("input", (event) => {
  gradientEndColor = (event.target as HTMLInputElement).value;
});
document.querySelector<HTMLInputElement>("#blur-effect")?.addEventListener("change", (event) => {
  blurEnabled = (event.target as HTMLInputElement).checked;
});
document.querySelector<HTMLInputElement>("#blur-strength")?.addEventListener("change", (event) => {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value) || value <= 0 || value > 50) {
    (event.target as HTMLInputElement).value = String(blurStrength);
    return setStatus("Blur strength must be between 0 and 50.");
  }
  blurStrength = value;
});
document.querySelector<HTMLSelectElement>("#fill-mode")?.addEventListener("change", (event) => {
  fillMode = (event.target as HTMLSelectElement).value === "none" ? "none" : "color";
  setStatus(fillMode === "none" ? "Fill bucket will clear fills." : "Fill bucket will apply the selected color.");
});
document.querySelector<HTMLButtonElement>("#clear-fill")?.addEventListener("click", () => {
  fillMode = "none";
  const mode = document.querySelector<HTMLSelectElement>("#fill-mode");
  if (mode) mode.value = "none";
  setStatus("Fill bucket will clear fills.");
});
document.querySelector<HTMLInputElement>("#width")?.addEventListener("input", (event) => {
  const width = Number((event.target as HTMLInputElement).value);
  currentStyle = { ...currentStyle, width };
  const output = document.querySelector<HTMLOutputElement>("#width-value");
  if (output) output.value = `${width}px`;
});
document.querySelector<HTMLInputElement>("#canvas-width")?.addEventListener("change", (event) => {
  const width = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(width) || width <= 0) {
    syncCanvasSizeInputs();
    return setStatus("Canvas dimensions must be positive numbers.");
  }
  setCanvasSize(width, project.height);
});
document.querySelector<HTMLInputElement>("#canvas-height")?.addEventListener("change", (event) => {
  const height = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(height) || height <= 0) {
    syncCanvasSizeInputs();
    return setStatus("Canvas dimensions must be positive numbers.");
  }
  setCanvasSize(project.width, height);
});
document.querySelector<HTMLInputElement>("#grid-size")?.addEventListener("change", (event) => {
  const size = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(size) || size < 1) {
    (event.target as HTMLInputElement).value = String(gridSize);
    return setStatus("Grid size must be a positive number.");
  }
  gridSize = size;
  redraw();
});
document.querySelector<HTMLButtonElement>("#undo")?.addEventListener("click", () => {
  const previous = history.pop();
  if (!previous) return setStatus("Nothing to undo.");
  const previousReferenceIds = [...previous.rasterReferences, ...previous.importedSvgs].map(({ id }) => id).join("|");
  const currentReferenceIds = [...project.rasterReferences, ...project.importedSvgs].map(({ id }) => id).join("|");
  Object.assign(project, previous);
  if (previousReferenceIds !== currentReferenceIds) {
    void refreshReferenceLayer(project).catch((error: unknown) => {
      setStatus(`Could not restore references: ${error instanceof Error ? error.message : "unknown error"}`);
    });
  }
  redraw();
  setStatus("Last action undone.");
});
document.querySelector<HTMLButtonElement>("#clear")?.addEventListener("click", () => {
  if (!project.strokes.length && !project.shapes.length && !project.texts.length && !project.animations.length) return;
  history.push(cloneProject(project));
  project.strokes = [];
  project.shapes = [];
  project.texts = [];
  project.animations = [];
  redraw();
  setStatus("Canvas cleared.");
});
document.querySelector<HTMLButtonElement>("#grid-toggle")?.addEventListener("click", (event) => {
  gridEnabled = !gridEnabled;
  const button = event.currentTarget as HTMLButtonElement;
  button.setAttribute("aria-pressed", String(gridEnabled));
  button.setAttribute("aria-label", gridEnabled ? "Hide grid" : "Show grid");
  button.title = gridEnabled ? "Hide grid" : "Show grid";
  redraw();
});
document.querySelector<HTMLButtonElement>("#save-project")?.addEventListener("click", () => {
  download("svg-draw-me-project.svgdraw", serializeProject(project), "application/json");
  setStatus("Project saved. Reopen the .svgdraw file to continue editing.");
});
document.querySelector<HTMLButtonElement>("#load-project")?.addEventListener("click", () => {
  document.querySelector<HTMLInputElement>("#project-file")?.click();
});
document.querySelector<HTMLInputElement>("#project-file")?.addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const loaded = deserializeProject(await file.text());
    const loadedReferences = await createReferenceLayer(loaded);
    expandProjectToReferenceBounds(loaded, loadedReferences.bounds);
    replaceReferenceLayer(loadedReferences);
    Object.assign(project, loaded);
    history.length = 0;
    zoom = 1;
    panX = 0;
    panY = 0;
    viewportMask.clear().rect(0, 0, project.width, project.height).fill("#ffffff");
    syncCanvasSizeInputs();
    syncScale();
    setStatus(`${file.name} opened. Continue editing your project.`);
  } catch (error) {
    setStatus(`Could not open ${file.name}: ${error instanceof Error ? error.message : "invalid project file"}`);
  } finally {
    input.value = "";
  }
});
document.querySelector<HTMLButtonElement>("#zoom-in")?.addEventListener("click", () => {
  zoomAt(zoom * 1.25, { x: pixi.screen.width / 2, y: pixi.screen.height / 2 });
});
document.querySelector<HTMLButtonElement>("#zoom-out")?.addEventListener("click", () => {
  zoomAt(zoom / 1.25, { x: pixi.screen.width / 2, y: pixi.screen.height / 2 });
});
document.querySelector<HTMLButtonElement>("#zoom-reset")?.addEventListener("click", () => {
  zoom = 1;
  panX = 0;
  panY = 0;
  syncViewport();
});
document.querySelector<HTMLButtonElement>("#export-svg")?.addEventListener("click", () => {
  download("svg-draw-me.svg", projectToSvg(project));
  setStatus("Standard SVG downloaded.");
});
document.querySelector<HTMLButtonElement>("#export-editable")?.addEventListener("click", () => {
  download("svg-draw-me-editable.svg", projectToEditableSvg(project));
  setStatus("Editable SVG downloaded.");
});

document.querySelector<HTMLInputElement>("#raster")?.addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readFile(file);
    const image = await loadImage(dataUrl);
    const texture = await Assets.load({ src: dataUrl, parser: "texture" });
    const reference = {
      id: crypto.randomUUID(),
      name: file.name,
      dataUrl,
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
      opacity: 0.35,
      visible: true,
    };
    referenceRenderVersion += 1;
    project.rasterReferences.push(reference);
    referenceBounds.set(reference.id, { x: 0, y: 0, width: image.width, height: image.height });
    const sprite = new Sprite(texture);
    sprite.position.set(reference.x, reference.y);
    sprite.width = reference.width;
    sprite.height = reference.height;
    sprite.alpha = reference.opacity;
    referencesLayer.addChild(sprite);
    expandProjectToReferenceBounds(project, referenceBounds);
    await refreshReferenceLayer(project);
    setStatus(`${file.name} added as a tracing reference.`);
  } catch (error) {
    setStatus(`Could not load ${file.name}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
});

document.querySelector<HTMLInputElement>("#svg")?.addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  let objectUrl: string | undefined;
  try {
    let markup = await file.text();
    if (!markup.includes("<svg")) return setStatus("That file does not contain SVG markup.");
    // lgtm [js/xss-through-dom] SVG is parsed as inert XML, then unsafe nodes and attributes are removed.
    const parsedSvg = new DOMParser().parseFromString(markup, "image/svg+xml");
    for (const script of Array.from(parsedSvg.querySelectorAll("script"))) script.remove();
    for (const element of Array.from(parsedSvg.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.toLowerCase().startsWith("on") ||
            ((attribute.name === "href" || attribute.name === "xlink:href") &&
              !attribute.value.trim().startsWith("#"))) {
          element.removeAttribute(attribute.name);
        }
      }
    }
    markup = new XMLSerializer().serializeToString(parsedSvg.documentElement);
    objectUrl = URL.createObjectURL(createSvgBlob(markup));
    const context = await Assets.load({
      src: objectUrl,
      parser: "svg",
      data: { parseAsGraphicsContext: true },
    });
    const imported = new Graphics(context);
    const localBounds = imported.getLocalBounds();
    const svgDimensions = getSvgDimensions(markup);
    const x = Math.max(0, -Math.min(svgDimensions.x, localBounds.x));
    const y = Math.max(0, -Math.min(svgDimensions.y, localBounds.y));
    const width = Math.max(svgDimensions.x + svgDimensions.width, localBounds.x + localBounds.width) + x;
    const height = Math.max(svgDimensions.y + svgDimensions.height, localBounds.y + localBounds.height) + y;
    const reference = {
      id: crypto.randomUUID(),
      name: file.name,
      markup,
      x,
      y,
      width,
      height,
      opacity: 1,
      visible: true,
    };
    referenceRenderVersion += 1;
    let editablePathCount = 0;
    let readonlyPathCount = 0;
    const inheritedAttribute = (element: Element, name: string): string | null => {
      let current: Element | null = element;
      while (current) {
        const value = current.getAttribute(name);
        if (value !== null) return value;
        current = current.parentElement;
      }
      return null;
    };
    for (const pathElement of Array.from(parsedSvg.querySelectorAll("path"))) {
      const d = pathElement.getAttribute("d");
      if (!d) continue;
      try {
        const commands = parseEditablePath(d);
        if (pathElement.hasAttribute("transform") || pathElement.parentElement?.closest("[transform]")) {
          readonlyPathCount += 1;
          continue;
        }
        const importedStroke = inheritedAttribute(pathElement, "stroke");
        const importedFill = inheritedAttribute(pathElement, "fill") ?? "#000000";
        const strokeColor = /^#[0-9a-f]{3,8}$/i.test(importedStroke ?? "") ? importedStroke! : "#000000";
        const hasStroke = importedStroke !== null && importedStroke !== "none";
        const fillColorValue = importedFill === "none" ? null : (/^#[0-9a-f]{3,8}$/i.test(importedFill) ? importedFill : "#000000");
        const strokeWidth = Number(inheritedAttribute(pathElement, "stroke-width"));
        const opacity = Number(inheritedAttribute(pathElement, "opacity") ?? "1");
        project.shapes.push({
          id: crypto.randomUUID(),
          kind: "path",
          geometry: { commands },
          transform: { translateX: reference.x, translateY: reference.y, rotation: 0, scaleX: 1, scaleY: 1 },
          style: {
            stroke: { color: strokeColor, width: hasStroke && Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 0, opacity: Number.isFinite(opacity) ? opacity : 1, lineCap: "round", lineJoin: "round" },
            fill: fillColorValue,
          },
          pointerType: "mouse",
          startedAt: 0,
          endedAt: 0,
        });
        pathElement.remove();
        editablePathCount += 1;
      } catch {
        readonlyPathCount += 1;
      }
    }
    reference.markup = new XMLSerializer().serializeToString(parsedSvg.documentElement);
    project.importedSvgs.push(reference);
    referenceBounds.set(reference.id, { x: reference.x, y: reference.y, width, height });
    imported.position.set(reference.x, reference.y);
    imported.alpha = 0.8;
    referencesLayer.addChild(imported);
    expandProjectToReferenceBounds(project, referenceBounds);
    await refreshReferenceLayer(project);
    const unsupported = findUnsupportedSvgFeatures(markup);
    const pathStatus = editablePathCount
      ? ` ${editablePathCount} path${editablePathCount === 1 ? "" : "s"} are editable${readonlyPathCount ? `; ${readonlyPathCount} remain read-only` : ""}.`
      : readonlyPathCount ? ` ${readonlyPathCount} path${readonlyPathCount === 1 ? "" : "s"} remain read-only.` : "";
    if (readonlyPathCount) unsupported.push("unsupported or transformed paths");
    setStatus(unsupported.length
      ? `${file.name} imported; preview may differ for unsupported features: ${unsupported.join(", ")}.${pathStatus}`
      : `${file.name} imported as a vector reference layer.${pathStatus}`);
    redraw();
  } catch (error) {
    setStatus(`Could not load ${file.name}: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
});

const syncScale = (): void => {
  fitScale = Math.min(pixi.screen.width / project.width, pixi.screen.height / project.height);
  syncViewport();
};
pixi.ticker.add((ticker) => {
  if (!animationPlaying) return;
  animationElapsed += ticker.deltaMS;
  if (!updateAnimatedDisplays()) {
    animationPlaying = false;
    const button = controls.querySelector<HTMLButtonElement>("#animation-play");
    button?.setAttribute("aria-pressed", "false");
    if (button) button.textContent = "Play";
  }
});
pixi.renderer.on("resize", syncScale);
syncScale();

const syncCanvasSizeInputs = (): void => {
  const widthInput = document.querySelector<HTMLInputElement>("#canvas-width");
  const heightInput = document.querySelector<HTMLInputElement>("#canvas-height");
  if (widthInput) widthInput.value = String(project.width);
  if (heightInput) heightInput.value = String(project.height);
};

const setCanvasSize = (width: number, height: number): void => {
  project.width = width;
  project.height = height;
  viewportMask.clear().rect(0, 0, width, height).fill("#ffffff");
  syncCanvasSizeInputs();
  syncScale();
};

const expandProjectToReferenceBounds = (
  target: DrawingProject,
  bounds: Map<string, { x: number; y: number; width: number; height: number }>,
): void => {
  const { width, height } = dimensionsForBounds(target.width, target.height, bounds.values());
  if (target === project) {
    if (width !== project.width || height !== project.height) setCanvasSize(width, height);
  } else {
    target.width = width;
    target.height = height;
  }
};

const replaceReferenceLayer = (scene: {
  layer: Container;
  bounds: Map<string, { x: number; y: number; width: number; height: number }>;
}): void => {
  referenceRenderVersion += 1;
  referencesLayer.removeChildren().forEach((child) => child.destroy());
  referencesLayer.addChild(...scene.layer.removeChildren());
  scene.layer.destroy();
  referenceBounds = scene.bounds;
};

const refreshReferenceLayer = async (source: DrawingProject): Promise<void> => {
  const version = ++referenceRenderVersion;
  const scene = await createReferenceLayer(source);
  if (version !== referenceRenderVersion) {
    scene.layer.destroy({ children: true });
    return;
  }
  expandProjectToReferenceBounds(source, scene.bounds);
  referencesLayer.removeChildren().forEach((child) => child.destroy());
  referencesLayer.addChild(...scene.layer.removeChildren());
  scene.layer.destroy();
  referenceBounds = scene.bounds;
};

async function createReferenceLayer(source: DrawingProject): Promise<{
  layer: Container;
  bounds: Map<string, { x: number; y: number; width: number; height: number }>;
}> {
  const layer = new Container();
  const layerContainers = createProjectLayerContainers(layer, source.layers);
  const bounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  const parentFor = (layerId: string | undefined): Container => {
    const parent = layerId === undefined ? undefined : layerContainers.get(layerId);
    return parent ?? layer;
  };
  try {
    for (const reference of source.rasterReferences) {
      const texture = await Assets.load({ src: reference.dataUrl, parser: "texture" });
      const sprite = new Sprite(texture);
      sprite.width = reference.width;
      sprite.height = reference.height;
      applyProjectTransform(sprite, reference.transform, { x: reference.x, y: reference.y });
      sprite.alpha = reference.opacity;
      sprite.visible = reference.visible;
      if (reference.layerId === undefined) sprite.zIndex = Number.MAX_SAFE_INTEGER;
      parentFor(reference.layerId).addChild(sprite);
      bounds.set(reference.id, {
        x: reference.x,
        y: reference.y,
        width: reference.width,
        height: reference.height,
      });
    }
    for (const reference of source.importedSvgs) {
      const url = URL.createObjectURL(createSvgBlob(reference.markup));
      try {
        const context = await Assets.load({
          src: url,
          parser: "svg",
          data: { parseAsGraphicsContext: true },
        });
        const imported = new Graphics(context);
        const localBounds = imported.getLocalBounds();
        const svgDimensions = getSvgDimensions(reference.markup);
        const xShift = Math.max(0, -Math.min(reference.x + svgDimensions.x, reference.x + localBounds.x));
        const yShift = Math.max(0, -Math.min(reference.y + svgDimensions.y, reference.y + localBounds.y));
        reference.x += xShift;
        reference.y += yShift;
        reference.width = Math.max(
          reference.width,
          svgDimensions.x + svgDimensions.width + xShift,
          localBounds.x + localBounds.width + xShift,
        );
        reference.height = Math.max(
          reference.height,
          svgDimensions.y + svgDimensions.height + yShift,
          localBounds.y + localBounds.height + yShift,
        );
        applyProjectTransform(imported, reference.transform, { x: reference.x, y: reference.y });
        imported.alpha = reference.opacity * 0.8;
        imported.visible = reference.visible;
        if (reference.layerId === undefined) imported.zIndex = Number.MAX_SAFE_INTEGER;
        parentFor(reference.layerId).addChild(imported);
        bounds.set(reference.id, {
          x: reference.x,
          y: reference.y,
          width: reference.width,
          height: reference.height,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch (error) {
    layer.destroy({ children: true });
    throw error;
  }
  return { layer, bounds };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Unable to decode image."));
    image.src = dataUrl;
  });
}
};

void initialize();
