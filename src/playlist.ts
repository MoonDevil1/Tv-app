import type {Channel} from './types';
export const PLAYLIST_URL='https://livetgtv.lovable.app/api/public/playlist.m3u';
export function parsePlaylist(source:string):Channel[]{
 const lines=source.replace(/^\uFEFF/,'').split(/\r?\n/);const out:Channel[]=[];
 let meta:{name:string;logo:string;group:string}|null=null,headers:Record<string,string>={},licenseUrl:string|undefined,licenseType:string|undefined,drmSystem:string|undefined;
 const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
 for(const raw of lines){const line=raw.trim();if(!line)continue;
  if(line.startsWith('#EXTINF:')){
   const attrs:Record<string,string>={};for(const m of line.matchAll(/([\w-]+)="([^"]*)"/g))attrs[m[1]]=decode(m[2]);
   const comma=line.indexOf(',');const display=comma>=0?line.slice(comma+1).trim():'';
   meta={name:display||attrs['tvg-name']||'Unknown channel',logo:attrs['tvg-logo']||'',group:attrs['group-title']||'Other'};
   headers={};licenseUrl=undefined;licenseType=undefined;drmSystem=undefined;continue;
  }
  if(line.startsWith('#EXTVLCOPT:http-')){const m=line.match(/^#EXTVLCOPT:http-(.+?)=(.*)$/i);if(m){const key=m[1].toLowerCase();const names:Record<string,string>={'user-agent':'User-Agent','referer':'Referer','referrer':'Referer','origin':'Origin','cookie':'Cookie','authorization':'Authorization'};headers[names[key]||key.replace(/(^|-)([a-z])/g,(_,a,b)=>b.toUpperCase())]=decode(m[2]);}continue;}
  if(line.startsWith('#EXTHTTP:')){try{const h=JSON.parse(line.slice(9));if(h&&typeof h==='object')headers={...headers,...h};}catch{}continue;}
  if(line.startsWith('#KODIPROP:')){const v=line.slice(10),i=v.indexOf('=');if(i>0){const k=v.slice(0,i),val=decode(v.slice(i+1));if(k==='inputstream.adaptive.license_key')licenseUrl=val;if(k==='inputstream.adaptive.license_type')licenseType=val;if(k==='inputstream.adaptive.manifest_type')drmSystem=val;}continue;}
  if(line.startsWith('#'))continue;
  if(meta){const url=decode(line);out.push({id:url+'|'+meta.name,name:meta.name,logo:meta.logo,group:meta.group,url,headers:{...headers},licenseUrl,licenseType,drmSystem});meta=null;}
 }
 return out;
}