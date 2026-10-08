import { describe, expect, it } from "vitest";
import { pointHitsShape, pointHitsStroke } from "../src/geometry";

describe("whole-object hit testing", () => {
  it("hits a stroke near one of its segments", () => {
    expect(pointHitsStroke(
      { x: 5, y: 2 },
      {
        id: "stroke",
        points: [
          { x: 0, y: 0, pressure: 1, time: 0 },
          { x: 10, y: 0, pressure: 1, time: 1 },
        ],
        style: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
        pointerType: "mouse",
        startedAt: 0,
        endedAt: 1,
      },
      2,
    )).toBe(true);
  });

  it("hits the outline of a rectangle shape", () => {
    expect(pointHitsShape(
      { x: 10, y: 20 },
      {
        id: "rectangle",
        kind: "rectangle",
        style: {
          stroke: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
          fill: null,
        },
        pointerType: "mouse",
        startedAt: 0,
        endedAt: 1,
        geometry: { x: 10, y: 20, width: 40, height: 30 },
      },
      2,
    )).toBe(true);
  });

  it("hits the interior of a filled rectangle", () => {
    expect(pointHitsShape(
      { x: 30, y: 35 },
      {
        id: "filled-rectangle",
        kind: "rectangle",
        style: {
          stroke: { color: "#000", width: 2, opacity: 1, lineCap: "round", lineJoin: "round" },
          fill: "#fff",
        },
        pointerType: "mouse",
        startedAt: 0,
        endedAt: 1,
        geometry: { x: 10, y: 20, width: 40, height: 30 },
      },
      2,
    )).toBe(true);
  });
});
