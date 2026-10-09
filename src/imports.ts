export function createSvgBlob(markup: string): Blob {
  return new Blob([markup], { type: "image/svg+xml" });
}

export function getSvgDimensions(markup: string): { width: number; height: number } {
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
    width: parseLength(attribute("width")) ?? viewBoxWidth ?? 300,
    height: parseLength(attribute("height")) ?? viewBoxHeight ?? 150,
  };
}
