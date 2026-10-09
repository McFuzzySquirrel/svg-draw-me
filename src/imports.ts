export function createSvgBlob(markup: string): Blob {
  return new Blob([markup], { type: "image/svg+xml" });
}

export function findUnsupportedSvgFeatures(markup: string): string[] {
  const features: Array<[RegExp, string]> = [
    [/<(?:filter|fe[a-z]+)\b/i, "filters"],
    [/<mask\b/i, "masks"],
    [/<style\b|style\s*=/i, "CSS styles"],
    [/<(?:animate|animateTransform|set)\b/i, "SVG animation"],
    [/(?:href|xlink:href)\s*=\s*["'](?!#|data:)/i, "external assets"],
  ];
  return features.filter(([pattern]) => pattern.test(markup)).map(([, name]) => name);
}

export function getSvgDimensions(markup: string): { x: number; y: number; width: number; height: number } {
  const attributes = markup.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const attribute = (name: string): string | undefined =>
    attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2];
  const parseLength = (value: string | undefined): number | undefined => {
    const match = value?.match(/^\s*(\d+(?:\.\d*)?|\.\d+)(?:px)?\s*$/i);
    const number = match ? Number(match[1]) : NaN;
    return Number.isFinite(number) && number > 0 ? number : undefined;
  };
  const viewBox = attribute("viewBox")
    ?.trim()
    .split(/[,\s]+/)
    .map(Number);
  const viewBoxWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2]! > 0
    ? viewBox[2]
    : undefined;
  const viewBoxHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3]! > 0
    ? viewBox[3]
    : undefined;

  return {
    x: viewBox?.length === 4 && Number.isFinite(viewBox[0]) ? viewBox[0]! : 0,
    y: viewBox?.length === 4 && Number.isFinite(viewBox[1]) ? viewBox[1]! : 0,
    width: parseLength(attribute("width")) ?? viewBoxWidth ?? 300,
    height: parseLength(attribute("height")) ?? viewBoxHeight ?? 150,
  };
}
