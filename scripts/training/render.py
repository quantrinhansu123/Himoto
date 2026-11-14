"""Render verified native scenes, measured narration and safe-area captions.

Actions follow their spoken cue. Only the still frame before/after a transition
is held; the actual UI transition plays at its recorded speed.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
import wave
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FFMPEG = Path("E:/backup/daotaonhansukama/node_modules/ffmpeg-static/ffmpeg.exe")
WIDTH, HEIGHT, FPS = 1080, 2400, 30
PANEL = (68, 230, 944, 1940)
CAPTION_TOP, CAPTION_BOTTOM = 2212, 2340
LEAD = 0.45
FONT_PATH = Path("C:/Windows/Fonts/segoeui.ttf")
BOLD_PATH = Path("C:/Windows/Fonts/segoeuib.ttf")
FONT = ImageFont.truetype(str(FONT_PATH), 46)


def run(*args):
    result = subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace")[-3000:])


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def mux_audio(concat, combined, final, duration):
    # Measure loudness, then apply a CONSTANT gain. This preserves the PCM
    # sample timeline instead of introducing lookahead/resampling differences.
    measurement = subprocess.run([str(FFMPEG), "-hide_banner", "-i", str(combined), "-af",
                                 "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-"], capture_output=True)
    if measurement.returncode:
        raise RuntimeError("Cannot measure narration loudness")
    match = re.search(r'\{\s*"input_i".*?\}', measurement.stderr.decode(errors="replace"), re.S)
    if not match:
        raise RuntimeError("Loudness measurement has no usable result")
    measured = json.loads(match.group())
    gain = min(-16-float(measured["input_i"]), -1.8-float(measured["input_tp"]))
    run("-f", "concat", "-safe", "0", "-i", concat, "-i", combined, "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-af", f"volume={gain}dB,apad", "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
        "-t", duration, "-metadata", "title=Himoto 1.0.6 - Tim va loc xe - elevenlabs.io - Preview",
        "-movflags", "+faststart", final)
    return gain


def escaped(path):
    return str(path.resolve()).replace("\\", "/").replace(":", "\\:")


def wrap(text, width=900):
    lines = [""]
    for word in text.split():
        candidate = (lines[-1] + " " + word).strip()
        if FONT.getlength(candidate) <= width:
            lines[-1] = candidate
        else:
            lines.append(word)
    return lines


def captions(words):
    cues, group = [], []
    for word in words:
        proposed = group + [word]
        if group and len(wrap(" ".join(item["text"] for item in proposed))) > 2:
            cues.append(group)
            group = []
        group.append(word)
        if word["text"].endswith((".", "?", "!", ":")):
            cues.append(group)
            group = []
    if group:
        cues.append(group)
    return [{"start": LEAD + cue[0]["start"], "end": LEAD + cue[-1]["end"],
             "lines": wrap(" ".join(word["text"] for word in cue).replace("Hi mô tô", "Himoto"))} for cue in cues]


def timestamp(value, srt=False):
    unit = 1000 if srt else 100
    ticks = round(value * unit)
    hours, remainder = divmod(ticks, 3600 * unit)
    minutes, remainder = divmod(remainder, 60 * unit)
    seconds, fraction = divmod(remainder, unit)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{fraction:03d}" if srt else f"{hours}:{minutes:02d}:{seconds:02d}.{fraction:02d}"


def write_ass(path, cues):
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 2400
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Segoe UI,46,&H002A2017,&H002A2017,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,1,0,0,5,90,90,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    rows = []
    for cue in cues:
        if not (1 <= len(cue["lines"]) <= 2):
            raise RuntimeError("A subtitle would exceed the reserved two-line area")
        text = r"\N".join(cue["lines"]).replace("{", "(").replace("}", ")")
        rows.append(f"Dialogue: 0,{timestamp(cue['start'])},{timestamp(cue['end'])},Caption,,0,0,0,,{{\\an5\\pos(540,2276)}}{text}")
    path.write_text(header + "\n".join(rows), encoding="utf-8-sig")


def background(scene, index, total):
    image = Image.new("RGB", (WIDTH, HEIGHT), "#F5F6F8")
    draw = ImageDraw.Draw(image)
    draw.text((68, 40), "HIMOTO", font=ImageFont.truetype(str(BOLD_PATH), 33), fill="#BA2028")
    draw.rounded_rectangle((800, 36, 1012, 88), radius=18, fill="#FFF0F0")
    draw.text((828, 45), "BẢN MẪU", font=ImageFont.truetype(str(BOLD_PATH), 25), fill="#BA2028")
    draw.text((68, 102), "Tìm và lọc xe", font=ImageFont.truetype(str(BOLD_PATH), 55), fill="#17202A")
    draw.text((68, 180), scene["title"], font=ImageFont.truetype(str(FONT_PATH), 28), fill="#536071")
    draw.text((930, 180), f"{index+1:02d}/{total:02d}", font=ImageFont.truetype(str(FONT_PATH), 25), fill="#536071")
    x, y, w, h = PANEL
    draw.rounded_rectangle((x-3, y-3, x+w+3, y+h+3), radius=12, fill="#D6DAE1")
    draw.rectangle((x, y, x+w, y+h), fill="white")
    draw.rectangle((68, 2200, 1012, 2203), fill="#D6DAE1")
    draw.rectangle((68, 2200, 68+round(944*(index+1)/total), 2203), fill="#BA2028")
    draw.text((68, 2364), "Android 1.0.6  ·  Giọng đọc: elevenlabs.io  ·  Bản thử", font=ImageFont.truetype(str(FONT_PATH), 23), fill="#536071")
    return image


def placement(image_path):
    with Image.open(image_path) as image:
        sw, sh = image.size
    x, y, w, h = PANEL
    scale = min(w/sw, h/sh)
    rw, rh = round(sw*scale), round(sh*scale)
    return x+(w-rw)//2, y+(h-rh)//2, rw, rh, sw, sh


def detect_motion(video, bounds):
    cap = cv2.VideoCapture(str(video))
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(cv2.resize(frame, (216, 444), interpolation=cv2.INTER_AREA).astype(np.float32))
    cap.release()
    if len(frames) < 20:
        raise RuntimeError("Native recording is too short")
    reference = frames[7]
    indices = []
    last_motion = 7
    for index in range(8, len(frames)):
        frame = frames[index]
        overall = np.mean(np.abs(frame[18:432] - reference[18:432]))
        region = 0
        if bounds:
            x1, y1, x2, y2 = [round(value/5) for value in bounds]
            if x2 > x1 and y2 > y1:
                region = np.mean(np.abs(frame[y1:y2, x1:x2]-reference[y1:y2, x1:x2]))
        if overall > 1.4 or region > 4:
            indices.append(index)
        difference = np.mean(np.abs(frame[18:432] - frames[index-1][18:432]))
        if difference > 0.6:
            last_motion = index
    if not indices:
        raise RuntimeError(f"No observable UI change: {video}")
    start = indices[0]/FPS
    end = min(len(frames)/FPS, max(start+0.8, last_motion/FPS+0.35))
    return {"motionStart": start, "motionEnd": end, "recordedDuration": len(frames)/FPS,
            "timingMethod": "first observable UI change in 30fps-normalized native capture", "reviewed": False}


def source_frame(video, seconds):
    cap = cv2.VideoCapture(str(video))
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0, seconds)*1000)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError("Cannot read a review frame")
    return Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))


def analyze(capture, output):
    timings = {}
    contact = Image.new("RGB", (1080, 530*sum(scene["capture"] == "native" for scene in capture["scenes"])), "white")
    draw = ImageDraw.Draw(contact)
    row = 0
    for scene in capture["scenes"]:
        if scene["capture"] != "native":
            continue
        folder = output / scene["id"]
        folder.mkdir(exist_ok=True)
        video = folder / "native-30fps-v2.mp4"
        if not video.exists():
            with Image.open(Path(scene["video"]).with_name("before.png")) as image:
                sw, sh = image.size
            cap = cv2.VideoCapture(scene["video"])
            ok, first = cap.read()
            cap.release()
            if not ok or first.shape[1] < sw or first.shape[0] < sh:
                raise RuntimeError("Recording dimensions do not contain the verified screenshot")
            if first.shape[:2] != (sh, sw):
                # Samsung's resolution override can leave a black padded encoder
                # surface. Remove ONLY verified empty padding, never app content.
                mask = np.ones(first.shape[:2], dtype=bool)
                mask[:sh, :sw] = False
                if np.mean(first[mask]) > 5:
                    raise RuntimeError("Unexpected non-black recorder padding; recapture at explicit screen size")
            run("-i", scene["video"], "-vf", f"crop={sw}:{sh}:0:0,fps=30", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", video)
        timing = detect_motion(video, scene.get("bounds"))
        timings[scene["id"]] = timing
        for column, seconds in enumerate((timing["motionStart"]-.3, timing["motionStart"]+.1, timing["motionStart"]+.6, timing["motionEnd"]-.1)):
            image = source_frame(video, seconds)
            image.thumbnail((230, 475))
            contact.paste(image, (column*270, row*530+35))
            draw.text((column*270, row*530+8), f"{scene['id']} / {seconds:.2f}s", fill="black", font=ImageFont.truetype(str(FONT_PATH), 16))
        row += 1
        print(json.dumps({"scene": scene["id"], **timing}), flush=True)
    write_json(output / "timing-review.json", timings)
    contact.save(output / "transition-contact-sheet.jpg", quality=92)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", type=Path, required=True)
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--analyze", action="store_true")
    parser.add_argument("--proof", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    capture = json.loads(args.capture.read_text(encoding="utf-8"))
    if args.analyze:
        analyze(capture, args.output)
        return
    scenes = capture["scenes"]
    if args.proof:
        scene = next(scene for scene in scenes if scene["id"] == "07-filters")
        image = background(scene, 7, len(scenes))
        screenshot = Path(scene["video"]).with_name("after.png")
        x, y, w, h, _, _ = placement(screenshot)
        with Image.open(screenshot) as source:
            image.paste(source.resize((w, h), Image.Resampling.LANCZOS), (x, y))
        draw = ImageDraw.Draw(image)
        for index, line in enumerate(wrap("Mở Bộ lọc ở bên phải ô tìm kiếm để kiểm tra trạng thái và cơ sở.")):
            draw.text((540, 2230+index*58), line, font=FONT, anchor="mt", fill="#17202A")
        image.save(args.output / "layout-proof.png")
        return
    if capture["status"] != "captured" or not args.audio:
        raise RuntimeError("Complete captures and aligned audio are required")
    timings = json.loads((args.output / "timing-review.json").read_text(encoding="utf-8"))
    if not all(timing.get("reviewed") for timing in timings.values()):
        raise RuntimeError("Review native transition frames before rendering")
    clips, all_cues, report = [], [], []
    elapsed = 0.0
    combined = args.output / "narration.wav"
    with wave.open(str(combined), "wb") as track:
        track.setnchannels(1)
        track.setsampwidth(2)
        track.setframerate(48000)
        for index, scene in enumerate(scenes):
            folder = args.output / scene["id"]
            folder.mkdir(exist_ok=True)
            voice_dir = args.audio / scene["id"]
            voice = json.loads((voice_dir / "voice.json").read_text(encoding="utf-8"))
            if not voice["sameResponseAudioAndAlignment"]:
                raise RuntimeError("Audio and alignment must have the same provenance")
            cues = captions(voice["words"])
            ass = folder / "captions.ass"
            write_ass(ass, cues)
            bg = folder / "background.png"
            background(scene, index, len(scenes)).save(bg)
            screenshot = Path(scene.get("image") or Path(scene["video"]).with_name("before.png"))
            x, y, w, h, sw, sh = placement(screenshot)
            # Captions occupy a separate region below the complete app image.
            if y+h >= CAPTION_TOP or any(len(cue["lines"]) > 2 for cue in cues):
                raise RuntimeError("Layout would overlap the app and captions")
            base_duration = LEAD + voice["duration"] + 0.65
            inputs = ["-loop", "1", "-framerate", str(FPS), "-i", str(bg)]
            if scene["capture"] == "still":
                inputs += ["-loop", "1", "-framerate", str(FPS), "-i", str(screenshot)]
                duration = math.ceil(base_duration*FPS)/FPS
                screen_filter = f"[1:v]scale={w}:{h},setsar=1[screen];"
                action_time = None
            else:
                timing = timings[scene["id"]]
                action_time = LEAD + voice["cueEnd"] + 0.1
                start = max(0, timing["motionStart"]-.35)
                pad = action_time-(timing["motionStart"]-start)
                if pad < 0:
                    raise RuntimeError("Action cue occurs before the retained source frame")
                duration = math.ceil(max(base_duration, action_time+timing["motionEnd"]-timing["motionStart"]+.55)*FPS)/FPS
                inputs += ["-i", str(folder / "native-30fps-v2.mp4")]
                screen_filter = (f"[1:v]trim=start={start}:end={timing['motionEnd']},setpts=PTS-STARTPTS,"
                                 f"tpad=start_mode=clone:start_duration={pad}:stop_mode=clone:stop_duration={duration},"
                                 f"scale={w}:{h},setsar=1[screen];")
            filters = screen_filter + f"[0:v][screen]overlay=x={x}:y={y}:shortest=1[layout];"
            label = "layout"
            if action_time is not None and scene.get("bounds"):
                bx1, by1, bx2, by2 = scene["bounds"]
                # Outline only. The target's text and icon stay visible.
                bx, by = x+bx1*w/sw, y+by1*h/sh
                bw, bh = (bx2-bx1)*w/sw, (by2-by1)*h/sh
                marker = folder / "action-marker.png"
                marker_image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
                marker_draw = ImageDraw.Draw(marker_image)
                marker_draw.rounded_rectangle((bx-6, by-6, bx+bw+6, by+bh+6), radius=min(18, bh/3), outline=(186, 32, 40, 230), width=5)
                marker_image.save(marker)
                inputs += ["-loop", "1", "-framerate", str(FPS), "-i", str(marker)]
                marker_start, marker_end = max(0, action_time-.65), max(.2, action_time-.04)
                filters += (f"[2:v]format=rgba,fade=t=in:st={marker_start}:d=0.12:alpha=1,"
                            f"fade=t=out:st={marker_end-.12}:d=0.12:alpha=1[marker];"
                            f"[layout][marker]overlay=0:0:shortest=1[marked];")
                label = "marked"
            filters += f"[{label}]subtitles='{escaped(ass)}',format=yuv420p[out]"
            clip = folder / "picture.mp4"
            run(*inputs, "-filter_complex", filters, "-map", "[out]", "-an", "-t", duration,
                "-r", FPS, "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-threads", "4", clip)
            clips.append(clip.resolve())
            with wave.open(str(voice_dir / "voice.wav")) as speech:
                if speech.getframerate() != 48000 or speech.getnchannels() != 1 or speech.getsampwidth() != 2:
                    raise RuntimeError("Unexpected narration format")
                samples = speech.readframes(speech.getnframes())
            leading_frames = round(LEAD*48000)
            trailing_frames = round(duration*48000)-leading_frames-len(samples)//2
            if trailing_frames < 0:
                raise RuntimeError("Narration would be truncated")
            track.writeframes(b"\0\0"*leading_frames + samples + b"\0\0"*trailing_frames)
            all_cues.extend({**cue, "start": elapsed+cue["start"], "end": elapsed+cue["end"]} for cue in cues)
            report.append({"scene": scene["id"], "start": elapsed, "duration": duration,
                           "spokenCueEnd": LEAD+voice["cueEnd"] if voice["cueEnd"] is not None else None,
                           "actionAt": action_time, "captionLinesMax": max(len(cue["lines"]) for cue in cues),
                           "appBottom": y+h, "captionAreaTop": CAPTION_TOP})
            elapsed += duration
            write_json(args.output / "render-progress.json", {"seconds": elapsed, "scenes": report})
            print(json.dumps({"scene": scene["id"], "rendered": True, "seconds": round(duration, 2)}), flush=True)
    concat = args.output / "pictures.txt"
    concat.write_text("\n".join("file '" + clip.as_posix() + "'" for clip in clips), encoding="utf-8")
    # Pictures are concatenated separately; narration is one continuous PCM
    # track, avoiding independent AAC priming offsets at scene boundaries.
    final = args.output / "Himoto-1.0.6-Mau-01-Tim-va-loc-xe.mp4"
    audio_gain = mux_audio(concat, combined, final, elapsed)
    srt = "\n\n".join(f"{index+1}\n{timestamp(cue['start'], True)} --> {timestamp(cue['end'], True)}\n"+"\n".join(cue["lines"]) for index, cue in enumerate(all_cues))
    final.with_suffix(".srt").write_text(srt+"\n", encoding="utf-8-sig")
    write_json(args.output / "quality.json", {"status": "rendered-awaiting-human-review", "duration": elapsed,
               "resolution": [WIDTH, HEIGHT], "fps": FPS, "provider": voice["provider"], "voiceId": voice["voiceId"],
               "platform": capture["platform"],
               "apkSha256": capture["apkSha256"], "operationalWrites": capture["operationalWrites"],
               "captionOutsideApp": True, "audioAlignmentSameResponse": True, "scenes": report,
               "audioGainDb": audio_gain, "sha256": hashlib.sha256(final.read_bytes()).hexdigest()})


if __name__ == "__main__":
    main()
