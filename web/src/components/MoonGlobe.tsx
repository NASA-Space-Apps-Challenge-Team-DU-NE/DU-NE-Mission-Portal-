// 3D 달 (UI 예시 initGlobe·loop·placeOverlay 를 옮김). three.js 객체는 ref 로만 소유한다.
// 표면: 파이프라인 s60 이 만든 전역 회색 텍스처(NASA SVS CGI Moon Kit) + 75°S 이남 LROC WAC 남극 모자이크.
// 지도 색: 실제 5 km 남극 격자(75°S 이남)만 칠한다. 그 밖은 자료가 없으므로 칠하지 않는다 (합성 값 금지).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { textureUrl } from '../adapters/data';
import { DEG, R_EARTH_KM, R_MOON_KM, R_SUN_KM } from '../core/constants';
import { j2000ToMoonFixed } from '../core/ephemeris';
import { skyState } from '../core/sky';
import { greatCircleKm } from '../core/vec';
import { useData } from '../state/data';
import { useBases } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite, useSiteCtx } from '../state/hooks';
import { useNormLayer } from '../state/layerNorm';
import { LAYER_UI } from '../state/layerUi';
import { useApp } from '../state/store';
import { playClock } from '../state/playClock';
import { useUi } from '../state/ui';
import { rampRGB } from './kit';
import { useArtemisVintage } from '../state/artemis';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap180 = (x: number) => ((x + 540) % 360) - 180;
const RAD15 = R_MOON_KM * 15 * DEG;
const v3 = (lat: number, lon: number, r = 1) => { const c = Math.cos(lat * D2R); return new THREE.Vector3(r * c * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * c * Math.sin(lon * D2R)); };
const meRaw = (v: number[]) => new THREE.Vector3(v[0], v[2], -v[1]);
const meToThree = (v: number[]) => meRaw(v).normalize();
/** 지구 표면 그림 (NASA Blue Marble 기반 three.js 예제 이미지). 장식이며 계산에 쓰지 않는다. 못 받으면 단색 */
const EARTH_TEX_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg';
/** 태양·지구 배치.
 *  compact (기본): 거리만 줄이고 크기는 달 중심에서 본 실제 각크기 그대로 (지구 약 1.9°, 태양 약 0.53°).
 *  real: 실제 거리·크기 (달 반지름 = 1). 태양은 카메라 범위 밖이라 실제 각크기를 지키며 2000 에 둔다. */
