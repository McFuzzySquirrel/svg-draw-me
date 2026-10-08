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
  rasterReferences: RasterReference[];
  importedSvgs: ImportedSvg[];
}
