'use client';
import type { CustomerDetails } from '@/lib/management/contract-document';

export function CustomerInternationalFields({value,onChange,disabled=false,prefix,errors={}}:{value:CustomerDetails;onChange:(value:CustomerDetails)=>void;disabled?:boolean;prefix:string;errors?:Record<string,string>}) {
  const foreign=value.customer_type==='foreign';
  return <div className="mg-field-wide mg-international-customer">
    <label className="mg-customer-mode"><input type="checkbox" checked={foreign} disabled={disabled} onChange={event=>onChange({...value,customer_type:event.target.checked?'foreign':'vietnam'})}/> Khách nước ngoài</label>
    {foreign&&<><p>Nhập hộ chiếu / giấy tờ quốc tế. Có thể dùng số quốc tế, WhatsApp hoặc Facebook; không bắt buộc số điện thoại Việt Nam.</p><div className="mg-form-grid">
      <div className="mg-field"><label htmlFor={`${prefix}-nationality`}>Quốc tịch</label><input id={`${prefix}-nationality`} value={value.nationality||''} disabled={disabled} onChange={e=>onChange({...value,nationality:e.target.value})}/></div>
      <div className="mg-field"><label htmlFor={`${prefix}-contact-channel`}>Kênh liên hệ</label><input id={`${prefix}-contact-channel`} list={`${prefix}-contact-options`} value={value.contact_channel||''} placeholder="WhatsApp, Facebook, email…" disabled={disabled} onChange={e=>onChange({...value,contact_channel:e.target.value})}/><datalist id={`${prefix}-contact-options`}><option value="WhatsApp"/><option value="Facebook"/><option value="Email"/><option value="Điện thoại quốc tế"/></datalist></div>
      <div className="mg-field mg-field-wide"><label htmlFor={`${prefix}-contact-detail`}>Số / tài khoản / liên kết liên hệ{!value.phone.trim()&&' *'}</label><input id={`${prefix}-contact-detail`} value={value.contact_detail||''} disabled={disabled} aria-invalid={Boolean(errors.contact_detail)} onChange={e=>onChange({...value,contact_detail:e.target.value})}/>{errors.contact_detail&&<p className="mg-field-error" role="alert">{errors.contact_detail}</p>}</div>
    </div></>}
  </div>;
}
