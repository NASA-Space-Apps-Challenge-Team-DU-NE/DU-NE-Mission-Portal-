// 3D 달 뒤 배경 하늘: 별과 은하수.
// - 방향은 실제 하늘과 같다: 은하 좌표 → J2000 적도 좌표(고정 회전 행렬) → 그 시각의 달 고정 좌표(MOON_ME).
//   그래서 달이 자전하면 하늘도 함께 돈다.
// - 별 하나하나의 위치는 실제 목록이 아니라 통계로 만든 것이다 (밝기 분포, 은하면 쪽으로 몰림, 색온도 분포).
//   보기용 배경이며 계산에는 쓰지 않는다.
import * as THREE from 'three';

/** J2000 적도 → 은하 좌표 회전 행렬 (Hipparcos 정의). 은하 = N · 적도 */
const N = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
const D2R = Math.PI / 180;
const R = 4000;

function h01(i: number) { let x = (i + 1) * 2654435761; x = (x ^ (x >>> 15)) * 2246822519; x ^= x >>> 13; x = Math.imul(x, 3266489917); x ^= x >>> 16; return (x >>> 0) / 4294967295; }

/** 은하 좌표 (l, b, 도) → J2000 적도 단위 벡터 */
function galToEq(l: number, b: number): [number, number, number] {
  const cb = Math.cos(b * D2R), g = [cb * Math.cos(l * D2R), cb * Math.sin(l * D2R), Math.sin(b * D2R)];
  return [N[0][0] * g[0] + N[1][0] * g[1] + N[2][0] * g[2], N[0][1] * g[0] + N[1][1] * g[1] + N[2][1] * g[2], N[0][2] * g[0] + N[1][2] * g[1] + N[2][2] * g[2]];
}

/** 색지수 B−V → 대략의 RGB (0–1) */
function bvToRgb(bv: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [-0.3, [0.62, 0.71, 1.0]], [0.0, [0.79, 0.85, 1.0]], [0.3, [0.95, 0.95, 1.0]], [0.6, [1.0, 0.96, 0.88]],
    [0.9, [1.0, 0.88, 0.72]], [1.3, [1.0, 0.78, 0.56]], [1.8, [1.0, 0.68, 0.45]],
  ];
  for (let i = 1; i < stops.length; i++) if (bv <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], k = (bv - a) / (b - a);
    return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
  }
  return stops[stops.length - 1][1];
}

export interface Sky { group: THREE.Group; update(eqToThree: (v: number[]) => THREE.Vector3, camPos: THREE.Vector3, pixelRatio: number): void; dispose(): void }

