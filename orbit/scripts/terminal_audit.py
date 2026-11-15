"""Development-only independent terminal audit: direct SPICE and native LOLA.
The hard-coded demo-terminal-v1 envelope is deliberately independent of TS.
No attitude/landing-gear or unresolved hazard certification is implied.
"""
import hashlib
import json
import numpy as np
from nasa_data import LolaTerrain, PROJECT


def audit_terminal(segments, frames, epoch, limits):
    terrain = LolaTerrain()
    # Match the documented high-altitude terrain model; native polar LOLA is
    # still mandatory below 12 km reference-sphere altitude. The conservative
    # global maximum (10504 m) also keeps these coarse samples above the 1 km
    # terminal envelope. Missing native coverage there is not missing data.
    meta = json.loads((PROJECT/'frontend/public/data/terrain/global.json').read_text(encoding='utf-8'))
    raw = (PROJECT/'frontend/public/data/terrain/global.bin').read_bytes()
    if hashlib.sha256(raw).hexdigest() != meta['sha256'] or len(raw) != meta['bytes']:
        raise ValueError('Global terrain integrity failure in independent terminal audit')
    global_dem = np.frombuffer(raw, dtype='<u2').reshape(meta['rows'],meta['cols'])
    rows = []
    coarse_samples, coarse_below_12km = 0, 0
    for begin, end, solution, command in segments:
        command = np.asarray(command)
        magnitude = np.linalg.norm(command)
        for t in np.linspace(begin, end, int(np.ceil((end-begin)/.125))+1):
            state = solution.sol(t)
            fixed = frames.sxform(epoch+t, inverse=True) @ state[:6]
            radius = np.linalg.norm(fixed[:3])
            lat = np.degrees(np.arcsin(fixed[2]/radius))
            lon = np.degrees(np.arctan2(fixed[1], fixed[0]))
            elevation = terrain.elevation(lat, lon)
            if elevation is None:
                row = int(np.clip(np.floor(90-lat),0,179))
                col = int(np.floor((lon+180)%360))
                elevation = float(global_dem[row,col])*meta['scale_m']+meta['offset_m']
                coarse_samples += 1
                if radius-1737400. < 12000:
                    coarse_below_12km += 1
            clearance = radius-1737400.-elevation-2.
            vertical = float(fixed[3:] @ (fixed[:3]/radius))
            horizontal = np.linalg.norm(fixed[3:]-vertical*fixed[:3]/radius)
            tilt = np.degrees(np.arccos(np.clip(command @ state[:3]/(magnitude*np.linalg.norm(state[:3])), -1, 1))) if magnitude > 1e-12 else np.nan
            rows.append([t, clearance, horizontal, vertical, tilt])
    data = np.asarray(rows)
    if data.size == 0:
        return {'passed': False, 'checks': {'samples': False}, 'samples': 0}
    valid = bool(np.all(np.isfinite(data)))
    terminal = data[:,1] <= 1000
    speed_violations, tilt_violations, band_counts = 0, 0, []
    for height, horizontal, down, tilt in [(1000,50,30,45),(100,5,5,15),(10,.5,1,5)]:
        local = data[data[:,1] <= height]
        band_counts.append(len(local))
        speed_violations += int(np.sum((local[:,2] > horizontal+1e-6) | (-local[:,3] > down+1e-6)))
        tilt_violations += int(np.sum((local[:,4] > tilt+1e-6) | ~np.isfinite(local[:,4])))
    final = data[-1]
    early = int(np.sum((data[:,1] <= .02) & (data[:,0] < final[0]-.05-1e-7)))
    penetration = int(np.sum(data[:,1] < -.02))
    duration = float(final[0]-data[terminal,0][0]) if np.any(terminal) else 0.
    checks = {
        'finite_terrain_samples': valid,
        'native_terrain_below_12km': coarse_below_12km == 0,
        'dense_inspection': bool(np.max(np.diff(data[:,0]), initial=0) <= .2500001),
        'terminal_duration_and_direction': duration >= 10 and bool(np.all(data[terminal,3] <= 1e-6)),
        'low_altitude_speed': valid and all(band_counts) and speed_violations == 0,
        'thrust_tilt': valid and all(band_counts) and tilt_violations == 0,
        'contact': valid and abs(final[1]) <= .02 and -min(1,limits['speed_tolerance_m_s'])-1e-6 <= final[3] < 0 and final[2] <= min(.5,limits['horizontal_speed_tolerance_m_s'])+1e-6 and early == 0 and penetration == 0,
    }
    return {'passed': bool(all(checks.values())), 'checks': {k:bool(v) for k,v in checks.items()}, 'samples':len(rows), 'policy':'demo-terminal-v1',
            'speed_violation_count':speed_violations, 'tilt_violation_count':tilt_violations, 'premature_contact_samples':early, 'penetration_samples':penetration,
            'final_thrust_tilt_deg':float(final[4]) if np.isfinite(final[4]) else None,
            'final_contact_clearance_m':float(final[1]) if np.isfinite(final[1]) else None,
            'terminal_duration_s':duration, 'coarse_terrain_samples_above_12km':coarse_samples-coarse_below_12km, 'coarse_terrain_samples_below_12km':coarse_below_12km, 'global_terrain_sha256':meta['sha256'],
            'scope':'Dense DOP853 states, direct SPICE frame and original 240m LOLA below 12km and integrity-checked conservative global DEM above; radial 2m support-point proxy only.'}
