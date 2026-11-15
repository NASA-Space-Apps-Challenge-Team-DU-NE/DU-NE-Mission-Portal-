import test from 'node:test';
import assert from 'node:assert/strict';
import { circularParameters, descentOrbit, integrate, rk4, MU, R_MOON, G0, norm, dot, cross, position, velocity, type State } from '../frontend/src/physics/math';

test('A: 100 km circular orbit returns after one analytic period, conserving energy and plane', () => {
  const orbit = circularParameters(100_000);
  // Arbitrary inclined orbit; catches integration and plane errors hidden by XY-only cases.
  const r = orbit.radius_m, v = orbit.speed_m_s, c = Math.SQRT1_2;
  const start: State = [r, 0, 0, 0, v * c, v * c, 1500];
  const energy = (s: State) => dot(velocity(s), velocity(s)) / 2 - MU / norm(position(s));
  const h0 = cross(position(start), velocity(start));
  let s = start;
  let maxRadiusError = 0, maxEnergyRelative = 0, maxPlaneError = 0;
  const steps = 2048, dt = orbit.period_s / steps;
  for (let i = 0; i < steps; i++) {
    s = rk4(s, dt);
    maxRadiusError = Math.max(maxRadiusError, Math.abs(norm(position(s)) - r));
    maxEnergyRelative = Math.max(maxEnergyRelative, Math.abs((energy(s) - energy(start)) / energy(start)));
    maxPlaneError = Math.max(maxPlaneError, Math.abs(dot(position(s), h0) / norm(h0)));
  }
  assert.equal(r, 1_837_400);
  assert.ok(Math.abs(v - 1633.504134) < .001);
  assert.ok(maxRadiusError < .01, `radial drift ${maxRadiusError} m`);
  assert.ok(maxEnergyRelative < 1e-9, `relative energy drift ${maxEnergyRelative}`);
  assert.ok(maxPlaneError < 1e-7, `plane drift ${maxPlaneError} m`);
  assert.ok(norm(s.slice(0, 3).map((x, i) => x - start[i])) < .01);
  assert.equal(s[6], 1500);
});

test('B: impulsive DOI vis-viva solution and integrated ellipse agree at 15 km periapsis', () => {
  const o = descentOrbit(100_000, 15_000);
  assert.ok(o.deltaV > 19 && o.deltaV < 20);
  const initial: State = [o.ra, 0, 0, 0, o.va, 0, 1490];
  const pdi = integrate(initial, o.coastTime, [0, 0, 0], 1);
  assert.ok(Math.abs(norm(position(pdi)) - (R_MOON + 15_000)) < .002);
  assert.ok(Math.abs(norm(velocity(pdi)) - o.vp) < .00001);
  assert.ok(Math.abs(dot(position(pdi), velocity(pdi)) / norm(position(pdi))) < .00001);
  assert.ok(norm([pdi[0] + o.rp, pdi[1], pdi[2]]) < .005);
  const energy = dot(velocity(pdi), velocity(pdi)) / 2 - MU / norm(position(pdi));
  assert.ok(Math.abs(energy + MU / (2 * o.a)) < .001);
});

test('F: RK4 seven-state dynamics consume propellant according to T=m|a| and Isp*g0', () => {
  const initial: State = [R_MOON + 15_000, 0, 0, 0, 1600, 0, 1490];
  const acceleration: [number, number, number] = [1.7, -4.2, .1];
  const duration = 320, isp = 320;
  const state = integrate(initial, duration, acceleration, .5, isp);
  const expectedMass = initial[6] * Math.exp(-norm(acceleration) * duration / (isp * G0));
  assert.ok(Math.abs(state[6] - expectedMass) < 1e-7);
  assert.ok(state[6] < initial[6]);
  // Demonstrate time-step convergence on an independent nontrivial thrust case.
  const coarse = integrate(initial, duration, acceleration, 4, isp);
  assert.ok(norm(position(coarse).map((x, i) => x - state[i])) < .005);
});
