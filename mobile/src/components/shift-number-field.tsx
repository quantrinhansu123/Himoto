import { useState } from "react";
import { FormField } from "./form-fields";
/** Preserve intermediate text such as '-' without silently turning invalid
 * money/counts into zero. Autofill replaces only externally changed values. */
export function ShiftNumberField({label,value,onChange,nullable=false,signed=false,disabled=false}:{label:string;value:number|null;onChange:(value:number|null)=>void;nullable?:boolean;signed?:boolean;disabled?:boolean}) {
  const [draft,setDraft]=useState<{value:number|null;text:string}|null>(null),text=draft&&Object.is(draft.value,value)?draft.text:value===null?"":Number.isNaN(value)?"":String(value);
  return <FormField label={label} value={text} editable={!disabled} keyboardType={signed?"numbers-and-punctuation":"number-pad"} maxLength={16} hint={nullable?"Để trống khi chưa có số liệu.":undefined} error={text!==""&&!new RegExp(signed?"^-?[0-9]+$":"^[0-9]+$").test(text)||text===""&&!nullable?"Nhập số nguyên hợp lệ.":undefined} onChangeText={next=>{const parsed=next===""&&nullable?null:new RegExp(signed?"^-?[0-9]+$":"^[0-9]+$").test(next)?Number(next):NaN;setDraft({value:parsed,text:next});onChange(parsed);}} />;
}
