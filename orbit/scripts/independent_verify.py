"""Optional developer-only independent DOP853 + real SPICE verification.

Run the TS validation script first. No Python component ships to the browser.
"""
import json
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
from nasa_data import SpiceFrames, LolaTerrain

ROOT = Path(__file__).resolve().parents[1]
MU = 4.902800118e12
G0 = 9.80665


def main():
    result = json.loads((ROOT / 'docs/default-trajectory.json').read_text(encoding='utf-8'))
    cfg = result['input']
    isp = cfg['lander']['isp_s']
    trajectory = result['trajectory']
    state = np.array(trajectory[0]['position_m'] + trajectory[0]['velocity_m_s'] + [cfg['lander']['initial_mass_kg']], float)
    calls = 0

    def propagate(state, duration, accel):
        nonlocal calls
        accel = np.array(accel, float)
        a = np.linalg.norm(accel)

        def ode(t, y):
            return np.r_[y[3:6], -MU * y[:3] / np.linalg.norm(y[:3]) ** 3 + accel, -y[6] * a / (isp * G0)]
        sol = solve_ivp(ode, (0, duration), state, method='DOP853', rtol=2e-12,
                        atol=np.array([1e-7] * 3 + [1e-10] * 3 + [1e-10]), max_step=2)
        assert sol.success
        calls += sol.nfev
        return sol.y[:, -1]

    doi = next(e for e in result['events'] if e['name'] == 'DOI')
    pdi = next(e for e in result['events'] if e['name'] == 'PDI')
    state = propagate(state, doi['time_s'], [0, 0, 0])
    state[3:6] += np.array(doi['delta_v_vector_m_s'])
    state[6] *= np.exp(-doi['delta_v_m_s'] / (isp * G0))
    state = propagate(state, pdi['time_s'] - doi['time_s'], [0, 0, 0])
    pdi_error = float(np.linalg.norm(state[:3] - np.array(pdi['position_m'])))
    pdi_speed_error = float(np.linalg.norm(state[3:6] - np.array(pdi['velocity_m_s'])))
    for control in result['controls']:
        state = propagate(state, control['duration_s'], control['acceleration_m_s2'])
    last = trajectory[-1]
    frames = SpiceFrames()
    landing_et = frames.utc_to_et(cfg['target']['landing_time_utc'])
    fixed = frames.inertial_to_fixed(state[:6], landing_et)
    target = np.array(result['target']['fixed_position_m'])
    radial = fixed[:3] / np.linalg.norm(fixed[:3])
    vertical = float(np.dot(fixed[3:], radial))
    horizontal = float(np.linalg.norm(fixed[3:] - vertical * radial))
    check = {
        'method': 'Independent SciPy DOP853 full seven-state ODE + original NAIF sxform',
        'nfev': calls,
        'pdi_position_difference_m': pdi_error,
        'pdi_velocity_difference_m_s': pdi_speed_error,
        'final_position_vs_typescript_m': float(np.linalg.norm(state[:3] - last['position_m'])),
        'final_velocity_vs_typescript_m_s': float(np.linalg.norm(state[3:6] - last['velocity_m_s'])),
        'final_mass_vs_typescript_kg': float(abs(state[6] - last['mass_kg'])),
        'actual_spice_fixed_target_error_m': float(np.linalg.norm(fixed[:3] - target)),
        'actual_spice_surface_speed_m_s': float(np.linalg.norm(fixed[3:])),
        'actual_spice_horizontal_speed_m_s': horizontal,
        'actual_spice_vertical_speed_m_s': vertical,
        'final_mass_kg': float(state[6]),
        'source': 'docs/default-trajectory.json, original locally reused NAIF kernels'
    }
    assert check['final_position_vs_typescript_m'] < .01
    assert check['final_velocity_vs_typescript_m_s'] < 1e-5
    assert check['actual_spice_fixed_target_error_m'] < cfg['constraints']['position_tolerance_m']
    assert check['actual_spice_surface_speed_m_s'] <= cfg['constraints']['speed_tolerance_m_s']
    assert horizontal <= cfg['constraints']['horizontal_speed_tolerance_m_s']
    assert state[6] >= cfg['lander']['dry_mass_kg']
    check['passed'] = True
    (ROOT / 'docs/independent-validation.json').write_text(json.dumps(check, indent=2), encoding='utf-8')
    print(json.dumps(check, indent=2))


if __name__ == '__main__':
    main()
