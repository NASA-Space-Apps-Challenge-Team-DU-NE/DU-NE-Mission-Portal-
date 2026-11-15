// 지구 3D: 지상국 위치 고르기 (UI 예시 initEarthGlobe). 클릭 = 그 자리에 지상국이 있다고 가정하고 계산.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { moonEcef } from '../core/stations';
import type { Station } from '../core/types';
import { useApp } from '../state/store';
import { toast } from './kit';

const D2R = Math.PI / 180, R2D = 180 / Math.PI, DAY = 86_400_000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap180 = (x: number) => ((x + 540) % 360) - 180;
const v3 = (lat: number, lon: number, r = 1) => { const c = Math.cos(lat * D2R); return new THREE.Vector3(r * c * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * c * Math.sin(lon * D2R)); };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
export const moonSub = (t: number) => { const m = moonEcef(t), n = Math.hypot(m[0], m[1], m[2]); return { lat: Math.asin(m[2] / n) * R2D, lon: Math.atan2(m[1], m[0]) * R2D }; };
const TEX = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/';
const EARTH_TEX_URL = `${TEX}earth_atmos_2048.jpg`; // 낮 (NASA Blue Marble 기반)
const EARTH_LIGHTS_URL = `${TEX}earth_lights_2048.png`; // 밤 도시 불빛
const EARTH_SPEC_URL = `${TEX}earth_specular_2048.jpg`; // 바다 반사 (바다 = 밝음)

const EGV = { lat: 30, lon: 127, dist: 3.1, target: null as null | { lat: number; lon: number; dist: number }, dirty: true };
export function earthView(v: 'korea' | 'moon' | 'all') {
  if (v === 'korea') EGV.target = { lat: 36, lon: 127.5, dist: 2.2 };
  else if (v === 'moon') { const m = moonSub(useApp.getState().t); EGV.target = { lat: m.lat, lon: m.lon, dist: 3.1 }; }
  else EGV.target = { lat: 20, lon: EGV.lon, dist: 3.4 };
  EGV.dirty = true;
}

