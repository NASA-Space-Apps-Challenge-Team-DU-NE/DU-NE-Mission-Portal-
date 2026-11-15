import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import type { Sample, SimulationResult, Terrain, Vec3, ViewMode } from '../types';

const R = 1737400;
const COLORS: Record<string, string> = { NRHO: '#6eaaff', TRANSFER: '#bc9af6', DEPARTURE_BURN: '#ed9a69', INSERTION_BURN: '#ed9a69', DOI_BURN: '#f2ad53', PARKING: '#6bc8c0', CIRCULAR: '#6eaaff', COAST: '#f2ad53', POWERED_DESCENT: '#ef7e71' };
export function toRender(v: number[]): [number, number, number] { return [v[0] / R, v[2] / R, -v[1] / R]; }
export function targetVector(lat: number, lon: number, elevation = 0): Vec3 {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180, r = R + elevation;
  return [r * Math.cos(p) * Math.cos(l), r * Math.cos(p) * Math.sin(l), r * Math.sin(p)];
}

class SceneBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="scene-error">3D 렌더러를 시작할 수 없습니다.<small>{this.state.error}</small></div> : this.props.children; }
}

function Moon({ textureUrl }: { textureUrl?: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!textureUrl) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(textureUrl, map => {
      loaded = map; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
      if (alive) setTexture(map); else map.dispose();
    }, undefined, () => { if (alive) setTexture(null); });
    return () => { alive = false; loaded?.dispose(); };
  }, [textureUrl]);
  // Loading a map changes Three.js shader defines. Remount the material when the
  // async texture arrives so production builds compile USE_MAP as well.
  return <mesh><sphereGeometry args={[1, 192, 128]}/><meshStandardMaterial key={texture?.uuid ?? 'untextured'} map={texture} color={texture ? '#d9dfdf' : '#a4adb1'} roughness={1}/></mesh>;
}

function Graticule() {
  const lines = useMemo(() => {
    const out: Vec3[][] = [];
    for (const lat of [-75, -45, 0, 45, 75]) out.push(Array.from({ length: 181 }, (_, i) => toRender(targetVector(lat, i * 2 - 180, 1800))));
    for (const lon of [0, 60, 120, 180, 240, 300]) out.push(Array.from({ length: 91 }, (_, i) => toRender(targetVector(i * 2 - 90, lon, 1800))));
    return out;
  }, []);
  return <>{lines.map((line, i) => <Line key={i} points={line} color="#96b5bd" lineWidth={0.5} transparent opacity={0.16}/>)}</>;
}

function ephemerisBodies(result: SimulationResult | null, time: number) {
  const path = result?.nrho?.system.body_path;
  if (result?.nrho?.mode !== 'EPHEMERIS' || !path?.length) return undefined;
  let lo = 0, hi = path.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (path[mid].time_s <= time) lo = mid; else hi = mid - 1; }
  const a = path[lo], b = path[lo + 1];
  if (!b || time <= a.time_s || b.time_s <= a.time_s) return a;
  const f = Math.min(1, (time - a.time_s) / (b.time_s - a.time_s));
  const lerp = (left: Vec3, right: Vec3) => left.map((v, i) => v + (right[i] - v) * f) as Vec3;
  return { time_s: time, earth_position_fixed_m: lerp(a.earth_position_fixed_m, b.earth_position_fixed_m), sun_position_fixed_m: lerp(a.sun_position_fixed_m, b.sun_position_fixed_m) };
}

function SolarLighting({ result, current }: { result: SimulationResult | null; current: Sample | null }) {
  const sun = ephemerisBodies(result, current?.time_s ?? 0)?.sun_position_fixed_m;
  const direction = sun ? new THREE.Vector3(...toRender(sun)).normalize().multiplyScalar(10) : new THREE.Vector3(4, -3, 5);
  return <directionalLight position={direction} intensity={2}/>;
}