const COMPACT = { earth: 26, sun: 60 };
const SUN_FAR = 2000;
const subLatLon = (v: number[]) => { const n = Math.hypot(v[0], v[1], v[2]); return { lat: Math.asin(v[2] / n) * R2D, lon: Math.atan2(v[1], v[0]) * R2D }; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
function h01(i: number) { let x = (i + 1) * 374761393; x = (x ^ (x >>> 13)) * 1274126177; x ^= x >>> 16; return (x >>> 0) / 4294967295; }

interface G {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; moon: THREE.Mesh;
  uni: Record<string, THREE.IUniform>; sunDisc: THREE.Sprite; sunGlow: THREE.Sprite; earth: THREE.Mesh; earthUni: Record<string, THREE.IUniform>;
  ovTex: THREE.CanvasTexture | null; dist: number; target: { lat: number; lon: number; dist: number } | null; dirty: boolean;
  /** 카메라 방향(보는 점 → 카메라, 단위 벡터)과 화면 위쪽. 위경도 대신 벡터라 극을 지나도 끊기지 않는다 (팀 4f05f1e) */
  pos: THREE.Vector3; up: THREE.Vector3;
  /** 평면 지구 그림 (지구 보기 '평면'일 때) */
  earthSpr: THREE.Sprite; earthCanvas: HTMLCanvasElement; earthTex: THREE.CanvasTexture; ph: number | null;
  /** 지금 그린 지구·태양 거리 (달 반지름 단위) — 겹침 표지 위치에 쓴다 */
  dE: number; dS: number;
  /** 카메라가 바라보는 점 (기본 달 중심). '지구까지' 보기에서는 달–지구 중간 */
  look: THREE.Vector3; lookT: THREE.Vector3;
  /** 카메라 이동 빠르기 (한 화면마다 남은 거리의 비율). 지구로 날아갈 때는 느리게 */
  k: number;
  /** 이동이 끝나면 한 번 부를 일 (지구로 날아간 뒤 지상국 화면 열기) */
  onArrive: (() => void) | null;
}
/** 점 p 에서의 북쪽 접선 (극 바로 위면 null) */
function northAt(p: THREE.Vector3): THREE.Vector3 | null {
  const n = new THREE.Vector3(0, 1, 0).addScaledVector(p, -p.y);
  return n.lengthSq() < 1e-8 ? null : n.normalize();
}
/** up 을 pos 에 수직인 단위 벡터로 다시 맞춘다 */
function orthoUp(g: { pos: THREE.Vector3; up: THREE.Vector3 }) {
  g.up.addScaledVector(g.pos, -g.up.dot(g.pos));
  if (g.up.lengthSq() < 1e-10) g.up.copy(northAt(g.pos) ?? new THREE.Vector3(0, 0, 1));
  g.up.normalize();
}
const lonOf = (p: THREE.Vector3) => Math.atan2(-p.z, p.x) / D2R;
const latOf = (p: THREE.Vector3) => Math.asin(clamp(p.y, -1, 1)) / D2R;
/** 평면 지구 그림: 태양 쪽만 밝은 위상 원반 (팀 4f05f1e 방식) */
function drawEarthSprite(c: HTMLCanvasElement, phase: number) {
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, 128, 128);
  const gr = x.createRadialGradient(50, 50, 6, 64, 64, 46); gr.addColorStop(0, '#bfe3f0'); gr.addColorStop(0.6, '#3f8fb5'); gr.addColorStop(1, '#173a52');
  x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 44, 0, 7); x.fill();
  x.fillStyle = 'rgba(2,6,8,.78)'; x.beginPath();
  const k = 1 - 2 * phase;
  x.ellipse(64, 64, 44 * Math.abs(k), 44, 0, 0, 7);
  if (k > 0) { x.fill(); x.beginPath(); x.rect(20, 20, 44, 88); x.fill(); }
  else { x.save(); x.beginPath(); x.rect(20, 20, 44, 88); x.clip(); x.beginPath(); x.arc(64, 64, 44, 0, 7); x.fill(); x.restore(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.ellipse(64, 64, 44 * Math.abs(k), 44, 0, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over'; }
}
const view = { g: null as G | null, real: false, flat: false };
const maxDist = () => (view.real ? 900 : 80);
export function globeView(v: 'pole' | 'sun' | 'globe' | 'in' | 'out' | 'earth' | 'north') {
  const g = view.g;
  if (!g) return;
  const eph = useData.getState().eph, t = useApp.getState().t;
  if (v === 'pole') g.target = { lat: -89.5, lon: lonOf(g.pos), dist: 2.0 };
  else if (v === 'north') g.target = { lat: latOf(g.pos), lon: lonOf(g.pos), dist: g.dist };
  else if (v === 'sun') { const s = subLatLon(eph.bodyVectors(t).sun); g.target = { lat: s.lat, lon: s.lon, dist: 3.2 }; }
  else if (v === 'globe') g.target = { lat: -25, lon: 0, dist: 3.6 };
  else if (v === 'in') g.dist = clamp(g.dist * 0.8, 1.08, maxDist());
  else if (v === 'out') g.dist = clamp(g.dist * 1.25, 1.08, maxDist());
  else if (v === 'earth') {
    // 달과 지구가 한 화면에 들어오게: 지구 방향에 수직인 쪽에서 바라본다
    const e = meToThree(eph.bodyVectors(t).earth), up = Math.abs(e.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3().crossVectors(e, up).normalize();
    g.lookT.copy(e).multiplyScalar(g.dE * 0.5);
    g.target = { lat: Math.asin(p.y) * R2D, lon: Math.atan2(-p.z, p.x) * R2D, dist: g.dE * 1.7 };
  }
  if (v !== 'earth' && v !== 'in' && v !== 'out' && v !== 'north') g.lookT.set(0, 0, 0);
  g.dirty = true;
}

/** 실제 거리 보기 켜기·끄기. 끌 때 카메라가 멀리 있으면 달 가까이로 돌아온다 */
export function globeReal(on: boolean) {
  view.real = on;
  const g = view.g;
  if (!g) return;
  if (!on && g.dist > 8) { g.target = { lat: latOf(g.pos), lon: lonOf(g.pos), dist: 3.4 }; g.lookT.set(0, 0, 0); }
  g.dirty = true;
}

/** 지구를 누르면: 카메라가 천천히 지구로 날아가 화면 가운데에 지구가 오면
 *  05 임무 시뮬레이션의 지상국 통신 창을 전체화면으로 연다 (한국이 보이게). 달 화면은 원래 보기로 돌려 놓는다. */
export function flyToEarth() {
  const g = view.g;
  if (!g || g.onArrive) return;
  const before = { lat: latOf(g.pos), lon: lonOf(g.pos), dist: g.dist, look: g.look.clone() };
  const pos = new THREE.Vector3().setFromMatrixPosition(g.earth.matrix);
  const rE = view.flat ? g.earthSpr.scale.x / 2 : new THREE.Vector3().setFromMatrixScale(g.earth.matrix).x;
  const dir = pos.clone().negate().normalize(); // 지구에서 달 쪽: 달에서 보이는 지구 면을 바라본다
  g.lookT.copy(pos);
  g.target = { lat: Math.asin(clamp(dir.y, -1, 1)) * R2D, lon: Math.atan2(-dir.z, dir.x) * R2D, dist: rE * 3.2 };
  g.k = 0.06;
  g.onArrive = () => {
    useUi.getState().set({ mode: 'plan', gsFull: true, simTab: 'comm' });
    const st = useApp.getState();
    if (st.fullscreen) st.setFullscreen(false);
    st.setPage('sim');
    g.target = { lat: before.lat, lon: before.lon, dist: before.dist };
    g.lookT.copy(before.look);
  };
  g.dirty = true;
}

/** 태양 원반: 가장자리 어두워짐(limb darkening, u≈0.6)과 가장자리 쪽 약간 붉은 색 */
function sunDiscCanvas() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d')!, im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N * 2 - 1, v = (j + 0.5) / N * 2 - 1, r = Math.hypot(u, v), k = (j * N + i) * 4;
    if (r > 1) continue;
    const mu = Math.sqrt(1 - r * r), I = 1 - 0.6 * (1 - mu), edge = clamp((1 - r) * N * 0.5, 0, 1);
    im.data[k] = 255 * Math.min(1, I * 1.06); im.data[k + 1] = 255 * Math.pow(I, 1.25) * 0.98; im.data[k + 2] = 255 * Math.pow(I, 1.9) * 0.92; im.data[k + 3] = 255 * edge;
  }
  x.putImageData(im, 0, 0);
  return c;
}
/** 태양 둘레의 희미한 빛(코로나·산란). 더하기 합성 */
function sunGlowCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,248,230,0.55)'); gr.addColorStop(0.12, 'rgba(255,240,215,0.28)'); gr.addColorStop(0.3, 'rgba(255,230,200,0.08)'); gr.addColorStop(1, 'rgba(255,220,190,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  return c;
}

