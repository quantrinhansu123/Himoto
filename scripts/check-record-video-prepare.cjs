const assert = require('node:assert/strict'), path = require('node:path');
const { load, root } = require('./lib/load-typescript.cjs');
const { prepareRecordVideo } = load(path.join(root, 'lib/management/record-photos'));

async function main() {
  const originalDocument = global.document, checks = [];
  let duration = 15, decodeError = false, released = 0;
  global.document = { createElement(tag) {
    assert.equal(tag, 'video');
    return { duration, removeAttribute() {}, load() { released++; },
      set src(_url) { queueMicrotask(() => decodeError ? this.onerror?.() : this.onloadedmetadata?.()); } };
  } };
  try {
    for (const [name, type, expected] of [
      ['IMG_1001.MOV', '', 'video/quicktime'], ['VID_1001.mp4', '', 'video/mp4'],
      ['VID_1002.mp4', 'application/octet-stream', 'video/mp4'],
      ['VID_1003.mp4', 'application/mp4', 'video/mp4'], ['video.webm', '', 'video/webm'],
      ['video.m4v', '', 'video/mp4'],
    ]) {
      const file = new File(['synthetic-video'], name, { type, lastModified: 12345 });
      const prepared = await prepareRecordVideo(file);
      assert.equal(prepared.type, expected); assert.equal(prepared.name, name);
      assert.equal(prepared.lastModified, file.lastModified); assert.equal(await prepared.text(), await file.text());
    }
    checks.push('MOV, MP4, M4V and WebM with missing/generic MIME retain identical bytes/name/date and enter the video upload path');
    const mp4Header = new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50]);
    for (const [name,type] of [['blob',''],['phone-video.mp4','com.apple.quicktime-movie'],['download','application/octet-stream']]) {
      const file=new File([mp4Header],name,{type,lastModified:54321});
      const prepared=await prepareRecordVideo(file);
      assert.equal(prepared.type,'video/mp4');assert.equal(prepared.name,name);assert.equal(prepared.lastModified,file.lastModified);
      assert.deepEqual(new Uint8Array(await prepared.arrayBuffer()),mp4Header);
    }
    checks.push('A real MP4 header recovers phone files with no extension/MIME or an unknown provider MIME without altering bytes');
    const atom=(type,payload)=>{const bytes=new Uint8Array(payload.length+8);new DataView(bytes.buffer).setUint32(0,bytes.length);bytes.set(Buffer.from(type),4);bytes.set(payload,8);return bytes;};
    const brands=(major,...compatible)=>atom('ftyp',Buffer.concat([Buffer.from(major),Buffer.alloc(4),...compatible.map(value=>Buffer.from(value))]));
    for(const [bytes,mime] of [[brands('qt  '),'video/quicktime'],[new Uint8Array([...atom('free',[]),...mp4Header]),'video/mp4'],
      [new Uint8Array([0x1a,0x45,0xdf,0xa3,...Buffer.from('webm')]),'video/webm']]) {
      assert.equal((await prepareRecordVideo(new File([bytes],'blob'))).type,mime);
    }
    for(const bytes of [brands('avif','isom'),brands('heic','mif1'),brands('M4A ','mp42'),new Uint8Array([0,0,255,255,...Buffer.from('ftypisom')]),Buffer.from('%PDF-1.7')]) {
      await assert.rejects(()=>prepareRecordVideo(new File([bytes],'blob')),/Không nhận diện/);
    }
    checks.push('Bounded container detection handles MOV/WebM/padded MP4 but excludes image/audio brands and truncated/invalid headers');
    const supported = new File(['synthetic-video'], 'clip.mp4', { type: 'video/mp4' });
    assert.equal(await prepareRecordVideo(supported), supported);
    checks.push('An already typed video keeps its identity so cached uploads and retries are reusable');
    for (const file of [new File(['pdf'], 'document.pdf'), new File(['image'], 'image.mov', { type: 'image/jpeg' }), new File([], 'empty.mp4')]) {
      await assert.rejects(() => prepareRecordVideo(file), /Không nhận diện|Video đang trống/);
    }
    await assert.rejects(() => prepareRecordVideo(new File([new Uint8Array(45 * 1024 * 1024 + 1)], 'large.mp4')), /vượt giới hạn 45 MB/);
    checks.push('Unknown files, an explicit image MIME, empty videos and videos above 45 MB remain rejected');
    const unreadable=new File(['video'],'blob');
    Object.defineProperty(unreadable,'slice',{value:()=>({arrayBuffer:async()=>{throw Error('Provider read failed');}})});
    await assert.rejects(()=>prepareRecordVideo(unreadable),/Không đọc được video.*Safari\/Chrome/);
    checks.push('An unreadable app-provided file receives a distinct recovery message instead of being reported as oversized');
    duration = 61;
    const before = released;
    await assert.rejects(() => prepareRecordVideo(supported), /60 giây/);
    assert.equal(released, before + 1);
    checks.push('Overlong video is rejected and its metadata element is released');
    decodeError = true;
    assert.equal(await prepareRecordVideo(supported), supported);
    checks.push('A browser unable to decode phone video can still use server conversion and duration validation');
  } finally { if (originalDocument === undefined) delete global.document; else global.document = originalDocument; }
  console.log(JSON.stringify({ passed: checks.length, checks, realProviderRequests: 0, realBusinessWrites: 0 }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
