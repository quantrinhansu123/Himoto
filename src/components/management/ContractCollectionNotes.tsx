'use client';

import { createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { COLLECTION_FOLLOWUP_SAVED,CONTACT_STATUSES,HANDLING_STATUSES,loadCollectionFollowups,type CollectionFollowup } from '@/lib/management/collection-report';
import type { ManagementRow } from '@/lib/management/types';
import { useManagement } from './ManagementProvider';
import { CollectionNoteField } from './CollectionNoteField';

type Context={followups:Map<number,CollectionFollowup>;loaded:boolean;error:string;refresh:()=>void;saved:(id:number,followup:CollectionFollowup)=>void;editing:(id:number,editing:boolean)=>void};
const NotesContext=createContext<Context|null>(null);
export function ContractCollectionNotesProvider({rows,enabled,children}:{rows:ManagementRow[];enabled:boolean;children:ReactNode}) {
  const ids=enabled?rows.map(row=>row.id).join(','):'';
  const [state,setState]=useState<{ids:string;rows:Map<number,CollectionFollowup>}>({ids:'',rows:new Map()}),[error,setError]=useState(''),[version,setVersion]=useState(0);
  const drafts=useRef(new Set<number>());
  const refresh=useCallback(()=>setVersion(v=>v+1),[]);
  const saved=useCallback((id:number,followup:CollectionFollowup)=>setState(current=>({...current,rows:new Map(current.rows).set(id,followup)})),[]);
  const editing=useCallback((id:number,editing:boolean)=>{if(editing)drafts.current.add(id);else drafts.current.delete(id);},[]);
  useEffect(()=>{
    if(!ids)return;
    const controller=new AbortController();setError('');
    void loadCollectionFollowups(ids.split(',').map(Number),controller.signal).then(result=>{if(!controller.signal.aborted)setState({ids,rows:new Map(result.map(row=>[row.id,row.followup]))});})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được ghi chú.');});
    return()=>controller.abort();
  },[ids,rows,version]);
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<{id:number;followup:CollectionFollowup}>).detail;if(detail)saved(detail.id,detail.followup);};
    const unload=(event:BeforeUnloadEvent)=>{if(drafts.current.size){event.preventDefault();event.returnValue='';}};
    window.addEventListener(COLLECTION_FOLLOWUP_SAVED,update);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener(COLLECTION_FOLLOWUP_SAVED,update);window.removeEventListener('beforeunload',unload);};
  },[saved]);
  return <NotesContext.Provider value={{followups:state.ids===ids?state.rows:new Map(),loaded:state.ids===ids,error,refresh,saved,editing}}>{children}</NotesContext.Provider>;
}

export function ContractCollectionNote({row}:{row:ManagementRow}) {
  const notes=useContext(NotesContext),{can}=useManagement();
  const followup=notes?.followups.get(row.id);
  if(!notes)return null;
  if(!followup)return <div className="mg-contract-collection-note">{notes.error||notes.loaded?<><p role="alert">{notes.error||'Không đọc được ghi chú hợp đồng. Tải lại để kiểm tra.'}</p><button type="button" className="mg-button" onClick={notes.refresh}>Tải lại ghi chú</button></>:<span role="status">Đang tải ghi chú…</span>}</div>;
  return <div className="mg-contract-collection-note">
    {(followup.customer_condition||followup.contact_status!=='uncontacted'||followup.handling_status!=='branch')&&<p className="mg-contract-followup-status">{[followup.customer_condition,CONTACT_STATUSES[followup.contact_status],HANDLING_STATUSES[followup.handling_status]].filter(Boolean).join(' · ')}</p>}
    <CollectionNoteField row={{id:row.id,code:row.code,followup}} editable={can('contracts.draft')} onSaved={notes.saved} onRefresh={notes.refresh} onEditingChange={notes.editing}/>
  </div>;
}
