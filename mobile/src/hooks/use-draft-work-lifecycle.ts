import {useEffect,useRef} from 'react';
import {AppState} from 'react-native';

/** AppState saves are local only; they never reserve a UUID or call business APIs. */
export function useDraftWorkLifecycle(enabled:boolean,prepare:()=>Promise<void>,onFailure:(cause:unknown)=>void,onSaved?:(state:string)=>void){
  const callbacks=useRef({prepare,onFailure,onSaved});
  useEffect(()=>{callbacks.current={prepare,onFailure,onSaved};},[prepare,onFailure,onSaved]);
  useEffect(()=>{
    if(!enabled)return;let alive=true;
    const subscription=AppState.addEventListener('change',state=>{
      if(state==='active')return;const at=callbacks.current;
      void at.prepare().then(()=>{if(alive)at.onSaved?.(state);}).catch(cause=>{if(alive)at.onFailure(cause);});
    });
    return()=>{alive=false;subscription.remove();};
  },[enabled]);
}
