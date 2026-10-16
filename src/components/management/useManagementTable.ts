'use client';
import { useEffect, useRef, useState } from 'react';
import { requestManagementTable, managementTableQuery, type ManagementTableInput, type ManagementTableResult } from '@/lib/management/management-table';

const caches=new WeakMap<object,Map<string,{data:ManagementTableResult;at:number}>>();
export function useManagementTable(input:ManagementTableInput,enabled:boolean,revision:unknown,ownershipStores:number[]) {
  const serialized=managementTableQuery(input).toString();
  let cache:Map<string,{data:ManagementTableResult;at:number}>|undefined;
  if(revision&&typeof revision==='object'){cache=caches.get(revision);if(!cache){cache=new Map();caches.set(revision,cache);}}
  const cached=cache?.get(serialized),initial=cached&&Date.now()-cached.at<30000?cached.data:null;
  const [data,setData]=useState<ManagementTableResult|null>(initial),[loading,setLoading]=useState(enabled&&!initial),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const current=useRef({input,ownershipStores});current.current={input,ownershipStores};
  const [query,setQuery]=useState(serialized);
  useEffect(()=>{if(serialized===query)return;const timer=setTimeout(()=>setQuery(serialized),input.query.search?250:0);return()=>clearTimeout(timer);},[serialized,query,input.query.search]);
  useEffect(()=>{
    if(!enabled)return;const controller=new AbortController();setLoading(true);setError('');
    if(query!==serialized)return()=>controller.abort();
    const previous=cache?.get(query);if(previous&&Date.now()-previous.at<30000){setData(previous.data);setLoading(false);return()=>controller.abort();}
    void requestManagementTable(current.current.input,controller.signal,false,current.current.ownershipStores).then(value=>{if(!controller.signal.aborted){setData(value);cache?.set(query,{data:value,at:Date.now()});if(cache&&cache.size>20)cache.delete(cache.keys().next().value!);}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được danh sách.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[enabled,query,serialized,revision,retry,cache]);
  return {data,loading,error,refresh:()=>{cache?.delete(serialized);setRetry(value=>value+1);},exportAll:()=>requestManagementTable(current.current.input,undefined,true,current.current.ownershipStores)};
}
