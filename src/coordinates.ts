export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
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
