import {useEffect,useRef,useState} from 'react';
import {uuid} from 'expo';
import {useSession} from '@/providers/session';
import {identityQrMessage,type IdentityQrScan} from '../../../shared/identity-qr';
import {EditorSheet} from './editor-sheet';
export function IdentityQrScanner({onScan,onClose}:{onScan:(scan:IdentityQrScan)=>void;onClose:()=>void}){
  const {api}=useSession(),[nonce]=useState(()=>uuid.v4().toLowerCase()),frame=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{const receive=(event:MessageEvent)=>{
    if(event.origin!==api!.origin||event.source!==frame.current?.contentWindow)return;
    const scan=identityQrMessage(event.data,nonce);if(scan){onScan(scan);onClose();}
  };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[api,nonce,onScan,onClose]);
  return <EditorSheet title="Quét QR căn cước" onClose={onClose}>
    <iframe ref={frame} title="Camera quét QR căn cước" src={api!.origin+'/mobile-identity-qr#'+nonce} allow="camera" style={{flex:1,border:0,width:'100%'}}/>
  </EditorSheet>;
}
