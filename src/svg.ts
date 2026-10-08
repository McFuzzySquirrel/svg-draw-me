import type { DrawingProject, Shape, Stroke } from "./types";

export function projectToSvg(project: DrawingProject, includeReferences = false): string {
  const content = [
    ...project.rasterReferences
      .filter((reference) => includeReferences && reference.visible)
      .map(
        (reference) =>
          `<image href="${escapeAttribute(reference.dataUrl)}" x="${reference.x}" y="${reference.y}" width="${reference.width}" height="${reference.height}" opacity="${reference.opacity}"/>`,
      ),
    ...project.importedSvgs
      .filter((svg) => svg.visible)
      .map((svg) => `<g transform="translate(${svg.x} ${svg.y})" opacity="${svg.opacity}">${svg.markup}</g>`),
    ...project.strokes.map(strokeToPath),
    ...project.shapes.map(shapeToSvg),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}"><metadata>${escapeText(
    JSON.stringify({ format: "svg-draw-me", version: project.version }),
  )}</metadata>${content}</svg>`;
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
  return `<path d="${commands}" fill="none" stroke="${escapeAttribute(stroke.style.color)}" stroke-width="${stroke.style.width}" stroke-opacity="${stroke.style.opacity}" stroke-linecap="${stroke.style.lineCap}" stroke-linejoin="${stroke.style.lineJoin}"/>`;
}

function shapeToSvg(shape: Shape): string {
  const stroke = `stroke="${escapeAttribute(shape.style.stroke.color)}" stroke-width="${shape.style.stroke.width}" stroke-opacity="${shape.style.stroke.opacity}" stroke-linecap="${shape.style.stroke.lineCap}" stroke-linejoin="${shape.style.stroke.lineJoin}"`;
  const fill = shape.style.fill ? `fill="${escapeAttribute(shape.style.fill)}"` : 'fill="none"';
  if (shape.kind === "line") {
    const g = shape.geometry;
    return `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" ${stroke} ${fill}/>`;
  }
  if (shape.kind === "rectangle") {
    const g = shape.geometry;
    return `<rect x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" ${stroke} ${fill}/>`;
  }
  if (shape.kind === "ellipse") {
    const g = shape.geometry;
    return `<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" ${stroke} ${fill}/>`;
  }
  if (shape.kind === "polygon") {
    const g = shape.geometry;
    return `<polygon points="${g.points.map((p) => `${p.x},${p.y}`).join(" ")}" ${stroke} ${fill}/>`;
  }
  if (shape.kind === "curve") {
    const g = shape.geometry;
    return `<path d="M ${g.x1} ${g.y1} Q ${g.cx} ${g.cy} ${g.x2} ${g.y2}" ${stroke} ${fill}/>`;
  }
  return "";
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}
