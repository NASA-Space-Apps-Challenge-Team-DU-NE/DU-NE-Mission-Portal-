"""Independently replay the formerly accepted dangerous GRAIL approach."""
import hashlib
import json
import os
from datetime import datetime, timezone
import numpy as np
from scipy.integrate import solve_ivp
import spiceypy as spice
from nasa_data import PROJECT, SpiceFrames
from independent_verify_gravity import IndependentGravity
from terminal_audit import audit_terminal

os.chdir(PROJECT)
fixture_path=PROJECT/'tests/fixtures/unsafe-terminal-grail30.json'
fixture_bytes=fixture_path.read_bytes()
f=json.loads(fixture_bytes)
e=json.loads((PROJECT/'frontend/public/data/ephemeris/index.json').read_text())
g=json.loads((PROJECT/'frontend/public/data/gravity/index.json').read_text())
frames=SpiceFrames()
spice.furnsh('data/ephemeris/gm_de440.tpc')
epoch=frames.utc_to_et(f['epoch_utc'])  # Historical fixture keeps its original time origin.
harmonic=IndependentGravity(g,30)
gms={name:float(spice.bodvrd(name,'GM',1)[1][0])*1e9 for name in ['EARTH','SUN']}
y=np.array(f['pdi'],dtype=float)
segments=[]
for control in f['controls']:
    start=f['start_et_offset_s']+control['start_s']
    end=start+control['duration_s']
    command=np.array(control['acceleration_m_s2'])
    def rhs(t,state):
        rotation=spice.pxform('J2000','MOON_PA_DE440',epoch+t)
        acceleration=rotation.T@harmonic.acceleration(rotation@state[:3])
        for name,gm in gms.items():
            body=np.array(spice.spkezr(name,epoch+t,'J2000','NONE','MOON')[0][:3])*1000
            relative=body-state[:3]
            acceleration+=gm*(relative/np.linalg.norm(relative)**3-body/np.linalg.norm(body)**3)
        return np.r_[state[3:6],acceleration+command,-state[6]*np.linalg.norm(command)/(f['input']['lander']['isp_s']*9.80665)]
    sol=solve_ivp(rhs,(start,end),y,method='DOP853',rtol=2e-13,atol=[1e-7]*3+[1e-10]*4,max_step=1,dense_output=True)
    if not sol.success: raise RuntimeError(sol.message)
    segments.append((start,end,sol,command));y=sol.y[:,-1]
audit=audit_terminal(segments,frames,epoch,f['input']['constraints'])
expected=not audit['passed'] and not audit['checks']['low_altitude_speed'] and not audit['checks']['thrust_tilt'] and not audit['checks']['contact'] and audit['checks']['finite_terrain_samples'] and audit['checks']['native_terrain_below_12km']
report={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'regression_passed':expected,'fixture_sha256':hashlib.sha256(fixture_bytes).hexdigest(),'initial_state_scope':'Saved historical PDI state only; no full NRHO-chain revalidation','method':'Independent SciPy DOP853, angular GRAIL evaluator, direct SPICE, native LOLA','audit':audit}
(PROJECT/'docs/terminal-independent-regression.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
if not expected: raise SystemExit('Expected unsafe terminal regression was not reproduced')