function SystemBodies({ result, current, view }: { result: SimulationResult; current: Sample | null; view: ViewMode }) {
  const system = result.nrho?.system;
  if (!system || view === 'site') return null;
  const earth = ephemerisBodies(result, current?.time_s ?? 0)?.earth_position_fixed_m ?? system.earth_position_fixed_m;
  const showLabels = ['system', 'nrho', 'transfer'].includes(view);
  return <>
    <group position={toRender(earth)}><mesh><sphereGeometry args={[system.earth_radius_m / R, 48, 32]}/><meshStandardMaterial color="#558fa7" roughness={0.8}/></mesh>{showLabels && <Html center position={[0, system.earth_radius_m / R + 2, 0]} className="space-label body-label">EARTH <span>날짜별 위치 · 구체</span></Html>}</group>
    {showLabels && <Html center position={[0, 1.7, 0]} className="space-label body-label">MOON</Html>}
  </>;
}

function ManeuverArrow({ position, deltaV, view }: { position: Vec3; deltaV: Vec3; view: ViewMode }) {
  const arrow = useMemo(() => {
    const dir = new THREE.Vector3(...toRender(deltaV)).normalize();
    return new THREE.ArrowHelper(dir, new THREE.Vector3(...toRender(position)), view === 'system' ? 8 : view === 'nrho' || view === 'transfer' ? 3 : 0.08, '#e1bdff', view === 'system' ? 1.5 : view === 'nrho' || view === 'transfer' ? 0.6 : 0.02, view === 'system' ? 0.7 : view === 'nrho' || view === 'transfer' ? 0.25 : 0.01);
  }, [position, deltaV, view]);
  useEffect(() => () => { arrow.line.geometry.dispose(); arrow.cone.geometry.dispose(); }, [arrow]);
  return <primitive object={arrow}/>;
}

function TerrainMesh({ terrain }: { terrain: Terrain }) {
  const geometry = useMemo(() => {
    const vertices = terrain.positions_m ?? terrain.vertices_m;
    if (!vertices?.length || !terrain.indices?.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap(toRender), 3));
    g.setIndex(terrain.indices); g.computeVertexNormals();
    return g;
  }, [terrain]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? <mesh geometry={geometry}><meshStandardMaterial color="#99aaa9" roughness={1} side={THREE.DoubleSide}/></mesh> : null;
}

function Craft({ sample, view }: { sample: Sample; view: ViewMode }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const p = toRender(sample.fixed_position_m);
  useFrame(() => { if (group.current) group.current.scale.setScalar(Math.max(0.00002, camera.position.distanceTo(group.current.position) * 0.006)); });
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...p).normalize()), [p[0], p[1], p[2]]);
  return <group position={p} quaternion={q} ref={group}>
    <mesh><boxGeometry args={[0.8, 0.6, 0.8]}/><meshStandardMaterial color="#f1ce82" metalness={0.45} roughness={0.3}/></mesh>
    <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.4, 0.45, 0.5, 8]}/><meshStandardMaterial color="#e9eeed"/></mesh>
    {[0, 1, 2, 3].map(i => <group key={i} rotation={[0, i * Math.PI / 2, 0]}><Line points={[[0.3, 0, 0.3], [1, -0.8, 1]]} color="#dae1e1" lineWidth={1.5}/><mesh position={[1, -0.8, 1]}><cylinderGeometry args={[0.2, 0.2, 0.06, 8]}/><meshBasicMaterial color="#d4b874"/></mesh></group>)}
    {sample.thrust_n > 0 && <mesh position={[0, -0.8, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.23, 0.7, 12]}/><meshBasicMaterial color="#ffad5e" transparent opacity={0.75}/></mesh>}
    {view !== 'site' && <Html center position={[0, 2, 0]} className="space-label craft-label" distanceFactor={undefined}>LANDER</Html>}
  </group>;
}

