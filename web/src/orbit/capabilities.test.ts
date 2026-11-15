import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const caps=JSON.parse(readFileSync('../orbit/frontend/public/integration/capabilities.json','utf8'));
beforeEach(()=>vi.resetModules());afterEach(()=>vi.unstubAllGlobals());
const ok=()=>new Response(JSON.stringify(caps),{status:200});
it('deduplicates concurrent portal metadata consumers',async()=>{
 const fetcher=vi.fn(async()=>ok());vi.stubGlobal('fetch',fetcher);
 const m=await import('./capabilities');await Promise.all([m.loadCapabilities(),m.loadCapabilities(),m.loadCapabilities()]);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(m.useCapabilityState.getState().caps).toEqual(caps);
});
it('retry replaces an initial HTTP error and clears shared stale errors',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('temporary',{status:503})).mockResolvedValueOnce(ok());vi.stubGlobal('fetch',fetcher);
 const m=await import('./capabilities');await m.loadCapabilities();expect(m.useCapabilityState.getState().error).toContain('503');
 await m.retryCapabilities();expect(fetcher).toHaveBeenCalledTimes(2);expect(m.useCapabilityState.getState()).toEqual({caps,error:null});
});
it('an obsolete failed request cannot overwrite a successful retry',async()=>{
 let finish!:(r:Response)=>void;const old=new Promise<Response>(resolve=>{finish=resolve;});
 vi.stubGlobal('fetch',vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(ok()));
 const m=await import('./capabilities');const initial=m.loadCapabilities();await Promise.resolve();await m.retryCapabilities();
 finish(new Response('late error',{status:503}));await initial;expect(m.useCapabilityState.getState()).toEqual({caps,error:null});
});
