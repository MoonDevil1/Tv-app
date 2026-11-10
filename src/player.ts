import shaka from 'shaka-player';
import type {Channel} from './types';
export async function playChannel(video:HTMLVideoElement,channel:Channel,onError:(message:string)=>void){
 shaka.polyfill.installAll(); if(!shaka.Player.isBrowserSupported()){onError('This device does not support the required media formats.');return null;}
 const player=new shaka.Player(); await player.attach(video);
 if(Object.keys(channel.headers).length)player.getNetworkingEngine()?.registerRequestFilter((type,request)=>{for(const [k,v] of Object.entries(channel.headers))request.headers[k]=v;});
 if(channel.licenseUrl){const systems:Record<string,string>={'com.widevine.alpha':channel.licenseUrl,'com.microsoft.playready':channel.licenseUrl,'com.apple.fps.1_0':channel.licenseUrl};const type=(channel.licenseType||'').toLowerCase();const key=type.includes('widevine')?'com.widevine.alpha':type.includes('playready')?'com.microsoft.playready':type.includes('fairplay')?'com.apple.fps.1_0':'com.widevine.alpha';player.configure({drm:{servers:{[key]:channel.licenseUrl}}});}
 try{await player.load(channel.url);}catch(e:any){onError(e?.message||'Unable to play this channel. The stream may be offline or require unsupported access.');}
 return player;
}