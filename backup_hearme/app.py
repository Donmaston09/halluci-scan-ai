import re
import tempfile
from hashlib import sha1
from dataclasses import dataclass

import pandas as pd
import streamlit as st

try:
    import whisper
except ImportError:
    whisper = None


st.set_page_config(
    page_title="HearMe Avatar Assist",
    page_icon="🧏",
    layout="wide",
)


LANGUAGE_OPTIONS = {
    "English": "en",
    "British Sign Style Gloss": "bsl",
    "American Sign Style Gloss": "asl",
    "Spanish": "es",
    "French": "fr",
}

SOUND_ALERTS = [
    ("Doorbell", "Someone is at the door"),
    ("Alarm", "Urgent sound detected"),
    ("Baby Cry", "A baby may need attention"),
    ("Name Call", "Someone may be calling your name"),
    ("Phone Ring", "Your phone is ringing"),
]

QUICK_PHRASES = [
    "Hello, how can I help you?",
    "Please speak a little slower.",
    "I am reading your message.",
    "Can you repeat that?",
    "Thank you for your patience.",
    "I need a written version of this.",
]

SIGN_KEYWORDS = {
    "hello": "[HELLO]",
    "help": "[HELP]",
    "thank": "[THANK-YOU]",
    "doctor": "[DOCTOR]",
    "water": "[WATER]",
    "food": "[FOOD]",
    "family": "[FAMILY]",
    "pain": "[PAIN]",
    "danger": "[DANGER]",
    "stop": "[STOP]",
    "yes": "[YES]",
    "no": "[NO]",
    "where": "[WHERE]",
    "please": "[PLEASE]",
}

TRANSLATION_PHRASES = {
    "es": {
        "hello, how can i help you?": "Hola, ¿como puedo ayudarte?",
        "please speak a little slower.": "Por favor, hable un poco mas despacio.",
        "i am reading your message.": "Estoy leyendo su mensaje.",
        "can you repeat that?": "¿Puede repetir eso?",
        "thank you for your patience.": "Gracias por su paciencia.",
        "i need a written version of this.": "Necesito una version escrita de esto.",
    },
    "fr": {
        "hello, how can i help you?": "Bonjour, comment puis-je vous aider ?",
        "please speak a little slower.": "Parlez un peu plus lentement, s'il vous plait.",
        "i am reading your message.": "Je lis votre message.",
        "can you repeat that?": "Pouvez-vous repeter cela ?",
        "thank you for your patience.": "Merci pour votre patience.",
        "i need a written version of this.": "J'ai besoin d'une version ecrite de cela.",
    },
}

STT_AVAILABLE = whisper is not None
WHISPER_MODEL_OPTIONS = ["tiny", "base", "small"]


@dataclass
class MessageCard:
    speaker: str
    original: str
    simplified: str
    translated: str
    urgency: str


def init_state() -> None:
    st.session_state.setdefault("conversation", [])
    st.session_state.setdefault("alerts", [])
    st.session_state.setdefault("caption_size", 30)
    st.session_state.setdefault("contrast_mode", True)
    st.session_state.setdefault("avatar_mood", "Calm")
    st.session_state.setdefault("last_transcript", "")
    st.session_state.setdefault("last_audio_hash", "")
    st.session_state.setdefault("caption_segments", [])


def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def simplify_text(text: str) -> str:
    cleaned = normalize_spaces(text)
    if not cleaned:
        return ""
    replacements = {
        "would you mind": "please",
        "approximately": "about",
        "in order to": "to",
        "assistance": "help",
        "immediately": "now",
        "regarding": "about",
    }
    lowered = cleaned.lower()
    for source, target in replacements.items():
        lowered = lowered.replace(source, target)

    sentences = re.split(r"(?<=[.!?])\s+", lowered)
    shorter = []
    for sentence in sentences:
        words = sentence.split()
        if len(words) > 14:
            sentence = " ".join(words[:14]) + "..."
        shorter.append(sentence.capitalize())
    return " ".join(part for part in shorter if part)


