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
    const supported = new File(['synthetic-video'], 'clip.mp4', { type: 'video/mp4' });
    assert.equal(await prepareRecordVideo(supported), supported);
    checks.push('An already typed video keeps its identity so cached uploads and retries are reusable');
    for (const file of [new File(['pdf'], 'document.pdf'), new File(['image'], 'image.mov', { type: 'image/jpeg' }), new File([], 'empty.mp4')]) {
      await assert.rejects(() => prepareRecordVideo(file), /Chọn video/);
    }
    await assert.rejects(() => prepareRecordVideo(new File([new Uint8Array(45 * 1024 * 1024 + 1)], 'large.mp4')), /45 MB/);
    checks.push('Unknown files, an explicit image MIME, empty videos and videos above 45 MB remain rejected');
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
