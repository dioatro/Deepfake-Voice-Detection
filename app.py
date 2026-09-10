import os
import io
import base64
import librosa
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from detector import analyze_audio, decode_audio

app = FastAPI(
    title="AI Voice Detection Portal",
    description="Multilingual AI-Generated vs Human Voice Forensics & Detection System",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SAMPLES_DIR = os.path.join(STATIC_DIR, "samples")

API_KEY = os.getenv("API_KEY", "test_key_123")

# ==========================================
# Preloaded Samples Catalog
# ==========================================
DEMO_SAMPLES = [
    {
        "id": "sample_ai_en",
        "title": "AI Voice (English)",
        "language": "English",
        "type": "AI Synthetic",
        "filename": "sample_ai_en.mp3",
        "description": "Synthesized with neural text-to-speech network (English US)",
        "expected": "AI_GENERATED"
    },
    {
        "id": "sample_ai_hi",
        "title": "AI Voice (Hindi)",
        "language": "Hindi",
        "type": "AI Synthetic",
        "filename": "sample_ai_hi.mp3",
        "description": "Synthesized neural Indian Hindi voice model",
        "expected": "AI_GENERATED"
    },
    {
        "id": "sample_ai_ta",
        "title": "AI Voice (Tamil)",
        "language": "Tamil",
        "type": "AI Synthetic",
        "filename": "sample_ai_ta.mp3",
        "description": "Synthesized neural Tamil voice model",
        "expected": "AI_GENERATED"
    },
    {
        "id": "sample_human_demo",
        "title": "Human Speech Demo",
        "language": "English",
        "type": "Human Spoken",
        "filename": "sample_human_demo.wav",
        "description": "Organic speech dynamics with natural micro-pitch variations and breath pauses",
        "expected": "HUMAN"
    }
]

@app.get("/")
def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"status": "ok", "message": "AI Voice Detection API is operational"}

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "AI Voice Detection API", "version": "2.0.0"}

@app.get("/api/samples")
def get_samples():
    return {"status": "success", "samples": DEMO_SAMPLES}

@app.get("/api/sample-audio/{sample_id}")
def stream_sample_audio(sample_id: str):
    sample = next((s for s in DEMO_SAMPLES if s["id"] == sample_id), None)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    
    file_path = os.path.join(SAMPLES_DIR, sample["filename"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Sample audio file not found on disk")
    
    media_type = "audio/mpeg" if sample["filename"].endswith(".mp3") else "audio/wav"
    return FileResponse(file_path, media_type=media_type)

# ==========================================
# Primary File Upload Detection Endpoint
# ==========================================
@app.post("/api/detect-file")
async def detect_file(
    file: UploadFile = File(...),
    language: str = Form("Auto-detect")
):
    try:
        content = await file.read()
        print(f"[DEBUG] Received upload: filename={file.filename}, size={len(content)}, content_type={file.content_type}")
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file provided")

        # Load audio using universal decoder
        try:
            audio, sr = decode_audio(content, target_sr=16000)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to decode audio file: {str(e)}")

        try:
            result = analyze_audio(audio, sr, language=language)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        result["filename"] = file.filename
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection processing error: {str(e)}")

# ==========================================
# Original Repository Base64 REST Endpoint
# ==========================================
@app.post("/api/voice-detection")
def voice_detection(payload: dict, x_api_key: str = Header(None)):
    # Support optional API key if configured
    if API_KEY and API_KEY != "test_key_123" and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if "audioBase64" not in payload:
        raise HTTPException(status_code=400, detail="audioBase64 missing in request body")

    try:
        raw_b64 = payload["audioBase64"]
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
            
        audio_bytes = base64.b64decode(raw_b64, validate=True)
        audio, sr = decode_audio(audio_bytes, target_sr=16000)

        lang = payload.get("language", "English")
        result = analyze_audio(audio, sr, language=lang)
        
        # Return structured JSON adhering to the repository specification
        return {
            "status": "success",
            "language": lang,
            "classification": result["classification"],
            "confidenceScore": result["confidenceScore"],
            "confidencePercent": result["confidencePercent"],
            "explanation": result["explanation"],
            "riskLevel": result["riskLevel"],
            "duration": result["duration"],
            "features": result["features"],
            "waveformPeaks": result["waveformPeaks"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Audio processing failed: {str(e)}")

# Mount static folder

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
