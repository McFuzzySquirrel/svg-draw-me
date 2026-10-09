import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import { clampProjectPoint, viewportToProject, zoomTransformAtPoint } from "./coordinates";
import { appendShape, appendStroke, applyFill, cloneProject, createProject, deserializeProject, serializeProject } from "./document";
import { createSvgBlob } from "./imports";
import { projectToEditableSvg, projectToSvg } from "./svg";
import { findFillTarget, isClosedStroke, pointHitsShape, pointHitsStroke } from "./geometry";
import type { DrawingProject, PointerKind, Shape, ShapeDraft, ShapeKind, Stroke, StrokePoint, StrokeStyle } from "./types";
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
let activeTool: "pen" | "eraser" | "fill" | "pan" | ShapeKind = "pen";
let fillEnabled = false;
let fillColor = "#93c5fd";
let fillMode: "color" | "none" = "color";
let activePoints: StrokePoint[] = [];
let activePointer: { id: number; type: PointerKind; startedAt: number } | null = null;
let drawingLayer: Graphics;
let referencesLayer: Container;
let viewportLayer: Container;
let gridLayer: Graphics;
let viewportMask: Graphics;
let gridEnabled = false;
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

const controls = document.createElement("section");
controls.className = "controls";
controls.innerHTML = `
  <button id="menu-toggle" class="menu-toggle" type="button" aria-expanded="true" aria-controls="drawing-controls" aria-label="Hide menu" title="Hide menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
  <span id="drawing-controls" class="toolbar-controls">
  <div class="brand"><strong>SVG Draw Me</strong><span>stroke-preserving sketchbook</span></div>
  <label>Color <input id="color" type="color" value="${currentStyle.color}"></label>
  <label>Width <input id="width" type="range" min="1" max="60" value="${currentStyle.width}"><output id="width-value">${currentStyle.width}px</output></label>
  <label>Tool <select id="tool"><option value="pen">Pen</option><option value="pan">Pan</option><option value="eraser">Eraser</option><option value="fill">Fill bucket</option><option value="line">Line</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option><option value="curve">Curved line</option></select></label>
  <span class="control-group" aria-label="Shape fill controls">
    <label for="fill-enabled"><input id="fill-enabled" type="checkbox"> Fill shape</label>
    <label for="fill-color">Fill color <input id="fill-color" type="color" value="${fillColor}"></label>
    <label for="fill-mode">Bucket action
      <select id="fill-mode">
        <option value="color">Apply color</option>
        <option value="none">No fill</option>
      </select>
    </label>
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
  <p id="status" role="status">Draw with a mouse, finger, or stylus.</p>
  </span>
`;
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
drawingLayer = new Graphics();
viewportLayer.addChild(referencesLayer, gridLayer, drawingLayer);
pixi.stage.addChild(viewportLayer);
viewportMask = new Graphics().rect(0, 0, project.width, project.height).fill("#ffffff");
viewportMask.renderable = false;
viewportLayer.mask = viewportMask;

const redraw = (): void => {
  gridLayer.clear();
  if (gridEnabled) {
    const gridStep = Math.max(50, Math.ceil(Math.max(project.width, project.height) / 2000 / 50) * 50);
    for (let x = 0; x <= project.width; x += gridStep) {
      gridLayer.moveTo(x, 0).lineTo(x, project.height).stroke({ color: x % 100 === 0 ? "#94a3b8" : "#cbd5e1", alpha: x % 100 === 0 ? 0.5 : 0.28, width: x % 100 === 0 ? 1.5 : 1 });
    }
    for (let y = 0; y <= project.height; y += gridStep) {
      gridLayer.moveTo(0, y).lineTo(project.width, y).stroke({ color: y % 100 === 0 ? "#94a3b8" : "#cbd5e1", alpha: y % 100 === 0 ? 0.5 : 0.28, width: y % 100 === 0 ? 1.5 : 1 });
    }
  }
  drawingLayer.clear();
  for (const stroke of project.strokes) drawRecordedStroke(stroke);
  for (const shape of project.shapes) drawShape(shape);
};

