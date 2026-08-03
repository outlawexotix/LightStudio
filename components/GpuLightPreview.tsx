import React, { useEffect, useRef } from 'react';
import { LightSource, LightType, SubjectBounds } from '../types';
import { getLightRenderModel } from '../lightingModel';

const MAX_LIGHTS = 12;

const getLightColorHex = (value: string) => value.match(/#[0-9a-f]{6}/i)?.[0] || '#ffffff';

const lightKind = (type: LightType) => {
  if (type === LightType.Spot || type === LightType.Volumetric || type === LightType.God_RAYS) return 1;
  if (type === LightType.Area) return 2;
  if (type === LightType.Tube) return 3;
  if (type === LightType.Environment) return 4;
  return 0;
};

const hexRgb = (value: string) => {
  const hex = getLightColorHex(value).replace('#', '');
  return [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
};

/** A single-pass WebGL optical compositor for responsive, physically-shaped preview light. */
export const GpuLightPreview: React.FC<{ lights: LightSource[]; subject: SubjectBounds }> = ({ lights, subject }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    const vertex = `attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}`;
    const fragment = `
      precision highp float;
      uniform vec2 resolution;
      uniform int count;
      uniform vec4 position[${MAX_LIGHTS}];
      uniform vec4 colorStrength[${MAX_LIGHTS}];
      uniform vec4 optics[${MAX_LIGHTS}];
      uniform vec4 subject;
      uniform float subjectEnabled;
      void main(){
        vec2 uv=gl_FragCoord.xy/resolution.xy; uv.y=1.-uv.y;
        vec3 sum=vec3(0.); float alpha=0.;
        for(int i=0;i<${MAX_LIGHTS};i++){
          if(i>=count) break;
          vec2 delta=uv-position[i].xy;
          float radius=max(.025,position[i].z);
          float angle=position[i].w;
          mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
          vec2 q=rot*delta;
          float kind=optics[i].x;
          if(kind>1.5&&kind<2.5) q.x*=.52;
          if(kind>2.5&&kind<3.5) q.y*=.24;
          float distanceField=length(q)/radius;
          if(kind>.5&&kind<1.5){
            float cone=max(.08,optics[i].y);
            float beam=smoothstep(cone,0.,abs(q.x)/max(.015,q.y+.08));
            distanceField=mix(2.,max(0.,q.y)/radius,beam)*step(-.02,q.y);
          }
          float falloff=mix(1.6,4.5,optics[i].z);
          float glow=pow(max(0.,1.-distanceField),falloff)*colorStrength[i].a;
          if(kind>3.5) glow=colorStrength[i].a*.16*(1.-uv.y*.25);
          float mask=1.;
          if(subjectEnabled>.5&&optics[i].w<-.15){
            vec2 sd=(uv-subject.xy)/max(subject.zw,vec2(.01));
            mask=smoothstep(.78,1.08,length(sd));
          }
          sum+=colorStrength[i].rgb*glow*mask;
          alpha=max(alpha,glow*mask);
        }
        gl_FragColor=vec4(sum,min(.94,alpha));
      }`;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const point = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(point);
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(gl.getUniformLocation(program, 'resolution'), canvas.width, canvas.height);
      const active = lights.filter(l => l.enabled !== false).slice(0, MAX_LIGHTS);
      gl.uniform1i(gl.getUniformLocation(program, 'count'), active.length);
      const positions = new Float32Array(MAX_LIGHTS * 4);
      const colors = new Float32Array(MAX_LIGHTS * 4);
      const properties = new Float32Array(MAX_LIGHTS * 4);
      active.forEach((light, index) => {
        const opticsModel = getLightRenderModel(light);
        positions.set([light.x / 100, light.y / 100, Math.max(.03, light.size / 430), opticsModel.angle * Math.PI / 180], index * 4);
        colors.set([...hexRgb(light.color), light.intensity * (light.opacity ?? 100) / 10000], index * 4);
        properties.set([lightKind(light.type), Math.max(.08, (light.coneAngle ?? 45) / 180), (light.falloff ?? 65) / 100, (light.zDepth ?? (light.placement === 'background' ? -40 : 20)) / 100], index * 4);
      });
      gl.uniform4fv(gl.getUniformLocation(program, 'position[0]'), positions);
      gl.uniform4fv(gl.getUniformLocation(program, 'colorStrength[0]'), colors);
      gl.uniform4fv(gl.getUniformLocation(program, 'optics[0]'), properties);
      gl.uniform4f(gl.getUniformLocation(program, 'subject'), subject.x / 100, subject.y / 100, subject.width / 200, subject.height / 200);
      gl.uniform1f(gl.getUniformLocation(program, 'subjectEnabled'), subject.enabled ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [lights, subject]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none mix-blend-screen z-[26]" aria-label="GPU light preview" />;
};
