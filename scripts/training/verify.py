"""Check the exported MP4, rather than only its editing parameters."""
import argparse
import json
import math
import subprocess
import wave
from pathlib import Path

import cv2
import numpy as np

from render import FFMPEG


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    quality = json.loads((args.output / "quality.json").read_text(encoding="utf-8"))
    video = args.output / "Himoto-1.0.6-Mau-01-Tim-va-loc-xe.mp4"
    capture = cv2.VideoCapture(str(video))
    assert capture.isOpened(), "Final MP4 cannot be opened"
    width, height = round(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps, frames = capture.get(cv2.CAP_PROP_FPS), round(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    assert [width, height] == quality["resolution"] == [1080, 2400]
    assert abs(fps-30) < .001 and abs(frames/fps-quality["duration"]) <= 1/30
    action_checks = []
    for scene in quality["scenes"]:
        assert scene["captionLinesMax"] <= 2 and scene["appBottom"] < scene["captionAreaTop"]
        if scene["actionAt"] is None:
            continue
        assert abs(scene["actionAt"]-scene["spokenCueEnd"]-.1) < .001
        images = []
        for offset in (-.8, .7):
            capture.set(cv2.CAP_PROP_POS_MSEC, (scene["start"]+scene["actionAt"]+offset)*1000)
            ok, frame = capture.read()
            assert ok, "Cannot inspect an action in the final MP4"
            # Exclude captions, headers and the phone's clock/status bar.
            images.append(cv2.resize(frame[320:2100, 90:990], (180, 356)).astype(np.float32))
        difference = float(np.mean(np.abs(images[0]-images[1])))
        assert difference > .03, f"No visible final-video change at {scene['scene']}"
        action_checks.append({"scene": scene["scene"], "visibleChange": True, "pixelDifference": round(difference, 3)})
    capture.release()
    decoded = subprocess.run([str(FFMPEG), "-hide_banner", "-v", "error", "-i", str(video), "-map", "0:a:0",
                              "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], capture_output=True)
    assert decoded.returncode == 0 and decoded.stdout and not decoded.stderr, "Final narration fails to decode"
    samples = np.frombuffer(decoded.stdout, dtype="<i2").astype(np.float64)
    seconds = len(samples)/48000
    assert abs(seconds-quality["duration"]) < .06, "Audio/video duration mismatch"
    peak = float(np.max(np.abs(samples)))
    assert 500 < peak < 32767, "Final audio is silent or clipped"
    with wave.open(str(args.output / "narration.wav")) as reference:
        assert reference.getframerate() == 48000 and reference.getnchannels() == 1
        original = np.frombuffer(reference.readframes(reference.getnframes()), dtype="<i2").astype(np.float64)
    shifts = []
    for scene in quality["scenes"]:
        begin = round((scene["start"]+.85)*48000)
        template = original[begin:begin+48000:8]
        search = samples[begin-7200:begin+48000+7200:8]
        template = template-template.mean()
        energy = np.concatenate(([0.0], np.cumsum(search*search)))
        windows = energy[len(template):]-energy[:-len(template)]
        scores = np.correlate(search, template, mode="valid") / np.maximum(1, np.sqrt(windows*np.sum(template*template)))
        best = int(np.argmax(scores))
        shift_ms = (best-900)/6
        assert float(scores[best]) > .9 and abs(shift_ms) < 20, "Mux changed the narration timeline"
        shifts.append({"scene": scene["scene"], "shiftMs": shift_ms, "correlation": round(float(scores[best]), 5)})
    full_decode = subprocess.run([str(FFMPEG), "-hide_banner", "-v", "error", "-i", str(video), "-f", "null", "-"], capture_output=True)
    assert full_decode.returncode == 0 and not full_decode.stderr, "Final MP4 has decoding errors"
    result = {"technicalChecks": "passed", "videoSeconds": frames/fps, "audioSeconds": seconds,
              "resolution": [width, height], "fps": fps, "bytes": video.stat().st_size,
              "audioPeakDbFS": round(20*math.log10(peak/32768), 2), "captionsOutsideApp": True,
              "maxMeasuredAudioShiftMs": max(abs(item["shiftMs"]) for item in shifts), "audioTimelineChecks": shifts,
              "maxCaptionLines": 2, "visibleActions": action_checks,
              "humanReview": "Pronunciation, perceived sync and instructional quality still need user review"}
    (args.output / "artifact-checks.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key not in ("visibleActions", "audioTimelineChecks")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
