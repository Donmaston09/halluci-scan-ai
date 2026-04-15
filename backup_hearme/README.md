# HearMe Avatar Assist

This repository contains a Streamlit prototype for helping deaf and hard-of-hearing users follow spoken communication through readable captions, an on-screen avatar, and visual alerts.

## What it does

- Converts typed speech snippets into large, readable captions
- Records short audio chunks from the browser microphone and auto-transcribes them into a running caption session
- Simplifies long or complex phrasing into shorter text
- Produces avatar-facing output in:
  - English
  - British Sign Style Gloss
  - American Sign Style Gloss
  - Spanish
  - French
- Keeps a conversation history for easier follow-up
- Triggers visual alerts for important sounds like alarms, doorbells, and phone calls
- Provides a high-contrast interface designed for accessibility demos

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

On first transcription, Whisper may download a local model file.

## Prototype notes

- This MVP supports both typed input and near-live browser microphone caption sessions
- The avatar is currently a visual guide, not a full animated sign-language character
- Spanish and French translation are demo-grade phrase mappings plus fallback text
- Sign-style output is gloss-oriented and should not be treated as full ASL or BSL translation
- Whisper transcription quality depends on microphone quality, background noise, and the selected model size
- Streamlit currently works best here with record-and-append caption segments rather than truly continuous low-latency streaming

## Good next steps

- Upgrade from near-live caption segments to a custom realtime streaming audio pipeline
- Add a real animation layer for signed output
- Support personalized phrase banks for healthcare, schools, and customer service
- Add offline and mobile-first modes for everyday use
