import { BlobSource, BufferTarget, Conversion, Input, MP4, QTFF, WEBM, Mp4OutputFormat, Output, Quality } from 'mediabunny';
import { MAX_VIDEO_BYTES, VideoValidationError } from './video-media';

/** Runs in a dedicated worker. Returning null requests the existing cloud converter. */
export async function convertBrowserVideo(file: File, maxDuration: number, progress: (value: number) => void): Promise<File | null> {
  if (!file.size || file.size > MAX_VIDEO_BYTES) throw new VideoValidationError('Video tối đa 45 MB.');
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM] });
  let conversion: Conversion | undefined;
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) return null;
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (duration > maxDuration) throw new VideoValidationError(`Video tối đa ${maxDuration} giây.`);
    const videos = await input.getVideoTracks(), audios = await input.getAudioTracks();
    // Don't silently discard sound or a second video/audio track.
    if (videos.length !== 1 || audios.length > 1) return null;
    const audio = audios[0];
    const width = await video.getDisplayWidth(), height = await video.getDisplayHeight();
    if (!width || !height || width * height > 3840 * 2160) return null;
    const copyVideo = await video.getCodec() === 'avc' && Math.max(width, height) <= 1920;
    const copyAudio = !audio || await audio.getCodec() === 'aac';
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    conversion = await Conversion.init({ input, output, tracks: 'primary', tags: {}, showWarnings: false,
      video: copyVideo ? { codec: 'avc' } : {
        codec: 'avc', width: Math.max(2, Math.floor(width * scale / 2) * 2),
        height: Math.max(2, Math.floor(height * scale / 2) * 2), fit: 'contain', frameRate: 30,
        quality: new Quality({ bitrate: 1_800_000 }), forceTranscode: true,
      },
      audio: copyAudio ? { codec: 'aac' } : { codec: 'aac', quality: new Quality({ bitrate: 96_000 }), numberOfChannels: 2, sampleRate: 44100 },
    });
    if (!conversion.isValid || conversion.discardedTracks.some(item => item.track.type === 'video' || item.track.type === 'audio')) return null;
    // Stop growing a large buffer before it can exhaust mobile memory.
    target.on('write', ({ end }) => { if (end > MAX_VIDEO_BYTES) void conversion?.cancel(); });
    conversion.onProgress = progress;
    await conversion.execute();
    if (!target.buffer || !target.buffer.byteLength || target.buffer.byteLength > MAX_VIDEO_BYTES) return null;
    return new File([target.buffer], 'video-himoto.mp4', { type: 'video/mp4' });
  } catch (error) {
    if (error instanceof VideoValidationError) throw error;
    return null;
  } finally {
    if (conversion && conversion.state !== 'done' && conversion.state !== 'canceled') await conversion.cancel().catch(() => {});
    input.dispose();
  }
}
