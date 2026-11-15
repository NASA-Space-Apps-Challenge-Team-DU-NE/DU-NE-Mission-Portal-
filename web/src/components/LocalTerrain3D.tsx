// 03 기지 배치 · 3D 지형 보기: 파이프라인 s75 의 실제 LOLA 30 m 고도(약 39 m/화소)로 만든 기복 + 음영기복 그림.
// 합성 기복은 쓰지 않는다. 고도 자료가 없는 지점(격자 칸·직접 입력 좌표)에서는 이 보기를 쓰지 않는다.
// 틀은 2D 지도(LocalMap)와 같다: 착륙지 중심 방위 등거리, 위 = 북, 오른쪽 = 동.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { localUrl, type LocalSiteTex, type LocalTerrain } from '../adapters/data';
import type { BaseElement } from '../core/hazards';
import { destinationLL, localEN } from './LocalMap';

const R2D = 180 / Math.PI;
const elevCache = new Map<string, { n: number; h: Float32Array }>();

/** R·G 두 바이트에 담긴 고도(최저 기준, step m 단위)를 읽는다 */
function useElev(info: LocalSiteTex | undefined): { n: number; h: Float32Array } | null {
  const [, bump] = useState(0);
  const f = info?.elev_file;
  useEffect(() => {
    if (!info || !f || elevCache.has(f)) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, h = new Float32Array(c.width * c.height);
      const step = info.elev_step_m ?? 0.1, off = info.elev_offset_m ?? 0;
      for (let i = 0; i < h.length; i++) h[i] = off + (d[i * 4] * 256 + d[i * 4 + 1]) * step;
      elevCache.set(f, { n: c.width, h }); bump((v) => v + 1);
    };
    im.src = localUrl(f);
  }, [info, f]);
  return f ? elevCache.get(f) ?? null : null;
}

