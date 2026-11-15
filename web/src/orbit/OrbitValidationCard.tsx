import { Card, Help } from '../components/kit';
import { useOrbitRun, orbitStatus } from '../state/orbitRun';
import { record } from './model';
export default function OrbitValidationCard(){
  const run=useOrbitRun();
  const checks=run.result&&record(run.result.validation)?Object.entries(run.result.validation):[];
  return <Card title="궤도 임무 검증 · Mode B" sub={orbitStatus(run)}>
    {run.input&&<p className="small mono">{run.input.target.landing_time_utc} · {run.input.target.latitude_deg}°, {run.input.target.longitude_deg}° · {run.input.nrho?.gravity_model} {run.input.nrho?.gravity_degree}</p>}
    {checks.length?<><table><thead><tr><th>검사</th><th>결과</th></tr></thead><tbody>{checks.map(([key,v])=><tr key={key}><td>{key}</td><td>{record(v)&&v.passed===true?'PASS':'NOT PASSED'}</td></tr>)}</tbody></table><details><summary>실행 입력·검증 원본</summary><pre style={{overflow:'auto',maxHeight:400}}>{JSON.stringify({input:run.input,buildId:run.buildId,validation:run.result?.validation,warnings:run.result?.warnings},null,2)}</pre></details></>:<p className="small">현재 계획의 궤도 검증 결과가 없습니다. 05에서 계산하세요.</p>}
    <Help>표면 일조·통신 평가는 궤도 검증과 별도입니다. NASA 자료를 사용한 수치 모델이며 실제 운용 인증을 뜻하지 않습니다.</Help>
  </Card>;
}
