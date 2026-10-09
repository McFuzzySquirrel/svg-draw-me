import { Container } from "pixi.js";
import type { ProjectLayer, ProjectTransform } from "./types";

export const applyProjectTransform = (
  displayObject: Container,
  transform: ProjectTransform | undefined,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): void => {
  displayObject.position.set(offset.x + (transform?.translateX ?? 0), offset.y + (transform?.translateY ?? 0));
  displayObject.rotation = transform?.rotation ?? 0;
  displayObject.scale.set(transform?.scaleX ?? 1, transform?.scaleY ?? 1);
};

export const projectTransformToSvg = (
  transform: ProjectTransform | undefined,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): string | null => {
  if (!transform) return offset.x === 0 && offset.y === 0
    ? null
    : `translate(${offset.x} ${offset.y})`;
  const translateX = offset.x + transform.translateX;
  const translateY = offset.y + transform.translateY;
  const degrees = transform.rotation * 180 / Math.PI;
  return `translate(${translateX} ${translateY}) rotate(${degrees}) scale(${transform.scaleX} ${transform.scaleY})`;
};

export const createProjectLayerContainers = (
  root: Container,
  layers: ProjectLayer[],
): Map<string, Container> => {
  const containers = new Map<string, Container>();
  const children = new Map<string | null, ProjectLayer[]>();
  for (const layer of layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }

  const attachChildren = (parent: Container, parentId: string | null): void => {
    for (const layer of (children.get(parentId) ?? []).sort((a, b) => a.order - b.order)) {
      const container = new Container();
      container.label = layer.name;
      container.visible = layer.visible;
      container.alpha = layer.opacity;
      container.zIndex = layer.order;
      applyProjectTransform(container, layer.transform);
      containers.set(layer.id, container);
      parent.addChild(container);
      container.sortableChildren = true;
      attachChildren(container, layer.id);
    }
  };

  root.sortableChildren = true;
  attachChildren(root, null);
  return containers;
};
