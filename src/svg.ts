import type { DrawingProject, ProjectLayer, Shape, Stroke } from "./types";
import { projectTransformToSvg } from "./transforms";

export function projectToSvg(project: DrawingProject, includeReferences = false): string {
  const rootReferences = [
    ...project.rasterReferences
      .filter((reference) => includeReferences && reference.visible && reference.layerId === undefined)
      .map((reference) => referenceSvg(reference)),
    ...project.importedSvgs
      .filter((reference) => reference.visible && reference.layerId === undefined)
      .map((reference) => referenceSvg(reference)),
  ];
  const rootArtwork = [
    ...project.strokes.filter((stroke) => stroke.layerId === undefined).map(strokeToPath),
    ...project.shapes.filter((shape) => shape.layerId === undefined).map(shapeToSvg),
  ];
  const content = [
    ...renderLayerContents(project, includeReferences, "references"),
    ...rootReferences,
    ...renderLayerContents(project, includeReferences, "artwork"),
    ...rootArtwork,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}"><metadata>${escapeText(
    JSON.stringify({ format: "svg-draw-me", version: project.version }),
  )}</metadata><defs><clipPath id="project-bounds"><rect width="${project.width}" height="${project.height}"/></clipPath></defs><g clip-path="url(#project-bounds)">${content}</g></svg>`;
}

function renderLayerContents(
  project: DrawingProject,
  includeReferences: boolean,
  category: "references" | "artwork",
): string[] {
  const contents = new Map<string, string[]>();
  const add = (layerId: string | undefined, svg: string): void => {
    if (layerId === undefined) return;
    const content = contents.get(layerId) ?? [];
    content.push(svg);
    contents.set(layerId, content);
  };
  if (category === "references") {
    for (const reference of project.rasterReferences) {
      if (includeReferences && reference.visible) add(reference.layerId, referenceSvg(reference));
    }
    for (const reference of project.importedSvgs) {
      if (reference.visible) add(reference.layerId, referenceSvg(reference));
    }
  } else {
    for (const stroke of project.strokes) add(stroke.layerId, strokeToPath(stroke));
    for (const shape of project.shapes) add(shape.layerId, shapeToSvg(shape));
  }

  const children = new Map<string | null, ProjectLayer[]>();
  for (const layer of project.layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }
  const renderLayer = (layer: ProjectLayer): string => {
    if (!layer.visible) return "";
    const transform = projectTransformToSvg(layer.transform);
    const attributes = [
      `data-layer="${escapeAttribute(layer.id)}"`,
      `opacity="${layer.opacity}"`,
      ...(transform ? [`transform="${transform}"`] : []),
    ].join(" ");
    const childContent = (children.get(layer.id) ?? [])
      .sort((a, b) => a.order - b.order)
      .map(renderLayer)
      .join("");
    return `<g ${attributes}>${(contents.get(layer.id) ?? []).join("")}${childContent}</g>`;
  };
  return (children.get(null) ?? []).sort((a, b) => a.order - b.order).map(renderLayer);
}

function referenceSvg(reference: DrawingProject["rasterReferences"][number] | DrawingProject["importedSvgs"][number]): string {
  const offset = { x: reference.x, y: reference.y };
  if ("dataUrl" in reference) {
    return wrapTransform(
      `<image href="${escapeAttribute(reference.dataUrl)}" width="${reference.width}" height="${reference.height}" opacity="${reference.opacity}"/>`,
      projectTransformToSvg(reference.transform, offset),
    );
  }
  return wrapTransform(
    `<g opacity="${reference.opacity}">${reference.markup}</g>`,
    projectTransformToSvg(reference.transform, offset),
  );
}

export function projectToEditableSvg(project: DrawingProject): string {
  const svg = projectToSvg(project, true);
  const history = escapeText(JSON.stringify(project));
  return svg.replace("</metadata>", `${history}</metadata>`);
}

function strokeToPath(stroke: Stroke): string {
  const [first, ...rest] = stroke.points;
  if (!first) return "";
  const commands = [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(" ");
  const fill = stroke.fill ? escapeAttribute(stroke.fill) : "none";
  const close = stroke.fill ? " Z" : "";
  return wrapTransform(
    `<path d="${commands}${close}" fill="${fill}" stroke="${escapeAttribute(stroke.style.color)}" stroke-width="${stroke.style.width}" stroke-opacity="${stroke.style.opacity}" stroke-linecap="${stroke.style.lineCap}" stroke-linejoin="${stroke.style.lineJoin}"/>`,
    projectTransformToSvg(stroke.transform),
  );
}

function shapeToSvg(shape: Shape): string {
  const stroke = `stroke="${escapeAttribute(shape.style.stroke.color)}" stroke-width="${shape.style.stroke.width}" stroke-opacity="${shape.style.stroke.opacity}" stroke-linecap="${shape.style.stroke.lineCap}" stroke-linejoin="${shape.style.stroke.lineJoin}"`;
  const fill = shape.style.fill ? `fill="${escapeAttribute(shape.style.fill)}"` : 'fill="none"';
  if (shape.kind === "line") {
    const g = shape.geometry;
    return wrapTransform(`<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" ${stroke} ${fill}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "rectangle") {
    const g = shape.geometry;
    return wrapTransform(`<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" ${stroke} ${fill}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "ellipse") {
    const g = shape.geometry;
    return wrapTransform(`<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" ${stroke} ${fill}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "polygon") {
    const g = shape.geometry;
    return wrapTransform(`<polygon points="${g.points.map((p) => `${p.x},${p.y}`).join(" ")}" ${stroke} ${fill}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "curve") {
    const g = shape.geometry;
    return wrapTransform(`<path d="M ${g.x1} ${g.y1} Q ${g.cx} ${g.cy} ${g.x2} ${g.y2}" ${stroke} ${fill}/>`, projectTransformToSvg(shape.transform));
  }
  return "";
}

function wrapTransform(content: string, transform: string | null): string {
  return transform ? `<g transform="${transform}">${content}</g>` : content;
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}
