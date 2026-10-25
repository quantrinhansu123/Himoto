import { convertBrowserVideo } from './video-processing';
import { VideoValidationError } from './video-media';

const worker = self as unknown as { onmessage: ((event: MessageEvent<{ file: File; maxDuration: number }>) => void) | null; postMessage: (data: unknown) => void };
worker.onmessage = async ({ data }) => {
  try {
    let last = 0;
    const file = await convertBrowserVideo(data.file, data.maxDuration, value => {
      const now = Date.now();
      if (now - last > 200 || value === 1) { last = now; worker.postMessage({ type: 'progress', value }); }
    });
    worker.postMessage({ type: 'done', file });
  } catch (error) {
    worker.postMessage({ type: error instanceof VideoValidationError ? 'invalid' : 'done', message: error instanceof VideoValidationError ? error.message : undefined, file: null });
  }
};