function CameraRig({ view, target, result, current, reset, terrain }: { view: ViewMode; target: Vec3; result: SimulationResult | null; current: Sample | null; reset: number; terrain: Terrain | null }) {
  const controls = useRef<OrbitControlsType>(null);
  const { camera, size } = useThree();
  const lastPosition = useRef<THREE.Vector3 | null>(null);
  const targetKey = target.join(',');
  useEffect(() => {
    const p = new THREE.Vector3(...toRender(target));
    const up = p.clone().normalize();
    const tangent = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    if (tangent.lengthSq() < 0.1) tangent.set(1, 0, 0);
    const descentPoints = result?.trajectory.filter(s => s.phase === 'POWERED_DESCENT').map(s => new THREE.Vector3(...toRender(s.fixed_position_m))) ?? [];
    const track = descentPoints.length > 1 ? descentPoints[0].clone().sub(descentPoints[descentPoints.length - 1]) : tangent.clone();
    track.addScaledVector(up, -track.dot(up)).normalize();
    if (track.lengthSq() < 0.1) track.copy(tangent);
    const crossTrack = new THREE.Vector3().crossVectors(up, track).normalize();
    const fitDistance = (points: THREE.Vector3[]) => {
      const box = new THREE.Box3().setFromPoints(points);
      const radius = Math.max(0.002, box.getSize(new THREE.Vector3()).length() * 0.5);
      const vfov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) * 0.5;
      const hfov = Math.atan(Math.tan(vfov) * size.width / size.height);
      return { center: box.getCenter(new THREE.Vector3()), distance: radius / Math.sin(Math.min(vfov, hfov)) * 1.15 };
    };
    let focus = new THREE.Vector3(), offset = up.clone().multiplyScalar(3.6).add(tangent.clone().multiplyScalar(1.5));
    if (view === 'orbit') offset = up.clone().multiplyScalar(2.8).add(tangent.clone().multiplyScalar(2.9));
    if ((view === 'moon' || view === 'orbit') && result?.circular_orbit && result.circular_orbit.length > 4) {
      const a = new THREE.Vector3(...toRender(result.circular_orbit[0]));
      const b = new THREE.Vector3(...toRender(result.circular_orbit[Math.floor(result.circular_orbit.length / 4)]));
      const orbitNormal = new THREE.Vector3().crossVectors(a, b).normalize();
      offset = orbitNormal.multiplyScalar(view === 'orbit' ? 3.1 : 3.7).add(up.clone().multiplyScalar(view === 'orbit' ? 1.6 : 1.8));
    }
    if (result?.nrho && (view === 'system' || view === 'nrho' || view === 'transfer')) {
      const nrhoPoints = result.nrho.reference_path_fixed_m.map(v => new THREE.Vector3(...toRender(v)));
      const transferPoints = result.trajectory.filter(s => ['DEPARTURE_BURN', 'TRANSFER', 'INSERTION_BURN'].includes(s.phase)).map(s => new THREE.Vector3(...toRender(s.fixed_position_m)));
      let points = view === 'transfer' && transferPoints.length ? transferPoints : nrhoPoints;
      if (view === 'system') {
        const earth = new THREE.Vector3(...toRender(result.nrho.system.earth_position_fixed_m));
        const er = result.nrho.system.earth_radius_m / R;
        points = [...points, new THREE.Vector3(), earth.clone().addScalar(er), earth.clone().addScalar(-er)];
        if (result.nrho.mode === 'EPHEMERIS') points.push(...(result.nrho.system.body_path ?? []).map(p => new THREE.Vector3(...toRender(p.earth_position_fixed_m))));
      }
      if (points.length) {
        const fitted = fitDistance([...points, new THREE.Vector3()]);
        focus = fitted.center;
        // A diagonal view avoids projecting the near-rectilinear halo edge-on.
        offset = new THREE.Vector3(0.65, 0.4, 1).normalize().multiplyScalar(fitted.distance);
      }
    }
    if (view === 'site') {
      const vertices = terrain?.positions_m ?? terrain?.vertices_m;
      const fitted = vertices?.length ? fitDistance(vertices.map(v => new THREE.Vector3(...toRender(v)))) : { center: p, distance: 0.028 };
      focus = fitted.center; offset = up.clone().multiplyScalar(0.88).add(crossTrack.clone().multiplyScalar(0.55)).normalize().multiplyScalar(fitted.distance);
    }
    if (view === 'descent' && descentPoints.length) {
      const fitted = fitDistance(descentPoints);
      focus = fitted.center; offset = up.clone().multiplyScalar(0.75).add(crossTrack.clone().multiplyScalar(0.8)).normalize().multiplyScalar(fitted.distance);
    }
    if (view === 'follow' && current) { focus = new THREE.Vector3(...toRender(current.fixed_position_m)); const range = ['NRHO', 'TRANSFER'].includes(current.phase) ? Math.max(2, focus.length() * 0.3) : 0.13; offset = up.clone().multiplyScalar(range).add(tangent.clone().multiplyScalar(range * 0.7)); }
    camera.near = ['system', 'nrho', 'transfer'].includes(view) ? 0.01 : 0.00001;
    camera.far = result?.nrho ? 5000 : 200;
    camera.updateProjectionMatrix();
    camera.up.copy(view === 'site' || view === 'descent' ? up : new THREE.Vector3(0, 1, 0));
    camera.position.copy(focus.clone().add(offset)); camera.lookAt(focus);
    controls.current?.target.copy(focus); controls.current?.update(); lastPosition.current = current ? new THREE.Vector3(...toRender(current.fixed_position_m)) : null;
  // Current position is deliberately omitted: playback must not reset user orbit control.
  }, [view, targetKey, result, reset, camera, terrain, size.width, size.height]);
  useFrame(() => {
    if (view !== 'follow' || !current || !controls.current) return;
    const p = new THREE.Vector3(...toRender(current.fixed_position_m));
    if (lastPosition.current) camera.position.add(p.clone().sub(lastPosition.current));
    controls.current.target.copy(p); lastPosition.current = p; controls.current.update();
  });
  return <OrbitControls ref={controls} makeDefault minDistance={0.0001} maxDistance={result?.nrho ? 2000 : 12} enableDamping dampingFactor={0.1} zoomSpeed={0.7} rotateSpeed={0.65}/>;
}

