import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { useTheme } from '@/theme';
import { Button } from './ui';
import { MOBILE_MAX_VIDEO_BYTES } from '../../../shared/mobile-video';

export function RecordVideoPlayer({source,label,onReady}:{source:VideoSource;label:string;onReady?:(ready:boolean,duration:number)=>void}) {
  if(Platform.OS==='web'&&typeof source==='object'&&source?.uri&&source.headers?.Authorization)return <WebProtectedVideo uri={source.uri} authorization={source.headers.Authorization} label={label} onReady={onReady}/>;
  return <Player source={source} label={label} onReady={onReady}/>;
}
function WebProtectedVideo({uri,authorization,label,onReady}:{uri:string;authorization:string;label:string;onReady?:(ready:boolean,duration:number)=>void}) {
  const theme=useTheme(),[local,setLocal]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let url='';
    async function read(){
      try{
        const response=await fetch(uri,{headers:{Authorization:authorization},credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});
        if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='video/mp4'||!response.body)throw Error('Invalid video');
        const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
        try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MOBILE_MAX_VIDEO_BYTES){await reader.cancel();throw Error('Video too large');}chunks.push(new Uint8Array(part.value));}}finally{reader.releaseLock();}
        const length=response.headers.get('content-length');if(!size||length!==null&&Number(length)!==size)throw Error('Incomplete video');
        if(controller.signal.aborted)return;url=URL.createObjectURL(new Blob(chunks,{type:'video/mp4'}));setLocal(url);setFailed(false);
      }catch{if(!controller.signal.aborted){setFailed(true);onReady?.(false,0);}}
    }
    void read();return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
    // Parent mounts a fresh player for every record/photo revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[uri,authorization]);
  if(!local)return <Text style={{color:failed?theme.danger:theme.muted,fontSize:15}}>{failed?'Chưa tải được video. Tải lại để thử lại.':'Đang tải video có xác thực…'}</Text>;
  return <Player source={{uri:local,useCaching:false}} label={label} onReady={onReady}/>;
}
function Player({source,label,onReady}:{source:VideoSource;label:string;onReady?:(ready:boolean,duration:number)=>void}) {
  const theme=useTheme(), [started,setStarted]=useState(false), [ended,setEnded]=useState(false);
  const player=useVideoPlayer(source,p=>{p.loop=false;p.staysActiveInBackground=false;p.showNowPlayingNotification=false;});
  const {status}=useEvent(player,'statusChange',{status:player.status});
  const loaded=useEvent(player,'sourceLoad');
  useEventListener(player,'playToEnd',()=>setEnded(true));
  useEventListener(player,'sourceChange',()=>setEnded(false));
  // Android SDK58 maps a successfully ended clip to idle. The reviewed local
  // file remains usable and replayable until its source changes or an error.
  const playable=status==='readyToPlay'||ended&&status==='idle';
  const readyCallback=useRef(onReady);
  useEffect(()=>{readyCallback.current=onReady;},[onReady]);
  useEffect(()=>{readyCallback.current?.(playable,loaded?.duration??player.duration);},[playable,loaded?.duration,player]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active'){try{player.pause();}catch{}}});return()=>sub.remove();},[player]);
  useFocusEffect(useCallback(()=>()=>{try{player.pause();}catch{}},[player]));
  return <View style={{gap:10}}>
    <VideoView player={player} accessibilityLabel={label} style={{width:'100%',height:240,backgroundColor:'#111827',borderRadius:12}} contentFit="contain" nativeControls allowsPictureInPicture={false}/>
    {status==='error'&&<Text accessibilityLiveRegion="polite" style={{color:theme.danger,fontSize:15}}>Chưa phát được video. Tải lại tệp hoặc chọn video khác.</Text>}
    {status==='loading'&&<Text style={{color:theme.muted,fontSize:15}}>Đang đọc video…</Text>}
    <Button secondary label={started?'Phát lại video':'Phát video để kiểm tra'} disabled={!playable} onPress={()=>{setEnded(false);player.replay();setStarted(true);}}/>
  </View>;
}
