import type { DrawingProject, Stroke } from "./types";

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

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}
