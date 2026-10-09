import type { AnimationDefinition } from "./types";

export interface AnimationSample {
  active: boolean;
  progress: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

const IDLE_SAMPLE: AnimationSample = {
  active: false,
  progress: 0,
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

export function evaluateAnimation(
  animation: AnimationDefinition,
  elapsedMs: number,
  reducedMotion = false,
): AnimationSample {
  if (!animation.enabled || reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < animation.delay) {
    return { ...IDLE_SAMPLE };
  }

  const elapsed = elapsedMs - animation.delay;
  const duration = Math.max(animation.duration, 1);
  const iteration = Math.floor(elapsed / duration);
  if (animation.iterations !== "infinite" && iteration >= animation.iterations) {
    return { ...sampleForProgress(animation, animation.direction === "reverse" ? 0 : 1), active: false };
  }

  let progress = (elapsed % duration) / duration;
  const reverse = animation.direction === "reverse"
    || animation.direction === "alternate" && iteration % 2 === 1
    || animation.direction === "alternate-reverse" && iteration % 2 === 0;
  if (reverse) progress = 1 - progress;
  return { ...sampleForProgress(animation, ease(progress, animation.easing)), active: true };
}

function sampleForProgress(animation: AnimationDefinition, progress: number): AnimationSample {
  const clamped = Math.max(0, Math.min(1, progress));
  const sample: AnimationSample = {
    ...IDLE_SAMPLE,
    progress: clamped,
  };
  if (animation.preset === "fade" || animation.preset === "draw") {
    sample.opacity = clamped;
  } else if (animation.preset === "move") {
    sample.translateX = (clamped - 0.5) * 40;
    sample.translateY = (clamped - 0.5) * 40;
  } else if (animation.preset === "scale") {
    sample.scaleX = 0.75 + clamped * 0.5;
    sample.scaleY = 0.75 + clamped * 0.5;
  } else if (animation.preset === "rotate") {
    sample.rotation = clamped * Math.PI * 2;
  } else if (animation.preset === "pulse") {
    const pulse = 1 + Math.sin(clamped * Math.PI * 2) * 0.12;
    sample.scaleX = pulse;
    sample.scaleY = pulse;
  } else if (animation.preset === "emphasis") {
    sample.opacity = 0.7 + Math.sin(clamped * Math.PI * 2) * 0.3;
  }
  return sample;
}

function ease(progress: number, easing: AnimationDefinition["easing"]): number {
  if (easing === "linear") return progress;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return 1 - (1 - progress) ** 2;
  if (easing === "ease-in-out") {
    return progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
  }
  return progress < 0.5
    ? 2 * progress * progress * (1.5 - progress)
    : 1 - ((-2 * progress + 2) ** 2 * (1.5 - (-2 * progress + 2) / 2)) / 2;
}
