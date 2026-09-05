import { useEffect, useRef } from 'react';

const vertexSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;
const fragmentSource = `
  precision mediump float;
  uniform float time;
  uniform float dpr;
  void main() {
    vec2 uv = gl_FragCoord.xy / dpr;
    vec2 gridPosition = mod(uv + vec2(time * 15.0, -time * 15.0), 30.0);
    float grid = max(step(29.0, gridPosition.x), step(29.0, gridPosition.y));
    gl_FragColor = vec4(mix(vec3(0.255, 0.259, 0.329), vec3(0.341, 0.341, 0.404), grid), 1.0);
  }
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Only expose the canvas after a successful draw; CSS supplies the fallback.
    canvas.style.visibility = 'hidden';
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return;

    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now();
    let frame = 0;
    let failed = false;
    let resizeObserver: ResizeObserver | undefined;

    const stopAnimation = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onContextLost = () => {
      // Keep the static grid until remount instead of rendering into a lost context.
      failed = true;
      stopAnimation();
      resizeObserver?.disconnect();
      canvas.style.visibility = 'hidden';
    };

    const cleanup = () => {
      stopAnimation();
      resizeObserver?.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      for (const shader of shaders) gl.deleteShader(shader);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };

    try {
      if (!program || !buffer) throw new Error('WebGL allocation failed');
      shaders.push(compileShader(gl, gl.VERTEX_SHADER, vertexSource));
      shaders.push(compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
      for (const shader of shaders) gl.attachShader(program, shader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
      }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const time = gl.getUniformLocation(program, 'time');
      const dpr = gl.getUniformLocation(program, 'dpr');

      const draw = (now: number) => {
        frame = 0;
        if (failed || document.hidden) return;
        gl.uniform1f(time, motion.matches ? 0 : (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        canvas.style.visibility = 'visible';
        if (!motion.matches) frame = requestAnimationFrame(draw);
      };
      const refreshAnimation = () => {
        stopAnimation();
        draw(performance.now());
      };
      const resize = () => {
        if (failed) return;
        // A simple grid does not need the full pixel count of high-density displays.
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(bounds.width * ratio));
        const height = Math.max(1, Math.round(bounds.height * ratio));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        gl.viewport(0, 0, width, height);
        gl.uniform1f(dpr, ratio);
        refreshAnimation();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();
      document.addEventListener('visibilitychange', refreshAnimation);
      motion.addEventListener('change', refreshAnimation);
      canvas.addEventListener('webglcontextlost', onContextLost);

      return () => {
        document.removeEventListener('visibilitychange', refreshAnimation);
        motion.removeEventListener('change', refreshAnimation);
        cleanup();
      };
    } catch (error) {
      console.warn('Using static panel grid:', error);
      canvas.style.visibility = 'hidden';
      cleanup();
    }
  }, []);

  return <canvas ref={canvasRef} className="grid-background" aria-hidden="true" />;
}
