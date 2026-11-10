import shaka from 'shaka-player';
import type {Channel} from './types';
export async function playChannel(video:HTMLVideoElement,channel:Channel,onError:(message:string)=>void,lowMemory=true){
 shaka.polyfill.installAll();
 if(!shaka.Player.isBrowserSupported()){onError('This device does not support the required media formats.');return null;}
 const player=new shaka.Player();await player.attach(video);
 player.configure({
  abr:{enabled:true,defaultBandwidthEstimate:1200000,bandwidthUpgradeTarget:0.85,bandwidthDowngradeTarget:0.95},
  streaming:{bufferingGoal:lowMemory?8:15,rebufferingGoal:lowMemory?2:3,bufferBehind:lowMemory?12:25,segmentPrefetchLimit:0,disableVideoPrefetch:true,disableAudioPrefetch:true,disableTextPrefetch:true,retryParameters:{maxAttempts:3,baseDelay:700,backoffFactor:2}},
  manifest:{retryParameters:{maxAttempts:2,baseDelay:700}}
 });
 if(Object.keys(channel.headers).length)player.getNetworkingEngine()?.registerRequestFilter((_type,request)=>{for(const [k,v] of Object.entries(channel.headers))request.headers[k]=v;});
 if(channel.licenseUrl){const type=(channel.licenseType||'').toLowerCase();const key=type.includes('playready')?'com.microsoft.playready':type.includes('fairplay')?'com.apple.fps.1_0':'com.widevine.alpha';player.configure({drm:{servers:{[key]:channel.licenseUrl}}});}
 try{await player.load(channel.url);}catch(e:any){await player.destroy();onError(e?.message||'Unable to play this channel. It may be offline, blocked by CORS, or require unsupported DRM.');return null;}
 return player;
}