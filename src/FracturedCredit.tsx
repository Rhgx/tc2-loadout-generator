import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

const shards = [
  { clip: 'polygon(0 0, 22% 0, 17% 31%, 0 38%)', cx: 0.09, cy: 0.16 },
  { clip: 'polygon(22% 0, 43% 0, 39% 34%, 17% 31%)', cx: 0.31, cy: 0.17 },
  { clip: 'polygon(43% 0, 68% 0, 62% 29%, 39% 34%)', cx: 0.53, cy: 0.16 },
  { clip: 'polygon(68% 0, 100% 0, 100% 35%, 62% 29%)', cx: 0.82, cy: 0.17 },
  { clip: 'polygon(0 38%, 17% 31%, 29% 58%, 0 67%)', cx: 0.11, cy: 0.49 },
  { clip: 'polygon(17% 31%, 39% 34%, 49% 57%, 29% 58%)', cx: 0.34, cy: 0.45 },
  { clip: 'polygon(39% 34%, 62% 29%, 73% 56%, 49% 57%)', cx: 0.57, cy: 0.44 },
  { clip: 'polygon(62% 29%, 100% 35%, 100% 66%, 73% 56%)', cx: 0.84, cy: 0.47 },
  { clip: 'polygon(0 67%, 29% 58%, 25% 100%, 0 100%)', cx: 0.12, cy: 0.82 },
  { clip: 'polygon(29% 58%, 49% 57%, 52% 100%, 25% 100%)', cx: 0.39, cy: 0.79 },
  { clip: 'polygon(49% 57%, 73% 56%, 78% 100%, 52% 100%)', cx: 0.63, cy: 0.79 },
  { clip: 'polygon(73% 56%, 100% 66%, 100% 100%, 78% 100%)', cx: 0.88, cy: 0.82 },
];

type ShardStyle = CSSProperties & {
  clipPath: string;
};

export function FracturedCredit({ onShatter }: { onShatter: (finished: Promise<void>) => void }) {
  const [clicks, setClicks] = useState(0);
  const [impact, setImpact] = useState({ x: 0.5, y: 0.5 });
  const fracture = Math.max(0, (clicks - 2) / 8);
  const shardRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const animationFrame = useRef(0);
  const lastImpact = useRef(impact);

  useEffect(() => () => cancelAnimationFrame(animationFrame.current), []);

  const shatter = (impactX: number, impactY: number) => new Promise<void>((resolve) => {
    const bodies = shards.map((shard, index) => {
      const dx = shard.cx - impactX;
      const dy = shard.cy - impactY;
      const distance = Math.max(0.12, Math.hypot(dx, dy));
      const mass = 0.72 + (index % 4) * 0.16;
      const variation = ((index * 47) % 23) - 11;
      const impulse = (82 + (index % 4) * 11) / mass;
      return {
        element: shardRefs.current[index],
        x: 0,
        y: 0,
        angle: 0,
        vx: (dx / distance) * impulse + variation,
        vy: (dy / distance) * impulse - 235 - (index % 3) * 22,
        angularVelocity: (index % 2 ? 1 : -1) * (190 + index * 21) / mass,
        top: shardRefs.current[index]?.getBoundingClientRect().top || 0,
        left: shardRefs.current[index]?.getBoundingClientRect().left || 0,
        width: shardRefs.current[index]?.getBoundingClientRect().width || 0,
        offscreen: false,
      };
    });
    let previousTime: number | null = null;
    const start = performance.now();
    const gravity = 980;
    const frame = (now: number) => {
      const delta = previousTime === null ? 0 : Math.min(1 / 30, (now - previousTime) / 1000);
      previousTime = now;
      bodies.forEach((body) => {
        if (!body.element || body.offscreen) return;
        const linearDrag = Math.exp(-0.16 * delta);
        const angularDrag = Math.exp(-0.1 * delta);
        body.vx *= linearDrag;
        body.vy = body.vy * linearDrag + gravity * delta;
        body.angularVelocity *= angularDrag;
        body.x += body.vx * delta;
        body.y += body.vy * delta;
        body.angle += body.angularVelocity * delta;
        body.element.style.transform = `translate3d(${body.x}px, ${body.y}px, 0) rotate(${body.angle}deg)`;
        body.offscreen = body.top + body.y > window.innerHeight + 24
          || body.left + body.x + body.width < -24
          || body.left + body.x > window.innerWidth + 24;
        if (body.offscreen) body.element.style.visibility = 'hidden';
      });
      if (bodies.every((body) => body.offscreen) || now - start > 3000) {
        window.setTimeout(resolve, 250);
        return;
      }
      animationFrame.current = requestAnimationFrame(frame);
    };
    animationFrame.current = requestAnimationFrame(frame);
  });

  const captureImpact = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
    lastImpact.current = point;
    setImpact(point);
  };

  const crack = () => {
    if (clicks >= 10) return;
    const next = clicks + 1;
    setClicks(next);
    if (next === 10) {
      onShatter(shatter(lastImpact.current.x, lastImpact.current.y));
    }
  };

  return (
    <button
      className={`fractured-credit${clicks >= 3 ? ' is-cracking' : ''}${clicks === 10 ? ' is-shattered' : ''}`}
      type="button"
      onClick={crack}
      onPointerDown={captureImpact}
      aria-label="Rocks"
      title="Rocks"
      style={{
        '--fracture-opacity': Math.min(1, fracture * 1.2),
        '--impact-x': `${impact.x * 100}%`,
        '--impact-y': `${impact.y * 100}%`,
      } as CSSProperties}
    >
      <span className="fractured-credit__base" style={{ opacity: Math.max(0, 1 - fracture * 4) }}>Rocks</span>
      {shards.map((shard, index) => (
        <span
          aria-hidden="true"
          className="fractured-credit__shard"
          key={index}
          ref={(element) => { shardRefs.current[index] = element; }}
          style={{
            clipPath: shard.clip,
            opacity: Math.min(1, fracture * 4),
          } as ShardStyle}
        >Rocks</span>
      ))}
    </button>
  );
}
