import 'server-only';
import { cleanOcrFields,type OcrFields,type OcrKind,type OcrResult } from '@/lib/management/photo-ocr';
import { PhotoOcrError } from './photo-ocr';

const keys=['id_card','name','id_card_issued_on','id_card_issued_by','driver_license_number','driver_license_issued_on'];
export const customerDocumentSchema={type:'object',properties:{documents:{type:'array',maxItems:12,items:{type:'object',properties:{document_type:{type:'string',enum:['cccd_front','cccd_back','passport','driver_license','other']},...Object.fromEntries(keys.map(key=>[key,{type:'string'}]))},required:['document_type',...keys],additionalProperties:false}}},required:['documents'],additionalProperties:false};
export const customerDocumentPrompt='Đọc từ 1 đến 3 ảnh hồ sơ của CÙNG MỘT KHÁCH. Mỗi ảnh có thể chứa đồng thời CCCD/CMND, GPLX, hộ chiếu và hợp đồng ở nền. Phân tách TỪNG GIẤY TỜ thành một phần tử documents. Chỉ đọc giấy tờ gốc, bỏ qua hợp đồng, chữ viết tay, con dấu thời gian/địa điểm của camera. name chỉ lấy từ trường Họ và tên / Full name của CHỦ GIẤY TỜ, tuyệt đối không lấy tên người ký cấp thẻ (ví dụ dưới chức danh, cạnh chữ ký) hoặc tên nằm trên hợp đồng. Với cccd_back, luôn để name rỗng. id_card chỉ là số CCCD/CMND hoặc Passport No, không lấy số GPLX, Personal No trên hộ chiếu. CCCD chỉ gồm 9 hoặc 12 số. Ngày cấp là NGÀY CẤP, YYYY-MM-DD, không lấy ngày sinh/hết hạn. driver_license_number và driver_license_issued_on chỉ đọc từ GPLX. Phải đọc tên trên GPLX để đối chiếu chủ giấy tờ. Không ghép thông tin của người khác nhau. Giữ số 0 đầu, dấu tiếng Việt; trường thiếu/mờ trả chuỗi rỗng; không suy đoán.';
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function combineCustomerDocuments(value:unknown):OcrResult {
  const entries=(value as {documents?:unknown})?.documents;
  if(!Array.isArray(entries)||entries.length>12)throw new PhotoOcrError('Kết quả đọc bộ giấy tờ chưa hợp lệ.',422);
  const documents=entries.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new PhotoOcrError('Kết quả giấy tờ chưa hợp lệ.',422);
    const kind=(entry as {document_type:OcrKind|'other'}).document_type;
    if(!['cccd_front','cccd_back','passport','driver_license','other'].includes(kind))throw new PhotoOcrError('Không xác định được loại giấy tờ.',422);
    return {kind,fields:kind==='other'?{}:cleanOcrFields(entry,kind),name:kind==='driver_license'?cleanOcrFields({name:(entry as {name?:unknown}).name},'customer_documents').name:undefined};
  });
  const ids=[...new Set(documents.map(doc=>doc.fields.id_card).filter(Boolean))];
  const names=[...new Set(documents.flatMap(doc=>[doc.fields.name,doc.name]).filter((name):name is string=>Boolean(name)).map(normalized))];
  if(ids.length>1||names.length>1)throw new PhotoOcrError('Có giấy tờ của nhiều người hoặc thông tin không khớp. Chọn đúng bộ giấy tờ của một khách rồi đọc lại; chưa điền thông tin.',422);
  const fields:OcrFields={},warnings:string[]=[];
  for(const doc of documents){for(const [key,value] of Object.entries(doc.fields)){
    const field=key as keyof OcrFields;
    if(fields[field]&&fields[field]!==value){delete fields[field];warnings.push(`Thông tin ${field} giữa các giấy tờ chưa khớp; cần kiểm tra.`);}
    else if(!warnings.some(note=>note.includes(field)))fields[field]=value;
  }}
  if(!fields.name)warnings.push('Chưa đọc rõ tên chủ giấy tờ. Tên người ký cấp thẻ không được dùng làm tên khách.');
  return {fields,...(warnings.length?{warnings}:{})};
}