const drawStroke = (points: StrokePoint[], style: StrokeStyle): void => {
  if (points.length < 2) return;
  const [first, ...rest] = points;
  drawingLayer.moveTo(first.x, first.y);
  for (const point of rest) drawingLayer.lineTo(point.x, point.y);
  drawingLayer.stroke({
    width: style.width,
    color: style.color,
    alpha: style.opacity,
    cap: style.lineCap,
    join: style.lineJoin,
  });
};

const drawRecordedStroke = (stroke: Stroke): void => {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  drawingLayer.moveTo(first.x, first.y);
  for (const point of rest) drawingLayer.lineTo(point.x, point.y);
  if (stroke.fill && isClosedStroke(stroke)) drawingLayer.closePath().fill(stroke.fill);
  drawingLayer.stroke({
    width: stroke.style.width,
    color: stroke.style.color,
    alpha: stroke.style.opacity,
    cap: stroke.style.lineCap,
    join: stroke.style.lineJoin,
  });
};

const drawShape = (shape: Shape): void => {
  const fill = shape.style.fill ?? undefined;
  const stroke = { width: shape.style.stroke.width, color: shape.style.stroke.color, alpha: shape.style.stroke.opacity, cap: shape.style.stroke.lineCap, join: shape.style.stroke.lineJoin };
  if (shape.kind === "line") {
    const g = shape.geometry;
    drawingLayer.moveTo(g.x1, g.y1).lineTo(g.x2, g.y2).stroke(stroke);
  }
  if (shape.kind === "rectangle") {
    const g = shape.geometry;
    drawingLayer.rect(g.x, g.y, g.width, g.height);
    if (fill) drawingLayer.fill(fill);
    drawingLayer.stroke(stroke);
  }
  if (shape.kind === "ellipse") {
    const g = shape.geometry;
    drawingLayer.ellipse(g.cx, g.cy, g.rx, g.ry);
    if (fill) drawingLayer.fill(fill);
    drawingLayer.stroke(stroke);
  }
  if (shape.kind === "polygon") {
    const g = shape.geometry;
    drawingLayer.poly(g.points.flatMap((point) => [point.x, point.y]), true);
    if (fill) drawingLayer.fill(fill);
    drawingLayer.stroke(stroke);
  }
  if (shape.kind === "curve") {
    const g = shape.geometry;
    drawingLayer.moveTo(g.x1, g.y1).quadraticCurveTo(g.cx, g.cy, g.x2, g.y2).stroke(stroke);
  }
};

const shapeFromPoints = (kind: ShapeKind, start: StrokePoint, end: StrokePoint): ShapeDraft => {
  const style = { stroke: currentStyle, fill: fillEnabled && kind !== "line" && kind !== "curve" ? fillColor : null };
  const meta = { style, pointerType: activePointer?.type ?? "mouse", startedAt: activePointer?.startedAt ?? start.time, endedAt: end.time };
  if (kind === "line") return { ...meta, kind, geometry: { x1: start.x, y1: start.y, x2: end.x, y2: end.y } };
  if (kind === "rectangle") return { ...meta, kind, geometry: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) } };
  if (kind === "ellipse") return { ...meta, kind, geometry: { cx: (start.x + end.x) / 2, cy: (start.y + end.y) / 2, rx: Math.abs(end.x - start.x) / 2, ry: Math.abs(end.y - start.y) / 2 } };
  if (kind === "curve") return { ...meta, kind, geometry: { x1: start.x, y1: start.y, cx: (start.x + end.x) / 2, cy: Math.min(start.y, end.y) - Math.abs(end.x - start.x) / 3, x2: end.x, y2: end.y } };
  return { ...meta, kind: "polygon", geometry: { points: [start, end] } };
};

const shapeFromPointList = (kind: ShapeKind, points: StrokePoint[]): ShapeDraft => {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (kind === "polygon") {
    return {
      kind,
      style: { stroke: currentStyle, fill: fillEnabled ? fillColor : null },
      pointerType: activePointer?.type ?? "mouse",
      startedAt: activePointer?.startedAt ?? first.time,
      endedAt: last.time,
      geometry: { points: points.map(({ x, y }) => ({ x, y })) },
    };
  }
  return shapeFromPoints(kind, first, last);
};