export function LocalTerrain3D(p: {
  lat: number; lon: number; sizeM: number; bases: BaseElement[]; meta: LocalTerrain; info: LocalSiteTex; img: HTMLImageElement;
  exag: number; disabled?: boolean; onPick(lat: number, lon: number): void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const elev = useElev(p.info);
  const st = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; mesh: THREE.Mesh | null; marks: THREE.Group; az: number; el: number; dist: number; draw(): void } | null>(null);

  // 장면 (한 번)
  useEffect(() => {
    const c = cvs.current!, w = wrap.current!;
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ canvas: c, antialias: true }); } catch { return; }
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1215);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-1, 1.2, -1); scene.add(sun); // 보기용 조명 (북서), 실제 햇빛 아님
    const marks = new THREE.Group(); scene.add(marks);
    const s = { r, scene, cam, mesh: null as THREE.Mesh | null, marks, az: -0.6, el: 0.75, dist: 1.6, draw: () => {} };
    s.draw = () => {
      const W = w.clientWidth, H = w.clientHeight; if (!W || !H) return;
      r.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
      cam.position.set(s.dist * Math.cos(s.el) * Math.sin(s.az), s.dist * Math.sin(s.el), s.dist * Math.cos(s.el) * Math.cos(s.az));
      cam.lookAt(0, 0, 0); r.render(scene, cam);
    };
    st.current = s;
    let drag: { x: number; y: number } | null = null, moved = 0;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy); drag = { x: e.clientX, y: e.clientY }; s.az -= dx * 0.008; s.el = Math.max(0.15, Math.min(1.5, s.el + dy * 0.006)); s.draw(); };
    const up = () => { drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); s.dist = Math.max(0.6, Math.min(4, s.dist * (e.deltaY > 0 ? 1.1 : 0.9))); s.draw(); };
    const click = (e: MouseEvent) => {
      if (moved >= 5 || !s.mesh || pick.current.disabled) return;
      const b = c.getBoundingClientRect(), m = new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(m, cam);
      const hit = rc.intersectObject(s.mesh)[0]; if (!hit) return;
      const half = pick.current.sizeM / 2000, ee = hit.point.x * 2 * half, nn = -hit.point.z * 2 * half;
      const [la, lo] = destinationLL(pick.current.lat, pick.current.lon, Math.atan2(ee, nn) * R2D, Math.hypot(ee, nn));
      pick.current.onPick(+la.toFixed(5), +lo.toFixed(5));
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('click', click);
    const ro = new ResizeObserver(() => s.draw()); ro.observe(w);
    return () => {
      ro.disconnect();
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up);
      c.removeEventListener('wheel', wheel); c.removeEventListener('click', click);
      r.dispose(); st.current = null;
    };
  }, []);
  const pick = useRef(p); pick.current = p;

  // 지형 메시: 보이는 정사각형만큼 고도를 잘라 표본, 음영기복을 덮는다
  useEffect(() => {
    const s = st.current;
    if (!s || !elev) return;
    const halfKm = p.meta.half_km, frac = Math.min(1, p.sizeM / 1000 / (2 * halfKm));
    const srcPx = frac * elev.n, seg = Math.max(16, Math.min(256, Math.round(srcPx)));
    const geo = new THREE.PlaneGeometry(1, 1, seg, seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const sample = (u: number, v: number) => {
      // u: 0(서)→1(동), v: 0(북)→1(남) 를 고도 그림 화소로
      const x = Math.max(0, Math.min(elev.n - 1.001, elev.n / 2 - srcPx / 2 + u * srcPx - 0.5));
      const y = Math.max(0, Math.min(elev.n - 1.001, elev.n / 2 - srcPx / 2 + v * srcPx - 0.5));
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, n = elev.n, h = elev.h;
      return h[y0 * n + x0] * (1 - fx) * (1 - fy) + h[y0 * n + x0 + 1] * fx * (1 - fy) + h[(y0 + 1) * n + x0] * (1 - fx) * fy + h[(y0 + 1) * n + x0 + 1] * fx * fy;
    };
    const zc = sample(0.5, 0.5);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5, v = pos.getZ(i) + 0.5;
      pos.setY(i, ((sample(u, v) - zc) / p.sizeM) * p.exag);
    }
    geo.computeVertexNormals();
    // 음영기복 그림도 같은 정사각형으로 잘라 덮는다
    const n2 = p.meta.size_px, src = frac * n2, tc = document.createElement('canvas'); tc.width = tc.height = 1024;
    tc.getContext('2d')!.drawImage(p.img, n2 / 2 - src / 2, n2 / 2 - src / 2, src, src, 0, 0, 1024, 1024);
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    if (s.mesh) { s.scene.remove(s.mesh); s.mesh.geometry.dispose(); ((s.mesh.material as THREE.MeshLambertMaterial).map)?.dispose(); (s.mesh.material as THREE.Material).dispose(); }
    s.mesh = new THREE.Mesh(geo, mat); s.scene.add(s.mesh);
    // 착륙지(가운데)와 기지
    s.marks.clear();
    const mk = (e: number, nKm: number, color: number, size: number) => {
      const half = p.sizeM / 2000, u = e / (2 * half), v = -nKm / (2 * half);
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return;
      const y = ((sample(u + 0.5, v + 0.5) - zc) / p.sizeM) * p.exag;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.35, size * 0.35, size * 2.4, 12), new THREE.MeshBasicMaterial({ color }));
      m.position.set(u, y + size * 1.2, v); s.marks.add(m);
    };
    mk(0, 0, 0xffffff, 0.012);
    for (const b of p.bases) { const [e, nKm] = localEN(p.lat, p.lon, b.lat_deg, b.lon_deg); mk(e, nKm, 0xd9a24e, 0.014); }
    s.draw();
  }, [elev, p.sizeM, p.exag, p.bases, p.lat, p.lon, p.img, p.meta]);

  return (
    <div className="mapwrap localmap t3d" ref={wrap}>
      <canvas ref={cvs} style={{ cursor: p.disabled ? 'not-allowed' : 'crosshair' }} />
      {!elev ? <div className="loading">고도 자료 불러오는 중…</div> : null}
    </div>
  );
}
