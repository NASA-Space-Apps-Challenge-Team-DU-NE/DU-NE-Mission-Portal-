import type { Config, Sample, SimulationResult, Vec3 } from '../../types';
import { DataUnavailable, latLon, surfacePosition, type Assets } from '../data';
import { add, dot, G0, matVec, norm, position, R_MOON, scale, solveLinear, sub, unit, velocity, type State } from '../math';
import { validateConfig, type Control } from '../simulator';
import { gravity, propagateEphemeris } from './dynamics';
import { Ephemeris } from './data';
import { TERMINAL_DESCENT_POLICY, contactPoint, validateTerminalDescent } from './terminalDescent';
import { burnDuration, propagateBurn, type FiniteBurn } from './finiteBurn';

const ZERO:Vec3=[0,0,0],SEGMENTS=96;
function budget(deadline:number){if(performance.now()>deadline)throw new Error('MISSION COMPUTATION TIME LIMIT');}
/** Fixed-step RK4 used for powered-control shooting and independent step refinement.
 * Forces are the SAME dated Earth/Moon/Sun model as the transfer integrator. */
export function landingStep(y:State,t:number,h:number,a:Vec3,eph:Ephemeris,isp:number,force?:Vec3):State {
  const rhs=(s:State,time:number):State=>{const g=gravity(time,position(s),eph),command=force?scale(force,1/s[6]):a;return [s[3],s[4],s[5],g[0]+command[0],g[1]+command[1],g[2]+command[2],force?-norm(force)/(isp*G0):-s[6]*norm(a)/(isp*G0)];};
  const advance=(k:State,f:number)=>y.map((v,i)=>v+h*f*k[i]) as State;
  const k1=rhs(y,t),k2=rhs(advance(k1,.5),t+h/2),k3=rhs(advance(k2,.5),t+h/2),k4=rhs(advance(k3,1),t+h);
  return y.map((v,i)=>v+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6) as State;
}
function integrateSegment(y:State,t:number,duration:number,a:Vec3,eph:Ephemeris,isp:number,step:number):State{
  const n=Math.max(1,Math.ceil(duration/step)),h=duration/n;let s=[...y] as State;
  for(let i=0;i<n;i++)s=landingStep(s,t+i*h,h,a,eph,isp);
  return s;
}
function shoot(initial:State,desired:number[],start:number,duration:number,eph:Ephemeris,isp:number,deadline:number,seedControls?:Vec3[]) {
  const p0=position(initial),v0=velocity(initial),pf=position(desired),vf=velocity(desired),dt=duration/SEGMENTS;
  const c2=scale(sub(scale(sub(pf,p0),3),scale(add(scale(v0,2),vf),duration)),1/duration**2);
  const c3=scale(add(scale(sub(p0,pf),2),scale(add(v0,vf),duration)),1/duration**3);
  const seed=seedControls??Array.from({length:SEGMENTS},(_,i)=>{const t=(i+.5)*dt;const p=add(add(p0,scale(v0,t)),add(scale(c2,t*t),scale(c3,t**3)));// Quintic correction preserves endpoint position/velocity and initial
    // acceleration while bringing the seed's final net acceleration to zero.
    // This is only a shooting guess: every displayed state is ODE-integrated.
    const da=scale(add(scale(c2,2),scale(c3,6*duration)),-1);
    const b=t**3*(t-duration)**2/(2*duration**3),dd=(20*t**3-24*duration*t*t+6*duration**2*t)/(2*duration**3);
    return sub(add(add(scale(c2,2),scale(c3,6*t)),scale(da,dd)),gravity(start+t,add(p,scale(da,b)),eph));});
  const controls=(q:number[])=>seed.map((a,i)=>add(a,add(q.slice(0,3) as Vec3,scale(q.slice(3,6) as Vec3,(i+.5)/SEGMENTS-.5))));
  const propagate=(cs:Vec3[],step=2)=>cs.reduce((y,a,i)=>integrateSegment(y,start+i*dt,dt,a,eph,isp,step),[...initial] as State);
  const residual=(q:number[])=>{budget(deadline);return propagate(controls(q)).slice(0,6).map((v,i)=>(v-desired[i])/(i<3?1000:10));};
  let q=[0,0,0,0,0,0],res=residual(q),iterations=0;
  for(;iterations<10&&norm(res)>2e-8;iterations++){
    const jac=Array.from({length:6},()=>Array(6).fill(0));
    for(let j=0;j<6;j++){const shifted=[...q];shifted[j]+=1e-4;const r=residual(shifted);for(let i=0;i<6;i++)jac[i][j]=(r[i]-res[i])/1e-4;}
    const dq=solveLinear(jac,res.map(x=>-x));let accepted=false;
    for(const alpha of [1,.5,.25,.125]){const trial=q.map((v,i)=>v+alpha*dq[i]),r=residual(trial);if(norm(r)<norm(res)){q=trial;res=r;accepted=true;break;}}
    if(!accepted)break;
  }
  const cs=controls(q),points:Array<{t:number;y:State;a:Vec3}>=[];let final=[...initial] as State;
  for(let i=0;i<cs.length;i++){
    const begin=start+i*dt,n=Math.ceil(dt/.25),h=dt/n;points.push({t:begin,y:[...final],a:cs[i]});
    for(let j=0;j<n;j++){final=landingStep(final,begin+j*h,h,cs[i],eph,isp);points.push({t:j+1===n?start+(i+1)*dt:begin+(j+1)*h,y:[...final],a:cs[i]});}
  }
  return {controls:cs,final,points,iterations,positionError:norm(sub(position(final),pf)),velocityError:norm(sub(velocity(final),vf))};
}
async function screenPoweredDescent(points:Array<{t:number;y:State;a:Vec3}>,c:Config,eph:Ephemeris,assets:Assets){
  const fixed=points.map(p=>eph.frames.toFixed(p.y,p.t)),coordinates=fixed.map(p=>latLon(position(p)));
  await assets.terrain.prepare(coordinates);
  const samples=points.map((p,i):Sample=>{
    const fp=position(fixed[i]),v=velocity(fixed[i]),vertical=dot(v,unit(fp)),e=assets.terrain.elevation(...coordinates[i]);
    const h=e.height===null?null:norm(fp)-R_MOON-e.height;
    return {time_s:p.t,phase:'POWERED_DESCENT',position_m:position(p.y),velocity_m_s:velocity(p.y),fixed_position_m:fp,altitude_m:h,speed_m_s:norm(v),horizontal_speed_m_s:Math.sqrt(Math.max(0,dot(v,v)-vertical**2)),vertical_speed_m_s:vertical,mass_kg:p.y[6],thrust_n:p.y[6]*norm(p.a),thrust_tilt_deg:norm(p.a)>1e-12?Math.acos(Math.max(-1,Math.min(1,dot(unit(p.a),unit(position(p.y))))))*180/Math.PI:null,distance_to_target_m:0};
  });
  return validateTerminalDescent(samples,c.constraints);
}
export interface LandingPlan {
  initial:State; start:number; landing:number; duration:number; parking:number; doiTime:number; pdiTime:number;
  doiDeltaV:number; poweredDuration:number; controls:Vec3[]; targetFixed:Vec3; desired:number[]; elevation:number;
  heading:number; phaseFactor:number; fuel:number; maxThrust:number; minThrust:number; final:State;
}
function thrustCosts(initialMass:number,controls:Vec3[],duration:number,isp:number){
  let m=initialMass,max=0,min=Infinity,dv=0;
  for(const a of controls){const magnitude=norm(a);max=Math.max(max,m*magnitude);const d=magnitude*duration/controls.length;dv+=d;m*=Math.exp(-d/(isp*G0));min=Math.min(min,m*magnitude);}
  return {finalMass:m,max,min,dv};
}
export async function planEphemerisLanding(c:Config,eph:Ephemeris,assets:Assets,landing:number,deadline:number,progress:(s:string)=>void){
  validateConfig(c);
  await assets.terrain.prepare([[c.target.latitude_deg,c.target.longitude_deg]]);
  const elevation=assets.terrain.elevation(c.target.latitude_deg,c.target.longitude_deg);
  if(elevation.height===null||elevation.source!=='LOLA_240M')throw new DataUnavailable('TERRAIN DATA UNAVAILABLE — precise landing targets require the supplied south-polar LOLA 240m DEM (75°S–90°S).');
  const targetFixed=surfacePosition(c.target.latitude_deg,c.target.longitude_deg,elevation.height),surface=eph.frames.toInertial([...add(targetFixed,scale(unit(targetFixed),TERMINAL_DESCENT_POLICY.center_to_contact_m)),0,0,0],landing);
  const radial=unit(position(surface)),desired=[...position(surface),...sub(velocity(surface),scale(radial,Math.min(.5,c.constraints.speed_tolerance_m_s*.25)))];
  const lat=c.target.latitude_deg*Math.PI/180,lon=c.target.longitude_deg*Math.PI/180,R=eph.frames.at(landing).r;
  const north=unit(matVec(R,[-Math.sin(lat)*Math.cos(lon),-Math.sin(lat)*Math.sin(lon),Math.cos(lat)])),east=unit(matVec(R,[-Math.sin(lon),Math.cos(lon),0]));
  const ra=R_MOON+c.orbit.altitude_km*1000,rp=R_MOON+c.orbit.pdi_altitude_km*1000,a=(ra+rp)/2,mu=eph.gm.moon;
  const circularSpeed=Math.sqrt(mu/ra),va=Math.sqrt(mu*(2/ra-1/a)),vp=Math.sqrt(mu*(2/rp-1/a)),coast=Math.PI*Math.sqrt(a**3/mu);
  const parking=(c.nrho?.parking_revolutions??0)*2*Math.PI*Math.sqrt(ra**3/mu),doiDeltaV=circularSpeed-va;
  const requestedDuration=c.nrho?.powered_descent_duration_s;
  if(requestedDuration!==undefined&&(!Number.isFinite(requestedDuration)||requestedDuration<260||requestedDuration>1200))throw new Error('Powered descent duration must be finite and between 260 and 1200 seconds.');
  const requestedHeading=c.nrho?.approach_heading_deg;
  if(requestedHeading!==undefined&&(!Number.isFinite(requestedHeading)||requestedHeading<0||requestedHeading>=360))throw new Error('Approach heading must be finite and between 0 inclusive and 360 exclusive degrees.');
  const headings=requestedHeading===undefined?[0,90,180,270]:[requestedHeading];
  const durations=requestedDuration===undefined?[440,560,700,880]:[requestedDuration];
  const candidates:LandingPlan[]=[],trials:Record<string,unknown>[]=[];
  for(const duration of durations)for(const heading of headings)for(const phaseFactor of [.6,4/7,.55]){
    budget(deadline);if(trials.length%6===0)progress(`Mode B 착륙 제어 계산 ${trials.length+1}/${durations.length*headings.length*3}`);
    try{
      const flight=parking+180+coast+duration,start=landing-flight; eph.at(start);
      const h=heading*Math.PI/180,tangent=add(scale(north,Math.cos(h)),scale(east,Math.sin(h))),beta=vp*duration/(2*rp)*phaseFactor;
      const periDirection=add(scale(radial,Math.cos(beta)),scale(tangent,-Math.sin(beta))),periTangent=add(scale(radial,Math.sin(beta)),scale(tangent,Math.cos(beta)));
      const apoDirection=scale(periDirection,-1),apoTangent=scale(periTangent,-1),theta=circularSpeed/ra*(parking+180);
      const r0=scale(add(scale(apoDirection,Math.cos(theta)),scale(apoTangent,-Math.sin(theta))),ra),v0=scale(add(scale(apoDirection,Math.sin(theta)),scale(apoTangent,Math.cos(theta))),circularSpeed);
      const initial:State=[...r0,...v0,c.lander.initial_mass_kg],opts={collect_samples:false,rtol:1e-12,max_step_s:20,collision_radius_m:0,deadline_ms:deadline};
      const doiTime=start+parking+180,pdiTime=doiTime+coast;
      const before=propagateEphemeris(initial,start,parking+180,eph,opts).final as State;
      const doi=propagateBurn(before,doiTime,scale(unit(velocity(before)),-doiDeltaV),c.lander,eph,opts);
      if(doi.burn.duration_s>=coast)throw new Error('Finite DOI overlaps powered descent.');
      const pdi=propagateEphemeris(doi.final,doiTime+doi.burn.duration_s,coast-doi.burn.duration_s,eph,opts).final as State;
      const shot=shoot(pdi,desired,pdiTime,duration,eph,c.lander.isp_s,deadline),cost=thrustCosts(pdi[6],shot.controls,duration,c.lander.isp_s);
      const terminal=await screenPoweredDescent(shot.points,c,eph,assets);
      const eligible=shot.positionError<.02&&shot.velocityError<.002&&cost.finalMass>=c.lander.dry_mass_kg&&cost.max<=c.lander.max_thrust_n&&cost.min>=c.lander.min_thrust_n;
      trials.push({duration_s:duration,heading_deg:heading,phase_factor:phaseFactor,position_error_m:shot.positionError,velocity_residual_m_s:shot.velocityError,max_thrust_n:cost.max,min_thrust_n:cost.min,final_mass_kg:cost.finalMass,engine_constraints_passed:eligible,terminal_validation:terminal.checks,terminal_constraints_passed:terminal.passed});
      if(terminal.passed&&(eligible||(c.nrho?.mass_basis==='nrho'&&shot.positionError<.02&&shot.velocityError<.002)))candidates.push({initial,start,landing,duration:flight,parking,doiTime,pdiTime,doiDeltaV,poweredDuration:duration,controls:shot.controls,targetFixed,desired,elevation:elevation.height,heading,phaseFactor,fuel:c.lander.initial_mass_kg-cost.finalMass,maxThrust:cost.max,minThrust:cost.min,final:shot.final});
    }catch(e){if(e instanceof DataUnavailable||/GRAVITY_DATA|GRAVITY_NUMERICS|TIME LIMIT|time budget|cancel/i.test(String(e)))throw e;trials.push({duration_s:duration,heading_deg:heading,error:String(e)});}
  }
  candidates.sort((a,b)=>c.objective==='time'?a.duration-b.duration||a.fuel-b.fuel:a.fuel-b.fuel||a.duration-b.duration);
  return {candidates,trials};
}

