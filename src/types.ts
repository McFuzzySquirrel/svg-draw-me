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
  layerId?: string;
  transform?: ProjectTransform;
  points: StrokePoint[];
  style: StrokeStyle;
  fill: string | null;
  pointerType: PointerKind;
  startedAt: number;
  endedAt: number;
}

export type ShapeKind = "line" | "rectangle" | "ellipse" | "polygon" | "curve" | "path";

export type PathCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; x1: number; y1: number; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Z" };

export type FillTarget =
  | { type: "stroke"; id: string }
  | { type: "shape"; id: string };

export interface ShapeStyle {
  stroke: StrokeStyle;
  fill: string | null;
  gradient?: GradientPaint;
  effect?: ShapeEffect;
}

export type GradientPaint =
  | { type: "linear"; startColor: string; endColor: string; angle: number }
  | { type: "radial"; startColor: string; endColor: string };

export interface ShapeEffect {
  type: "blur";
  strength: number;
}

interface ShapeBase {
  id: string;
  layerId?: string;
  transform?: ProjectTransform;
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
  | (ShapeBase & { kind: "curve"; geometry: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number } })
  | (ShapeBase & { kind: "path"; geometry: { commands: PathCommand[] } });

export type ShapeDraft = Omit<Extract<Shape, { kind: "line" }>, "id">
  | Omit<Extract<Shape, { kind: "rectangle" }>, "id">
  | Omit<Extract<Shape, { kind: "ellipse" }>, "id">
  | Omit<Extract<Shape, { kind: "polygon" }>, "id">
  | Omit<Extract<Shape, { kind: "curve" }>, "id">
  | Omit<Extract<Shape, { kind: "path" }>, "id">;

export interface RasterReference {
  id: string;
  layerId?: string;
  transform?: ProjectTransform;
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
  layerId?: string;
  transform?: ProjectTransform;
  name: string;
  markup: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
}

export interface TextObject {
  id: string;
  layerId?: string;
  transform?: ProjectTransform;
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  opacity: number;
  align: "left" | "center" | "right";
}

export interface ProjectTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface ProjectLayer {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  opacity: number;
  parentId: string | null;
  transform?: ProjectTransform;
}

export type AnimationPreset = "fade" | "move" | "scale" | "rotate" | "draw" | "pulse" | "emphasis";
export type AnimationDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";
export type AnimationEasing = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";

export interface AnimationDefinition {
  id: string;
  preset: AnimationPreset;
  targetType: "object" | "layer";
  targetId: string;
  duration: number;
  delay: number;
  iterations: number | "infinite";
  direction: AnimationDirection;
  easing: AnimationEasing;
  enabled: boolean;
}

export interface DrawingProject {
  version: 2;
  width: number;
  height: number;
  strokes: Stroke[];
  shapes: Shape[];
  rasterReferences: RasterReference[];
  importedSvgs: ImportedSvg[];
  texts: TextObject[];
  layers: ProjectLayer[];
  animations: AnimationDefinition[];
}
