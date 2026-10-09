import { describe, expect, it } from "vitest";
import { evaluateAnimation } from "../src/animation";
import type { AnimationDefinition } from "../src/types";

const animation = (overrides: Partial<AnimationDefinition> = {}): AnimationDefinition => ({
  id: "animation-1",
  preset: "move",
  targetType: "object",
  targetId: "object-1",
  duration: 1000,
  delay: 100,
  iterations: 2,
  direction: "normal",
  easing: "linear",
  enabled: true,
  ...overrides,
});

describe("animation evaluator", () => {
  it("holds during delay and interpolates preset values", () => {
    expect(evaluateAnimation(animation(), 50).active).toBe(false);
    expect(evaluateAnimation(animation(), 600)).toMatchObject({
      active: true,
      progress: 0.5,
      translateX: 0,
      translateY: 0,
    });
  });

  it("supports alternate direction and finite iteration completion", () => {
    expect(evaluateAnimation(animation({ direction: "alternate" }), 1_100).progress).toBe(1);
    expect(evaluateAnimation(animation({ direction: "alternate" }), 2_100).active).toBe(false);
  });

  it("supports looping and reduced-motion defaults", () => {
    expect(evaluateAnimation(animation({ iterations: "infinite" }), 2_600).active).toBe(true);
    expect(evaluateAnimation(animation(), 600, true)).toMatchObject({
      active: false,
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("evaluates fade, scale, rotate, and pulse presets", () => {
    expect(evaluateAnimation(animation({ preset: "fade", delay: 0 }), 500).opacity).toBe(0.5);
    expect(evaluateAnimation(animation({ preset: "scale", delay: 0 }), 500).scaleX).toBe(1);
    expect(evaluateAnimation(animation({ preset: "rotate", delay: 0 }), 500).rotation).toBeCloseTo(Math.PI);
    expect(evaluateAnimation(animation({ preset: "pulse", delay: 0 }), 250).scaleX).toBeCloseTo(1.12);
  });
});
