import { useEffect, useRef } from 'react';

export function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false });
    if (!canvas || !gl) return;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const start = performance.now();

    function cleanup() {
      cancelAnimationFrame(frame);
      shaders.forEach(shader => gl!.deleteShader(shader));
      gl!.deleteProgram(program);
      gl!.deleteBuffer(buffer);
    }

    try {
      if (!program || !buffer) throw new Error('WebGL allocation failed');
      const sources = [
        [gl.VERTEX_SHADER, 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }'],
        [gl.FRAGMENT_SHADER, `
          precision mediump float;
          uniform float time;
          uniform float dpr;
          void main() {
            vec2 uv = gl_FragCoord.xy / dpr;
            vec2 gridPosition = mod(uv + vec2(time * 15.0, -time * 15.0), 30.0);
            float grid = max(step(29.0, gridPosition.x), step(29.0, gridPosition.y));
            gl_FragColor = vec4(mix(vec3(0.255, 0.259, 0.329), vec3(0.341, 0.341, 0.404), grid), 1.0);
          }
        `],
      ] as const;
      for (const [type, source] of sources) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const time = gl.getUniformLocation(program, 'time');
      const dpr = gl.getUniformLocation(program, 'dpr');

      function draw(now: number) {
        gl!.uniform1f(time, motion.matches ? 0 : (now - start) / 1000);
        gl!.drawArrays(gl!.TRIANGLES, 0, 6);
        if (!motion.matches && !document.hidden) frame = requestAnimationFrame(draw);
      }
      function refresh() {
        cancelAnimationFrame(frame);
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const bounds = canvas!.getBoundingClientRect();
        canvas!.width = Math.max(1, Math.round(bounds.width * ratio));
        canvas!.height = Math.max(1, Math.round(bounds.height * ratio));
        gl!.viewport(0, 0, canvas!.width, canvas!.height);
        gl!.uniform1f(dpr, ratio);
        if (!document.hidden) draw(performance.now());
      }

      const resizeObserver = new ResizeObserver(refresh);
      resizeObserver.observe(canvas);
      document.addEventListener('visibilitychange', refresh);
      motion.addEventListener('change', refresh);
      refresh();
      return () => {
        resizeObserver.disconnect();
        document.removeEventListener('visibilitychange', refresh);
        motion.removeEventListener('change', refresh);
        cleanup();
      };
    } catch (error) {
      console.warn('Using static panel grid:', error);
      cleanup();
    }
  }, []);

  return <canvas ref={canvasRef} className="grid-background" aria-hidden="true" data-html2canvas-ignore />;
}
