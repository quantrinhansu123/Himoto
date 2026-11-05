/** Runs directly from the user's press to retain WebKit's clipboard gesture. */
export async function copyText(value:string){
  if(!value||value.length>2*1024*1024)throw Error('Nội dung sao chép trống hoặc quá dài.');
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
  const field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';field.setAttribute('readonly','');document.body.appendChild(field);
  try{field.select();if(!document.execCommand('copy'))throw Error('Chưa chép được nội dung. Chọn văn bản hoặc xuất tệp rồi thử lại.');}finally{field.remove();}
}