def detect_urgency(text: str) -> str:
    lowered = text.lower()
    urgent_words = {"urgent", "danger", "help", "emergency", "alarm", "stop", "fire", "pain"}
    if any(word in lowered for word in urgent_words):
        return "High"
    if len(text.split()) > 20:
        return "Medium"
    return "Low"


def translate_text(text: str, target_code: str) -> str:
    cleaned = normalize_spaces(text)
    if not cleaned:
        return ""
    if target_code == "en":
        return cleaned
    if target_code in {"asl", "bsl"}:
        return to_sign_gloss(cleaned, target_code)
    lookup = TRANSLATION_PHRASES.get(target_code, {})
    return lookup.get(cleaned.lower(), f"[Demo translation to {target_code.upper()}] {cleaned}")


def to_sign_gloss(text: str, sign_variant: str) -> str:
    tokens = re.findall(r"[a-zA-Z']+", text.lower())
    gloss = [SIGN_KEYWORDS.get(token, token.upper()) for token in tokens]
    prefix = "BSL" if sign_variant == "bsl" else "ASL"
    return f"{prefix}: " + " ".join(gloss)


def avatar_reaction(urgency: str) -> tuple[str, str]:
    if urgency == "High":
        return "Alert", "#ff6b6b"
    if urgency == "Medium":
        return "Focused", "#f7b32b"
    return "Calm", "#2bb3a3"


@st.cache_resource(show_spinner=False)
def load_whisper_model(model_name: str):
    if whisper is None:
        return None
    return whisper.load_model(model_name)


def transcribe_audio_bytes(audio_bytes: bytes, model_name: str) -> str:
    if whisper is None:
        return ""

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    model = load_whisper_model(model_name)
    result = model.transcribe(temp_audio_path, fp16=False)
    return normalize_spaces(result.get("text", ""))


def process_audio_segment(audio_bytes: bytes, target_code: str, model_name: str) -> str:
    transcript = transcribe_audio_bytes(audio_bytes, model_name)
    if not transcript:
        return ""

    st.session_state.last_transcript = transcript
    st.session_state.caption_segments.append(transcript)
    push_message("Microphone", transcript, target_code)
    return transcript


def push_message(speaker: str, text: str, target_code: str) -> None:
    simplified = simplify_text(text)
    urgency = detect_urgency(text)
    translated = translate_text(simplified or text, target_code)
    mood, _ = avatar_reaction(urgency)
    st.session_state.avatar_mood = mood
    st.session_state.conversation.append(
        MessageCard(
            speaker=speaker,
            original=text,
            simplified=simplified or text,
            translated=translated,
            urgency=urgency,
        )
    )


def push_alert(alert_name: str, description: str) -> None:
    st.session_state.alerts.insert(0, {"alert": alert_name, "description": description})
    st.session_state.avatar_mood = "Alert"


