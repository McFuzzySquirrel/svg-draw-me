import type { DrawingProject, ProjectLayer, Shape, Stroke, TextObject } from "./types";
import { pathCommandsToSvg } from "./path";
import { projectTransformToSvg } from "./transforms";

export const MAX_EDITABLE_METADATA_LENGTH = 1_000_000;

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
    ...project.texts.filter((text) => text.layerId === undefined).map(textToSvg),
  ];
  const content = [
    ...renderLayerContents(project, includeReferences, "references"),
    ...rootReferences,
    ...renderLayerContents(project, includeReferences, "artwork"),
    ...rootArtwork,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}"><metadata>${escapeText(
    JSON.stringify({ format: "svg-draw-me", version: project.version }),
  )}</metadata><defs>${paintAndEffectDefs(project)}<clipPath id="project-bounds"><rect width="${project.width}" height="${project.height}"/></clipPath></defs><g clip-path="url(#project-bounds)">${content}</g></svg>`;
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
    for (const text of project.texts) add(text.layerId, textToSvg(text));
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
  const serializedProject = JSON.stringify(project);
  if (serializedProject.length > MAX_EDITABLE_METADATA_LENGTH) {
    throw new Error("Editable SVG metadata exceeds the supported size limit.");
  }
  const svg = projectToSvg(project, true);
  const metadata = escapeText(JSON.stringify({
    format: "svg-draw-me",
    version: project.version,
    project,
  }));
  return svg.replace(
    /<metadata>.*?<\/metadata>/,
    `<metadata>${metadata}</metadata>`,
  );
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
  const fill = shape.style.gradient
    ? `fill="url(#gradient-${escapeAttribute(shape.id)})"`
    : shape.style.fill ? `fill="${escapeAttribute(shape.style.fill)}"` : 'fill="none"';
  const effect = shape.style.effect?.type === "blur"
    ? `filter="url(#effect-${escapeAttribute(shape.id)})"`
    : "";
  if (shape.kind === "line") {
    const g = shape.geometry;
    return wrapTransform(`<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" ${stroke} ${fill} ${effect}/>`, projectTransformToSvg(shape.transform));
  }

  if (shape.kind === "rectangle") {
    const g = shape.geometry;
    return wrapTransform(`<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" ${stroke} ${fill} ${effect}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "ellipse") {
    const g = shape.geometry;
    return wrapTransform(`<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" ${stroke} ${fill} ${effect}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "polygon") {
    const g = shape.geometry;
    return wrapTransform(`<polygon points="${g.points.map((p) => `${p.x},${p.y}`).join(" ")}" ${stroke} ${fill} ${effect}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "curve") {
    const g = shape.geometry;
    return wrapTransform(`<path d="M ${g.x1} ${g.y1} Q ${g.cx} ${g.cy} ${g.x2} ${g.y2}" ${stroke} ${fill} ${effect}/>`, projectTransformToSvg(shape.transform));
  }
  if (shape.kind === "path") {
    return wrapTransform(`<path d="${pathCommandsToSvg(shape.geometry.commands)}" ${stroke} ${fill} ${effect}/>`, projectTransformToSvg(shape.transform));
  }
  return "";
}

function paintAndEffectDefs(project: DrawingProject): string {
  return project.shapes
    .filter((shape) => shape.style.gradient || shape.style.effect)
    .map((shape) => {
      const gradient = shape.style.gradient;
      const effect = shape.style.effect;
      const gradientMarkup = gradient
        ? gradient.type === "radial"
          ? `<radialGradient id="gradient-${escapeAttribute(shape.id)}" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stop-color="${escapeAttribute(gradient.startColor)}"/><stop offset="1" stop-color="${escapeAttribute(gradient.endColor)}"/></radialGradient>`
          : `<linearGradient id="gradient-${escapeAttribute(shape.id)}" x1="0.5" y1="0.5" x2="${(0.5 + Math.cos(gradient.angle) / 2).toString()}" y2="${(0.5 + Math.sin(gradient.angle) / 2).toString()}"><stop offset="0" stop-color="${escapeAttribute(gradient.startColor)}"/><stop offset="1" stop-color="${escapeAttribute(gradient.endColor)}"/></linearGradient>`
        : "";
      const effectMarkup = effect?.type === "blur"
        ? `<filter id="effect-${escapeAttribute(shape.id)}"><feGaussianBlur stdDeviation="${effect.strength}"/></filter>`
        : "";
      return gradientMarkup + effectMarkup;
    })
    .join("");
}

function textToSvg(text: TextObject): string {
  const fontFamily = text.fontFamily.includes(",")
    ? text.fontFamily
    : `${text.fontFamily}, sans-serif`;
  const attributes = [
    `x="${text.x}"`,
    `y="${text.y}"`,
    `font-family="${escapeAttribute(fontFamily)}"`,
    `font-size="${text.fontSize}"`,
    `fill="${escapeAttribute(text.color)}"`,
    `opacity="${text.opacity}"`,
    `text-anchor="${text.align === "left" ? "start" : text.align === "center" ? "middle" : "end"}"`,
  ].join(" ");
  return wrapTransform(`<text ${attributes}>${escapeText(text.text)}</text>`, projectTransformToSvg(text.transform));
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
