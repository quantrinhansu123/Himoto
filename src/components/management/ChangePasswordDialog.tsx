'use client';
import { useState,type FormEvent } from 'react';
import { Dialog } from './Dialog';

export function ChangePasswordDialog({onClose,onChanged}:{onClose:()=>void;onChanged:()=>void}){
  const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [visible,setVisible]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
  async function save(event:FormEvent){
    event.preventDefault();if(saving)return;
    if(password!==confirmation){setError('Nhập lại mật khẩu mới chưa khớp.');return;}
    setSaving(true);setError('');
    try{
      const response=await fetch('/api/auth/password',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password:current,new_password:password,confirmation})});
      const body=await response.json();if(!response.ok||body.status!=='success')throw Error(body.message||'Chưa đổi được mật khẩu.');
      setCurrent('');setPassword('');setConfirmation('');onChanged();
    }catch(cause){setError(cause instanceof Error?cause.message:'Chưa đổi được mật khẩu.');}finally{setSaving(false);}
  }
  return <Dialog title="Đổi mật khẩu của tôi" onClose={()=>{if(!saving)onClose();}}><form onSubmit={save}><div className="mg-dialog-body"><div className="mg-form-grid">
    <div className="mg-field mg-field-wide"><label htmlFor="self-current-password">Mật khẩu hiện tại</label><input id="self-current-password" type={visible?'text':'password'} autoComplete="current-password" required maxLength={256} value={current} disabled={saving} onChange={e=>setCurrent(e.target.value)}/></div>
    <div className="mg-field mg-field-wide"><label htmlFor="self-new-password">Mật khẩu mới</label><input id="self-new-password" type={visible?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={72} value={password} disabled={saving} onChange={e=>setPassword(e.target.value)}/><small>Dùng ít nhất 8 ký tự.</small></div>
    <div className="mg-field mg-field-wide"><label htmlFor="self-confirm-password">Nhập lại mật khẩu mới</label><input id="self-confirm-password" type={visible?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} disabled={saving} onChange={e=>setConfirmation(e.target.value)}/></div>
    <label className="mg-checkbox"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/>Hiện mật khẩu đang nhập</label>
    <p className="mg-reminder-help">Sau khi đổi, các phiên đăng nhập khác sẽ hết hiệu lực.</p>
    <p className="mg-reminder-help">Mật khẩu được cập nhật vào bảng quản lý tài khoản; chỉ quanlyvanhanh và quantri được xem để hỗ trợ khôi phục.</p>
  </div>{error&&<p className="mg-field-error" role="alert">{error}</p>}</div><div className="mg-dialog-footer"><button className="mg-button" type="button" disabled={saving} onClick={onClose}>Hủy</button><button className="mg-button mg-button-primary" disabled={saving}>{saving?'Đang đổi…':'Lưu mật khẩu mới'}</button></div></form></Dialog>;
}
