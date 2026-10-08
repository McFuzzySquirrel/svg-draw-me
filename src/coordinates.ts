export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function projectToViewport(
  x: number,
  y: number,
  transform: CanvasTransform,
): { x: number; y: number } {
  return {
    x: x * transform.scale + transform.offsetX,
    y: y * transform.scale + transform.offsetY,
  };
}

export function viewportToProject(
  clientX: number,
  clientY: number,
  canvasRect: Pick<DOMRect, "left" | "top">,
  transform: CanvasTransform,
): { x: number; y: number } {
  return {
    x: (clientX - canvasRect.left - transform.offsetX) / transform.scale,
    y: (clientY - canvasRect.top - transform.offsetY) / transform.scale,
  };
}

export function zoomTransformAtPoint(
  transform: CanvasTransform,
  projectPoint: { x: number; y: number },
  viewportPoint: { x: number; y: number },
  nextScale: number,
): CanvasTransform {
  return {
    scale: nextScale,
    offsetX: viewportPoint.x - projectPoint.x * nextScale,
    offsetY: viewportPoint.y - projectPoint.y * nextScale,
  };
}
