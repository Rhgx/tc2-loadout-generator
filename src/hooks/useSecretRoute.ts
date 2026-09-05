import { useEffect, useRef } from 'react';

const fullSequence = [
  'up',
  'up',
  'down',
  'down',
  'left',
  'right',
  'left',
  'right',
  'b',
  'a',
  'start',
];
const touchSequence = [...fullSequence.slice(0, 8), 'start'];
const keyboardKey: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  b: 'b',
  B: 'b',
  a: 'a',
  A: 'a',
  Enter: 'start',
};
const gamepadButtons: Array<[number, string]> = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [1, 'b'],
  [0, 'a'],
  [9, 'start'],
];

function sequenceMatcher(sequence: string[], onMatch: () => void) {
  let index = 0;
  return (input: string) => {
    if (input === sequence[index]) {
      index += 1;
      if (index === sequence.length) {
        index = 0;
        onMatch();
        return true;
      }
      return false;
    }
    index = input === sequence[0] ? 1 : 0;
    return false;
  };
}

export function useSecretRoute(onUnlock: () => void) {
  const unlockRef = useRef(onUnlock);
  unlockRef.current = onUnlock;

  useEffect(() => {
    const unlock = () => unlockRef.current();
    const matchKeyboard = sequenceMatcher(fullSequence, unlock);
    const matchTouch = sequenceMatcher(touchSequence, unlock);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      const input = keyboardKey[event.key];
      if (input && matchKeyboard(input)) event.preventDefault();
    };

    let touchStart: { x: number; y: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!touchStart || event.changedTouches.length !== 1) return;
      const x = event.changedTouches[0].clientX - touchStart.x;
      const y = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      const input =
        Math.max(Math.abs(x), Math.abs(y)) < 40
          ? 'start'
          : Math.abs(x) > Math.abs(y)
            ? x > 0
              ? 'right'
              : 'left'
            : y > 0
              ? 'down'
              : 'up';
      if (matchTouch(input)) event.preventDefault();
    };

    let animationFrame = 0;
    let previousButtons: boolean[] = [];
    const pollGamepads = () => {
      animationFrame = 0;
      const gamepad = navigator.getGamepads?.().find(Boolean);
      if (!gamepad || document.hidden) {
        previousButtons = [];
        return;
      }
      gamepadButtons.forEach(([buttonIndex, input]) => {
        const pressed = Boolean(gamepad.buttons[buttonIndex]?.pressed);
        if (pressed && !previousButtons[buttonIndex]) matchKeyboard(input);
        previousButtons[buttonIndex] = pressed;
      });
      animationFrame = requestAnimationFrame(pollGamepads);
    };
    // Connection and visibility events restart polling without an idle frame loop.
    const refreshGamepads = () => {
      cancelAnimationFrame(animationFrame);
      previousButtons = [];
      pollGamepads();
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('gamepadconnected', refreshGamepads);
    window.addEventListener('gamepaddisconnected', refreshGamepads);
    document.addEventListener('visibilitychange', refreshGamepads);
    refreshGamepads();
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('gamepadconnected', refreshGamepads);
      window.removeEventListener('gamepaddisconnected', refreshGamepads);
      document.removeEventListener('visibilitychange', refreshGamepads);
    };
  }, []);
}
