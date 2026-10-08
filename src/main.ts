import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import { viewportToProject, zoomTransformAtPoint } from "./coordinates";
import { appendStroke, cloneProject, createProject } from "./document";
import { createSvgBlob } from "./imports";
import { projectToEditableSvg, projectToSvg } from "./svg";
import type { DrawingProject, PointerKind, StrokePoint, StrokeStyle } from "./types";
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
  <div class="brand"><strong>SVG Draw Me</strong><span>stroke-preserving sketchbook</span></div>
  <label>Color <input id="color" type="color" value="${currentStyle.color}"></label>
  <label>Width <input id="width" type="range" min="1" max="60" value="${currentStyle.width}"><output id="width-value">${currentStyle.width}px</output></label>
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
`;
appRoot.append(controls);

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
  for (const stroke of project.strokes) {
    drawStroke(stroke.points, stroke.style);
  }
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
  activePoints.push(toProjectPoint(event));
  redraw();
  drawStroke(activePoints, currentStyle);
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
  const next = appendStroke(project, activePoints, currentStyle, activePointer.type, activePointer.startedAt, endedAt);
  Object.assign(project, next);
  activePointer = null;
  activePoints = [];
  redraw();
  setStatus(`${project.strokes.length} stroke${project.strokes.length === 1 ? "" : "s"} recorded.`);
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
  if (!project.strokes.length) return;
  history.push(cloneProject(project));
  project.strokes = [];
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
