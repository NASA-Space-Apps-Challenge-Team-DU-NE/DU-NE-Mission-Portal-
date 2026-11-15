import { defaultMission } from '../../../orbit/frontend/src/defaultMission';
import { parseConfig, configKey, type Capabilities, type Config } from '../../../orbit/frontend/src/integration/contract';
export { BRIDGE, parseCapabilities, parseConfig, configKey, isEnvelope, resultIsValidated, record } from '../../../orbit/frontend/src/integration/contract';
export type { Capabilities, Config, SimulationResult, Envelope } from '../../../orbit/frontend/src/integration/contract';
export type OrbitSettings = Pick<Config,'nrho'|'orbit'|'constraints'|'objective'>;
export const ORBIT_DEFAULT=defaultMission();
export const orbitDefaults=():OrbitSettings=>structuredClone({nrho:ORBIT_DEFAULT.nrho,orbit:ORBIT_DEFAULT.orbit,constraints:ORBIT_DEFAULT.constraints,objective:ORBIT_DEFAULT.objective});
export interface Propulsion { dry_mass_kg:number; prop_mass_kg:number; thrust_n:number; min_thrust_n:number; isp_s:number }
export const defaultPropulsion=():Propulsion=>({dry_mass_kg:ORBIT_DEFAULT.lander.dry_mass_kg,prop_mass_kg:ORBIT_DEFAULT.lander.initial_mass_kg-ORBIT_DEFAULT.lander.dry_mass_kg,thrust_n:ORBIT_DEFAULT.lander.max_thrust_n,min_thrust_n:ORBIT_DEFAULT.lander.min_thrust_n,isp_s:ORBIT_DEFAULT.lander.isp_s});
export function makeOrbitConfig(site:{lat_deg:number;lon_deg:number}|null, landing:number, ex:Propulsion, settings:OrbitSettings):Config {
  if(!site)throw new Error('02에서 계획 착륙지를 선택하세요.');
  if(!Number.isFinite(landing))throw new Error('유효한 UTC 착륙 시각이 필요합니다.');
  return {initial_orbit:'nrho',...structuredClone(settings),target:{latitude_deg:site.lat_deg,longitude_deg:site.lon_deg,landing_time_utc:new Date(landing).toISOString()},lander:{initial_mass_kg:ex.dry_mass_kg+ex.prop_mass_kg,dry_mass_kg:ex.dry_mass_kg,max_thrust_n:ex.thrust_n,min_thrust_n:ex.min_thrust_n,isp_s:ex.isp_s}};
}
export function validateOrbitPlan(config:Config,caps:Capabilities){return parseConfig(config,caps);}
export function inputIdentity(config:Config|null){return config?configKey(config):'no-plan';}
