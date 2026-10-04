import { useEffect } from "react";

const START_SPEED = 90;
const MAX_SPEED = 850;
const RAMP_MS = 1100;
const IDLE_RESET_MS = 350;
const INPUT_GRACE_MS = 160;
const TOUCH_MOMENTUM_MS = 1200;
const PROGRAMMATIC_SETTLE_MS = 250;
const PROGRAMMATIC_MAX_MS = 1800;

let programmaticActive = false;
let programmaticDeadline = 0;
let programmaticIdleTimer: number | null = null;

function armProgrammaticIdle() {
  if (programmaticIdleTimer !== null) {
    window.clearTimeout(programmaticIdleTimer);
  }
  programmaticIdleTimer = window.setTimeout(() => {
    programmaticActive = false;
    programmaticIdleTimer = null;
  }, PROGRAMMATIC_SETTLE_MS);
}

export function markProgrammaticScroll() {
  programmaticActive = true;
  programmaticDeadline = performance.now() + PROGRAMMATIC_MAX_MS;
  armProgrammaticIdle();
}

function rampDistance(elapsedMs: number) {
  const rampSeconds = RAMP_MS / 1000;
  const t = elapsedMs / 1000;
  const accel = (MAX_SPEED - START_SPEED) / rampSeconds;
  if (t <= rampSeconds) {
    return START_SPEED * t + 0.5 * accel * t * t;
  }
  const atRampEnd =
    START_SPEED * rampSeconds + 0.5 * accel * rampSeconds * rampSeconds;
  return atRampEnd + MAX_SPEED * (t - rampSeconds);
}

export function useSelectionAutoscroll(
  ref: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let active = false;
    let anchor = 0;
    let direction = 0;
    let startedAt = 0;
    let expected: number | null = null;
    let idleTimer: number | null = null;
    let lastInputAt = -Infinity;
    let momentumUntil = -Infinity;

    const reset = () => {
      active = false;
      direction = 0;
      expected = null;
    };

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const selectionInsideScroller = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return false;
      }
      const range = selection.getRangeAt(0);
      if (range.collapsed) return false;
      return (
        el.contains(range.startContainer) && el.contains(range.endContainer)
      );
    };

    const onScroll = () => {
      const current = el.scrollTop;

      if (expected !== null && Math.abs(current - expected) < 1) {
        expected = null;
        return;
      }

      clearIdleTimer();
      idleTimer = window.setTimeout(reset, IDLE_RESET_MS);

      if (programmaticActive) {
        if (performance.now() < programmaticDeadline) {
          reset();
          armProgrammaticIdle();
          return;
        }
        programmaticActive = false;
      }

      const now = performance.now();
      if (!selectionInsideScroller()) {
        reset();
        return;
      }
      if (now - lastInputAt < INPUT_GRACE_MS || now < momentumUntil) {
        reset();
        return;
      }

      if (!active) {
        active = true;
        anchor = current;
        direction = 0;
        startedAt = now;
        return;
      }

      const moved = current - anchor;
      const sign = Math.sign(moved);
      if (sign === 0) return;
      if (direction !== 0 && sign !== direction) {
        anchor = current;
        direction = 0;
        startedAt = now;
        return;
      }
      direction = sign;

      const allowed = rampDistance(now - startedAt);
      const target = anchor + direction * allowed;
      const pastLimit = direction < 0 ? current < target : current > target;
      if (pastLimit) {
        el.scrollTop = target;
        expected = el.scrollTop;
      }
    };

    const markInput = () => {
      lastInputAt = performance.now();
    };

    const onTouchEnd = () => {
      momentumUntil = performance.now() + TOUCH_MOMENTUM_MS;
    };

    const onSelectionChange = () => {
      if (!selectionInsideScroller()) reset();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("touchstart", markInput, {
      passive: true,
      capture: true,
    });
    document.addEventListener("touchmove", markInput, {
      passive: true,
      capture: true,
    });
    document.addEventListener("touchend", onTouchEnd, {
      passive: true,
      capture: true,
    });
    document.addEventListener("wheel", markInput, {
      passive: true,
      capture: true,
    });
    document.addEventListener("keydown", markInput, { capture: true });
    document.addEventListener("mousedown", markInput, { capture: true });
    document.addEventListener("mouseup", markInput, { capture: true });
    document.addEventListener("dblclick", markInput, { capture: true });
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      clearIdleTimer();
      el.removeEventListener("scroll", onScroll);
      document.removeEventListener("touchstart", markInput, { capture: true });
      document.removeEventListener("touchmove", markInput, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("wheel", markInput, { capture: true });
      document.removeEventListener("keydown", markInput, { capture: true });
      document.removeEventListener("mousedown", markInput, { capture: true });
      document.removeEventListener("mouseup", markInput, { capture: true });
      document.removeEventListener("dblclick", markInput, { capture: true });
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [ref]);
}
