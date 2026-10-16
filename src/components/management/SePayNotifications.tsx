'use client';
import { useEffect,useRef,useState } from 'react';
import { useManagement } from './ManagementProvider';
import { formatMoney } from '@/lib/formatters';
type PaymentEvent={id:string|number;mode:string;status:string;amount:string|number;code:string;message:string};
export function SePayNotifications(){
  const {can,notify,invalidateData}=useManagement();const enabled=can('contracts.read')||can('finance.read');
  const [sound,setSound]=useState(false),audio=useRef<AudioContext|null>(null),version=useRef<number|null>(null);
  useEffect(()=>{if(!enabled)return;const controller=new AbortController();let running=false;
    const poll=async()=>{if(running||document.visibilityState==='hidden')return;running=true;try{const response=await fetch(`/api/auth/payment-events?after=${version.current??0}`,{cache:'no-store',signal:controller.signal});if(!response.ok)return;const body=await response.json();if(!Array.isArray(body.data)||controller.signal.aborted)return;
      const rows=body.data as PaymentEvent[],old=version.current;version.current=Math.max(version.current||0,...rows.map(row=>Number(row.id)));
      if(old===null)return;
      const received=rows.filter(row=>['matched','simulated'].includes(row.status));if(!received.length)return;
      const row=received[0];notify(`${row.mode==='test'?'Demo SePay':'Đã nhận tiền'}: ${formatMoney(Number(row.amount))} · HĐ ${row.code}${received.length>1?` và ${received.length-1} giao dịch khác`:''}`);
      if(received.some(row=>row.mode==='live'))invalidateData(['contracts']);
      if(sound&&audio.current?.state==='running'){const oscillator=audio.current.createOscillator(),gain=audio.current.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(880,audio.current.currentTime);gain.gain.setValueAtTime(0.08,audio.current.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audio.current.currentTime+0.5);oscillator.connect(gain);gain.connect(audio.current.destination);oscillator.start();oscillator.stop(audio.current.currentTime+0.5);}
    }catch{/* Retry automatically after a network interruption. */}finally{running=false;}};
    void poll();const timer=setInterval(()=>void poll(),4000);return()=>{controller.abort();clearInterval(timer);};
  },[enabled,sound,notify,invalidateData]);
  if(!enabled)return null;
  return <button type="button" className="mg-button mg-sepay-sound" aria-pressed={sound} onClick={()=>{if(!sound){audio.current??=new AudioContext();void audio.current.resume();}setSound(!sound);}}>{sound?'Âm báo tiền: bật':'Bật âm báo tiền'}</button>;
}
