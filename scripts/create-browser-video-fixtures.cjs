// Generate test patterns and synthetic sound only. Requires an existing FFmpeg executable.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const argument=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
const bin=argument('--ffmpeg')||'ffmpeg';
const dir=path.resolve(argument('--output')||'.backups/browser-video-20261025/fixtures');
if(!dir.startsWith(path.resolve('.backups')+path.sep))throw Error('Write synthetic fixtures inside .backups only');
fs.mkdirSync(dir,{recursive:true});
const run=args=>{const r=spawnSync(bin,['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',windowsHide:true,timeout:120000});if(r.status!==0)throw Error('FFmpeg failed while generating synthetic fixtures');};
const source=['-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','3'];
run([...source,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',path.join(dir,'avc.mov')]);
run([...source,'-c:v','libx265','-preset','ultrafast','-x265-params','log-level=error:pools=2','-tag:v','hvc1','-pix_fmt','yuv420p','-c:a','aac',path.join(dir,'hevc.mov')]);
run([...source,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-c:a','libopus',path.join(dir,'vp9.webm')]);
run(['-i',path.join(dir,'avc.mov'),'-an','-c:v','copy',path.join(dir,'silent.mp4')]);
run(['-i',path.join(dir,'avc.mov'),'-c','copy','-metadata:s:v:0','rotate=90',path.join(dir,'rotated.mov')]);
run(['-f','lavfi','-i','color=c=green:s=160x90:r=5','-t','61','-c:v','libx264','-an',path.join(dir,'long61.mp4')]);
run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','3','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-an',path.join(dir,'silent.webm')]);
fs.writeFileSync(path.join(dir,'corrupt.mp4'),'synthetic corrupt media');
console.log(JSON.stringify({syntheticFixtures:8,realCustomerMediaUsed:false}));
