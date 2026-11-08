"""ElevenLabs narration with alignment from the SAME synthesis response.

Credentials stay in the ignored local file and are never logged. Cached results
prevent repeated billing when rendering or recording again.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import wave
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / ".backups/training-pilot-1.0.6/elevenlabs.local.env"
FFMPEG = Path("E:/backup/daotaonhansukama/node_modules/ffmpeg-static/ffmpeg.exe")


def config():
    values = {}
    if CONFIG.exists():
        for line in CONFIG.read_text(encoding="utf-8-sig").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                name, value = line.split("=", 1)
                values[name.strip()] = value.strip().strip("\"'")
    for name in ("ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"):
        values[name] = os.environ.get(name, values.get(name, ""))
    if not values["ELEVENLABS_API_KEY"]:
        raise RuntimeError("ElevenLabs API key is not configured in the private local file")
    return values


def checked(response):
    if response.status_code != 200:
        try:
            detail = response.json().get("detail", {})
            status = detail.get("status", "request_failed") if isinstance(detail, dict) else "request_failed"
        except ValueError:
            status = "request_failed"
        message = str(detail.get("message", "")) if isinstance(detail, dict) else ""
        key = response.request.headers.get("xi-api-key", "")
        if key:
            message = message.replace(key, "[redacted]")
        raise RuntimeError(f"ElevenLabs HTTP {response.status_code}: {status}: {message[:500]}")
    return response.json()


def list_voices(session):
    data = checked(session.get("https://api.elevenlabs.io/v2/voices", params={"page_size": 100, "language": "vi"}, timeout=30))
    voices = data["voices"]
    while data.get("has_more"):
        data = checked(session.get("https://api.elevenlabs.io/v2/voices", params={"page_size": 100, "language": "vi", "next_page_token": data["next_page_token"]}, timeout=30))
        voices.extend(data["voices"])
    return [{key: voice.get(key) for key in ("voice_id", "name", "labels", "description", "verified_languages", "preview_url")} for voice in voices]


def alignment_words(alignment):
    chars = alignment["characters"]
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]
    if not (len(chars) == len(starts) == len(ends)):
        raise RuntimeError("Incomplete alignment from the synthesis response")
    text = "".join(chars)
    if any(len(char) != 1 for char in chars):
        raise RuntimeError("Expected character-level alignment")
    return [{"text": match.group(), "start": starts[match.start()], "end": ends[match.end()-1]}
            for match in re.finditer(r"\S+", text)]


def cue_time(words, cue):
    assembled = " ".join(word["text"] for word in words).casefold()
    match = assembled.find(cue.casefold())
    if match < 0:
        raise RuntimeError(f"Spoken action phrase missing from alignment: {cue}")
    end = match + len(cue)
    offset = 0
    for word in words:
        offset += len(word["text"])
        if offset >= end:
            return float(word["end"])
        offset += 1
    raise RuntimeError("Cannot resolve cue timing")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--model", default="eleven_v3")
    parser.add_argument("--only", help="Generate just one scene, e.g. 00-intro")
    parser.add_argument("--voice-id", help="Override the local Voice ID for an isolated voice comparison")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cfg = config()
    session = requests.Session()
    session.headers["xi-api-key"] = cfg["ELEVENLABS_API_KEY"]
    voice_id = args.voice_id or cfg["ELEVENLABS_VOICE_ID"]
    if args.list or not voice_id:
        voices = list_voices(session)
        (args.output / "available-vietnamese-voices.json").write_text(json.dumps(voices, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.list:
            print(json.dumps([{"id": voice["voice_id"], "name": voice["name"], "labels": voice["labels"]} for voice in voices], ensure_ascii=False))
            return
        ranked = sorted(voices, key=lambda v: (v.get("labels", {}).get("gender") == "female", bool(v.get("verified_languages"))), reverse=True)
        if not ranked:
            raise RuntimeError("No Vietnamese voice in the account; select one in ElevenLabs and configure its Voice ID")
        voice_id = ranked[0]["voice_id"]
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", voice_id):
        raise RuntimeError("Invalid configured Voice ID")
    scenes = json.loads(Path(__file__).with_name("pilot.json").read_text(encoding="utf-8"))["scenes"]
    settings = {"stability": 0.5, "similarity_boost": 0.75, "speed": 0.95}
    for scene in scenes:
        if args.only and scene["id"] != args.only:
            continue
        folder = args.output / scene["id"]
        folder.mkdir(exist_ok=True)
        fingerprint = hashlib.sha256(json.dumps([scene["text"], voice_id, args.model, settings], ensure_ascii=False).encode()).hexdigest()
        metadata_file = folder / "voice.json"
        if metadata_file.exists() and (folder / "voice.wav").exists():
            old = json.loads(metadata_file.read_text(encoding="utf-8"))
            if old["fingerprint"] == fingerprint:
                print(json.dumps({"scene": scene["id"], "cached": True}), flush=True)
                continue
        payload = {"text": scene["text"], "model_id": args.model, "language_code": "vi", "voice_settings": settings}
        # No retries for billed synthesis. Each successful result is cached.
        data = checked(session.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps",
                       params={"output_format": "mp3_44100_128"}, json=payload, timeout=120))
        alignment = data.get("normalized_alignment") or data.get("alignment")
        if not alignment:
            raise RuntimeError("Synthesis returned no alignment; refusing guessed subtitle timing")
        (folder / "voice.mp3").write_bytes(base64.b64decode(data["audio_base64"], validate=True))
        (folder / "alignment.json").write_text(json.dumps(alignment, ensure_ascii=False), encoding="utf-8")
        subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(folder / "voice.mp3"),
                        "-ar", "48000", "-ac", "1", str(folder / "voice.wav")], check=True)
        with wave.open(str(folder / "voice.wav")) as wav:
            duration = wav.getnframes() / wav.getframerate()
        words = alignment_words(alignment)
        if not words or min(word["start"] for word in words) < 0 or max(word["end"] for word in words) > duration + 0.2:
            raise RuntimeError("Alignment does not fit the actual decoded audio")
        result = {"provider": "ElevenLabs", "voiceId": voice_id, "model": args.model, "fingerprint": fingerprint,
                  "settings": settings, "duration": duration, "words": words,
                  "cueEnd": cue_time(words, scene["cue"]) if scene.get("cue") else None,
                  "sameResponseAudioAndAlignment": True}
        metadata_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"scene": scene["id"], "seconds": round(duration, 2), "characters": len(scene["text"])}), flush=True)


if __name__ == "__main__":
    main()
