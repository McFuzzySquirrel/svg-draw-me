import type { PathCommand } from "./types";

const SUPPORTED = new Set(["M", "L", "H", "V", "C", "S", "Q", "T", "Z"]);

export function parseEditablePath(d: string): PathCommand[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  if (tokens.join("").replace(/,/g, "") !== d.replace(/[\s,]+/g, "")) {
    throw new Error("Path contains unsupported tokens.");
  }
  const commands: PathCommand[] = [];
  let index = 0;
  let active = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let previousControl: { x: number; y: number } | undefined;
  let previousType: "C" | "Q" | undefined;
  let movePending = false;

  const read = (count: number): number[] => {
    if (index + count > tokens.length || tokens.slice(index, index + count).some((token) => /^[a-zA-Z]$/.test(token!))) {
      throw new Error(`Incomplete ${active.toUpperCase()} command.`);
    }
    const values = tokens.slice(index, index + count).map(Number);
    if (values.some((value) => !Number.isFinite(value))) throw new Error("Path contains an invalid number.");
    index += count;
    return values;
  };
  const target = (relative: boolean, px: number, py: number): { x: number; y: number } => ({
    x: relative ? x + px : px,
    y: relative ? y + py : py,
  });
  const setPosition = (next: { x: number; y: number }): void => {
    x = next.x;
    y = next.y;
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index]!)) {
      active = tokens[index++]!;
      if (!SUPPORTED.has(active.toUpperCase())) throw new Error(`Unsupported path command: ${active}`);
      if (active.toUpperCase() === "Z") {
        commands.push({ type: "Z" });
        x = startX;
        y = startY;
        previousControl = undefined;
        previousType = undefined;
        movePending = false;
        continue;
      }
      movePending = active.toUpperCase() === "M";
    } else if (!active) {
      throw new Error("Path must begin with a command.");
    }

    const upper = active.toUpperCase();
    const relative = active !== upper;
    if (upper === "M" || upper === "L" || upper === "T") {
      const [px, py] = read(2);
      const next = target(relative, px!, py!);
      if (upper === "M" && movePending) {
        commands.push({ type: "M", ...next });
        startX = next.x;
        startY = next.y;
        movePending = false;
      } else if (upper === "T") {
        const control = previousType === "Q" && previousControl
          ? { x: 2 * x - previousControl.x, y: 2 * y - previousControl.y }
          : { x, y };
        commands.push({ type: "Q", x1: control.x, y1: control.y, x: next.x, y: next.y });
        previousControl = control;
        previousType = "Q";
      } else {
        commands.push({ type: "L", ...next });
        previousControl = undefined;
        previousType = undefined;
      }
      setPosition(next);
      continue;
    }
    if (upper === "H" || upper === "V") {
      const [value] = read(1);
      const next = upper === "H"
        ? { x: relative ? x + value! : value!, y }
        : { x, y: relative ? y + value! : value! };
      commands.push({ type: "L", ...next });
      setPosition(next);
      previousControl = undefined;
      previousType = undefined;
      continue;
    }
    if (upper === "Q" || upper === "C" || upper === "S") {
      let control1: { x: number; y: number };
      let control2: { x: number; y: number } | undefined;
      let next: { x: number; y: number };
      if (upper === "Q") {
        const values = read(4);
        control1 = target(relative, values[0]!, values[1]!);
        next = target(relative, values[2]!, values[3]!);
        commands.push({ type: "Q", x1: control1.x, y1: control1.y, x: next.x, y: next.y });
        previousType = "Q";
      } else if (upper === "S") {
        const values = read(4);
        control1 = previousType === "C" && previousControl
          ? { x: 2 * x - previousControl.x, y: 2 * y - previousControl.y }
          : { x, y };
        control2 = target(relative, values[0]!, values[1]!);
        next = target(relative, values[2]!, values[3]!);
        commands.push({ type: "C", x1: control1.x, y1: control1.y, x2: control2.x, y2: control2.y, x: next.x, y: next.y });
        previousType = "C";
      } else {
        const values = read(6);
        control1 = target(relative, values[0]!, values[1]!);
        control2 = target(relative, values[2]!, values[3]!);
        next = target(relative, values[4]!, values[5]!);
        commands.push({ type: "C", x1: control1.x, y1: control1.y, x2: control2.x, y2: control2.y, x: next.x, y: next.y });
        previousType = "C";
      }
      previousControl = upper === "Q" ? control1 : control2;
      setPosition(next);
      continue;
    }
  }
  return commands;
}

export function pathCommandsToSvg(commands: PathCommand[]): string {
  return commands.map((command) => {
    if (command.type === "Z") return "Z";
    if (command.type === "M" || command.type === "L") return `${command.type} ${command.x} ${command.y}`;
    if (command.type === "Q") return `Q ${command.x1} ${command.y1} ${command.x} ${command.y}`;
    if (command.type === "C") return `C ${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}`;
    return "";
  }).join(" ");
}
