// Shared limits and receipts; no credentials or server dependencies belong here.
export const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
export const VIDEO_FILE_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm';

function containerVideoType(bytes: Uint8Array): string | undefined {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start,end));
  if (bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3&&text(4,bytes.length).includes('webm')) return 'video/webm';
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let offset=0;offset+16<=bytes.length;){
    const size=view.getUint32(offset),box=text(offset+4,offset+8);
    if(size<8||offset+size>bytes.length)return;
    if(box==='ftyp'&&size>=16){
      const brands=[text(offset+8,offset+12)];
      for(let at=offset+16;at+4<=offset+size;at+=4)brands.push(text(at,at+4));
      // HEIF/AVIF and audio-only files also use ftyp. Do not turn these into videos.
      if(brands.some(brand=>/^(?:avif|avis|heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1|M4A |M4B |M4P |f4a )$/.test(brand)))return;
      if(brands.includes('qt  '))return 'video/quicktime';
      if(brands.some(brand=>/^(?:isom|iso[2-9]|mp4[12]|avc1|hvc1|hev1|M4V |M4VH|M4VP|MSNV)$/.test(brand)))return 'video/mp4';
      return;
    }
    if(!['free','wide','skip'].includes(box))return;
    offset+=size;
  }
}

/** Recover missing names/provider MIME using a bounded header read. The server still inspects full media. */
export async function normalizeVideoFile(file: File): Promise<File> {
  if (file.type.startsWith('video/')) return file;
  const extension = file.name.split('.').pop()?.toLowerCase();
  let mime = ['', 'application/octet-stream', 'application/mp4'].includes(file.type)
    ? extension === 'mov' ? 'video/quicktime' : extension === 'webm' ? 'video/webm'
      : extension === 'mp4' || extension === 'm4v' ? 'video/mp4' : undefined
    : undefined;
  if(!mime&&!/^(?:image|audio)\//.test(file.type)&&file.size>0&&file.size<=MAX_VIDEO_BYTES){
    mime=containerVideoType(new Uint8Array(await file.slice(0,4096).arrayBuffer()));
  }
  return mime ? new File([file], file.name, { type: mime, lastModified: file.lastModified }) : file;
}
export interface BrowserVideoReceipt {
  provider: 'cloudfly-browser';
  resource_type: 'video';
  upload_id: string;
  signature: string;
}
export interface VideoUploadProgress { message: string; percent?: number }
export type VideoProgressCallback = (progress: VideoUploadProgress) => void;
export class VideoValidationError extends Error {}
