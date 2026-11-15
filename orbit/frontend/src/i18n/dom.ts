import { translateOrbit, type OrbitLanguage } from './translate';
let language: OrbitLanguage = 'ko';
let started = false;
const original = new WeakMap<Text, string>(), rendered = new WeakMap<Text, string>();
const attributes = new WeakMap<Element, Map<string, { original: string; rendered: string }>>();
const names = ['title','aria-label','placeholder'];
function skipped(el: Element | null) { return !!el?.closest('script,style,pre,code,[data-no-translate]'); }
function update(node: Node) {
  if(node.nodeType===Node.TEXT_NODE){
    const text=node as Text;if(skipped(text.parentElement))return;
    const current=text.data, source=rendered.get(text)===current?original.get(text)??current:current;
    original.set(text,source);const value=translateOrbit(source,language);rendered.set(text,value);if(value!==current)text.data=value;
  } else if(node instanceof Element && !skipped(node)) {
    let values=attributes.get(node);if(!values){values=new Map();attributes.set(node,values);}
    for(const name of names){const current=node.getAttribute(name);if(current===null)continue;const old=values.get(name),source=old?.rendered===current?old.original:current,value=translateOrbit(source,language);values.set(name,{original:source,rendered:value});if(value!==current)node.setAttribute(name,value);}
  }
}
function walk(node: Node){update(node);const iterator=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);for(let child=iterator.nextNode();child;child=iterator.nextNode())update(child);}
export function setOrbitLanguage(value: unknown){
  if(value!=='en'&&value!=='ko')return;
  language=value;document.documentElement.lang=value;walk(document.body);
}
export function startOrbitI18n(){
  if(started)return;started=true;
  try {setOrbitLanguage(localStorage.getItem('dune.lang')==='ko'?'ko':'en');}catch{setOrbitLanguage('en');}
  new MutationObserver(changes=>{for(const change of changes){if(change.type==='childList')change.addedNodes.forEach(walk);else update(change.target);}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:names});
}
