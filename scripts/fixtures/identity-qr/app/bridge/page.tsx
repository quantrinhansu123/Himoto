'use client';
import {useEffect,useState} from 'react';
export default function BridgeFixture(){
  const [received,setReceived]=useState('');
  useEffect(()=>{const handler=(event:MessageEvent)=>{if(event.origin===location.origin)setReceived(event.data);};window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler);},[]);
  return <><iframe title="Bộ quét QR QA" src="/mobile-identity-qr#00000000-0000-4000-8000-000000000001" style={{height:700,width:370}}/><pre aria-label="QR đã nhận">{received}</pre></>;
}
