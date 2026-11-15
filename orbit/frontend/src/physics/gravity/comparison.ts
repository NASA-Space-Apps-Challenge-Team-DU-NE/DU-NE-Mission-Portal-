import type { Config, Vec3 } from '../../types';
import { Ephemeris } from '../ephemeris/data';
import { propagateEphemeris } from '../ephemeris/dynamics';
import { norm, sub } from '../math';
import type { Control } from '../simulator';

/** A diagnostic, not another landing solution: identical actual PDI state and
 * identical inertial acceleration commands, compared at the same final epoch.
 * Only harmonics are removed; GM, Earth/Sun and frames remain identical.
 * No trajectory is emitted and terrain/contact is not certified for this replay. */
export function comparePoweredControls(config:Config,eph:Ephemeris,pdi:number[],controls:Control[],final:number[],deadline:number):Record<string,number|string|boolean|null>{
  if(!eph.lunarGravity || eph.lunarGravity.metadata.degree===0)return {};
  if(deadline-performance.now()<1000)return {gravity_same_controls_status:'not_run_budget',gravity_same_controls_scope:'PDI to fixed final epoch; not a contact/terrain validation'};
  const baseline=new Ephemeris({...eph.data,gm:{...eph.gm}});
  const started=performance.now(),diagnosticDeadline=Math.min(deadline-500,started+1500);let state=[...pdi];
  try{
    for(const control of controls)state=propagateEphemeris(state,control.start_s,control.duration_s,baseline,{acceleration_m_s2:control.acceleration_m_s2,isp_s:config.lander.isp_s,rtol:3e-13,atol_position_m:1e-6,atol_velocity_m_s:1e-9,max_step_s:1,collision_radius_m:0,collect_samples:false,deadline_ms:diagnosticDeadline}).final;
    return {gravity_same_controls_status:'computed',gravity_same_controls_scope:'Same actual PDI state and inertial acceleration commands; compared at the GRAIL final epoch, not at a separately detected surface contact.',gravity_same_controls_baseline:'GL1800F GM degree 0 + same Earth/Sun',gravity_same_controls_baseline_gm_m3_s2:eph.gm.moon,gravity_same_controls_position_difference_m:norm(sub(state.slice(0,3) as Vec3,final.slice(0,3) as Vec3)),gravity_same_controls_velocity_difference_m_s:norm(sub(state.slice(3,6) as Vec3,final.slice(3,6) as Vec3)),gravity_same_controls_mass_difference_kg:Math.abs(state[6]-final[6]),gravity_same_controls_elapsed_ms:performance.now()-started,gravity_same_controls_terrain_validated:false};
  }catch(e){return {gravity_same_controls_status:'not_completed',gravity_same_controls_message:String(e),gravity_same_controls_terrain_validated:false};}
}
