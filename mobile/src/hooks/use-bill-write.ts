import { useEffect, useMemo, useRef, useState } from "react";
import { File } from "expo-file-system";
import { uuid } from "expo";
import { router, usePreventRemove } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileBillReceipt } from "../../../shared/mobile-bills";
import type { PreparedPhoto } from "@/lib/prepare-photo";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";

export function useBillWrite(id: string, dirty: boolean, returnToRenewal = false, collection = false, returnToCollection = false, backfill=false) {
  const {api,session}=useSession(),cache=useQueryClient();
  const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileBillReceipt|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false),token=useRef(session?.token);
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,
    // Scope primitives stay stable during same-scope session revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api,session?.user.id,session?.user.storeId,session?.user.allStores]);
  const operation=`${collection?"payment":"renewal"}.bill:${id}`;
  const findReceipt=(pending:string)=>collection?api!.collectionBillReceipt(pending):api!.billReceipt(pending);
  useEffect(()=>{token.current=session?.token;},[session?.token]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const disablePrevention=usePreventRemove(!receipt&&(dirty||busy||!!key),({repeat})=>setExit(()=>repeat));
  const current=(at:string|undefined)=>alive.current&&at===token.current;
  function accept(found:MobileBillReceipt){
    if(found.id!==Number(id))throw Error("Bill trả về không khớp hợp đồng. Giữ mã để đối chiếu.");
    setReceipt(found);
    void cache.invalidateQueries({queryKey:["renewal-preparation"]});
    void cache.invalidateQueries({queryKey:["renewal-bill"]});
    void cache.invalidateQueries({queryKey:["renewal-collection-bill"]});
    void cache.invalidateQueries({queryKey:["renewal-collection"]});
  }
  useEffect(()=>{
    let cancelled=false;const at=token.current;
    async function recover(){
      if(!api||!scope)return;
      try{
        const previous=await pendingWrites.lookup(scope,operation);
        if(cancelled||!current(at))return;
        setKey(previous);
        if(previous){const found=await findReceipt(previous);if(cancelled||!current(at))return;
          if(found.receipt)accept(found.receipt);else setNotice("Có lần lưu bill chưa rõ kết quả. Đối chiếu trước khi chọn hoặc gửi ảnh khác.");}
      }catch(cause){if(!cancelled&&current(at))setError((cause as Error).message);}
      finally{if(!cancelled&&current(at))setChecked(true);}
    }
    void recover();return()=>{cancelled=true;};
    // The parent is keyed by authentication/scope/grants/resource.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[api,scope,operation]);
  async function submit(photo:PreparedPhoto,version:number,revision:string,expectedPhotoRevision:string|null){
    if(!api||!scope||!checked||running.current||key||receipt)return;
    running.current=true;setBusy(true);setError("");setNotice("");const at=token.current;
    try{
      const pending=await pendingWrites.reserve(scope,operation,()=>uuid.v4().toLowerCase());
      if(!current(at))return;
      setKey(pending);
      const bytes=await new File(photo.uri).arrayBuffer();
      if(!current(at))return;
      if(bytes.byteLength!==photo.size||bytes.byteLength>2*1024*1024)throw Error("Ảnh chuẩn bị đã thay đổi. Đối chiếu mã rồi chọn lại ảnh.");
      const saved=await (collection?api.uploadCollectionBill(id,version,revision,expectedPhotoRevision,bytes,pending):api.uploadRenewalBill(id,version,revision,expectedPhotoRevision,bytes,pending,backfill));
      if(current(at))accept(saved);
    }catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve(){
    if(!api||!scope||!key||running.current||receipt)return;
    running.current=true;setChecking(true);setError("");setNotice("");const at=token.current,previous=key;
    try{
      const result=await api.resolveWrite(previous,operation);if(!current(at))return;
      if(result.status==="committed"){
        const found=await findReceipt(previous);if(!current(at))return;
        if(!found.receipt)throw Error("Máy chủ đã ghi nhưng chưa trả được bill. Giữ mã để kiểm tra lại.");
        accept(found.receipt);
      }else{
        await pendingWrites.complete(scope,operation,previous);if(!current(at))return;
        setKey(null);setNotice("Máy chủ xác nhận chưa lưu ảnh và đã khóa mã cũ. Ảnh đang chọn được giữ để rà soát lại.");
        void cache.invalidateQueries({queryKey:["renewal-preparation"]});void cache.invalidateQueries({queryKey:["renewal-bill"]});
        void cache.invalidateQueries({queryKey:["renewal-collection"]});void cache.invalidateQueries({queryKey:["renewal-collection-bill"]});
      }
    }catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setChecking(false);}
  }
  async function acknowledge(){
    if(!scope||!key||!receipt||running.current)return;
    running.current=true;setChecking(true);setError("");const at=token.current;
    try{await pendingWrites.complete(scope,operation,key);if(!current(at))return;disablePrevention();
      if(collection&&returnToCollection)router.dismissTo({pathname:"/renewal-payment/[id]",params:{id,version:String(receipt.version)}});
      else if(collection)router.dismissTo({pathname:"/finance/[id]",params:{id}});
      else if(returnToRenewal)router.dismissTo({pathname:"/renewal/[id]",params:{id,...(backfill?{backfill:"1"}:{})}});
      else router.dismissTo({pathname:"/record/[kind]/[id]",params:{kind:"contracts",id}});
    }catch(cause){if(current(at))setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setChecking(false);}
  }
  return{checked,busy,checking,key,receipt,error,notice,exit,submit,resolve,acknowledge,
    dismissExit:()=>setExit(null),leave:()=>{const repeat=exit;disablePrevention();setExit(null);repeat?.();}};
}
