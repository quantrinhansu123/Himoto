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
                    result = page.evaluate("""async url => {
                      const video = document.querySelector('video');
                      const ready = new Promise((resolve, reject) => {
                        video.onloadeddata = resolve;
                        video.onerror = () => reject(new Error('Synthetic video decode failed'));
                        setTimeout(() => reject(new Error('Synthetic video load timeout')), 25000);
                      });
                      video.src = url; await ready;
                      if (!(video.duration > 0 && video.videoWidth > 0 && video.videoHeight > 0)) throw new Error('Missing decoded metadata');
                      const seek = new Promise((resolve, reject) => {
                        video.onseeked = resolve;
                        setTimeout(() => reject(new Error('Synthetic video seek timeout')), 10000);
                      });
                      video.currentTime = video.duration / 2; await seek;
                      await video.play();
                      const result = {decoded:true, seeked:video.currentTime > 0, playing:!video.paused};
                      video.pause(); return result;
                    }""", url)
                    if not all(result.values()):
                        raise RuntimeError("Playback check failed")
                    results.append({"browser": name, "mobileViewport": mobile, **result})
                    context.close()
            finally:
                browser.close()
    print(json.dumps({"passed": len(results), "results": results}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"passed": False, "error": "Synthetic video browser playback failed"}))
        sys.exit(1)
