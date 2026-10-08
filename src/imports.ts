export function createSvgBlob(markup: string): Blob {
  return new Blob([markup], { type: "image/svg+xml" });
}
