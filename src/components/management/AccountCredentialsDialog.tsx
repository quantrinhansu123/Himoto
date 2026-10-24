'use client';
import { useState } from 'react';
import type { IssuedAccountCredentials } from '@/lib/management/accounts';
import { Dialog } from './Dialog';

export function AccountCredentialsDialog({value,onClose}:{value:IssuedAccountCredentials;onClose:()=>void}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  const text=`Tài khoản: ${value.login_name}\nMật khẩu: ${value.password}\nĐăng nhập: https://himoto.vercel.app/login\n${value.enabled?'Đã được phép đăng nhập.':'Chờ quản lý phân cơ sở/mở quyền đăng nhập.'}`;
  return <Dialog title="Tài khoản nhân sự vừa tạo" onClose={onClose}><div className="mg-dialog-body">
    <p>Lưu thông tin để bàn giao cho nhân viên. Mật khẩu chỉ hiển thị ở lần cấp này.</p>
    <div className="mg-form-grid"><div className="mg-field"><label htmlFor="issued-login">Tài khoản</label><input id="issued-login" value={value.login_name} readOnly/></div>
      <div className="mg-field"><label htmlFor="issued-password">Mật khẩu đã sinh</label><input id="issued-password" value={value.password} readOnly autoComplete="off"/></div></div>
    {!value.enabled&&<p role="status">Tài khoản đang khóa, chờ phân cơ sở hoặc mở quyền đăng nhập.</p>}
    {copied&&<p role="status">Đã sao chép thông tin tài khoản.</p>}{error&&<p role="alert">{error}</p>}
  </div><div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
    <button type="button" className="mg-button" onClick={()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`tai-khoan-${value.login_name}.txt`;link.click();URL.revokeObjectURL(url);}}>Tải thông tin</button>
    <button type="button" className="mg-button mg-button-primary" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setError('');}catch{setError('Chưa sao chép được. Dùng Tải thông tin hoặc chọn nội dung để sao chép.');}}}>Sao chép</button></div></Dialog>;
}