def render_styles() -> None:
    background = "#08111f" if st.session_state.contrast_mode else "#f6f4ef"
    surface = "#101b2e" if st.session_state.contrast_mode else "#ffffff"
    text_color = "#f6fbff" if st.session_state.contrast_mode else "#132238"
    muted = "#a7bdd8" if st.session_state.contrast_mode else "#4f6173"
    st.markdown(
        f"""
        <style>
        .stApp {{
            background:
                radial-gradient(circle at top left, rgba(43,179,163,0.18), transparent 30%),
                radial-gradient(circle at top right, rgba(247,179,43,0.18), transparent 24%),
                {background};
            color: {text_color};
        }}
        .hero {{
            background: linear-gradient(135deg, rgba(16,27,46,0.92), rgba(20,48,76,0.88));
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 28px;
            padding: 28px;
            margin-bottom: 18px;
            box-shadow: 0 24px 60px rgba(0,0,0,0.20);
        }}
        .avatar-card, .caption-card, .panel-card {{
            background: {surface};
            border-radius: 24px;
            padding: 22px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 18px 40px rgba(0,0,0,0.12);
            min-height: 100%;
        }}
        .avatar-face {{
            width: 180px;
            height: 180px;
            margin: 12px auto 18px;
            border-radius: 50%;
            background: linear-gradient(180deg, #ffd9b8, #f5b88a);
            position: relative;
            box-shadow: inset 0 -18px 0 rgba(0,0,0,0.07);
        }}
        .eye {{
            width: 22px;
            height: 22px;
            background: #16324f;
            border-radius: 50%;
            position: absolute;
            top: 70px;
        }}
        .eye.left {{ left: 48px; }}
        .eye.right {{ right: 48px; }}
        .mouth {{
            width: 62px;
            height: 24px;
            border-bottom: 6px solid #9d4b33;
            border-radius: 0 0 50px 50px;
            position: absolute;
            left: 59px;
            top: 118px;
        }}
        .avatar-status {{
            text-align: center;
            font-size: 1rem;
            color: {muted};
        }}
        .caption-text {{
            font-size: {st.session_state.caption_size}px;
            line-height: 1.45;
            font-weight: 700;
        }}
        .translated-text {{
            margin-top: 16px;
            padding: 16px;
            border-radius: 18px;
            background: rgba(43,179,163,0.12);
            font-size: 1.05rem;
        }}
        .chip {{
            display: inline-block;
            padding: 6px 12px;
            border-radius: 999px;
            background: rgba(247,179,43,0.14);
            color: {text_color};
            font-size: 0.88rem;
            margin-right: 8px;
            margin-bottom: 8px;
        }}
        .timeline {{
            border-left: 3px solid rgba(43,179,163,0.5);
            padding-left: 18px;
            margin-left: 8px;
        }}
        .timeline-item {{
            margin-bottom: 18px;
            padding-bottom: 10px;
        }}
        .muted {{
            color: {muted};
        }}
        .metric-box {{
            background: rgba(255,255,255,0.04);
            padding: 16px;
            border-radius: 18px;
            text-align: center;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_header() -> None:
    st.markdown(
        """
        <div class="hero">
            <h1>HearMe Avatar Assist</h1>
            <p style="font-size:1.1rem; max-width:760px;">
                A Streamlit prototype for deaf and hard-of-hearing users. It turns spoken content into
                readable captions, simplified language, sign-style gloss, and visual alerts through an
                on-screen avatar.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_avatar_panel(latest: MessageCard | None) -> None:
    urgency = latest.urgency if latest else "Low"
    mood, color = avatar_reaction(urgency)
    st.markdown(
        f"""
        <div class="avatar-card">
            <h3>Avatar Guide</h3>
            <div class="avatar-face">
                <div class="eye left"></div>
                <div class="eye right"></div>
                <div class="mouth"></div>
            </div>
            <div class="avatar-status">
                <div><strong>Status:</strong> <span style="color:{color};">{mood}</span></div>
                <div><strong>Mode:</strong> visual cue + readable translation</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_caption_panel(latest: MessageCard | None) -> None:
    if latest is None:
        message = "Your next spoken message will appear here."
        translated = "Choose a translation mode from the sidebar to see the avatar output."
        speaker = "Waiting"
        urgency = "Low"
    else:
        message = latest.simplified
        translated = latest.translated
        speaker = latest.speaker
        urgency = latest.urgency

    st.markdown(
        f"""
        <div class="caption-card">
            <h3>Live Caption</h3>
            <div class="muted">Speaker: {speaker} | Urgency: {urgency}</div>
            <div class="caption-text">{message}</div>
            <div class="translated-text"><strong>Avatar Output:</strong><br>{translated}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_overview(latest: MessageCard | None) -> None:
    conversation = st.session_state.conversation
    alerts = st.session_state.alerts
    summary_df = pd.DataFrame(
        [
            {"Metric": "Messages processed", "Value": len(conversation)},
            {"Metric": "High urgency messages", "Value": sum(1 for item in conversation if item.urgency == "High")},
            {"Metric": "Sound alerts", "Value": len(alerts)},
            {"Metric": "Current avatar mood", "Value": st.session_state.avatar_mood},
        ]
    )

    left, right = st.columns([1.3, 1])
    with left:
        render_caption_panel(latest)
    with right:
        render_avatar_panel(latest)

    st.dataframe(summary_df, hide_index=True, use_container_width=True)


def render_microphone_input(target_code: str, model_name: str) -> None:
    st.subheader("Microphone Speech-to-Text")
    st.write(
        "Record short chunks in sequence and the app will auto-transcribe them into a running caption session."
    )
    st.caption(
        "This is near-live captioning inside Streamlit: each fresh recording is transcribed automatically and appended to the live session."
    )

    if not STT_AVAILABLE:
        st.warning(
            "Microphone recording is ready, but local speech-to-text needs the optional `openai-whisper` package installed."
        )

    audio_clip = st.audio_input("Record from microphone")
    if audio_clip is not None:
        st.audio(audio_clip)
        audio_bytes = audio_clip.getvalue()
        audio_hash = sha1(audio_bytes).hexdigest()
        if audio_hash != st.session_state.last_audio_hash:
            st.session_state.last_audio_hash = audio_hash
            if not STT_AVAILABLE:
                st.error("Install the speech-to-text dependency first, then try again.")
            else:
                with st.spinner("Transcribing your latest segment..."):
                    transcript = process_audio_segment(audio_bytes, target_code, model_name)
                if transcript:
                    st.success("New caption segment added.")
                else:
                    st.warning("I couldn't detect speech in that recording. Please try again.")

    left, right = st.columns([1.5, 1])
    with left:
        if st.session_state.caption_segments:
            session_text = " ".join(st.session_state.caption_segments)
            st.markdown(
                f"""
                <div class="panel-card">
                    <h3>Live Caption Session</h3>
                    <div>{session_text}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        elif st.session_state.last_transcript:
            st.markdown(
                f"""
                <div class="panel-card">
                    <h3>Latest Microphone Transcript</h3>
                    <div>{st.session_state.last_transcript}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            st.info("Your caption session will build here as you record short audio chunks.")

    with right:
        st.markdown('<div class="panel-card">', unsafe_allow_html=True)
        st.markdown("### Session Controls")
        st.write(f"Segments captured: {len(st.session_state.caption_segments)}")
        if st.button("Clear live session", use_container_width=True):
            st.session_state.caption_segments = []
            st.session_state.last_transcript = ""
            st.session_state.last_audio_hash = ""
            st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)


def render_input_controls(target_code: str) -> None:
    st.subheader("Conversation Input")
    speaker = st.selectbox("Speaker", ["Listener", "Family member", "Doctor", "Teacher", "Support staff"])
    typed_message = st.text_area(
        "Enter speech or a conversation snippet",
        placeholder="Example: Hello, I need your help immediately because the fire alarm is sounding.",
        height=130,
    )

    left, right = st.columns([1, 1])
    with left:
        if st.button("Process Message", use_container_width=True):
            if typed_message.strip():
                push_message(speaker, typed_message.strip(), target_code)
            else:
                st.warning("Enter a message first so the avatar has something to translate.")
    with right:
        selected_phrase = st.selectbox("Quick phrase", QUICK_PHRASES)
        if st.button("Send Quick Phrase", use_container_width=True):
            push_message("Preset", selected_phrase, target_code)


def render_alert_controls() -> None:
    st.subheader("Visual Sound Alerts")
    cols = st.columns(len(SOUND_ALERTS))
    for idx, (alert_name, description) in enumerate(SOUND_ALERTS):
        with cols[idx]:
            if st.button(alert_name, use_container_width=True):
                push_alert(alert_name, description)

    if st.session_state.alerts:
        st.markdown('<div class="panel-card">', unsafe_allow_html=True)
        st.markdown("### Recent Alerts")
        for alert in st.session_state.alerts[:5]:
            st.markdown(f'<div class="chip">{alert["alert"]}</div> {alert["description"]}', unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)


def render_history() -> None:
    st.subheader("Conversation History")
    if not st.session_state.conversation:
        st.info("No messages yet. Process a message to build a readable history.")
        return

    st.markdown('<div class="panel-card"><div class="timeline">', unsafe_allow_html=True)
    for item in reversed(st.session_state.conversation[-8:]):
        st.markdown(
            f"""
            <div class="timeline-item">
                <strong>{item.speaker}</strong> <span class="muted">| urgency {item.urgency}</span><br>
                <span class="muted">Original:</span> {item.original}<br>
                <span class="muted">Simplified:</span> {item.simplified}<br>
                <span class="muted">Avatar:</span> {item.translated}
            </div>
            """,
            unsafe_allow_html=True,
        )
    st.markdown("</div></div>", unsafe_allow_html=True)


def render_about() -> None:
    st.subheader("What This Prototype Does")
    st.write(
        "This MVP demonstrates how an accessibility app can convert spoken content into large captions, "
        "simplified language, sign-style gloss, and visual alerts. The avatar is a UI guide for now, not a full 3D signer."
    )
    st.write(
        "A production version could add truly streaming captions, multilingual translation, personal vocabularies, "
        "emergency detection, and a proper animated signing avatar."
    )

    roadmap = pd.DataFrame(
        [
            {"Phase": "Now", "Capability": "Near-live caption sessions from microphone recordings, alerts, avatar panel, readable captions"},
            {"Phase": "Next", "Capability": "True streaming captions from a custom realtime audio pipeline"},
            {"Phase": "Later", "Capability": "Sign language animation engine and personalized settings"},
        ]
    )
    st.dataframe(roadmap, hide_index=True, use_container_width=True)


def main() -> None:
    init_state()
    render_styles()
    render_header()

    with st.sidebar:
        st.header("Accessibility Settings")
        target_language = st.selectbox("Avatar translation mode", list(LANGUAGE_OPTIONS.keys()))
        whisper_model = st.selectbox("Speech model", WHISPER_MODEL_OPTIONS, index=0, disabled=not STT_AVAILABLE)
        st.session_state.caption_size = st.slider("Caption size", 22, 44, st.session_state.caption_size, 2)
        st.session_state.contrast_mode = st.toggle("High contrast mode", value=st.session_state.contrast_mode)
        st.markdown("**Demo features**")
        st.write("- Microphone capture")
        st.write("- Simplified captions")
        st.write("- Sign-style gloss")
        st.write("- Visual sound alerts")
        st.write("- Conversation memory")
        if not STT_AVAILABLE:
            st.info("Install `openai-whisper` to enable local microphone transcription.")
        if st.button("Clear conversation", use_container_width=True):
            st.session_state.conversation = []
            st.session_state.alerts = []
            st.session_state.avatar_mood = "Calm"
            st.session_state.last_transcript = ""
            st.session_state.last_audio_hash = ""
            st.session_state.caption_segments = []

    latest = st.session_state.conversation[-1] if st.session_state.conversation else None
    render_overview(latest)

    tabs = st.tabs(["Microphone", "Assist", "Alerts", "History", "About"])
    with tabs[0]:
        render_microphone_input(LANGUAGE_OPTIONS[target_language], whisper_model)
    with tabs[1]:
        render_input_controls(LANGUAGE_OPTIONS[target_language])
    with tabs[2]:
        render_alert_controls()
    with tabs[3]:
        render_history()
    with tabs[4]:
        render_about()


if __name__ == "__main__":
    main()
