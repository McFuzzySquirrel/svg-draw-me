export type PointerKind = "mouse" | "pen" | "touch";

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface StrokeStyle {
  color: string;
  width: number;
  opacity: number;
  lineCap: "round" | "butt" | "square";
  lineJoin: "round" | "bevel" | "miter";
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  style: StrokeStyle;
  pointerType: PointerKind;
  startedAt: number;
  endedAt: number;
}

export type ShapeKind = "line" | "rectangle" | "ellipse" | "polygon" | "curve";

export interface ShapeStyle {
  stroke: StrokeStyle;
  fill: string | null;
}

interface ShapeBase {
  id: string;
  style: ShapeStyle;
  pointerType: PointerKind;
  startedAt: number;
  endedAt: number;
}

export type Shape =
  | (ShapeBase & { kind: "line"; geometry: { x1: number; y1: number; x2: number; y2: number } })
  | (ShapeBase & { kind: "rectangle"; geometry: { x: number; y: number; width: number; height: number } })
  | (ShapeBase & { kind: "ellipse"; geometry: { cx: number; cy: number; rx: number; ry: number } })
  | (ShapeBase & { kind: "polygon"; geometry: { points: Array<{ x: number; y: number }> } })
  | (ShapeBase & { kind: "curve"; geometry: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number } });

export type ShapeDraft = Omit<Extract<Shape, { kind: "line" }>, "id">
  | Omit<Extract<Shape, { kind: "rectangle" }>, "id">
  | Omit<Extract<Shape, { kind: "ellipse" }>, "id">
  | Omit<Extract<Shape, { kind: "polygon" }>, "id">
  | Omit<Extract<Shape, { kind: "curve" }>, "id">;

export interface RasterReference {
  id: string;
  name: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
}

export interface ImportedSvg {
  id: string;
  name: string;
  markup: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
}

export interface DrawingProject {
  version: 1;
  width: number;
  height: number;
  strokes: Stroke[];
  shapes: Shape[];
  rasterReferences: RasterReference[];
  importedSvgs: ImportedSvg[];
}
