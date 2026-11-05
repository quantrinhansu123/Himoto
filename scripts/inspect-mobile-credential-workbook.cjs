// Reads only the user-supplied credential workbook. Never prints credential values.
const ExcelJS=require('exceljs'),fs=require('node:fs'),crypto=require('node:crypto');
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={login:['taikhoan','tendangnhap','dangnhap','username','loginname'],password:['matkhau','matkhaubandau','matkhautamthoi','password'],role:['vaitro','quyen','phanquyen','chucvu'],store:['coso','pgd','chinhanh'],name:['hovaten','hoten','nhansu','tennhanvien','nhanvien']};
async function main(){
 const filename=process.argv[2],target=process.argv[3]||'';if(!filename)throw Error('WORKBOOK_PATH_REQUIRED');
 const bytes=fs.readFileSync(filename),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
 const sheets=[];
 for(const sheet of workbook.worksheets){
  for(let index=1;index<=Math.min(sheet.rowCount,12);index++){
   const columns={};sheet.getRow(index).eachCell((cell,column)=>{const key=fold(cell.text);for(const [type,names]of Object.entries(aliases))if(names.includes(key))columns[type]=column;});
   if(!columns.login||!columns.password)continue;
   let targetMatches=0,qaMarkedRows=0;
   for(let r=index+1;r<=sheet.rowCount;r++){const row=sheet.getRow(r),login=row.getCell(columns.login).text.trim();if(login===target)targetMatches++;if(/(^|[\s._-])(qa|test)([\s._-]|$)/i.test(login+' '+(columns.name?row.getCell(columns.name).text:'')))qaMarkedRows++;}
   sheets.push({sheetIndex:sheet.id,headerRow:index,columns,rowCount:sheet.rowCount-index,targetMatches,qaMarkedRows});break;
  }
 }
 console.log(JSON.stringify({ok:true,credentialValuesPrinted:false,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sheets},null,2));
}
main().catch(()=>{console.error('WORKBOOK_INSPECTION_FAILED_NO_VALUES_LOGGED');process.exitCode=1;});
