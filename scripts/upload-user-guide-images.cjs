const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'docs/huong-dan-su-dung');
require('@next/env').loadEnvConfig(root,false,{info(){},error(){}});

function configuration(){
  let url;
  if(process.env.CLOUDINARY_URL){try{url=new URL(process.env.CLOUDINARY_URL);}catch{throw Error('CLOUDINARY_URL chưa hợp lệ.');}}
  return {cloud_name:process.env.CLOUDINARY_CLOUD_NAME||url?.hostname,api_key:process.env.CLOUDINARY_API_KEY||(url&&decodeURIComponent(url.username)),api_secret:process.env.CLOUDINARY_API_SECRET||(url&&decodeURIComponent(url.password))};
}
async function main(){
  const files=fs.readdirSync(path.join(directory,'images')).filter(name=>/^\d{2}-[a-z0-9-]+\.jpg$/.test(name)).sort();
  const config=configuration(),configured=Boolean(config.cloud_name&&config.api_key&&config.api_secret);
  if(!process.argv.includes('--upload')){
    console.log(JSON.stringify({images:files.length,configured,mode:'check',message:configured?'Sẵn sàng. Dùng --upload để tải bộ ảnh lên Cloudinary.':'Chưa có cấu hình Cloudinary; Markdown tiếp tục dùng ảnh cục bộ.'},null,2));return;
  }
  if(!configured)throw Error('Chưa có cấu hình Cloudinary. Thiết lập CLOUDINARY_URL hoặc CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET trong môi trường local.');
  if(!files.length)throw Error('Chưa có ảnh hướng dẫn để tải.');
  const cloudinary=require('cloudinary').v2;cloudinary.config({...config,secure:true});
  const manifestPath=path.join(directory,'images-manifest.json');
  const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{images:[]};
  manifest.images||=[];
  for(const filename of files){
    const file=path.join(directory,'images',filename),sha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    let entry=manifest.images.find(item=>item.filename===filename);
    if(!entry){entry={filename,local_path:`images/${filename}`};manifest.images.push(entry);}
    if(entry.sha256!==sha256||!entry.secure_url){
      const uploaded=await cloudinary.uploader.upload(file,{public_id:`himoto/user-guides/web-2026-11-05/${path.basename(filename,'.jpg')}-${sha256.slice(0,12)}`,resource_type:'image',type:'upload',overwrite:false,tags:['himoto-user-guide']});
      if(!uploaded.secure_url?.startsWith('https://res.cloudinary.com/'))throw Error('Cloudinary chưa trả về đường dẫn ảnh hợp lệ.');
      Object.assign(entry,{sha256,public_id:uploaded.public_id,secure_url:uploaded.secure_url,uploaded_at:new Date().toISOString()});
      manifest.status='uploading';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    }
    const response=await fetch(entry.secure_url,{method:'HEAD',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Ảnh ${filename} chưa truy cập được (HTTP ${response.status}).`);
    entry.verified_at=new Date().toISOString();
  }
  const markdownPath=path.join(directory,'HUONG-DAN-SU-DUNG-HIMOTO.md');
  let markdown=fs.readFileSync(markdownPath,'utf8');
  for(const entry of manifest.images)if(entry.secure_url)markdown=markdown.replaceAll(`](${entry.local_path})`,`](${entry.secure_url})`);
  markdown=markdown.replace('Ảnh đang liên kết từ thư mục `images` lưu cùng tài liệu; xem `QUAN-LY-ANH.md` để chuyển sang Cloudinary.','Ảnh minh họa đã tải lên Cloudinary; bản gốc vẫn được giữ trong thư mục `images`. Xem `QUAN-LY-ANH.md` để cập nhật ảnh.');
  fs.writeFileSync(markdownPath,markdown);manifest.status='uploaded';manifest.updated_at=new Date().toISOString();
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({uploaded:files.length,status:'uploaded',markdown:'docs/huong-dan-su-dung/HUONG-DAN-SU-DUNG-HIMOTO.md'},null,2));
}
main().catch(error=>{console.error(error.http_code?`Cloudinary từ chối tải ảnh (HTTP ${error.http_code}). Kiểm tra cấu hình và quyền tài khoản.`:error.message||'Chưa tải xong bộ ảnh.');process.exitCode=1;});
