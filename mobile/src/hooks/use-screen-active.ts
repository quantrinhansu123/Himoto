import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
/** App foreground and route focus are independent for mounted stack screens. */
export function useScreenActive(){
  const[focused,setFocused]=useState(false),[foreground,setForeground]=useState(AppState.currentState==='active');
  useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));
  useEffect(()=>{const sub=AppState.addEventListener('change',value=>setForeground(value==='active'));return()=>sub.remove();},[]);
  return focused&&foreground;
}
