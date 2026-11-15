import messages from './en.json';
export type OrbitLanguage = 'ko' | 'en';
const dictionary: Record<string, string> = messages;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const literals = Object.keys(dictionary).filter(k => !/\{\d+\}/.test(k)).sort((a,b)=>b.length-a.length);
const partials = new RegExp(literals.map(escape).join('|'), 'g');
const templates = Object.entries(dictionary).filter(([k])=>/\{\d+\}/.test(k)).sort(([a],[b])=>b.length-a.length).map(([key,value]) => {
  const ids: string[]=[];
  const parts=key.split(/(\{\d+\})/g).map(p=>{if(/^\{\d+\}$/.test(p)){ids.push(p);return '(.*?)';}return escape(p);});
  return {pattern:new RegExp('^'+parts.join('')+'$'),value,ids};
});
export function translateOrbit(text: string, lang: OrbitLanguage, depth = 0): string {
  if(lang==='ko'||!/[가-힣]/.test(text))return text;
  const source=text.replace(/\s+/g,' ').trim();
  let out=dictionary[source];
  if(!out && depth<4){for(const t of templates){const match=t.pattern.exec(source);if(match){out=t.value.replace(/\{\d+\}/g,k=>translateOrbit(match[t.ids.indexOf(k)+1]??k,lang,depth+1));break;}}}
  out??=source.replace(partials,k=>dictionary[k]);
  return (text.match(/^\s*/)?.[0]??'')+out+(text.match(/\s*$/)?.[0]??'');
}