export default function LunarScene({ result, current, target, view, reset, terrain, textureUrl }: { result: SimulationResult | null; current: Sample | null; target: Vec3; view: ViewMode; reset: number; terrain: Terrain | null; textureUrl?: string }) {
  const paths = useMemo(() => {
    if (!result) return [];
    return ['NRHO', 'DEPARTURE_BURN', 'TRANSFER', 'INSERTION_BURN', 'PARKING', 'CIRCULAR', 'DOI_BURN', 'COAST', 'POWERED_DESCENT'].map(phase => ({ phase, points: result.trajectory.filter(s => s.phase === phase && s.fixed_position_m?.every(Number.isFinite)).map(s => toRender(s.fixed_position_m)) }));
  }, [result]);
  const events = useMemo(() => (result?.events ?? []).map(event => {
    const nearest = result?.trajectory.length ? result.trajectory.reduce((best, s) => Math.abs(s.time_s - event.time_s) < Math.abs(best.time_s - event.time_s) ? s : best) : undefined;
    return { ...event, fixed_position_m: event.fixed_position_m ?? nearest?.fixed_position_m };
  }), [result]);
  const wideView = ['system', 'nrho', 'transfer'].includes(view);
  const visibleEvents = events.filter(e => e.fixed_position_m && /DOI|PDI|NRHO_DEPARTURE|LLO_INSERTION/i.test(e.name ?? '') && view !== 'site' &&
    (view !== 'descent' || e.name === 'PDI') && (wideView ? /NRHO_DEPARTURE|LLO_INSERTION/.test(e.name ?? '') : e.name !== 'NRHO_DEPARTURE'));
  const eventRadius = view === 'system' ? 0.25 : wideView ? 0.06 : view === 'descent' ? 0.001 : 0.004;
  return <SceneBoundary><Canvas camera={{ position: [2.5, -3.2, 2.2], fov: 38, near: 0.00001, far: 200 }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} fallback={<div className="scene-error">WebGL을 사용할 수 없습니다. 계산과 수치 결과는 사용할 수 있습니다.</div>}>
    <color attach="background" args={['#000000']}/>
    <ambientLight intensity={0.72}/><SolarLighting result={result} current={current}/><directionalLight position={[-3, 1, -2]} intensity={0.18}/>
    <Suspense fallback={null}><Stars radius={result?.nrho ? 1800 : 65} depth={result?.nrho ? 800 : 20} count={1500} factor={1.8} saturation={0} fade speed={0}/></Suspense>
    {!(view === 'site' && Boolean(terrain?.positions_m?.length || terrain?.vertices_m?.length)) && <Moon textureUrl={textureUrl}/>}
    {(view === 'moon' || view === 'orbit') && <Graticule/>}
    {view === 'site' && terrain && <TerrainMesh terrain={terrain}/>}
    {result?.nrho && <SystemBodies result={result} current={current} view={view}/>}
    {['system', 'nrho', 'transfer'].includes(view) && result?.nrho?.reference_path_fixed_m.length && <Line points={result.nrho.reference_path_fixed_m.map(toRender)} color={COLORS.NRHO} lineWidth={1.4} transparent opacity={0.7}/>}
    {(view === 'moon' || view === 'orbit') && result?.circular_orbit && result.circular_orbit.length > 1 && <Line points={result.circular_orbit.map(toRender)} color={result.nrho ? COLORS.PARKING : COLORS.CIRCULAR} lineWidth={1} transparent opacity={0.6}/>}
    {paths.filter(p => view === 'descent' || view === 'site' ? p.phase === 'POWERED_DESCENT' : view === 'moon' || view === 'orbit' ? !['NRHO', 'DEPARTURE_BURN', 'TRANSFER'].includes(p.phase) : true).map(p => p.points.length > 1 && <Line key={p.phase} points={p.points} color={p.phase === 'CIRCULAR' && result?.nrho ? COLORS.PARKING : COLORS[p.phase]} lineWidth={2} dashed={result?.status !== 'VALIDATED'} dashSize={result?.nrho && ['NRHO', 'TRANSFER'].includes(p.phase) ? 0.3 : 0.012} gapSize={result?.nrho && ['NRHO', 'TRANSFER'].includes(p.phase) ? 0.12 : 0.004}/>)}
    <group position={toRender(target)}><mesh><sphereGeometry args={[view === 'site' ? 0.000025 : 0.004, 16, 16]}/><meshBasicMaterial color="#76d6aa" depthTest={false}/></mesh>{!wideView && <Html center distanceFactor={undefined} className="space-label target-label" position={[0, view === 'site' ? 0.0003 : 0.018, 0]}>TARGET <span>착륙 목표</span></Html>}</group>
    {visibleEvents.map((e, i) => <group key={i} position={toRender(e.fixed_position_m!)}><mesh><sphereGeometry args={[eventRadius, 12, 12]}/><meshBasicMaterial color={/NRHO|INSERTION/.test(e.name ?? '') ? '#bc9af6' : /DOI/i.test(e.name ?? '') ? '#f2ad53' : '#ef7e71'}/></mesh><Html center distanceFactor={undefined} className="space-label event-label" position={[0, eventRadius * 4, 0]}>{e.name?.replaceAll('_', ' ') ?? e.phase}{wideView && e.delta_v_m_s != null && <span> · {e.delta_v_m_s.toFixed(0)} m/s</span>}</Html></group>)}
    {visibleEvents.filter(e => e.delta_v_fixed_m_s && e.fixed_position_m).map((e, i) => <ManeuverArrow key={i} position={e.fixed_position_m!} deltaV={e.delta_v_fixed_m_s!} view={view}/>)}
    {current && <Craft sample={current} view={view}/>}
    <CameraRig view={view} target={target} result={result} current={current} reset={reset} terrain={terrain}/>
  </Canvas></SceneBoundary>;
}