let cstN = 0;
export function EarthGlobe({ stations }: { stations: Array<Station & { custom?: boolean; short?: string }> }) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const ovl = useRef<HTMLDivElement>(null);
  const live = useRef({ stations, t: useApp.getState().t });
  const t = useApp((s) => s.t);
  live.current = { stations, t };
  useEffect(() => { EGV.dirty = true; }, [stations, t]);

  useEffect(() => {
    const c = cvs.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    // 지구 표면: 실제 시각의 태양 방향으로 낮·밤을 나누고, 밤에는 도시 불빛, 바다에는 햇빛 반사, 가장자리에 대기 빛.
    // 지상국을 고르는 화면이라 밤쪽도 지형이 보이게 아주 어둡게 하지는 않는다.
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
    const uni: Record<string, THREE.IUniform> = {
      day: { value: blank }, hasDay: { value: 0 }, lights: { value: blank }, spec: { value: blank }, hasSpec: { value: 0 },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec2 vUv; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vP=w.xyz; vUv=uv; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `
        precision highp float; varying vec3 vN; varying vec3 vP; varying vec2 vUv;
        uniform sampler2D day; uniform sampler2D lights; uniform sampler2D spec; uniform float hasDay; uniform float hasSpec; uniform vec3 sunDir;
        void main(){
          vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vP); vec3 s=normalize(sunDir);
          float l=dot(n,s);
          vec3 base=hasDay>0.5?texture2D(day,vUv).rgb:vec3(0.12,0.26,0.42);
          float lum=dot(base,vec3(0.299,0.587,0.114));
          base=clamp(mix(vec3(lum),base,1.18),0.0,1.0);               // 색을 조금 살린다 (흐릿한 느낌 줄이기)
          base=pow(base,vec3(1.08));                                  // 대비
          float dayF=smoothstep(-0.12,0.22,l);                        // 부드러운 명암 경계
          vec3 dayCol=base*(0.38+0.85*max(l,0.0));
          vec3 nightCol=base*vec3(0.26,0.30,0.40)+texture2D(lights,vUv).rgb*vec3(1.0,0.78,0.48)*0.85;
          vec3 col=mix(nightCol,dayCol,dayF);
          float water=hasSpec>0.5?texture2D(spec,vUv).r:0.0;
          vec3 h=normalize(s+v);
          col+=vec3(1.0,0.95,0.85)*water*pow(max(dot(n,h),0.0),300.0)*0.2*dayF;   // 바다 햇빛 반사
          float fr=pow(1.0-max(dot(n,v),0.0),3.0);
          col+=vec3(0.30,0.55,1.0)*fr*(0.18+0.55*smoothstep(-0.3,0.4,l)); // 대기 가장자리
          gl_FragColor=vec4(col,1.0);
        }`,
    });
    const load = new THREE.TextureLoader();
    load.load(EARTH_TEX_URL, (tx) => { tx.anisotropy = 4; uni.day.value = tx; uni.hasDay.value = 1; EGV.dirty = true; }, undefined, () => { EGV.dirty = true; });
    load.load(EARTH_LIGHTS_URL, (tx) => { uni.lights.value = tx; EGV.dirty = true; }, undefined, () => {});
    load.load(EARTH_SPEC_URL, (tx) => { uni.spec.value = tx; uni.hasSpec.value = 1; EGV.dirty = true; }, undefined, () => {});
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), mat);
    scene.add(earth);
    // 대기 빛 띠: 지구보다 조금 큰 구의 뒷면만 그려 가장자리 바깥으로 번지게
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 48), new THREE.ShaderMaterial({
      uniforms: { sunDir: uni.sunDir },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `precision highp float; varying vec3 vN; varying vec3 vP; uniform vec3 sunDir;
        void main(){ vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vP);
          float k=pow(max(0.0,0.72+dot(n,v)),4.0); float lit=0.35+0.65*smoothstep(-0.4,0.5,dot(n,normalize(sunDir)));
          gl_FragColor=vec4(vec3(0.32,0.58,1.0)*k*lit*0.9,1.0); }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    scene.add(halo);
    const gp: THREE.Vector3[] = [];
    for (let la = -80; la <= 80; la += 20) for (let lo = -180; lo < 180; lo += 4) gp.push(v3(la, lo, 1.002), v3(la, lo + 4, 1.002));
    for (let lo = -180; lo < 180; lo += 30) for (let la = -88; la < 88; la += 4) gp.push(v3(la, lo, 1.002), v3(la + 4, lo, 1.002));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 })));
    const ro = new ResizeObserver(() => { const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); EGV.dirty = true; });
    ro.observe(c);
    let drag: { x: number; y: number } | null = null, moved = 0;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; c.setPointerCapture(e.pointerId); EGV.target = null; };
    const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy); drag = { x: e.clientX, y: e.clientY }; const k = 0.25 * (EGV.dist - 1); EGV.lon -= dx * k; EGV.lat = clamp(EGV.lat + dy * k, -85, 85); EGV.dirty = true; };
    const up = () => { drag = null; };
    const click = (e: MouseEvent) => {
      if (moved >= 5) return;
      const r = c.getBoundingClientRect(), m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(m, cam);
      const hit = rc.intersectObject(earth)[0];
      if (!hit) return;
      const p = hit.point.clone().normalize(), lat = Math.asin(p.y) * R2D, lon = Math.atan2(-p.z, p.x) * R2D;
      const n = ++cstN;
      useApp.getState().addStation({ id: `cst${n}_${Date.now().toString(36)}`, name: `가정 지상국 ${n}`, network: 'other', lat_deg: +lat.toFixed(3), lon_deg: +lon.toFixed(3), height_m: 0, antennas: [], min_elev_deg: 10, source_keys: [], verified: false });
      toast(`가정 지상국 ${n} 추가 (${lat.toFixed(1)}°, ${lon.toFixed(1)}°)`);
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); EGV.dist = clamp(EGV.dist * (e.deltaY > 0 ? 1.12 : 0.89), 1.3, 6); EGV.dirty = true; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('click', click); c.addEventListener('wheel', wheel, { passive: false });
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (EGV.target) { const T = EGV.target, dl = wrap180(T.lon - EGV.lon); EGV.lat += (T.lat - EGV.lat) * 0.12; EGV.lon += dl * 0.12; EGV.dist += (T.dist - EGV.dist) * 0.12; if (Math.abs(T.lat - EGV.lat) < 0.05 && Math.abs(dl) < 0.05) EGV.target = null; EGV.dirty = true; }
      if (!EGV.dirty) return;
      EGV.dirty = false;
      cam.position.copy(v3(EGV.lat, EGV.lon, EGV.dist)); cam.lookAt(0, 0, 0);
      const tt = live.current.t, d = new Date(tt), doy = (tt - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY, h0 = d.getUTCHours() + d.getUTCMinutes() / 60;
      (uni.sunDir.value as THREE.Vector3).copy(v3(23.44 * Math.sin((2 * Math.PI * (doy - 80)) / 365.25), -(h0 - 12) * 15, 1)); // 태양 직하점 근사 (조명 표현용)
      renderer.render(scene, cam);
      const o = ovl.current;
      if (!o) return;
      const W = c.clientWidth, H = c.clientHeight, camDir = cam.position.clone().normalize();
      const put = (lat: number, lon: number, cls: string, label: string) => { const p3 = v3(lat, lon, 1.003); if (p3.clone().normalize().dot(camDir) < 0.1) return ''; const v = p3.project(cam); const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H; return `<div class="mk ${cls}" style="transform:translate(${x.toFixed(1)}px,${(y - 9).toFixed(1)}px)"><span class="d"></span><span class="l">${esc(label)}</span></div>`; };
      let html = '';
      for (const st of live.current.stations) html += put(st.lat_deg, st.lon_deg, st.custom ? 'est custom' : 'est', st.short ?? st.name);
      const ms = moonSub(tt);
      html += put(ms.lat, ms.lon, 'emoon', '☾ 달 바로 아래');
      o.innerHTML = html;
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('click', click); c.removeEventListener('wheel', wheel);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="egwrap">
      <canvas ref={cvs} />
      <div className="ovl" ref={ovl} />
      <div className="hint">드래그 회전 · 휠 확대 · <b>클릭 = 지상국 추가</b></div>
      <div className="vtools"><button onClick={() => earthView('korea')}>대한민국</button><button onClick={() => earthView('moon')}>달 쪽</button><button onClick={() => earthView('all')}>전체</button></div>
      <div className="vleg"><span style={{ color: 'var(--earth)' }}>■</span> 카탈로그 지상국 · <span style={{ color: 'var(--amber)' }}>■</span> 가정 지상국 · <span style={{ color: '#F2E6B0' }}>☾</span> 달 바로 아래</div>
    </div>
  );
}
