import type { Config, NRHOResult, Sample, SimulationResult } from '../../types';
import { DataUnavailable, latLon, type Assets } from '../data';
import { cross, dot, G0, norm, position, R_MOON, scale, sub, unit, velocity } from '../math';
import { normalizeNRHOSettings } from './settings';
import { Ephemeris } from './data';
import { propagateEphemeris } from './dynamics';
import { planEphemerisLanding, replayEphemerisLanding, type LandingPlan } from './landing';
import { solveEphemerisTransfer, type TransferSeedCandidate } from './transfer';
import { solveFiniteTransfer, type FiniteTransferResult } from './finiteBurn';
import { betterMission, interleaveHeadings, missionScore, type MissionCost } from './jointSearch';
import { CalculationTimeout, CalculationCancelled } from '../errors';
import { TERMINAL_DESCENT_POLICY } from './terminalDescent';
import { comparePoweredControls } from '../gravity/comparison';

export async function runEphemerisMission(input:Config,assets:Assets,eph:Ephemeris,progress:(message:string)=>void=()=>{}):Promise<SimulationResult & Record<string,unknown>> {
  const started=performance.now();
  const settings=normalizeNRHOSettings(input.nrho),c={...input,nrho:settings};
  const requested=settings.gravity_model??'point_mass';
  if(!['point_mass','grail'].includes(requested)||(requested==='grail')!==Boolean(eph.lunarGravity))throw new DataUnavailable('GRAVITY_DATA — requested lunar gravity model is not loaded. No model fallback is permitted.');
  if(eph.lunarGravity&&eph.lunarGravity.metadata.degree!==(settings.gravity_degree??30))throw new DataUnavailable('GRAVITY_DATA — requested harmonic degree differs from the loaded model.');
  const gravityMetadata=eph.lunarGravity?.metadata??{model:'point_mass' as const,degree:0,gm_m3_s2:eph.gm.moon,frame:'Moon-centered J2000 (spherical)'};
  const modelSummary=()=>({gravity_model:gravityMetadata.model,gravity_degree:gravityMetadata.degree,gravity_calls:eph.lunarGravity?.stats.calls??null,gravity_cpu_ms:eph.lunarGravity?.stats.cpu_ms??null,gravity_source:eph.lunarGravity?.metadata.source_url??'DE440 GM point mass',gravity_static_tides_omitted:true,mission_elapsed_ms:performance.now()-started});
  if(c.orbit.altitude_km!==100)throw new Error('NRHO integration currently targets the existing 100 km LLO mode.');
  if(![settings.transfer_tof_min_days,settings.transfer_tof_max_days,settings.max_transfer_delta_v_m_s,settings.parking_revolutions,settings.max_iterations,settings.max_computation_seconds].every(Number.isFinite))throw new Error('NRHO settings must be finite.');
  if(!(settings.transfer_tof_min_days>0&&settings.transfer_tof_max_days>=settings.transfer_tof_min_days&&settings.transfer_tof_max_days<=14))throw new Error('Transfer interval must satisfy 0 < minimum ≤ maximum ≤ 14 days.');
  if(settings.parking_revolutions<0||settings.parking_revolutions>5||!Number.isInteger(settings.max_iterations)||settings.max_iterations<1||settings.max_iterations>100||settings.max_computation_seconds<1||settings.max_computation_seconds>300)throw new Error('Parking: 0–5 revolutions; iterations: 1–100; computation limit: 1–300 s.');
  if(settings.max_transfer_delta_v_m_s<=0||settings.max_transfer_delta_v_m_s>20000||!['llo','nrho'].includes(settings.mass_basis)||!['delta_v','time','balanced'].includes(settings.objective))throw new Error('Unsupported NRHO setting.');
  const deadline=performance.now()+settings.max_computation_seconds*1000,landing=eph.landingTime(c.target.landing_time_utc);
  const searchDeadline=deadline-Math.max(3000,Math.min(15000,settings.max_computation_seconds*80));
  const fail=(status:string,message:string,extra:Record<string,unknown>={}):SimulationResult & Record<string,unknown>=>({status,message,trajectory:[],summary:modelSummary(),validation:{},input:c,reference:{mode:'EPHEMERIS',mode_b_implemented:true,epoch_utc:eph.data.epoch_utc,gravity:gravityMetadata,terminal_descent:TERMINAL_DESCENT_POLICY},...extra});
  const opts={rtol:2e-12,atol_position_m:1e-5,atol_velocity_m_s:1e-8,max_step_s:300,deadline_ms:deadline};
  const departureCache=new Map<number,number[]>();
  const departureState=(t:number)=>{
    if(t<eph.data.reference_coverage_s[0]||t>eph.data.reference_coverage_s[1])throw new DataUnavailable('EPHEMERIS REFERENCE COVERAGE — departure must lie within the supported dated NRHO reference interval.');
    let state=departureCache.get(t);if(!state){state=eph.referenceState(t);departureCache.set(t,state);}return state;
  };
  progress('유한 DOI를 포함한 착륙 후보 생성 · 전체 임무 공동 평가');
  const plans=await planEphemerisLanding(c,eph,assets,landing,deadline,progress),landingTrials=plans.trials;
  if(!plans.candidates.length){
    const rejected=landingTrials.find(r=>r.engine_constraints_passed&&r.terminal_constraints_passed===false);
    return fail(rejected?'LANDING CONSTRAINT VIOLATION':'NOT CONVERGED','No landing seed passed the shooting, engine and terminal descent constraints. This is not proof of physical impossibility.',{validation:rejected?.terminal_validation??{},landing_diagnostic:{status:'NOT CONVERGED',input:c,candidates:landingTrials,summary:{},validation:{}}});
  }
  type Replay=Awaited<ReturnType<typeof replayEphemerisLanding>>;
  type Best={plan:LandingPlan;transfer:FiniteTransferResult;replay:Replay;cost:MissionCost;row:Record<string,unknown>};
  let best:Best|undefined,timedOut=false,screened=0,attempted=0,validCount=0;
  const jointTrials:Record<string,unknown>[]=[],screening:Record<string,unknown>[]=[],queue:Array<{plan:LandingPlan;seed:TransferSeedCandidate}>=[];
  const grid=Array.from({length:settings.transfer_tof_min_days===settings.transfer_tof_max_days?1:9},(_,i)=>settings.transfer_tof_min_days+(settings.transfer_tof_max_days-settings.transfer_tof_min_days)*i/8);
  if(!plans.candidates.some(p=>grid.some(d=>eph.reference.supports(p.start-d*86400))))throw new DataUnavailable('EPHEMERIS REFERENCE COVERAGE — no supported departure date in the attempted grid.');
  const passes=grid.length===1?[grid]:[grid.filter((_,i)=>i%4===0),grid.filter((_,i)=>i%4!==0)];
  const evaluate=async(plan:LandingPlan,guess:TransferSeedCandidate)=>{
    if(performance.now()>=searchDeadline)throw new CalculationTimeout();
    attempted++;
    const row:Record<string,unknown>={heading_deg:plan.heading,phase_factor:plan.phaseFactor,powered_duration_s:plan.poweredDuration,branch:guess.branch,tof_days:guess.tof_s/86400,impulsive_seed_delta_v_m_s:guess.total_delta_v_m_s,validated:false};jointTrials.push(row);
    progress(`전체 임무 후보 ${attempted} · 접근 ${plan.heading}° · 유한 연소 재표적화`);
    const transfer=solveFiniteTransfer({ephemeris:eph,seed:guess,arrival_state:plan.initial.slice(0,6),arrival_time_s:plan.start,lander:c.lander,mass_basis:settings.mass_basis,max_delta_v_m_s:settings.max_transfer_delta_v_m_s,max_iterations:settings.max_iterations,deadline_ms:searchDeadline});
    row.status=transfer.status;row.message=transfer.message;row.transfer_validation=transfer.validation;
    if(transfer.status!=='TRANSFER VALIDATED')return;
    try{
      const actual=transfer.final_state!,replay=await replayEphemerisLanding(plan,actual,{...c,lander:{...c.lander,initial_mass_kg:actual[6]}},eph,assets,searchDeadline);
      const cost:MissionCost={totalDeltaV:transfer.total_delta_v_m_s+plan.doiDeltaV+replay.poweredDeltaV,totalFuel:transfer.initial_state![6]-replay.final[6],flightSeconds:landing-transfer.departure_time_s};
      Object.assign(row,{validated:replay.valid,total_delta_v_m_s:cost.totalDeltaV,total_fuel_kg:cost.totalFuel,flight_duration_s:cost.flightSeconds,score:missionScore(cost,settings.objective),landing_validation:replay.checks});
      if(!replay.valid)return;
      validCount++;if(!best||betterMission(cost,best.cost,settings.objective))best={plan,transfer,replay,cost,row};
    }catch(e){
      if(e instanceof CalculationTimeout||e instanceof CalculationCancelled||e instanceof DataUnavailable||/GRAVITY_DATA|GRAVITY_NUMERICS|TIME LIMIT|time budget/i.test(String(e)))throw e;
      row.status='LANDING NOT CONVERGED';row.message=String(e);
    }
  };
  try{
    // Evaluate one full mission per landing seed first. Remaining transfer seeds
    // are retained for a second pass; a failed candidate never ends the search.
    for(let round=0;round<passes.length;round++)for(const plan of interleaveHeadings(plans.candidates)){
      if(performance.now()>=searchDeadline)throw new CalculationTimeout();
      progress(`전체 임무 ${round===0?'넓은 범위 탐색':'전이 시간 세분화'} · 접근 ${plan.heading}°`);
      const transferSeeds=await solveEphemerisTransfer({ephemeris:eph,departureState,arrival_state:plan.initial.slice(0,6),arrival_time_s:plan.start,tof_days:[settings.transfer_tof_min_days,settings.transfer_tof_max_days],tof_values_days:passes[round],max_delta_v_m_s:settings.max_transfer_delta_v_m_s,max_iterations:settings.max_iterations,deadline_ms:searchDeadline,objective:settings.objective,position_tolerance_m:.05});
      if(round===0)screened++;screening.push({round,heading_deg:plan.heading,phase_factor:plan.phaseFactor,powered_duration_s:plan.poweredDuration,candidates:transferSeeds.candidates});
      const guesses=transferSeeds.seeds??[];
      if(guesses.length){queue.push(...guesses.slice(1).map(seed=>({plan,seed})));await evaluate(plan,guesses[0]);}
      if(transferSeeds.timed_out)throw new CalculationTimeout();
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    const estimate=(item:typeof queue[number])=>missionScore({totalDeltaV:item.seed.total_delta_v_m_s+c.lander.isp_s*G0*Math.log(c.lander.initial_mass_kg/item.plan.final[6]),totalFuel:0,flightSeconds:landing-item.seed.departure_time_s},settings.objective);
    queue.sort((a,b)=>estimate(a)-estimate(b));
    while(queue.length){const next=queue.shift()!;await evaluate(next.plan,next.seed);await new Promise<void>(resolve=>setTimeout(resolve,0));}
  }catch(e){
    if(e instanceof CalculationCancelled)throw e;
    if(e instanceof CalculationTimeout||/TIME LIMIT|time budget/i.test(String(e)))timedOut=true;else throw e;
  }
  const jointDiagnostic={objective:settings.objective,score_definition:settings.objective==='time'?'Complete flight duration in seconds':settings.objective==='balanced'?'All-burn delta-V + 100 m/s per complete-flight day':'All-burn characteristic delta-V',transfer_grid_days:grid,search_order:'All headings, coarse flight-time grid first; remaining grid times second; remaining converged seeds last',landing_candidates:plans.candidates.length,landing_candidates_screened:screened,seed_batches_evaluated:screening.length,finite_candidates_attempted:attempted,validated_candidates:validCount,search_complete:!timedOut,search_timed_out:timedOut,global_optimality_proven:false,candidates:jointTrials,seed_screening:screening};
  if(!best){
    const rejected=jointTrials.find(r=>r.landing_validation&&['terminal_descent','low_altitude_speed','thrust_tilt','contact'].some(k=>(r.landing_validation as Record<string,{passed:boolean}>)[k]?.passed===false));
    return fail(rejected?'LANDING CONSTRAINT VIOLATION':'TRANSFER NOT CONVERGED',`${timedOut?'Time budget reached. ':''}${rejected?'TERMINAL DESCENT CONSTRAINTS — computed landing candidates violate the low-altitude speed, thrust tilt or contact envelope.':'No complete finite-burn mission passed the checks in the attempted candidate set.'} This is not proof of physical impossibility.`,{joint_search:jointDiagnostic,landing_diagnostic:{candidates:landingTrials},validation:rejected?.landing_validation??{}});
  }
  const {plan,transfer,replay}=best,after=transfer.final_state!,initialMass=transfer.initial_state![6],insertionMass=after[6],lloMass=settings.mass_basis==='llo'?c.lander.initial_mass_kg:insertionMass;
  const dv0=transfer.burns[0].delta_v_m_s,dv1=transfer.burns[1].delta_v_m_s,transferMass=transfer.burns[0].final_state[6];
  progress(`검증된 전체 임무 ${validCount}개 중 선택 · 연속 상태 및 결과 확인`);
  const preDuration=10800,departure=transfer.departure_time_s!,start=departure-preDuration;
  const referenceSegment=eph.reference.segmentAt(departure);
  const seed={epoch_utc:eph.utc(departure),epoch_et:eph.data.epoch_et+departure,epoch_t_s:departure,state:eph.referenceState(departure),source_url:eph.reference.data.source_url,method:'NASA SPK type-9 direct lookup',source_priority:referenceSegment.source_priority};
  const precursor=propagateEphemeris(transfer.initial_state!,departure,-preDuration,eph,opts);
  const referenceDifference=norm(sub(position(seed.state),position(transfer.initial_state!)));
  const referenceVelocityDifference=norm(seed.state.slice(3,6).map((v,i)=>v-transfer.initial_state![i+3]));
  const sample=(state:number[],t:number,phase:string,mass:number):Sample=>{const fixed=eph.frames.toFixed(state,t),p=position(fixed),v=velocity(fixed),vertical=dot(v,unit(p));return {time_s:t-start,phase,position_m:position(state),velocity_m_s:velocity(state),fixed_position_m:p,altitude_m:norm(p)-R_MOON,speed_m_s:norm(v),horizontal_speed_m_s:Math.sqrt(Math.max(0,dot(v,v)-vertical**2)),vertical_speed_m_s:vertical,mass_kg:mass,thrust_n:0,distance_to_target_m:norm(sub(p,plan!.targetFixed))};};
  const trajectory=[...[...precursor.samples].reverse().map(p=>sample(p.state,p.t,'NRHO',initialMass)),...transfer.samples.map(p=>({...sample(p.state,p.t,p.phase,p.state[6]),thrust_n:p.thrust_n})),...replay.samples.map(p=>({...p,time_s:p.time_s-start}))];
  const referenceTrace=propagateEphemeris(seed.state,seed.epoch_t_s,Math.min(6.5*86400,eph.data.reference_coverage_s[1]-seed.epoch_t_s),eph,{...opts,max_step_s:600});
  const referencePath=referenceTrace.samples.map(p=>position(eph.frames.toFixed(p.state,p.t))),radii=referenceTrace.samples.map(p=>norm(position(p.state))-R_MOON);
  const actualR=position(after),actualV=velocity(after),h=cross(actualR,actualV),targetH=cross(position(plan.initial),velocity(plan.initial));
  const eccentricity=norm(sub(scale(cross(actualV,h),1/eph.gm.moon),unit(actualR))),planeError=Math.atan2(norm(cross(h,targetH)),dot(h,targetH));
  const insertionCheck={passed:norm(sub(actualR,position(plan.initial)))<=.05&&norm(sub(actualV,velocity(plan.initial)))<1e-5&&eccentricity<1e-6&&Math.abs(norm(actualR)-R_MOON-100000)<.1,position_error_m:norm(sub(actualR,position(plan.initial))),velocity_error_m_s:norm(sub(actualV,velocity(plan.initial))),eccentricity,plane_error_rad:planeError,altitude_m:norm(actualR)-R_MOON,position_was_reset:false,velocity_was_reset:false};
  const fuelCheck={passed:Math.abs(insertionMass-lloMass)<.001&&trajectory.every(p=>p.mass_kg>=c.lander.dry_mass_kg),initial_nrho_mass_kg:initialMass,after_departure_mass_kg:transferMass,after_insertion_mass_kg:insertionMass,final_mass_kg:replay.last.mass_kg,departure_propellant_kg:initialMass-transferMass,insertion_propellant_kg:transferMass-insertionMass,landing_propellant_kg:insertionMass-replay.last.mass_kg,mass_continuity_error_kg:Math.abs(insertionMass-lloMass)};
  const checks={...replay.checks,ephemeris_coverage:{passed:start>=eph.coverage[0]&&landing<=eph.coverage[1],start_utc:eph.utc(start),end_utc:eph.utc(landing),coverage_utc:eph.data.coverage_utc},nrho_reference:{passed:referenceDifference<1e-6&&referenceVelocityDifference<1e-9,departure_handoff_position_error_m:referenceDifference,departure_handoff_velocity_error_m_s:referenceVelocityDifference,source:'NASA SPK type-9 at departure time + DE440 Earth-to-Moon origin translation; source interpolation independently checked during preprocessing.',source_priority:referenceSegment.source_priority,source_segment_s:[referenceSegment.start_s,referenceSegment.end_s]},nrho_coast:{passed:precursor.stats.min_moon_distance_m>R_MOON+12000,minimum_altitude_m:precursor.stats.min_moon_distance_m-R_MOON},transfer_coast:{...transfer.validation,passed:transfer.status==='TRANSFER VALIDATED'},llo_insertion:insertionCheck,total_fuel:fuelCheck};
  const burns=[...transfer.burns,replay.doiBurn];
  const finiteChecks={passed:burns.every((b,i)=>b.duration_s>=0&&b.thrust_n<=c.lander.max_thrust_n+1e-6&&(b.duration_s===0||b.thrust_n>=c.lander.min_thrust_n-1e-6)&&b.final_state[6]>=c.lander.dry_mass_kg&&(!i||burns[i-1].start_s+burns[i-1].duration_s<=b.start_s+1e-7))&&replay.doiBurn.start_s+replay.doiBurn.duration_s<plan.pdiTime,model:'finite_constant_thrust_v1',burn_count:burns.length,maximum_thrust_n:Math.max(...burns.map(b=>b.thrust_n)),position_and_velocity_jumps:false,attitude_dynamics_included:false};
  const selectedScore=missionScore(best.cost,settings.objective);
  const allChecks={...checks,finite_burns:finiteChecks,joint_selection:{passed:jointTrials.filter(r=>r.validated).every(r=>Number(r.score)>=selectedScore-1e-8),validated_candidates:validCount,scope:'Best fully validated mission among attempted finite candidates, not proof of global optimum'}};
  const validated=Object.values(allChecks).every(v=>v.passed);
  const bodyPath=trajectory.filter((_,i)=>i%Math.max(1,Math.floor(trajectory.length/500))===0||i===trajectory.length-1).map(p=>({time_s:p.time_s,...eph.bodyFixed(p.time_s+start)}));
  const nrho:NRHOResult={mode:'EPHEMERIS',gravity:gravityMetadata,mass_basis:settings.mass_basis,ephemeris:{epoch_utc:eph.data.epoch_utc,coverage_utc:eph.data.coverage_utc,reference_epoch_utc:seed.epoch_utc},
    source:{reference_id:'nasa-nrho-type9-direct',label:'NASA design reference at departure UTC · integrated coast preview',api_url:seed.source_url,signature_version:'ephemeris-v2'},reference_path_fixed_m:referencePath,
    system:{...eph.bodyFixed(start),earth_radius_m:eph.data.earth_radius_m,body_path:bodyPath},transfer:{status:transfer.status,departure_time_s:preDuration,arrival_time_s:plan.start-start,duration_s:transfer.tof_s,departure_delta_v_m_s:dv0,insertion_delta_v_m_s:dv1,position_error_m:insertionCheck.position_error_m,velocity_error_m_s:insertionCheck.velocity_error_m_s,parking_duration_s:plan.parking}};
  const [lat,lon]=latLon(replay.last.fixed_position_m);
  const comparison=validated?comparePoweredControls(c,eph,replay.pdi,replay.controls,replay.final,deadline):{};
  return {status:validated?'VALIDATED':'NUMERICALLY CONVERGED',message:validated?'선택한 달 중력장과 날짜별 지구·태양 중력으로 전이부터 접지까지 계산해 모델 검증 조건을 충족했습니다.':'날짜 기반 경로의 수치 계산은 완료했지만 전체 착륙 검증을 통과하지 못했습니다.',input:c,trajectory:validated?trajectory:[],nrho,target:{...c.target,elevation_m:plan.elevation,fixed_position_m:plan.targetFixed},terrain:await assets.terrain.roi(c.target.latitude_deg,c.target.longitude_deg),
    summary:{...modelSummary(),...comparison,landing_success:validated,landing_position_error_m:replay.last.distance_to_target_m,touchdown_velocity_m_s:replay.last.speed_m_s,horizontal_touchdown_velocity_m_s:replay.last.horizontal_speed_m_s,contact_clearance_m:replay.last.contact_clearance_m??null,touchdown_thrust_tilt_deg:replay.last.thrust_tilt_deg??null,vertical_touchdown_velocity_m_s:replay.last.vertical_speed_m_s,actual_latitude_deg:lat,actual_longitude_deg:lon,doi_delta_v_m_s:plan.doiDeltaV,powered_descent_delta_v_m_s:replay.poweredDeltaV,total_delta_v_m_s:best.cost.totalDeltaV,propellant_consumed_kg:best.cost.totalFuel,remaining_propellant_kg:replay.last.mass_kg-c.lander.dry_mass_kg,initial_nrho_mass_kg:initialMass,llo_initial_mass_kg:insertionMass,final_mass_kg:replay.last.mass_kg,maximum_thrust_n:Math.max(replay.checks.thrust.maximum_n,finiteChecks.maximum_thrust_n),flight_duration_s:landing-start,transfer_duration_s:transfer.tof_s,parking_duration_s:plan.parking,nrho_coast_duration_s:preDuration,departure_delta_v_m_s:dv0,insertion_delta_v_m_s:dv1,departure_utc:eph.utc(departure),llo_insertion_utc:eph.utc(plan.start),landing_time_utc:eph.utc(landing),global_optimality_proven:false,transfer_search_timed_out:timedOut,joint_search_complete:!timedOut,joint_candidates_evaluated:attempted,joint_candidates_validated:validCount,selected_heading_deg:plan.heading,propulsion_model:'finite_constant_thrust_v1',powered_descent_duration_s:plan.poweredDuration,descent_guidance:'early_braking_quintic_seed_96_controls',departure_burn_duration_s:burns[0].duration_s,insertion_burn_duration_s:burns[1].duration_s,doi_burn_duration_s:burns[2].duration_s},
    validation:allChecks,events:[...transfer.burns.map(b=>({name:b.name,phase:b.name==='NRHO_DEPARTURE'?'DEPARTURE_BURN':'INSERTION_BURN',time_s:b.start_s-start,end_time_s:b.start_s+b.duration_s-start,duration_s:b.duration_s,burn_model:'finite',thrust_n:b.thrust_n,fixed_position_m:position(eph.frames.toFixed(b.initial_state,b.start_s)),delta_v_m_s:b.delta_v_m_s,propellant_kg:b.propellant_kg})),...replay.events.map(e=>({...e,time_s:e.time_s-start,...(typeof e.end_time_s==='number'?{end_time_s:e.end_time_s-start}:{})}))],
    finite_burns:burns.map(b=>({...b,start_s:b.start_s-start})),joint_search:{...jointDiagnostic,selected_candidate:best.row},
    controls:replay.controls.map(control=>({...control,start_s:control.start_s-start})),transfer_diagnostic:transfer,landing_diagnostic:{candidates:landingTrials},
    replay_initial:{post_insertion_state_m_m_s_kg:after,arrival_et_offset_s:plan.start,final_state_m_m_s_kg:replay.final,doi_et_offset_s:plan.doiTime,pdi_et_offset_s:plan.pdiTime,doi_delta_v_m_s:plan.doiDeltaV,pdi_state_m_m_s_kg:replay.pdi},
    reference:{mode:'EPHEMERIS',mode_b_implemented:true,gravity:gravityMetadata,terminal_descent:TERMINAL_DESCENT_POLICY,inertial_frame:'Moon-centered J2000 axes',surface_frame:eph.data.fixed_frame,time:'ET/TDB seconds internally; UTC converted using packaged SPICE mapping',epoch_utc:eph.data.epoch_utc,epoch_et:eph.data.epoch_et,start_time_utc:eph.utc(start),start_et_offset_s:start,landing_time_utc:eph.utc(landing),controls_time_origin:'Full mission start',dynamics:`${eph.lunarGravity?`GL1800F degree ${gravityMetadata.degree} DE440 PA full lunar gravity`:'Lunar point mass'} + differential Earth/Sun point masses from DE440 for ALL phases; finite constant thrust for departure/insertion/DOI, piecewise acceleration for descent, and integrated mass flow`,units:'metres, seconds, kilograms, newtons',gm_m3_s2:eph.gm,departure_state_source:'NASA SPK type-9 direct lookup',reference_seed:seed,reference_preview_kind:'Numerically integrated free coast from departure; not the source SPK path',reference_preview_span_s:referenceTrace.samples.at(-1)!.t-seed.epoch_t_s,reference_preview_minimum_altitude_m:Math.min(...radii),reference_preview_maximum_altitude_m:Math.max(...radii)},
    warnings:['Terminal envelope demo-terminal-v1 uses assumed limits and a 2 m radial contact proxy. It does not validate attitude dynamics, landing legs, slopes or unresolved obstacles.','MODE B — departure position/velocity read directly from the NASA design NRHO SPK subset at departure UTC; not an operational Gateway ephemeris.','The source includes other forces and maintenance maneuvers. Only the departure state is imported; the displayed 3-hour pre-departure coast and free-coast preview are numerical model propagations, and no source samples replace integrated post-departure states.','Departure, insertion and DOI integrate finite maximum-thrust burns with fixed inertial direction and variable mass. Attitude, slew, ignition transients, navigation uncertainty and operational certification remain outside this model.',...(timedOut?['Joint search reached its time budget; this is the best fully validated mission found, not an exhausted search or a global optimum.']:[]),...(eph.lunarGravity?['GL1800F is a truncated static measured gravity model. Degree 2/3 permanent tides are excluded in the source; small numerical residuals do not establish actual landing accuracy.']:['Point-mass baseline excludes lunar gravity harmonics.']),'Reference preview extrema are extrema of the computed time window, not a proof of periodicity.','LOLA terrain validation is limited to the supplied 240 m south-polar DEM.']};
}
