import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import { viewportToProject, zoomTransformAtPoint } from "./coordinates";
import { appendShape, appendStroke, applyStrokeFill, cloneProject, createProject } from "./document";
import { createSvgBlob } from "./imports";
import { projectToEditableSvg, projectToSvg } from "./svg";
import { isClosedStroke, pointHitsShape, pointHitsStroke, pointInStrokeLoop } from "./geometry";
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
let activeTool: "pen" | "eraser" | "fill" | ShapeKind = "pen";
let fillEnabled = false;
let fillColor = "#93c5fd";
let activePoints: StrokePoint[] = [];
let activePointer: { id: number; type: PointerKind; startedAt: number } | null = null;
let drawingLayer: Graphics;
let referencesLayer: Container;
let viewportLayer: Container;
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
let pinchStart: { distance: number; zoom: number; x: number; y: number } | null = null;

const controls = document.createElement("section");
controls.className = "controls";
controls.innerHTML = `
  <button id="menu-toggle" class="menu-toggle" type="button" aria-expanded="true" aria-controls="drawing-controls">Menu</button>
  <span id="drawing-controls" class="toolbar-controls">
  <div class="brand"><strong>SVG Draw Me</strong><span>stroke-preserving sketchbook</span></div>
  <label>Color <input id="color" type="color" value="${currentStyle.color}"></label>
  <label>Width <input id="width" type="range" min="1" max="60" value="${currentStyle.width}"><output id="width-value">${currentStyle.width}px</output></label>
  <label>Tool <select id="tool"><option value="pen">Pen</option><option value="eraser">Eraser</option><option value="fill">Fill bucket</option><option value="line">Line</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option><option value="curve">Curved line</option></select></label>
  <span class="control-group" aria-label="Shape fill controls">
    <label for="fill-enabled"><input id="fill-enabled" type="checkbox"> Fill shape</label>
    <label for="fill-color">Fill color <input id="fill-color" type="color" value="${fillColor}"></label>
  </span>
  <button id="undo" type="button">Undo</button>
  <button id="clear" type="button">Clear</button>
  <span class="zoom-controls" aria-label="Zoom controls">
    <button id="zoom-out" type="button" aria-label="Zoom out">−</button>
    <output id="zoom-value">100%</output>
    <button id="zoom-in" type="button" aria-label="Zoom in">+</button>
    <button id="zoom-reset" type="button">Reset zoom</button>
  </span>
  <label class="file-button">Reference image<input id="raster" type="file" accept="image/png,image/jpeg"></label>
  <label class="file-button">Import SVG<input id="svg" type="file" accept="image/svg+xml,.svg"></label>
  <button id="export-svg" type="button">Download SVG</button>
  <button id="export-editable" type="button">Download editable</button>
  <p id="status" role="status">Draw with a mouse, finger, or stylus.</p>
  </span>
`;
appRoot.append(controls);
const menuToggle = controls.querySelector<HTMLButtonElement>("#menu-toggle");
const toolbarControls = controls.querySelector<HTMLSpanElement>("#drawing-controls");
const setMenuOpen = (open: boolean): void => {
  controls.classList.toggle("menu-collapsed", !open);
  menuToggle?.setAttribute("aria-expanded", String(open));
  if (menuToggle) menuToggle.textContent = open ? "Hide menu" : "Menu";
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
drawingLayer = new Graphics();
viewportLayer.addChild(referencesLayer, drawingLayer);
pixi.stage.addChild(viewportLayer);

const redraw = (): void => {
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
  for (let index = project.strokes.length - 1; index >= 0; index -= 1) {
    const stroke = project.strokes[index]!;
    if (stroke.fill || !pointInStrokeLoop(point, stroke)) continue;
    history.push(cloneProject(project));
    Object.assign(project, applyStrokeFill(project, stroke.id, fillColor));
    redraw();
    setStatus("Closed stroke filled.");
    return;
  }
  setStatus("Tap inside a closed hand-drawn loop to fill it.");
};

const toProjectPoint = (event: PointerEvent): StrokePoint => {
  const rect = pixi.canvas.getBoundingClientRect();
  const point = viewportToProject(event.clientX, event.clientY, rect, {
    scale: canvasScale,
    offsetX: canvasOffsetX,
    offsetY: canvasOffsetY,
  });
  return {
    x: point.x,
    y: point.y,
    pressure: event.pressure || (event.pointerType === "mouse" ? 0.5 : 1),
    time: performance.now(),
  };
};

const pointerKind = (event: PointerEvent): PointerKind =>
  event.pointerType === "pen" ? "pen" : event.pointerType === "touch" ? "touch" : "mouse";

const isShapeTool = (tool: typeof activeTool): tool is ShapeKind =>
  tool !== "pen" && tool !== "eraser" && tool !== "fill";

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
  const value = document.querySelector<HTMLOutputElement>("#zoom-value");
  if (value) value.value = `${Math.round(zoom * 100)}%`;
  redraw();
};

const zoomAt = (nextZoom: number, point: { x: number; y: number }): void => {
  const boundedZoom = Math.max(0.25, Math.min(8, nextZoom));
  const projectPoint = viewportToProject(
    point.x,
    point.y,
    { left: 0, top: 0 },
    { scale: canvasScale, offsetX: canvasOffsetX, offsetY: canvasOffsetY },
  );
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
  if (event.button === 1 || spacePressed) {
    panPointer = { id: event.pointerId, ...point };
    return;
  }
  if (event.pointerType === "touch" && pointers.size === 2) {
    activePointer = null;
    activePoints = [];
    const [first, second] = [...pointers.values()];
    pinchStart = {
      distance: distanceBetween(first, second),
      zoom,
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
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
    zoomAt(pinchStart.zoom * (distance / pinchStart.distance), midpoint);
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