/** Replay from the actual post-insertion state; correct the powered controls for
 * its residual, with no position reset, then independently check full dense path. */
export async function replayEphemerisLanding(plan:LandingPlan,initial:State,c:Config,eph:Ephemeris,assets:Assets,deadline:number){
  let y=[...initial] as State,t=plan.start;const points:Array<{t:number;y:State;phase:string;thrust:number;acceleration:Vec3}>=[];
  const append=(phase:string,a:Vec3,force?:Vec3)=>points.push({t,y:[...y] as State,phase,thrust:force?norm(force):y[6]*norm(a),acceleration:force?scale(force,1/y[6]):a});
  const segment=(end:number,a:Vec3,phase:string,step:number,force?:Vec3)=>{
    append(phase,a,force);
    while(t<end-1e-7){budget(deadline);const dense=phase==='POWERED_DESCENT'||norm(position(y))-R_MOON<20000;const h=Math.min(end-t,step,dense?120/Math.max(1,norm(velocity(y))):step);y=landingStep(y,t,h,a,eph,c.lander.isp_s,force);t+=h;append(phase,a,force);}
  };
  const events:NonNullable<SimulationResult['events']>=[];
  if(plan.parking>0)segment(plan.start+plan.parking,ZERO,'PARKING',2);
  segment(plan.doiTime,ZERO,'CIRCULAR',2);
  const before=[...y] as State,dv=scale(unit(velocity(y)),-plan.doiDeltaV),doiStart=t;
  const doiDuration=burnDuration(y[6],plan.doiDeltaV,c.lander.max_thrust_n,c.lander.isp_s),doiForce=scale(unit(dv),c.lander.max_thrust_n);
  if(t+doiDuration>=plan.pdiTime)throw new Error('Finite DOI overlaps powered descent.');
  segment(t+doiDuration,ZERO,'DOI_BURN',.25,doiForce);
  const doiBurn:FiniteBurn={name:'DOI',start_s:doiStart,duration_s:doiDuration,thrust_vector_n:doiForce,thrust_n:c.lander.max_thrust_n,delta_v_m_s:plan.doiDeltaV,propellant_kg:before[6]-y[6],initial_state:before,final_state:[...y]};
  events.push({name:'DOI',phase:'DOI_BURN',time_s:doiStart,end_time_s:t,duration_s:doiDuration,burn_model:'finite',thrust_n:c.lander.max_thrust_n,fixed_position_m:position(eph.frames.toFixed(before,doiStart)),delta_v_m_s:norm(dv),propellant_kg:before[6]-y[6]});
  segment(plan.pdiTime,ZERO,'COAST',2);const pdi=[...y] as State;
  events.push({name:'PDI',phase:'POWERED_DESCENT',time_s:t,fixed_position_m:position(eph.frames.toFixed(y,t))});
  const shot=shoot(y,plan.desired,t,plan.poweredDuration,eph,c.lander.isp_s,deadline,plan.controls);
  const controls:Control[]=[];
  for(const a of shot.controls){const start=t,mass=y[6],end=plan.pdiTime+(controls.length+1)*plan.poweredDuration/SEGMENTS;segment(end,a,'POWERED_DESCENT',.25);controls.push({start_s:start,duration_s:end-start,acceleration_m_s2:a,thrust_start_n:mass*norm(a),thrust_end_n:y[6]*norm(a)});}
  const fixed=points.map(p=>eph.frames.toFixed(p.y,p.t)),coordinates=fixed.map(s=>latLon(position(s)));await assets.terrain.prepare(coordinates);
  let missing=0,collisions=0,coarse=0,minClearance=Infinity;
  const samples=points.map((p,i):Sample=>{const f=fixed[i],fp=position(f),fv=velocity(f),e=assets.terrain.elevation(...coordinates[i]),h=e.height===null?null:norm(fp)-R_MOON-e.height,vertical=dot(fv,unit(fp));
    if(h===null)missing++;else if(i<points.length-1){minClearance=Math.min(minClearance,h);if(h<-.02)collisions++;}if(e.source!=='LOLA_240M'&&norm(fp)-R_MOON<12000)coarse++;
    return {time_s:p.t,phase:p.phase,position_m:position(p.y),velocity_m_s:velocity(p.y),fixed_position_m:fp,altitude_m:h,speed_m_s:norm(fv),horizontal_speed_m_s:Math.sqrt(Math.max(0,dot(fv,fv)-vertical**2)),vertical_speed_m_s:vertical,mass_kg:p.y[6],thrust_n:p.thrust,distance_to_target_m:norm(sub(contactPoint(fp),plan.targetFixed)),contact_clearance_m:h===null?null:h-TERMINAL_DESCENT_POLICY.center_to_contact_m,thrust_tilt_deg:norm(p.acceleration)>1e-12?Math.acos(Math.max(-1,Math.min(1,dot(unit(p.acceleration),unit(position(p.y))))))*180/Math.PI:null};});
  const last=samples[samples.length-1],maxThrust=Math.max(...samples.map(s=>s.thrust_n)),minThrust=Math.min(...samples.filter(s=>s.phase==='POWERED_DESCENT'||s.phase==='DOI_BURN').map(s=>s.thrust_n));
  // Different step size, starting from the same actual PDI state, checks numerical error.
  let refined=pdi;for(let i=0;i<controls.length;i++)refined=integrateSegment(refined,controls[i].start_s,controls[i].duration_s,controls[i].acceleration_m_s2,eph,c.lander.isp_s,.125);
  // A different integrator checks the entire unpowered landing arc from the
  // same actual insertion state, carrying its errors through the finite DOI burn.
  const refinementOptions={rtol:3e-13,atol_position_m:1e-6,atol_velocity_m_s:1e-9,max_step_s:10,collect_samples:false,collision_radius_m:0,deadline_ms:deadline};
  const coastBefore=propagateEphemeris(initial,plan.start,plan.doiTime-plan.start,eph,refinementOptions).final as State;
  // Replay the exported force and duration, not a new target or impulse.
  const coastAfter=propagateEphemeris(coastBefore,plan.doiTime,doiDuration,eph,{...refinementOptions,thrust_n:doiForce,isp_s:c.lander.isp_s,max_step_s:.125}).final;
  const coastPdi=propagateEphemeris(coastAfter,plan.doiTime+doiDuration,plan.pdiTime-plan.doiTime-doiDuration,eph,refinementOptions).final;
  const coastPositionError=norm(sub(position(coastPdi),position(pdi))),coastVelocityError=norm(sub(velocity(coastPdi),velocity(pdi)));
  const terminal=validateTerminalDescent(samples,c.constraints);
  const checks={
    ...terminal.checks,
    position:{passed:last.distance_to_target_m<=c.constraints.position_tolerance_m,actual_m:last.distance_to_target_m,limit_m:c.constraints.position_tolerance_m},
    speed:{passed:last.speed_m_s<=c.constraints.speed_tolerance_m_s,actual_m_s:last.speed_m_s,limit_m_s:c.constraints.speed_tolerance_m_s},
    horizontal_speed:{passed:last.horizontal_speed_m_s<=c.constraints.horizontal_speed_tolerance_m_s,actual_m_s:last.horizontal_speed_m_s},
    mass:{passed:last.mass_kg>=c.lander.dry_mass_kg,final_kg:last.mass_kg,dry_kg:c.lander.dry_mass_kg},
    thrust:{passed:maxThrust<=c.lander.max_thrust_n+1e-6&&minThrust>=c.lander.min_thrust_n-1e-6,maximum_n:maxThrust,minimum_n:minThrust},
    terrain:{passed:missing===0&&collisions===0&&coarse===0,unavailable_samples:missing,collision_samples:collisions,low_resolution_below_12km:coarse,minimum_prelanding_clearance_m:minClearance,checked_samples:samples.length,sampling:'Powered descent and coast below 20 km: time step limited to 120 m / inertial speed; powered step <=0.25s, other coast <=2s. DEM grid is 240m, unresolved obstacles excluded.'},
    continuity:{passed:norm(sub(position(initial),position(plan.initial)))<=1,landing_start_position_error_m:norm(sub(position(initial),position(plan.initial))),position_was_reset:false},
    forward_propagation:{passed:coastPositionError<.05&&coastVelocityError<.0001&&norm(sub(position(refined),position(y)))<.01&&norm(sub(velocity(refined),velocity(y)))<.0001,coast_refined_position_difference_m:coastPositionError,coast_refined_velocity_difference_m_s:coastVelocityError,refined_endpoint_difference_m:norm(sub(position(refined),position(y))),refined_velocity_difference_m_s:norm(sub(velocity(refined),velocity(y))),method:'Coast: independent adaptive DOPRI from actual insertion through DOI. Powered descent: half-step RK4 from actual PDI.'}
  };
  if(Object.values(checks).every(v=>v.passed))events.push({name:'TOUCHDOWN',phase:'POWERED_DESCENT',time_s:t,fixed_position_m:contactPoint(position(eph.frames.toFixed(y,t))),contact_model:TERMINAL_DESCENT_POLICY.contact_model});
  const stride=Math.max(1,Math.ceil(samples.length/4000)),displayed=samples.filter((p,i)=>i===0||i===samples.length-1||i%stride===0||points[i-1]?.phase!==p.phase||points[i+1]?.phase!==p.phase);
  const cost=thrustCosts(pdi[6],shot.controls,plan.poweredDuration,c.lander.isp_s);
  return {samples:displayed,checks,valid:Object.values(checks).every(v=>v.passed),last,final:y,controls,events,poweredDeltaV:cost.dv,pdi,doiBurn};
}
