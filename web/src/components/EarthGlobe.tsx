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
const EARTH_TEX_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg';

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
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8 });
    new THREE.TextureLoader().load(EARTH_TEX_URL, (tx) => { mat.map = tx; mat.needsUpdate = true; EGV.dirty = true; }, undefined, () => { mat.color.set(0x2f6d8f); mat.needsUpdate = true; EGV.dirty = true; });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), mat);
    scene.add(earth);
    const gp: THREE.Vector3[] = [];
    for (let la = -80; la <= 80; la += 20) for (let lo = -180; lo < 180; lo += 4) gp.push(v3(la, lo, 1.002), v3(la, lo + 4, 1.002));
    for (let lo = -180; lo < 180; lo += 30) for (let la = -88; la < 88; la += 4) gp.push(v3(la, lo, 1.002), v3(la + 4, lo, 1.002));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })));
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    scene.add(sun);
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
      sun.position.copy(v3(23.44 * Math.sin((2 * Math.PI * (doy - 80)) / 365.25), -(h0 - 12) * 15, 10)); // 태양 직하점 근사 (조명 표현용)
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
      <div className="vtools"><button onClick={() => earthView('korea')}>한국</button><button onClick={() => earthView('moon')}>달 쪽</button><button onClick={() => earthView('all')}>전체</button></div>
      <div className="vleg"><span style={{ color: 'var(--earth)' }}>■</span> 카탈로그 지상국 · <span style={{ color: 'var(--amber)' }}>■</span> 가정 지상국 · <span style={{ color: '#F2E6B0' }}>☾</span> 달 바로 아래</div>
    </div>
  );
}
