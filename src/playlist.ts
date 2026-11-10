import type {Channel} from './types';
export const PLAYLIST_URL='https://livetgtv.lovable.app/api/public/playlist.m3u';
export function parsePlaylist(source:string):Channel[]{
 const lines=source.replace(/^\\uFEFF/,'').split(/\\r?\\n/); const out:Channel[]=[]; let meta:any=null; let headers:Record<string,string>={}; let licenseUrl:string|undefined,licenseType:string|undefined,drmSystem:string|undefined;
 const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"');
 for(const raw of lines){const line=raw.trim(); if(!line)continue;
  if(line.startsWith('#EXTINF:')){const attrs:Record<string,string>={}; for(const m of line.matchAll(/([\\w-]+)="([^"]*)"/g))attrs[m[1]]=decode(m[2]); const name=line.slice(line.lastIndexOf(',')+1).trim()||attrs['tvg-name']||'Unknown channel'; meta={name,logo:attrs['tvg-logo']||'',group:attrs['group-title']||'Other'}; headers={};licenseUrl=undefined;licenseType=undefined;drmSystem=undefined;continue;}
  if(line.startsWith('#EXTVLCOPT:http-')){const m=line.match(/^#EXTVLCOPT:http-(.+?)=(.*)$/i);if(m)headers[m[1].toLowerCase().replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decode(m[2]);continue;}
  if(line.startsWith('#EXTHTTP:')){try{const h=JSON.parse(line.slice(9));if(h&&typeof h==='object')headers={...headers,...h};}catch{}continue;}
  if(line.startsWith('#KODIPROP:')){const v=line.slice(10),i=v.indexOf('=');if(i>0){const k=v.slice(0,i),val=decode(v.slice(i+1));if(k==='inputstream.adaptive.license_key')licenseUrl=val; if(k==='inputstream.adaptive.license_type')licenseType=val;if(k==='inputstream.adaptive.manifest_type')drmSystem=val;}continue;}
  if(line.startsWith('#'))continue;
  if(meta){const url=decode(line);out.push({id:url+'|'+meta.name,name:meta.name,logo:meta.logo,group:meta.group,url,headers:{...headers},licenseUrl,licenseType,drmSystem});meta=null;}
 }
 return out;
}