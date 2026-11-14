# Pilot video Himoto 1.0.6

Scope: one native Android pilot, **Tìm và lọc xe**, before producing the remaining training library. Previous 1.0.4 videos are preserved. Application source is not modified.

## Inputs

- The installed Samsung APK must match `.backups/mobile-release-1.0.6-clean-20261108/Himoto-1.0.6-android-release.apk` by SHA-256.
- `pilot.json` is the authoritative scene list and spoken action cue. The pilot uses only navigation/search/filtering; it submits no business transaction.
- Put ElevenLabs credentials in the ignored `.backups/training-pilot-1.0.6/elevenlabs.local.env`. Never add that file, its contents or account responses to a deliverable.
- A Vietnamese library voice requires an ElevenLabs subscription that permits library voices through the API. A Free account can report unused characters yet reject that voice with `402 payment_required`.
- The current preview uses the available **Bella** preset (`hpp4J3VqNfWAUOO0d1Us`), `eleven_v3`, Vietnamese text and language `vi`. It is a voice comparison, not a claim that this preset has a native Vietnamese accent.
- Audio generated under the Free plan is for noncommercial review with attribution. A client handover needs newly generated audio under an appropriate commercial license; a later subscription does not retrospectively change the existing generation. [Provider billing/license documentation](https://elevenlabs.io/docs/overview/administration/billing).

## Commands

Run from the project root. Python dependencies used are the existing `requests`, `Pillow`, `numpy`, and `opencv-python`. FFmpeg and ADB paths are defined in the scripts.

```powershell
python scripts/training/capture_native.py --output .backups/training-pilot-1.0.6/native-take-02
python scripts/training/voice.py --output .backups/training-pilot-1.0.6/audio --list
python scripts/training/voice.py --output .backups/training-pilot-1.0.6/audio --only 00-intro
python scripts/training/voice.py --output .backups/training-pilot-1.0.6/audio
python scripts/training/render.py --capture .backups/training-pilot-1.0.6/native-take-02/capture.json --output .backups/training-pilot-1.0.6/render --analyze
python scripts/training/render.py --capture .backups/training-pilot-1.0.6/native-take-02/capture.json --output .backups/training-pilot-1.0.6/render --proof
```

For the approved alternative-voice preview:

```powershell
python scripts/training/voice.py --output .backups/training-pilot-1.0.6/audio-bella-preview --voice-id hpp4J3VqNfWAUOO0d1Us
```

Inspect the before/transition/after frames in `transition-contact-sheet.jpg`. Correct `motionStart` / `motionEnd` if needed, then set `reviewed: true` per scene in `timing-review.json`. Render refuses unreviewed transitions.

```powershell
python scripts/training/render.py --capture .backups/training-pilot-1.0.6/native-take-02/capture.json --audio .backups/training-pilot-1.0.6/audio --output .backups/training-pilot-1.0.6/render
python scripts/training/verify.py --output .backups/training-pilot-1.0.6/render
```

## Synchronization and layout

- One synthesis response supplies both the audio and character alignment. There is no second synthesis for subtitle timestamps.
- The first observable native UI change is placed 100 ms after the end of the spoken action cue. Only stationary source frames are extended before/after it; the recorded transition runs at its original speed.
- Narration uses one continuous PCM track, with real silence inserted at scene boundaries. Loudness is measured first, then constant gain is applied without changing sample timing. It is encoded to AAC once, avoiding independent encoder offsets per scene.
- Portrait output is 1080 × 2400 / 30 fps, H.264 + AAC. The complete app image preserves its aspect ratio.
- App panel: x=68, y=230, width=944, height=1940. Caption area: y=2212..2340, at most two lines. Layout checks reject overlap.
- Word-aligned subtitles use 46 px text, follow sentence boundaries and fit within two lines. They are written to SRT as well as burned into the reserved caption area. A rounded target outline fades out before the UI changes.

## Review limits

Automated timing/layout checks do not certify pronunciation or instructional quality. Review the actual MP4 on a phone and a computer, compare the spoken cue with the visible transition, and check the full sentence. The remaining training modules need separate demo data for contracts, collections, refunds, inventory changes and attendance; do not demonstrate those writes against production.

Provider references: [ElevenLabs synthesis with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps/), [Vietnamese voices](https://elevenlabs.io/text-to-speech/vietnamese).
