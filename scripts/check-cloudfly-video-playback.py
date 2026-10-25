"""Read an ephemeral signed synthetic-video URL from stdin; never log the URL."""
import json
import sys
from playwright.sync_api import sync_playwright


def main():
    url = json.load(sys.stdin)["url"]
    results = []
    with sync_playwright() as playwright:
        for name in ("chromium", "webkit"):
            browser = getattr(playwright, name).launch(headless=True)
            try:
                for mobile in (False, True):
                    context = browser.new_context(viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 800})
                    page = context.new_page()
                    page.set_content('<video controls muted playsinline preload="metadata"></video>')
                    try:
                      result = page.evaluate("""async url => {
                      const video = document.querySelector('video');
                      window.__qaVideoPhase = 'load';
                      const ready = new Promise((resolve, reject) => {
                        video.onloadeddata = resolve;
                        video.onerror = () => reject(new Error('Synthetic video decode failed'));
                        setTimeout(() => reject(new Error('Synthetic video load timeout')), 25000);
                      });
                      video.src = url; await ready;
                      if (!(video.duration > 0 && video.videoWidth > 0 && video.videoHeight > 0)) throw new Error('Missing decoded metadata');
                      window.__qaVideoPhase = 'seek';
                      const seek = new Promise((resolve, reject) => {
                        video.onseeked = resolve;
                        setTimeout(() => reject(new Error('Synthetic video seek timeout')), 10000);
                      });
                      const targetTime = video.duration / 2;
                      video.currentTime = targetTime; await seek;
                      const afterSeek = video.currentTime;
                      window.__qaVideoPhase = 'play'; await video.play();
                      // WebKit updates its audio clock asynchronously during resume.
                      // A settled clock near the requested target proves seek + resume, unlike the transient value.
                      await new Promise(resolve => setTimeout(resolve, 300));
                      const result = {decoded:true, seeked:video.currentTime >= targetTime - 0.1 && video.currentTime < targetTime + 1, playing:!video.paused,
                        targetTime, afterSeek, afterPlay:video.currentTime};
                      video.pause(); return result;
                    }""", url)
                    except Exception:
                        phase = page.evaluate('window.__qaVideoPhase || "unknown"')
                        print(json.dumps({"passed": False, "browser": name, "mobileViewport": mobile, "phase": phase}))
                        return False
                    if not all(result[key] for key in ('decoded', 'seeked', 'playing')):
                        print(json.dumps({"passed": False, "browser": name, "mobileViewport": mobile, "phase": "assert-playback", "result": result}))
                        return False
                    results.append({"browser": name, "mobileViewport": mobile, **result})
                    context.close()
            finally:
                browser.close()
    print(json.dumps({"passed": len(results), "results": results}))
    return True


if __name__ == "__main__":
    try:
        if not main(): sys.exit(1)
    except Exception:
        print(json.dumps({"passed": False, "error": "Synthetic video browser playback failed"}))
        sys.exit(1)