export function createSky(): Sky {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;

  // ── 별 ──
  const COUNT = 14000, pos: number[] = [], col: number[] = [], size: number[] = [];
  const mLo = -1.2, mHi = 7.4, k = 0.45, a = Math.pow(10, k * mLo), bR = Math.pow(10, k * mHi);
  for (let i = 0; i < COUNT; i++) {
    // 밝기: 어두운 별일수록 많다 (N(m) ∝ 10^(0.45 m))
    const m = Math.log10(a + h01(i * 7) * (bR - a)) / k;
    // 어두운 별일수록 은하면 쪽으로 몰린다
    const inPlane = h01(i * 7 + 1) < 0.18 + 0.5 * Math.max(0, m) / mHi;
    let dir: [number, number, number];
    if (inPlane) {
      let l = 0;
      for (let tries = 0; tries < 8; tries++) { l = h01(i * 7 + 2 + tries * 101) * 360 - 180; if (h01(i * 7 + 3 + tries * 101) < 0.35 + 0.65 * Math.exp(-((l / 55) ** 2))) break; }
      const u = h01(i * 7 + 4) - 0.5, bScale = 6 + 6 * Math.exp(-((l / 30) ** 2));
      const b = -Math.sign(u) * bScale * Math.log(1 - 2 * Math.abs(u));
      dir = galToEq(l, Math.max(-89, Math.min(89, b)));
    } else {
      const z = h01(i * 7 + 5) * 2 - 1, th = h01(i * 7 + 6) * Math.PI * 2, s = Math.sqrt(1 - z * z);
      dir = [s * Math.cos(th), s * Math.sin(th), z];
    }
    pos.push(dir[0] * R, dir[1] * R, dir[2] * R);
    const r = h01(i * 7 + 8), bv = r < 0.12 ? -0.25 + r * 3 : r < 0.62 ? 0.25 + (r - 0.12) * 1.1 : 0.8 + (r - 0.62) * 2.2;
    const c = bvToRgb(bv), alpha = Math.max(0.12, Math.min(1, 1.15 - 0.13 * m));
    col.push(c[0] * alpha, c[1] * alpha, c[2] * alpha);
    size.push(Math.max(1.0, Math.min(5.2, 3.6 - 0.42 * m)));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sg.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  const starUni = { pr: { value: 1 } };
  const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: starUni,
    vertexShader: `attribute float size; attribute vec3 color; uniform float pr; varying vec3 vC;
      void main(){ vC=color; gl_PointSize=size*pr; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision highp float; varying vec3 vC;
      void main(){ vec2 d=gl_PointCoord-0.5; float r2=dot(d,d)*4.0; if(r2>1.0) discard;
        float core=exp(-r2*9.0), halo=exp(-r2*2.5)*0.35; gl_FragColor=vec4(vC*(core+halo),1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.renderOrder = -2;
  stars.frustumCulled = false;

  // ── 은하수: 은하면을 따라 흐린 띠 + 얼룩 + 중심 쪽 먼지띠 ──
  const nArr = new THREE.Matrix3().set(N[0][0], N[0][1], N[0][2], N[1][0], N[1][1], N[1][2], N[2][0], N[2][1], N[2][2]);
  const band = new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 96, 48), new THREE.ShaderMaterial({
    uniforms: { N: { value: nArr } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `precision highp float; varying vec3 vD; uniform mat3 N;
      float h(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float s=0.0, a=0.5; for(int k=0;k<5;k++){ s+=a*n3(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 g=N*normalize(vD);                       // 적도 → 은하 좌표
        float b=asin(clamp(g.z,-1.0,1.0)), l=atan(g.y,g.x);
        float centre=exp(-pow(l/0.75,2.0));           // 은하 중심(궁수자리) 쪽이 더 넓고 밝다
        float width=0.10+0.10*centre;
        float lum=exp(-pow(b/width,2.0))*(0.35+0.65*centre) + exp(-pow(b/0.05,2.0))*0.25*centre;
        lum+=exp(-pow(l/0.35,2.0)-pow(b/0.12,2.0))*0.6; // 중심 팽대부
        float cl=fbm(g*6.0);                          // 얼룩
        lum*=0.55+0.9*cl;
        float dust=smoothstep(0.45,0.75,fbm(g*9.0+3.1))*exp(-pow((b-0.012)/0.035,2.0))*(0.4+0.6*centre);
        lum*=1.0-0.75*dust;                           // 먼지띠 (Great Rift 같은 어두운 줄)
        vec3 c=mix(vec3(0.55,0.62,0.80),vec3(0.95,0.86,0.72),centre*0.8+0.1);
        gl_FragColor=vec4(c*lum*0.24,1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
  }));
  band.renderOrder = -3;
  band.frustumCulled = false;

  group.add(band, stars);
  const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
  return {
    group,
    update(eqToThree, camPos, pixelRatio) {
      ex.copy(eqToThree([1, 0, 0])); ey.copy(eqToThree([0, 1, 0])); ez.copy(eqToThree([0, 0, 1]));
      group.matrix.makeBasis(ex, ey, ez).setPosition(camPos); // 카메라를 따라다녀 끝없이 먼 하늘처럼 보인다
      group.matrixWorldNeedsUpdate = true;
      starUni.pr.value = pixelRatio;
    },
    dispose() { sg.dispose(); (stars.material as THREE.Material).dispose(); band.geometry.dispose(); (band.material as THREE.Material).dispose(); },
  };
}
