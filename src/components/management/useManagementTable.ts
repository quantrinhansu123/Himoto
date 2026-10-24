'use client';
import { useEffect, useRef, useState } from 'react';
import { requestManagementTable, managementTableQuery,managementStatisticsKey, type ManagementTableInput, type ManagementTableResult } from '@/lib/management/management-table';

type CacheEntry={data:ManagementTableResult;at:number;statisticsAt:number};
const caches=new WeakMap<object,Map<string,CacheEntry>>();
const fresh=(entry:CacheEntry|undefined)=>Boolean(entry&&Date.now()-entry.at<30000&&Date.now()-entry.statisticsAt<30000);
export function useManagementTable(input:ManagementTableInput,enabled:boolean,revision:unknown,ownershipStores:number[]) {
  const serialized=managementTableQuery(input).toString();
  let cache:Map<string,CacheEntry>|undefined;
  if(revision&&typeof revision==='object'){cache=caches.get(revision);if(!cache){cache=new Map();caches.set(revision,cache);}}
  const cached=cache?.get(serialized),initial=cached&&fresh(cached)?cached.data:null;
  // A response belongs to one filter/page only. Never show the previous tab's rows
  // under a newly selected tab, including during the search debounce.
  const [state,setState]=useState<{key:string;data:ManagementTableResult|null;pending:boolean;error:string}>(()=>({key:serialized,data:initial,pending:enabled&&!initial,error:''}));
  const [retry,setRetry]=useState(0);
  const current=useRef({input,ownershipStores});current.current={input,ownershipStores};
  const [query,setQuery]=useState(serialized);
  useEffect(()=>{
    if(serialized===query)return;
    const previous=new URLSearchParams(query),next=new URLSearchParams(serialized);
    previous.delete('search');next.delete('search');
    // Only typing is delayed; switching tabs and pages takes effect immediately.
    if(previous.toString()!==next.toString()){setQuery(serialized);return;}
    const timer=setTimeout(()=>setQuery(serialized),input.query.search?250:0);return()=>clearTimeout(timer);
  },[serialized,query,input.query.search]);
  useEffect(()=>{
    if(!enabled||query!==serialized)return;
    const controller=new AbortController();
    const previous=cache?.get(query);
    if(previous&&fresh(previous)){setState({key:query,data:previous.data,pending:false,error:''});return;}
    setState(old=>({key:query,data:old.key===query?old.data:null,pending:true,error:''}));
    let statistics:CacheEntry|undefined;
    if(input.kind==='contracts'&&cache){const key=managementStatisticsKey(query);for(const [other,entry] of cache)if(Date.now()-entry.statisticsAt<30000&&managementStatisticsKey(other)===key&&(!statistics||entry.statisticsAt>statistics.statisticsAt))statistics=entry;}
    void requestManagementTable(current.current.input,controller.signal,false,current.current.ownershipStores,statistics?.data).then(value=>{if(!controller.signal.aborted){setState({key:query,data:value,pending:false,error:''});cache?.set(query,{data:value,at:Date.now(),statisticsAt:statistics&&value.total===statistics.data.total?statistics.statisticsAt:Date.now()});if(cache&&cache.size>20)cache.delete(cache.keys().next().value!);}})
      .catch(cause=>{if(!controller.signal.aborted)setState(old=>({key:query,data:old.key===query?old.data:null,pending:false,error:cause instanceof Error?cause.message:'Không tải được danh sách.'}));});
    return()=>controller.abort();
  },[enabled,query,serialized,revision,retry,cache,input.kind]);
  const data=state.key===serialized?state.data:initial;
  const error=state.key===serialized?state.error:'';
  return {data,loading:enabled&&!data&&!error,refreshing:state.key===serialized&&state.pending&&Boolean(data),error,refresh:()=>{cache?.clear();setRetry(value=>value+1);},exportAll:()=>requestManagementTable(current.current.input,undefined,true,current.current.ownershipStores)};
}