export function MoonGlobe({ children, onSub, tools }: { children?: ReactNode; onSub?(s: string | null): void; tools?: ReactNode }) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const viewEl = useRef<HTMLDivElement>(null);
  const ovl = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<string | null>('달 표면 불러오는 중…');
  const app = useApp();
  const tex = useData((d) => d.textures);
  const grid = useData((d) => d.grid);
  const gridApprox = useData((d) => d.gridApprox);
  const sites = useData((d) => d.sites.items);
  const regions = useData((d) => d.artemisRegions);
  const vint = useArtemisVintage();
  const eph = useData((d) => d.eph);
  const res = useGridRun((g) => g.result);
  const rs = useResolvedSite();
  const ctx = useSiteCtx(rs);
  const nl = useNormLayer();
  const bases = useBases();
  const live = useRef({ sites, regions, vint, res, rs, ctx, eph, t: app.t, bases });
  live.current = { sites, regions, vint, res, rs, ctx, eph, t: app.t, bases };

  // ── 초기화 ──
  useEffect(() => {
    const c = cvs.current!, vw = viewEl.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true }); } catch { setLoading('이 브라우저에서 WebGL 을 쓸 수 없습니다'); return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 1, 0.01, 6000);
    const sp: number[] = [];
    for (let i = 0; i < 1500; i++) { const u = h01(i * 3) * 2 - 1, th = h01(i * 3 + 1) * 6.283, s = Math.sqrt(1 - u * u); sp.push(4000 * s * Math.cos(th), 4000 * u, 4000 * s * Math.sin(th)); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9fb3b0, size: 1.2, sizeAttenuation: false })));
    const blank = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;
    const blank0 = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); blank0.needsUpdate = true;
    const uni: Record<string, THREE.IUniform> = {
      map: { value: blank }, south: { value: blank }, overlay: { value: blank0 }, sunDir: { value: new THREE.Vector3(1, 0, 0) },
      ovOn: { value: 1 }, ovOp: { value: 0.75 }, texel: { value: 1 / 2048 }, hasMap: { value: 0 }, hasSouth: { value: 0 }, ovScale: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: 'varying vec3 vN; varying vec2 vUv; void main(){ vN=normalize(position); vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        precision highp float; varying vec3 vN; varying vec2 vUv;
        uniform sampler2D map, south, overlay; uniform vec3 sunDir; uniform float ovOn, ovOp, texel, hasMap, hasSouth, ovScale;
        const float PI=3.14159265;
        float lum(vec2 uv){ return texture2D(map,uv).r; }
        float slum(vec2 uv){ return texture2D(south,uv).r; }
        void main(){
          vec3 n=normalize(vN); float lat=asin(clamp(n.y,-1.0,1.0)); float lon=atan(-n.z,n.x);
          vec3 east=vec3(-sin(lon),0.0,-cos(lon)); vec3 north=vec3(-sin(lat)*cos(lon),cos(lat),sin(lat)*sin(lon));
          float g=0.5, gx=0.0, gy=0.0;
          if(hasMap>0.5){ g=lum(vUv); gx=lum(vUv+vec2(texel,0.0))-lum(vUv-vec2(texel,0.0)); gy=lum(vUv+vec2(0.0,texel))-lum(vUv-vec2(0.0,texel)); }
          float rho=(PI*0.5+lat)/(15.0*PI/180.0);
          float cap=hasSouth*smoothstep(-1.292,-1.396,lat);
          if(cap>0.0){ vec2 su=vec2(0.5+0.5*rho*sin(lon),0.5+0.5*rho*cos(lon)); float t2=1.0/1536.0;
            float s=slum(su)*1.3; float sx=slum(su+vec2(t2,0.0))-slum(su-vec2(t2,0.0)); float sy=slum(su+vec2(0.0,t2))-slum(su-vec2(0.0,t2));
            g=mix(g,s,cap); gx=mix(gx,sx*0.6,cap); gy=mix(gy,sy*0.6,cap); }
          vec3 nb=normalize(n-2.2*(gx*east+gy*north));
          float d=max(dot(nb,sunDir),0.0); float mu=max(dot(n,sunDir),0.0);
          float light=0.10+1.2*mix(d, d*2.0*mu/(mu+0.25+1e-3), 0.5);
          vec3 col=vec3(g)*light;
          if(ovOn>0.5){
            float la=lat*180.0/PI, lo=lon*180.0/PI;
            float gl=step(abs(mod(la+0.13,10.0)),0.26)+step(abs(mod(lo+0.13,10.0)),0.26);
            if(lat<-1.30){ vec2 ou=vec2(0.5+0.5*rho*ovScale*sin(lon),0.5+0.5*rho*ovScale*cos(lon)); vec4 o=texture2D(overlay,ou);
              col=mix(col,o.rgb*(0.62+0.45*clamp(d*1.4,0.0,1.0)),o.a*ovOp); }
            col=mix(col,vec3(0.9,0.93,0.92),min(gl,1.0)*0.16);
          }
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), mat);
    scene.add(moon);
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunDiscCanvas()), depthWrite: false, transparent: true }));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunGlowCanvas()), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    scene.add(sunGlow); scene.add(sunDisc);
    // 지구: 실제 자전 방향(극·본초자오선)으로 돌린 구. 태양 쪽만 밝고, 가장자리에 대기 빛
    const earthUni: Record<string, THREE.IUniform> = { day: { value: blank }, hasDay: { value: 0 }, sunE: { value: new THREE.Vector3(1, 0, 0) } };
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.ShaderMaterial({
      uniforms: earthUni,
      vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec2 vUv; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vP=w.xyz; vUv=uv; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `
        precision highp float; varying vec3 vN; varying vec3 vP; varying vec2 vUv;
        uniform sampler2D day; uniform float hasDay; uniform vec3 sunE;
        void main(){
          vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vP);
          float l=dot(n,sunE);
          vec3 base=hasDay>0.5?texture2D(day,vUv).rgb:vec3(0.16,0.33,0.52);
          float lit=smoothstep(-0.06,0.12,l);
          vec3 col=base*(0.05+1.15*max(l,0.0))*lit + base*0.012;
          float fr=pow(1.0-max(dot(n,v),0.0),2.6);
          col+=vec3(0.32,0.55,1.0)*fr*smoothstep(-0.25,0.35,l)*0.9;
          gl_FragColor=vec4(col,1.0);
        }`,
    }));
    earth.matrixAutoUpdate = false;
    scene.add(earth);
    new THREE.TextureLoader().load(EARTH_TEX_URL, (tx) => { earthUni.day.value = tx; earthUni.hasDay.value = 1; g.dirty = true; }, undefined, () => {});
    const earthCanvas = document.createElement('canvas'); earthCanvas.width = earthCanvas.height = 128;
    const earthTex = new THREE.CanvasTexture(earthCanvas);
    const earthSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: earthTex, depthWrite: false })); earthSpr.visible = false; scene.add(earthSpr);
    const pos0 = v3(-55, 0);
    const g: G = { renderer, scene, cam, moon, uni, sunDisc, sunGlow, earth, earthUni, ovTex: null, dist: 3.4, pos: pos0, up: northAt(pos0)!, earthSpr, earthCanvas, earthTex, ph: null, target: null, dirty: true, dE: COMPACT.earth, dS: COMPACT.sun, look: new THREE.Vector3(), lookT: new THREE.Vector3(), k: 0.14, onArrive: null };
    view.g = g;
    // 자전축 (북극–남극을 잇는 선): 화면이 기울어도 방향을 알 수 있게 항상 그린다 (팀 4f05f1e). 색은 차분한 흰색
    const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.32, 0), new THREE.Vector3(0, 1.32, 0)]);
    const axis = new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.45 }));
    scene.add(axis);

    let drag: { x: number; y: number } | null = null, moved = 0;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; c.setPointerCapture(e.pointerId); g.target = null; };
    // 화면 기준 회전 (트랙볼, 팀 4f05f1e): 가로로 끌면 화면 세로축, 세로로 끌면 화면 가로축을 중심으로 돈다. 극 위에서도 매끄럽다
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy); drag = { x: e.clientX, y: e.clientY };
      const k = Math.min(0.3, 0.25 * (g.dist - 1)) * D2R;
      const right = new THREE.Vector3().crossVectors(g.pos, g.up).negate().normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(g.up, -dx * k).multiply(new THREE.Quaternion().setFromAxisAngle(right, -dy * k));
      g.pos.applyQuaternion(q).normalize(); g.up.applyQuaternion(q); orthoUp(g);
      g.dirty = true;
    };
    const up = () => { drag = null; };
    const click = (e: MouseEvent) => {
      if (moved >= 5) return;
      const r = c.getBoundingClientRect(), m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(m, cam);
      const hitE = rc.intersectObject(view.flat ? earthSpr : earth)[0];
      const hit = rc.intersectObject(moon)[0];
      if (hitE && (!hit || hitE.distance < hit.distance)) return flyToEarth();
      if (!hit) return;
      const p = hit.point.clone().normalize(), lat = Math.asin(p.y) * R2D, lon = Math.atan2(-p.z, p.x) * R2D;
      const gr = useData.getState().grid, st = useApp.getState();
      if (lat < -75 && gr) {
        let best = -1, bd = 1e9;
        for (let i = 0; i < gr.cells.length; i += 1) { const d = greatCircleKm(lat, lon, gr.lat[i], gr.lon[i]); if (d < bd) { bd = d; best = i; } }
        if (bd < 25) return st.setSite({ kind: 'cell', cell: best });
      }
      st.setSite({ kind: 'custom', lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); g.dist = clamp(g.dist * (e.deltaY > 0 ? 1.12 : 0.89), 1.08, maxDist()); g.target = null; g.dirty = true; };
    const dbl = () => { const st = useApp.getState(); st.setFullscreen(!st.fullscreen); };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('click', click); c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('dblclick', dbl);
    const ro = new ResizeObserver(() => { const w = vw.clientWidth, h = vw.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); g.dirty = true; });
    ro.observe(vw);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (g.target) {
        // 방향은 대원을 따라(벡터 slerp) 옮긴다. 위경도를 따로 보간하면 극 근처에서 빙글 돌고 가운데에 안 맞는다
        // 목표 지점으로 갈 때는 화면 위쪽도 서서히 북쪽으로 되돌린다
        const T = g.target, a = g.pos, b = v3(T.lat, T.lon);
        const ang = a.angleTo(b);
        if (ang > 1e-4) {
          const step = ang < 0.002 ? ang : ang * g.k;
          const ax = new THREE.Vector3().crossVectors(a, b);
          if (ax.lengthSq() < 1e-12) ax.copy(g.up); // 정반대 방향
          const q = new THREE.Quaternion().setFromAxisAngle(ax.normalize(), step);
          a.applyQuaternion(q).normalize(); g.up.applyQuaternion(q);
        }
        const nb = northAt(g.pos);
        if (nb) g.up.lerp(nb, g.k);
        orthoUp(g);
        g.dist += (T.dist - g.dist) * g.k;
        if (a.angleTo(b) < 0.0005 && Math.abs(T.dist - g.dist) < 0.002 && (!nb || g.up.angleTo(nb) < 0.002)) { g.pos.copy(b); if (nb) g.up.copy(nb); orthoUp(g); g.dist = T.dist; g.target = null; }
        g.dirty = true;
      }
      if (g.look.distanceTo(g.lookT) > 1e-4) { g.look.lerp(g.lookT, g.k); if (g.look.distanceTo(g.lookT) < 1e-3 * Math.max(1, g.lookT.length())) g.look.copy(g.lookT); g.dirty = true; }
      if (g.onArrive) {
        // 지구가 화면 가운데에 거의 왔으면 도착으로 본다 (남은 아주 작은 이동을 기다리지 않는다)
        const T = g.target, near = g.look.distanceTo(g.lookT) < 0.02 * Math.max(1, g.lookT.length());
        const camOk = !T || (g.pos.angleTo(v3(T.lat, T.lon)) < 0.02 && Math.abs(T.dist - g.dist) < 0.04 * T.dist);
        if (near && camOk) { const f = g.onArrive; g.onArrive = null; g.k = 0.14; f(); }
      }
      if (playClock.playing) g.dirty = true; // 재생 중에는 매 프레임 그린다
      if (!g.dirty) return;
      g.dirty = false;
      cam.position.copy(g.pos).multiplyScalar(g.dist).add(g.look);
      cam.up.copy(g.up);
      cam.lookAt(g.look);
      const L = live.current, T0 = playClock.playing ? playClock.t : L.t, b = L.eph.bodyVectors(T0), sd = meToThree(b.sun), ed = meToThree(b.earth);
      (uni.sunDir.value as THREE.Vector3).copy(sd);
      const kmE = Math.hypot(...b.earth), kmS = Math.hypot(...b.sun);
      const dE = view.real ? kmE / R_MOON_KM : COMPACT.earth, rE = view.real ? R_EARTH_KM / R_MOON_KM : COMPACT.earth * (R_EARTH_KM / kmE);
      const dS = view.real ? SUN_FAR : COMPACT.sun, rS = dS * (R_SUN_KM / kmS);
      g.dE = dE; g.dS = dS;
      sunDisc.position.copy(sd).multiplyScalar(dS); sunDisc.scale.set(2 * rS, 2 * rS, 1);
      sunGlow.position.copy(sd).multiplyScalar(dS * 1.0001); sunGlow.scale.set(2 * rS * 9, 2 * rS * 9, 1);
      // 지구 자전: 극 = J2000 z축, 본초자오선 = 그리니치 평균 항성시(GMST) 방향을 달 고정 좌표로 옮김
      { const jd = T0 / 86400000 + 2440587.5, gm = (280.46061837 + 360.98564736629 * (jd - 2451545)) * D2R;
        const P = meRaw(j2000ToMoonFixed(T0, [0, 0, 1])).normalize(), M = meRaw(j2000ToMoonFixed(T0, [Math.cos(gm), Math.sin(gm), 0]));
        M.sub(P.clone().multiplyScalar(M.dot(P))).normalize();
        const E = new THREE.Vector3().crossVectors(P, M);
        earth.matrix.makeBasis(M.multiplyScalar(rE), P.multiplyScalar(rE), E.multiplyScalar(-rE)).setPosition(ed.clone().multiplyScalar(dE));
        earth.matrixWorldNeedsUpdate = true;
        // 지구 보기: 3D(실제 자전·명암) 또는 평면 위상 그림
        earth.visible = !view.flat; earthSpr.visible = view.flat;
        if (view.flat) {
          earthSpr.position.copy(ed).multiplyScalar(dE); const sc = Math.max(2 * rE * (128 / 88), 3.4 * (dE / 26)); earthSpr.scale.set(sc, sc, 1);
          const ph = (1 - sd.dot(ed)) / 2;
          if (g.ph == null || Math.abs(g.ph - ph) > 0.01) { g.ph = ph; drawEarthSprite(earthCanvas, ph); earthTex.needsUpdate = true; }
        }
        const sunFromEarth = meRaw(b.sun).sub(meRaw(b.earth)).normalize();
        (earthUni.sunE.value as THREE.Vector3).copy(sunFromEarth); }
      renderer.render(scene, cam);
      placeOverlay(sd, ed);
    };
    const placeOverlay = (sd: THREE.Vector3, ed: THREE.Vector3) => {
      const o = ovl.current;
      if (!o) return;
      const W = vw.clientWidth, H = vw.clientHeight, camDir = cam.position.clone().normalize();
      const proj = (p: THREE.Vector3) => { const v = p.clone().project(cam); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, z: v.z }; };
      const L = live.current;
      type It = { cls: string; lat: number; lon: number; l?: string; d?: string | number; act?: string };
      const items: It[] = [];
      if (L.rs) items.push({ cls: 'sel', lat: L.rs.site.lat_deg, lon: L.rs.site.lon_deg, l: L.rs.site.name });
      (L.res?.top ?? []).slice(0, 10).forEach((cc, i) => items.push({ cls: 'rank', lat: cc.lat_deg, lon: cc.lon_deg, d: i + 1, act: `cell:${cc.cell}` }));
      // 과거 착륙 지점(아폴로·CLPS·다른 나라)은 멀리서도 보이고, 남극 밖은 서로 떨어져 있어 이름도 붙인다
      const PAST = new Set(['apollo', 'clps', 'international']);
      L.sites.forEach((x) => {
        const past = PAST.has(x.category) && x.lat_deg > -75;
        const lab = past ? (g.dist < 4.5 ? x.name : '') : g.dist < 2.0 ? x.name : '';
        items.push({ cls: x.category === 'artemis' ? `artemis ${L.vint.get(x.id)?.year === 2022 ? 'old' : L.vint.get(x.id)?.year === 2024 ? 'y24' : ''}` : past ? 'site past' : 'site', lat: x.lat_deg, lon: x.lon_deg, l: lab, act: `site:${x.id}` });
      });
      L.bases.forEach((bb, i) => items.push({ cls: 'base', lat: bb.lat_deg, lon: bb.lon_deg, d: i + 1 }));
      if (g.dist < 2.6) L.regions.forEach((r) => { const ring = r.rings[0]; const la = ring.reduce((a, p) => a + p[1], 0) / ring.length, lo = ring.reduce((a, p) => a + p[0], 0) / ring.length; items.push({ cls: 'region', lat: la, lon: lo, l: g.dist < 2.0 ? r.name : r.code }); });
      // 화면에서 달이 작아지면(멀리서 볼 때) 표지가 달을 덮으므로 숨긴다. 기준은 화면 위 달 반지름(px)
      const cd = cam.position.length(), moonPx = (H / 2) / Math.tan((cam.fov / 2) * D2R) / Math.sqrt(Math.max(1e-6, cd * cd - 1));
      const far = moonPx < 70;
      // 멀리서 볼 때는 자전축 선도 숨긴다 (다음 화면부터 반영)
      if (axis.visible === far) { axis.visible = !far; g.dirty = true; }
      vw.closest('.moon')?.classList.toggle('far', far); // 멀리서 볼 때는 위쪽 단추 줄만 남긴다 (CSS)
      let html = '';
      for (const it of items) {
        if (far) break;
        if (moonPx < 160 && it.cls !== 'sel') continue;
        const p3 = v3(it.lat, it.lon, 1.002);
        if (p3.clone().normalize().dot(camDir) < 0.12) continue;
        const p = proj(p3);
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
        html += `<div class="mk ${it.cls}" style="transform:translate(${p.x.toFixed(1)}px,${(p.y - 10).toFixed(1)}px)" ${it.act ? `data-act="${it.act}"` : ''} title="${esc(it.l || '')}"><span class="d">${it.d ?? ''}</span>${it.l ? `<span class="l">${esc(it.l)}</span>` : ''}</div>`;
      }
      const placed: Array<{ x: number; y: number }> = [];
      const emit = (cls: string, x: number, y: number, inner: string) => {
        x = clamp(x, 6, W - 150); y = clamp(y, 44, H - 60);
        for (const q of placed) if (Math.abs(q.x - x) < 150 && Math.abs(q.y - y) < 26) y = q.y + 28 > H - 60 ? q.y - 28 : q.y + 28;
        placed.push({ x, y });
        const act = cls.includes(' act') ? ' data-act="earth" title="지구로 가서 지상국 통신 창 보기"' : '';
        html += `<div class="chipb ${cls.replace(' act', '')}${act ? ' go' : ''}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)"${act}>${inner}</div>`;
      };
      const now = L.ctx ? skyState(L.ctx.frame, L.ctx.mask, L.ctx.eph, playClock.playing ? playClock.t : L.t, L.ctx.margin_deg) : null;
      const body = (dir: THREE.Vector3, dist: number, cls: string, name: string, el: string) => {
        const p = proj(dir.clone().multiplyScalar(dist));
        const inside = p.z < 1 && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 30;
        if (inside) return emit(cls, p.x + 14, p.y - 10, `${name} <em>${el}</em>`);
        let dx = p.x - W / 2, dy = p.y - H / 2;
        if (p.z > 1) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx), Lb = 70, R = W - 90, T = 48, B = H - 64, cx = W / 2, cy = (T + B) / 2;
        const sx = Math.abs(Math.cos(a)) > 1e-6 ? (Math.cos(a) > 0 ? R - cx : cx - Lb) / Math.abs(Math.cos(a)) : 1e9;
        const sy = Math.abs(Math.sin(a)) > 1e-6 ? (Math.sin(a) > 0 ? B - cy : cy - T) / Math.abs(Math.sin(a)) : 1e9, tt = Math.min(sx, sy);
        emit(cls, cx + Math.cos(a) * tt - 40, cy + Math.sin(a) * tt - 10, `<span class="ar" style="transform:rotate(${(a * R2D + 90).toFixed(0)}deg)"></span>${name} <em>${el}</em>`);
      };
      if (!far) body(sd, g.dS, 'sun', '☀ 태양', now ? `고도 ${now.sun.el_deg.toFixed(1)}°` : '');
      // 자전축 끝 표시 (N·S)
      if (!far) for (const [y, lb] of [[1.36, 'N'], [-1.36, 'S']] as Array<[number, string]>) {
        const p = proj(new THREE.Vector3(0, y, 0));
        if (p.z < 1 && p.x > 0 && p.x < W && p.y > 0 && p.y < H) html += `<div class="axl" style="transform:translate(${(p.x - 7).toFixed(0)}px,${(p.y - 9).toFixed(0)}px)">${lb}</div>`;
      }
      if (!far) body(ed, g.dE, 'earth act', '◉ 지구', now ? `고도 ${now.earth.el_deg.toFixed(1)}°` : '');
      o.innerHTML = html;
    };
    loop();
    const tm = window.setTimeout(() => setLoading(null), 6000);
    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(tm); ro.disconnect();
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up);
      c.removeEventListener('click', click); c.removeEventListener('wheel', wheel); c.removeEventListener('dblclick', dbl);
      axisGeo.dispose(); earthTex.dispose(); renderer.dispose(); view.g = null; vw.closest(".moon")?.classList.remove("far");
    };
  }, []);

  // ── 표면 텍스처 (2k → 8k), 남극 모자이크 ──
  useEffect(() => {
    const g = view.g;
    if (!g || !tex) return;
    const loader = new THREE.TextureLoader();
    const t2 = (tex as Record<string, { file: string } | undefined>).globe_2k, t8 = (tex as Record<string, { file: string } | undefined>).globe_8k;
    const setMap = (tt: THREE.Texture, px: number) => { tt.anisotropy = 4; tt.wrapS = THREE.RepeatWrapping; g.uni.map.value = tt; g.uni.texel.value = 1 / px; g.uni.hasMap.value = 1; setLoading(null); onSub?.(null); g.dirty = true; };
    if (t2) loader.load(textureUrl(t2.file), (tt) => { setMap(tt, 2048); if (t8) loader.load(textureUrl(t8.file), (tt8) => setMap(tt8, 8192)); }, undefined, () => { setLoading(null); onSub?.('표면 텍스처 자료 없음 (남극 모자이크만 표시)'); });
    else { setLoading(null); onSub?.('표면 텍스처 자료 없음 (남극 모자이크만 표시)'); }
    const sw = tex.wac ?? tex.hillshade;
    if (sw) loader.load(textureUrl(sw.file), (tt) => { tt.minFilter = THREE.LinearFilter; tt.generateMipmaps = false; g.uni.south.value = tt; g.uni.hasSouth.value = 1; g.dirty = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex]);

  // ── 지도 색 (남극 격자) ──
  const ovCanvas = useMemo(() => {
    if (!grid || !nl.v) return null;
    const { nx, ny } = grid.manifest;
    const c = document.createElement('canvas'); c.width = nx; c.height = ny;
    const x = c.getContext('2d')!, im = x.createImageData(nx, ny);
    for (let i = 0; i < grid.cells.length; i++) {
      const v = nl.v[i];
      if (!Number.isFinite(v)) continue;
      let a = 1;
      if (nl.pass && !nl.pass[i]) a = app.failMode === 'hide' ? 0 : app.failMode === 'dim' ? 0.32 : 1;
      const [r, gg, b] = rampRGB(v);
      im.data.set([r, gg, b, a * 255], grid.cells[i] * 4);
    }
    x.putImageData(im, 0, 0);
    return c;
  }, [grid, nl, app.failMode]);
  useEffect(() => {
    const g = view.g;
    if (!g) return;
    g.ovTex?.dispose();
    if (ovCanvas && grid) {
      const t = new THREE.CanvasTexture(ovCanvas);
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      g.ovTex = t; g.uni.overlay.value = t;
      g.uni.ovScale.value = RAD15 / ((grid.manifest.nx * grid.manifest.cell_km) / 2);
    } else { g.ovTex = null; g.uni.overlay.value = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); (g.uni.overlay.value as THREE.DataTexture).needsUpdate = true; }
    g.dirty = true;
  }, [ovCanvas, grid]);
  useEffect(() => { const g = view.g; if (!g) return; g.uni.ovOn.value = app.colorOn ? 1 : 0; g.uni.ovOp.value = app.opacity; g.dirty = true; }, [app.colorOn, app.opacity]);
  useEffect(() => { if (view.g) view.g.dirty = true; }, [app.t, res, sites, regions, rs, bases, eph]);

  // ── 아르테미스 III 후보 지역 경계 (USGS 2024) ──
  useEffect(() => {
    const g = view.g;
    if (!g || !regions.length) return;
    const grp = new THREE.Group();
    const mat = new THREE.LineDashedMaterial({ color: 0x8fd6c9, dashSize: 0.004, gapSize: 0.003, transparent: true, opacity: 0.95, depthTest: true });
    for (const r of regions) for (const ring of r.rings) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < ring.length - 1; k++) {
        const [lo0, la0] = ring[k], [lo1, la1] = ring[k + 1];
        for (let s = 0; s < 8; s++) { const f = s / 8; pts.push(v3(la0 + (la1 - la0) * f, lo0 + wrap180(lo1 - lo0) * f, 1.0015)); }
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineLoop(geo, mat);
      line.computeLineDistances();
      grp.add(line);
    }
    g.scene.add(grp);
    g.dirty = true;
    return () => { g.scene.remove(grp); grp.children.forEach((c) => (c as THREE.Line).geometry.dispose()); mat.dispose(); };
  }, [regions]);

  // ── 착륙지가 바뀌면 그쪽으로 ──
  const siteId = rs ? `${rs.site.id}|${rs.site.lat_deg}|${rs.site.lon_deg}` : '';
  useEffect(() => {
    const g = view.g;
    if (!g || !rs) return;
    // 고른 지점이 화면 한가운데 오도록 카메라를 그 지점 바로 위에 둔다 (극지는 조금 더 가까이)
    const s = rs.site, polar = Math.abs(s.lat_deg) > 75;
    g.target = { lat: s.lat_deg, lon: s.lon_deg, dist: polar ? 2.3 : 3.0 };
    g.dirty = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const l = LAYER_UI[app.mapLayer] ?? LAYER_UI.composite;
  const [real, setReal] = useState(view.real);
  const [flat, setFlat] = useState(view.flat);
  return (
    <div className="view" ref={viewEl}>
      <canvas id="gl" ref={cvs} />
      <div
        className="ovl"
        ref={ovl}
        onClick={(e) => {
          const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
          if (!t) return;
          const [k, v] = (t.dataset.act ?? '').split(':');
          if (k === 'earth') flyToEarth();
          else if (k === 'cell') app.setSite({ kind: 'cell', cell: Number(v) });
          else if (k === 'site') app.setSite({ kind: 'catalog', id: v });
        }}
      />
      <div className="vtools">
        {tools}
        <button onClick={() => globeView('pole')}>남극</button>
        <button onClick={() => globeView('sun')}>태양 쪽</button>
        <button onClick={() => globeView('globe')}>전체</button>
        <button title="화면 위쪽을 북쪽으로 되돌립니다" onClick={() => globeView('north')}>북 ↑</button>
        <button onClick={() => globeView('earth')}>지구까지</button>
        <button aria-pressed={flat} title="지구를 3D(실제 자전·명암) 또는 평면 위상 그림으로" onClick={() => { view.flat = !flat; setFlat(!flat); if (view.g) view.g.dirty = true; }}>{flat ? '지구 평면' : '지구 3D'}</button>
        <button aria-pressed={real} title="실제 거리·크기로 보기 (달 반지름 = 1)" onClick={() => { globeReal(!real); setReal(!real); }}>실제 거리</button>
        <button aria-label="확대" onClick={() => globeView('in')}>+</button>
        <button aria-label="축소" onClick={() => globeView('out')}>−</button>
      </div>
      <div className="vleg">
        {app.colorOn ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{l.name}{app.mapLayer === 'composite' && app.failMode !== 'show' ? <span className="muted" style={{ fontWeight: 400 }}> · 미달 {app.failMode === 'dim' ? '흐리게' : '숨김'}</span> : null}</div>
            <div className="ramp" style={{ width: 150 }} />
            <div className="ramp-t" style={{ width: 150 }}><span>{l.lo}</span><span>{l.hi}</span></div>
            <div className="muted" style={{ marginTop: 3 }}>{grid ? `75°S 이남 ${grid.manifest.cell_km} km 격자${gridApprox ? ' · 근사, 지형 미반영' : ''}` : '격자 자료 없음'}</div>
          </>
        ) : <span className="muted">지도 색 꺼짐 (C)</span>}
      </div>
      <div className="scale-note">{real ? '실제 거리·크기 · 지구 약 221 달 반지름 · 태양은 실제 각크기로 표시' : '태양·지구 크기는 달에서 보이는 실제 각크기 · 거리만 줄임'}</div>
      {children}
      {loading ? <div className="loading">{loading}</div> : null}
    </div>
  );
}