const eraseAt = (point: { x: number; y: number }): void => {
  const radius = Math.max(currentStyle.width * 1.5, 8);
  let strokeIndex = -1;
  for (let index = project.strokes.length - 1; index >= 0; index -= 1) {
    if (pointHitsStroke(point, project.strokes[index]!, radius)) {
      strokeIndex = index;
      break;
    }
  }
  let shapeIndex = -1;
  for (let index = project.shapes.length - 1; index >= 0; index -= 1) {
    if (pointHitsShape(point, project.shapes[index]!, radius)) {
      shapeIndex = index;
      break;
    }
  }
  if (strokeIndex < 0 && shapeIndex < 0) {
    setStatus("Nothing to erase.");
    return;
  }
  history.push(cloneProject(project));
  if (shapeIndex > strokeIndex) project.shapes.splice(shapeIndex, 1);
  else project.strokes.splice(strokeIndex, 1);
  redraw();
  setStatus("Object erased.");
};

const fillAt = (point: { x: number; y: number }): void => {
  const target = findFillTarget(project, point, Math.max(currentStyle.width * 1.5, 8));
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
  tool !== "pen" && tool !== "eraser" && tool !== "fill" && tool !== "pan";

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
  else if (activeTool === "polygon") activePoints.push(nextPoint);
  else activePoints = [activePoints[0]!, nextPoint];
  redraw();
  if (activeTool === "pen") drawStroke(activePoints, currentStyle);
  else if (activePoints.length > 1 && isShapeTool(activeTool)) drawShape({ ...shapeFromPointList(activeTool, activePoints), id: "preview" } as Shape);
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
document.querySelector<HTMLButtonElement>("#undo")?.addEventListener("click", () => {
  const previous = history.pop();
  if (!previous) return setStatus("Nothing to undo.");
  Object.assign(project, previous);
  redraw();
  setStatus("Last stroke removed.");
});
document.querySelector<HTMLButtonElement>("#clear")?.addEventListener("click", () => {
  if (!project.strokes.length && !project.shapes.length) return;
  history.push(cloneProject(project));
  project.strokes = [];
  project.shapes = [];
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
    referencesLayer.removeChildren().forEach((child) => child.destroy());
    referencesLayer.addChild(...loadedReferences.removeChildren());
    Object.assign(project, loaded);
    history.length = 0;
    zoom = 1;
    panX = 0;
    panY = 0;
    viewportMask.clear().rect(0, 0, project.width, project.height).fill("#ffffff");
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
    project.rasterReferences.push({
      id: crypto.randomUUID(),
      name: file.name,
      dataUrl,
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
      opacity: 0.35,
      visible: true,
    });
    const reference = new Sprite(texture);
    reference.position.set(0, 0);
    reference.width = image.width;
    reference.height = image.height;
    reference.alpha = 0.35;
    referencesLayer.addChild(reference);
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
    const markup = await file.text();
    if (!markup.includes("<svg")) return setStatus("That file does not contain SVG markup.");
    objectUrl = URL.createObjectURL(createSvgBlob(markup));
    const context = await Assets.load({
      src: objectUrl,
      parser: "svg",
      data: { parseAsGraphicsContext: true },
    });
    project.importedSvgs.push({
      id: crypto.randomUUID(),
      name: file.name,
      markup,
      x: 0,
      y: 0,
      width: project.width,
      height: project.height,
      opacity: 1,
      visible: true,
    });
    const imported = new Graphics(context);
    imported.alpha = 0.8;
    referencesLayer.addChild(imported);
    setStatus(`${file.name} imported as a vector reference layer.`);
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
pixi.renderer.on("resize", syncScale);
syncScale();

async function createReferenceLayer(source: DrawingProject): Promise<Container> {
  const layer = new Container();
  try {
    for (const reference of source.rasterReferences) {
      const texture = await Assets.load({ src: reference.dataUrl, parser: "texture" });
      const sprite = new Sprite(texture);
      sprite.position.set(reference.x, reference.y);
      sprite.width = reference.width;
      sprite.height = reference.height;
      sprite.alpha = reference.opacity;
      sprite.visible = reference.visible;
      layer.addChild(sprite);
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
        imported.position.set(reference.x, reference.y);
        imported.alpha = reference.opacity * 0.8;
        imported.visible = reference.visible;
        layer.addChild(imported);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch (error) {
    layer.destroy({ children: true });
    throw error;
  }
  return layer;
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
