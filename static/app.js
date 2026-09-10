// Frontend application logic for AI Voice Forensics Portal
const API_BASE = (window.location.protocol === "file:" || !window.location.port) ? "http://127.0.0.1:8000" : "";

function safeCreateIcons() {
    try {
        if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    } catch (e) {}
}

let currentAudioBlob = null;
let currentAudioUrl = null;
let currentFileName = "sample.wav";
let currentDuration = 0;
let peaksData = [];
let visualizerAnimationId = null;

// PCM Web Audio capture variables
let audioContext = null;
let mediaStreamSource = null;
let scriptProcessorNode = null;
let activeMediaStream = null;
let pcmSampleBuffer = []; // List of Float32Array chunks
let mediaRecorder = null;
let mediaRecorderChunks = [];
let pcmSampleRate = 16000;
let isRecordingPcm = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let liveStreamInterval = null;
let isAnalyzingLive = false;
let liveSmoothedPercent = null;
let liveSmoothedIsAi = null;

// Inline SVGs
const SVG_MIC = '<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"></path></svg>';
const SVG_STOP = '<svg class="w-6 h-6 text-rose-300" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';

// DOM Elements
const tabUpload = document.getElementById("tabUpload");
const tabRecord = document.getElementById("tabRecord");
const tabSamples = document.getElementById("tabSamples");
const panelUpload = document.getElementById("panelUpload");
const panelRecord = document.getElementById("panelRecord");
const panelSamples = document.getElementById("panelSamples");

const dropZone = document.getElementById("dropZone");
const audioFileInput = document.getElementById("audioFileInput");
const languageSelect = document.getElementById("languageSelect");

// Mic Section Elements
const turnOnMicBtn = document.getElementById("turnOnMicBtn");
const btnMicIcon = document.getElementById("btnMicIcon");
const btnMicLabel = document.getElementById("btnMicLabel");
const micStateDot = document.getElementById("micStateDot");
const micStateText = document.getElementById("micStateText");
const recordTimer = document.getElementById("recordTimer");
const liveVisualizer = document.getElementById("liveRecordVisualizer");
const liveVolumeLabel = document.getElementById("liveVolumeLabel");

// Live In-Segment Result Box Elements
const micLiveResultBox = document.getElementById("micLiveResultBox");
const livePulseDot = document.getElementById("livePulseDot");
const liveVerdictStatus = document.getElementById("liveVerdictStatus");
const liveVerdictBadge = document.getElementById("liveVerdictBadge");
const liveVerdictHeadline = document.getElementById("liveVerdictHeadline");
const liveVerdictSubtitle = document.getElementById("liveVerdictSubtitle");
const liveConfidencePercentage = document.getElementById("liveConfidencePercentage");
const liveConfidenceBar = document.getElementById("liveConfidenceBar");
const liveMicPitch = document.getElementById("liveMicPitch");
const liveMicPitchStd = document.getElementById("liveMicPitchStd");
const liveMicType = document.getElementById("liveMicType");

// Player & Sample Elements
const samplesList = document.getElementById("samplesList");
const loadedAudioName = document.getElementById("loadedAudioName");
const loadedAudioMeta = document.getElementById("loadedAudioMeta");
const playPauseBtn = document.getElementById("playPauseBtn");
const playIcon = document.getElementById("playIcon");
const playText = document.getElementById("playText");
const clearAudioBtn = document.getElementById("clearAudioBtn");
const waveformCanvas = document.getElementById("waveformCanvas");
const waveformProgress = document.getElementById("waveformProgress");
const nativeAudio = document.getElementById("nativeAudio");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzeIcon = document.getElementById("analyzeIcon");
const analyzeText = document.getElementById("analyzeText");

// Master Results Elements (Right Panel)
const verdictCard = document.getElementById("verdictCard");
const verdictBadge = document.getElementById("verdictBadge");
const verdictTitle = document.getElementById("verdictTitle");
const verdictRisk = document.getElementById("verdictRisk");
const confidenceScoreVal = document.getElementById("confidenceScoreVal");
const gaugeCircle = document.getElementById("gaugeCircle");
const verdictIcon = document.getElementById("verdictIcon");
const explanationBanner = document.getElementById("explanationBanner");

// Master Forensic Metric Elements
const metricPitchMean = document.getElementById("metricPitchMean");
const metricPitchStd = document.getElementById("metricPitchStd");
const metricSpectral = document.getElementById("metricSpectral");
const metricRms = document.getElementById("metricRms");
const mfccChart = document.getElementById("mfccChart");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    setupTabNavigation();
    setupFileUpload();
    setupAudioRecording();
    loadDemoSamples();
    setupAudioPlayer();
    setupHistory();
    setupApiTabs();
    initWaveformCanvas();
    safeCreateIcons();
});

// Helper: Convert Float32Array PCM samples to a 100% valid 16-bit WAV file
function encodeWavPcm(floatSamples, sampleRate) {
    const buffer = new ArrayBuffer(44 + floatSamples.length * 2);
    const view = new DataView(buffer);

    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + floatSamples.length * 2, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true);  // NumChannels (1 mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true);  // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample (16 bits)

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, floatSamples.length * 2, true);

    // Write 16-bit PCM samples with clipping protection
    let offset = 44;
    for (let i = 0; i < floatSamples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, floatSamples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([new Uint8Array(buffer)], { type: 'audio/wav' });
}

// Tab Navigation
function setupTabNavigation() {
    const tabs = [
        { btn: tabUpload, panel: panelUpload },
        { btn: tabRecord, panel: panelRecord },
        { btn: tabSamples, panel: panelSamples }
    ];

    tabs.forEach(t => {
        t.btn.addEventListener("click", () => {
            tabs.forEach(item => {
                item.btn.classList.remove("bg-cyan-600", "text-white");
                item.btn.classList.add("text-slate-400");
                item.panel.classList.add("hidden");
            });
            t.btn.classList.add("bg-cyan-600", "text-white");
            t.btn.classList.remove("text-slate-400");
            t.panel.classList.remove("hidden");
        });
    });
}

// File Upload
function setupFileUpload() {
    dropZone.addEventListener("click", () => audioFileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("border-cyan-400", "bg-cyber-900");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("border-cyan-400", "bg-cyber-900");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("border-cyan-400", "bg-cyber-900");
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleSelectedFile(e.dataTransfer.files[0]);
        }
    });

    audioFileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            handleSelectedFile(e.target.files[0]);
        }
    });
}

function handleSelectedFile(file) {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i)) {
        alert("Please upload a valid audio file (WAV, MP3, OGG, FLAC, M4A, WebM).");
        return;
    }
    loadAudioBlob(file, file.name);
}

// Load Audio into Web Player
function loadAudioBlob(blob, filename) {
    currentAudioBlob = blob;
    currentFileName = filename;

    if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
    }
    currentAudioUrl = URL.createObjectURL(blob);
    nativeAudio.src = currentAudioUrl;

    loadedAudioName.textContent = filename;
    const sizeKb = (blob.size / 1024).toFixed(1);
    loadedAudioMeta.textContent = `Loading metadata... | ${sizeKb} KB`;

    playPauseBtn.disabled = false;
    analyzeBtn.disabled = false;

    nativeAudio.onloadedmetadata = () => {
        currentDuration = nativeAudio.duration;
        loadedAudioMeta.textContent = `${currentDuration.toFixed(2)}s | ${sizeKb} KB`;
        generateWaveformPreview(blob);
    };
}

// Audio Player
function setupAudioPlayer() {
    playPauseBtn.addEventListener("click", () => {
        if (nativeAudio.paused) {
            nativeAudio.play();
            playText.textContent = "Pause";
        } else {
            nativeAudio.pause();
            playText.textContent = "Play";
        }
        safeCreateIcons();
    });

    nativeAudio.addEventListener("timeupdate", () => {
        if (currentDuration > 0) {
            const progress = (nativeAudio.currentTime / currentDuration) * 100;
            waveformProgress.style.width = `${progress}%`;
        }
    });

    nativeAudio.addEventListener("ended", () => {
        playText.textContent = "Play";
        waveformProgress.style.width = "0%";
        safeCreateIcons();
    });

    clearAudioBtn.addEventListener("click", () => {
        resetAudioPlayer();
    });

    waveformCanvas.addEventListener("click", (e) => {
        if (!currentDuration) return;
        const rect = waveformCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;
        nativeAudio.currentTime = percent * currentDuration;
    });

    analyzeBtn.addEventListener("click", () => {
        runVoiceDetection();
    });
}

function resetAudioPlayer() {
    nativeAudio.pause();
    nativeAudio.src = "";
    currentAudioBlob = null;
    currentAudioUrl = null;
    currentDuration = 0;
    loadedAudioName.textContent = "No audio loaded";
    loadedAudioMeta.textContent = "0.00s | 0 KB";
    playPauseBtn.disabled = true;
    analyzeBtn.disabled = true;
    waveformProgress.style.width = "0%";
    drawStaticWaveform([]);
}

// =======================================================
// PURE PCM WEB AUDIO API RECORDING & ROLLING WAV STREAMING
// =======================================================
function setupAudioRecording() {
    if (!turnOnMicBtn) return;
    turnOnMicBtn.addEventListener("click", async () => {
        if (isRecordingPcm) {
            stopPcmRecording();
        } else {
            await startPcmRecording();
        }
    });
}

async function startPcmRecording() {
    try {
        activeMediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create or reuse AudioContext and ensure it is in running state
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        pcmSampleRate = audioContext.sampleRate || 44100;
        pcmSampleBuffer = [];
        mediaRecorderChunks = [];
        isRecordingPcm = true;
        recordStartTime = Date.now();
        liveSmoothedPercent = null;
        liveSmoothedIsAi = null;

        mediaStreamSource = audioContext.createMediaStreamSource(activeMediaStream);
        
        // 4096 samples buffer for live PCM capture
        scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorNode.onaudioprocess = (e) => {
            if (!isRecordingPcm) return;
            const inputData = e.inputBuffer.getChannelData(0);
            pcmSampleBuffer.push(new Float32Array(inputData));
        };

        // Connect through a zero-gain node to prevent microphone feedback howling and speaker echo
        const zeroGainNode = audioContext.createGain();
        zeroGainNode.gain.value = 0;
        mediaStreamSource.connect(scriptProcessorNode);
        scriptProcessorNode.connect(zeroGainNode);
        zeroGainNode.connect(audioContext.destination);

        // Also start native MediaRecorder as dual-redundancy fallback
        try {
            let mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
                ? "audio/webm;codecs=opus" 
                : (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm");
            mediaRecorder = new MediaRecorder(activeMediaStream, { mimeType });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) mediaRecorderChunks.push(e.data);
            };
            mediaRecorder.start(250);
        } catch (e) {
            console.log("MediaRecorder fallback not available:", e.message);
        }

        // UI State -> Active
        turnOnMicBtn.className = "w-full max-w-md mx-auto py-4 px-6 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-bold text-base tracking-wide flex items-center justify-center gap-3 shadow-xl shadow-rose-600/30 transition-all active:scale-95 group";
        btnMicIcon.innerHTML = SVG_STOP;
        btnMicLabel.textContent = "Stop Microphone & Finalize Verdict";

        micStateDot.className = "w-3 h-3 rounded-full bg-rose-500 animate-ping";
        micStateText.className = "text-xs font-mono font-bold text-rose-400 uppercase tracking-wider";
        micStateText.textContent = "Live Forensic Listening Active";

        // Reset live result segment
        micLiveResultBox.className = "p-5 rounded-xl border border-cyan-500/50 bg-cyber-950/90 text-left space-y-4 transition-all duration-300";
        livePulseDot.className = "w-3 h-3 rounded-full bg-cyan-400 animate-ping";
        liveVerdictStatus.className = "text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider";
        liveVerdictStatus.textContent = "Analyzing Speech Stream Live...";
        liveVerdictBadge.className = "text-xs font-mono font-bold px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 animate-pulse";
        liveVerdictBadge.textContent = "SCANNING...";
        liveVerdictHeadline.textContent = "Speak into microphone...";
        liveVerdictSubtitle.textContent = "Direct uncompressed 16-bit PCM audio is streaming to the acoustic detector in real-time.";

        // 60-second Timer & Progress Tracking
        recordTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
            const secs = String(elapsed % 60).padStart(2, "0");
            recordTimer.textContent = `${mins}:${secs}`;

            const progressBar = document.getElementById("sessionProgressBar");
            const sessionTarget = document.getElementById("sessionDurationTarget");
            if (progressBar) {
                const pct = Math.min(100, Math.round((elapsed / 60) * 100));
                progressBar.style.width = `${pct}%`;
                if (sessionTarget) {
                    if (elapsed >= 60) {
                        sessionTarget.innerHTML = `<span class="text-emerald-400 font-bold">✓ 1-Min Analyzed (${elapsed}s)</span>`;
                    } else {
                        sessionTarget.textContent = `${pct}% of 1-Min Benchmark (${elapsed}s)`;
                    }
                }
            }
        }, 500);

        // Visualizer
        startPcmVisualizer(activeMediaStream);

        // 60-SECOND CONTINUOUS LIVE ROLLING WAV DETECTION ENGINE:
        // Takes the LAST 3.0 seconds of raw PCM samples, encodes a clean 16-bit WAV,
        // and evaluates every 1.2 seconds. Never degrades over 1 minute or longer!
        liveStreamInterval = setInterval(async () => {
            const elapsedSec = (Date.now() - recordStartTime) / 1000;
            if (elapsedSec >= 1.0 && pcmSampleBuffer.length > 0 && !isAnalyzingLive) {
                isAnalyzingLive = true;
                try {
                    // Extract last 3.0 seconds of PCM samples
                    const samplesNeeded = Math.floor(pcmSampleRate * 3.0);
                    const allSamples = flattenPcmBuffer(pcmSampleBuffer);
                    const recentSamples = allSamples.length > samplesNeeded 
                        ? allSamples.subarray(allSamples.length - samplesNeeded)
                        : allSamples;

                    // Verify window has active speech sound (not pure silence)
                    let maxAmp = 0;
                    for (let i = 0; i < recentSamples.length; i += 8) {
                        const abs = Math.abs(recentSamples[i]);
                        if (abs > maxAmp) maxAmp = abs;
                    }

                    if (maxAmp > 0.015) {
                        // Encode pure 16-bit WAV (always 100% valid with 44-byte header)
                        const wavBlob = encodeWavPcm(recentSamples, pcmSampleRate);
                        const formData = new FormData();
                        formData.append("file", wavBlob, "live_stream.wav");
                        formData.append("language", languageSelect.value);

                        const res = await fetch(`${API_BASE}/api/detect-file`, {
                            method: "POST",
                            body: formData
                        });

                        if (res.ok) {
                            const data = await res.json();
                            if (data.status === "success") {
                                updateLiveMicSegment(data);
                                renderDetectionResults(data);
                            }
                        }
                    }
                } catch (e) {
                    console.log("Live stream frame skipped:", e.message);
                } finally {
                    isAnalyzingLive = false;
                }
            }
        }, 1200);

    } catch (err) {
        console.error("Microphone activation error:", err);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            alert("Microphone permission was blocked. Please click the permissions icon (or lock icon) in your browser address bar and allow Microphone access.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            alert("No microphone detected. Please connect a microphone and try again.");
        } else {
            alert("Microphone error: " + err.message);
        }
    }
}

// Flatten chunk array into single Float32Array
function flattenPcmBuffer(chunks) {
    let totalLength = 0;
    for (let i = 0; i < chunks.length; i++) {
        totalLength += chunks[i].length;
    }
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
        result.set(chunks[i], offset);
        offset += chunks[i].length;
    }
    return result;
}

function stopPcmRecording() {
    isRecordingPcm = false;
    clearInterval(recordTimerInterval);
    clearInterval(liveStreamInterval);
    stopLiveVisualizer();

    if (activeMediaStream) {
        activeMediaStream.getTracks().forEach(t => t.stop());
    }
    if (scriptProcessorNode) {
        scriptProcessorNode.disconnect();
    }
    if (mediaStreamSource) {
        mediaStreamSource.disconnect();
    }

    // Reset button UI
    turnOnMicBtn.className = "w-full max-w-md mx-auto py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-base tracking-wide flex items-center justify-center gap-3 shadow-xl shadow-cyan-500/25 transition-all active:scale-95 group";
    btnMicIcon.innerHTML = SVG_MIC;
    btnMicLabel.textContent = "Turn On Microphone & Start Live Detection";

    micStateDot.className = "w-3 h-3 rounded-full bg-emerald-400";
    micStateText.className = "text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider";
    micStateText.textContent = "Recording Complete - Finalizing Report";

    // Stop native MediaRecorder if active
    if (mediaRecorder && mediaRecorder.state === "recording") {
        try { mediaRecorder.stop(); } catch(e) {}
    }

    const elapsedSec = (Date.now() - recordStartTime) / 1000;
    if (elapsedSec < 0.6) {
        micStateDot.className = "w-3 h-3 rounded-full bg-amber-400";
        micStateText.className = "text-xs font-mono font-bold text-amber-400 uppercase tracking-wider";
        micStateText.textContent = "Audio Too Short - Please speak for at least 1 second";
        return;
    }

    // Build final authoritative audio blob (PCM WAV priority, MediaRecorder fallback)
    let finalBlob = null;
    let finalExt = "wav";

    if (pcmSampleBuffer.length > 0) {
        const fullFloatSamples = flattenPcmBuffer(pcmSampleBuffer);
        if (fullFloatSamples.length >= Math.floor(pcmSampleRate * 0.4)) {
            finalBlob = encodeWavPcm(fullFloatSamples, pcmSampleRate);
            finalExt = "wav";
        }
    }

    // Secondary fallback: Use MediaRecorder container if PCM buffer was empty
    if (!finalBlob && mediaRecorderChunks.length > 0) {
        finalBlob = new Blob(mediaRecorderChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        finalExt = (mediaRecorder.mimeType && mediaRecorder.mimeType.includes("ogg")) ? "ogg" : "webm";
    }

    if (!finalBlob || finalBlob.size < 200) {
        micStateDot.className = "w-3 h-3 rounded-full bg-rose-400";
        micStateText.className = "text-xs font-mono font-bold text-rose-400 uppercase tracking-wider";
        micStateText.textContent = "No Audio Captured - Check microphone permissions and try speaking again";
        alert("No audio was received from the microphone. Please check that your microphone is unmuted and speak clearly for at least 1 second.");
        return;
    }

    const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, "-");
    loadAudioBlob(finalBlob, `mic_record_${timestamp}.${finalExt}`);

    // AUTOMATIC ZERO-CLICK SUBMIT: Run final authoritative analysis immediately
    setTimeout(() => {
        runVoiceDetection();
    }, 150);

    safeCreateIcons();
}

// Update the In-Segment Live Box inside panelRecord with Temporal EMA Smoothing
function updateLiveMicSegment(data) {
    if (!liveVerdictBadge) return;
    const rawIsAi = data.classification === "AI_GENERATED";
    const rawPercent = data.confidencePercent || Math.round(data.confidenceScore * 100);

    // Exponential Moving Average (EMA) for rock-solid 60-second stability
    if (liveSmoothedPercent === null) {
        liveSmoothedPercent = rawPercent;
        liveSmoothedIsAi = rawIsAi;
    } else {
        liveSmoothedPercent = Math.round(0.70 * rawPercent + 0.30 * liveSmoothedPercent);
        liveSmoothedIsAi = rawIsAi;
    }

    const isAi = liveSmoothedIsAi;
    const percent = liveSmoothedPercent;

    if (isAi) {
        micLiveResultBox.className = "p-5 rounded-xl border border-rose-500/70 bg-gradient-to-r from-cyber-950 via-rose-950/30 to-cyber-950 text-left space-y-4 transition-all duration-300 shadow-xl shadow-rose-950/50";
        livePulseDot.className = "w-3 h-3 rounded-full bg-rose-500 animate-ping";
        liveVerdictStatus.className = "text-xs font-mono font-bold text-rose-400 uppercase tracking-wider";
        liveVerdictStatus.textContent = "⚡ Real-Time Stream Verdict: SYNTHETIC";

        liveVerdictBadge.className = "text-xs font-mono font-bold px-3 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-600 animate-pulse";
        liveVerdictBadge.textContent = `🚨 AI VOICE (${percent}%)`;

        liveVerdictHeadline.className = "text-lg sm:text-xl font-extrabold text-rose-300 tracking-tight flex items-center gap-2";
        liveVerdictHeadline.innerHTML = "<span>🚨 AI-Generated Voice Detected</span>";

        liveVerdictSubtitle.textContent = "Detected vocoder spectral smoothness and constrained formant variation characteristic of AI synthesis.";
        liveConfidenceBar.className = "h-full bg-rose-500 rounded-full transition-all duration-500";
        liveConfidencePercentage.className = "font-bold text-rose-400";
        liveMicType.textContent = "AI Synthesis";
        liveMicType.className = "font-mono font-bold text-rose-400";
    } else {
        micLiveResultBox.className = "p-5 rounded-xl border border-emerald-500/70 bg-gradient-to-r from-cyber-950 via-emerald-950/30 to-cyber-950 text-left space-y-4 transition-all duration-300 shadow-xl shadow-emerald-950/50";
        livePulseDot.className = "w-3 h-3 rounded-full bg-emerald-400 animate-pulse";
        liveVerdictStatus.className = "text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider";
        liveVerdictStatus.textContent = "⚡ Real-Time Stream Verdict: AUTHENTIC";

        liveVerdictBadge.className = "text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-600";
        liveVerdictBadge.textContent = `👤 HUMAN (${percent}%)`;

        liveVerdictHeadline.className = "text-lg sm:text-xl font-extrabold text-emerald-300 tracking-tight flex items-center gap-2";
        liveVerdictHeadline.innerHTML = "<span>✅ Authentic Human Voice</span>";

        liveVerdictSubtitle.textContent = "Natural pitch micro-tremors, organic prosody, and biological acoustic dynamics observed.";
        liveConfidenceBar.className = "h-full bg-emerald-500 rounded-full transition-all duration-500";
        liveConfidencePercentage.className = "font-bold text-emerald-400";
        liveMicType.textContent = "Biological Human";
        liveMicType.className = "font-mono font-bold text-emerald-400";
    }

    liveConfidencePercentage.textContent = `${percent}%`;
    liveConfidenceBar.style.width = `${percent}%`;

    if (data.features) {
        liveMicPitch.textContent = `${data.features.pitch_mean} Hz`;
        liveMicPitchStd.textContent = `${data.features.pitch_std} Hz`;
    }
}

// Live Visualizer
function startPcmVisualizer(stream) {
    try {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        mediaStreamSource.connect(analyser);

        const canvas = liveVisualizer;
        const ctx = canvas.getContext("2d");
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function draw() {
            visualizerAnimationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = "#070b14";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let sum = 0;
            const barWidth = (canvas.width / bufferLength) * 1.8;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
                const barHeight = (dataArray[i] / 255) * canvas.height;
                ctx.fillStyle = `rgb(${dataArray[i] + 50}, 240, 255)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 2;
            }

            if (liveVolumeLabel) {
                const avg = Math.round((sum / bufferLength / 255) * 100);
                liveVolumeLabel.textContent = `Levels: ${avg}%`;
            }
        }
        draw();
    } catch(e) {
        console.log("Visualizer error:", e);
    }
}

function stopLiveVisualizer() {
    if (visualizerAnimationId) cancelAnimationFrame(visualizerAnimationId);
}

// Demo Samples Loader
async function loadDemoSamples() {
    try {
        const res = await fetch(`${API_BASE}/api/samples`);
        const data = await res.json();
        if (data.status === "success" && data.samples) {
            renderDemoSamples(data.samples);
        }
    } catch (err) {
        console.error("Failed to fetch demo samples:", err);
    }
}

function renderDemoSamples(samples) {
    samplesList.innerHTML = "";
    samples.forEach(s => {
        const isAi = s.type.includes("AI");
        const badgeColor = isAi 
            ? "bg-rose-950/80 text-rose-300 border-rose-800" 
            : "bg-emerald-950/80 text-emerald-300 border-emerald-800";
        
        const card = document.createElement("div");
        card.className = "border border-cyber-700 bg-cyber-900/70 hover:border-cyan-500/60 rounded-xl p-3.5 space-y-2.5 transition-all text-left group";
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">${s.title}</span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeColor}">${s.type}</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-snug">${s.description}</p>
            <div class="flex items-center justify-between pt-1">
                <span class="text-[10px] font-mono text-slate-500">Lang: ${s.language}</span>
                <button class="load-sample-btn text-xs font-medium px-2.5 py-1 rounded bg-cyber-700 hover:bg-cyan-600 text-white flex items-center gap-1 transition-all" data-id="${s.id}" data-filename="${s.filename}" data-lang="${s.language}">
                    <span>Load & Analyze</span>
                </button>
            </div>
        `;
        samplesList.appendChild(card);
    });

    safeCreateIcons();

    document.querySelectorAll(".load-sample-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const sampleId = btn.dataset.id;
            const filename = btn.dataset.filename;
            const lang = btn.dataset.lang;
            await loadSampleAudio(sampleId, filename, lang);
        });
    });
}

async function loadSampleAudio(sampleId, filename, lang) {
    try {
        const res = await fetch(`${API_BASE}/api/sample-audio/${sampleId}`);
        const blob = await res.blob();
        languageSelect.value = lang;
        loadAudioBlob(blob, filename);
        tabUpload.click();
        setTimeout(() => runVoiceDetection(), 300);
    } catch (err) {
        alert("Failed to load sample: " + err.message);
    }
}

// Waveform Canvas Setup
function initWaveformCanvas() {
    waveformCanvas.width = waveformCanvas.offsetWidth || 500;
    waveformCanvas.height = 80;
    drawStaticWaveform([]);
}

function drawStaticWaveform(peaks) {
    const ctx = waveformCanvas.getContext("2d");
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) {
        ctx.strokeStyle = "#16223d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < width; i += 8) {
            const h = Math.sin(i * 0.05) * 12 + height / 2;
            ctx.moveTo(i, height / 2);
            ctx.lineTo(i, h);
        }
        ctx.stroke();
        return;
    }

    const barWidth = width / peaks.length;
    const midY = height / 2;

    for (let i = 0; i < peaks.length; i++) {
        const p = peaks[i];
        const barHeight = Math.max(2, p * (height * 0.45));
        const x = i * barWidth;

        const grad = ctx.createLinearGradient(0, midY - barHeight, 0, midY + barHeight);
        grad.addColorStop(0, "#00f0ff");
        grad.addColorStop(0.5, "#10b981");
        grad.addColorStop(1, "#00f0ff");

        ctx.fillStyle = grad;
        ctx.fillRect(x, midY - barHeight, barWidth - 1, barHeight * 2);
    }
}

async function generateWaveformPreview(blob) {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        const totalSamples = rawData.length;
        const blockSize = Math.floor(totalSamples / 70);
        const peaks = [];

        for (let i = 0; i < 70; i++) {
            let max = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j += 10) {
                const val = Math.abs(rawData[start + j] || 0);
                if (val > max) max = val;
            }
            peaks.push(max);
        }
        const maxPeak = Math.max(...peaks, 0.01);
        peaksData = peaks.map(p => p / maxPeak);
        drawStaticWaveform(peaksData);
    } catch (e) {
        // Fallback
    }
}

// Core Voice Detection Call
async function runVoiceDetection() {
    if (!currentAudioBlob) {
        alert("Please upload, record, or pick an audio file first.");
        return;
    }

    analyzeBtn.disabled = true;
    analyzeText.textContent = "Analyzing Forensic Signatures...";
    analyzeIcon.className = "w-5 h-5 animate-spin";

    try {
        const formData = new FormData();
        formData.append("file", currentAudioBlob, currentFileName);
        formData.append("language", languageSelect.value);

        const response = await fetch(`${API_BASE}/api/detect-file`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Server analysis error");
        }

        const data = await response.json();
        renderDetectionResults(data);
        saveHistoryItem(data, currentFileName);

    } catch (err) {
        if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"))) {
        alert("Server Connection Error: Could not reach the backend server at http://127.0.0.1:8000.\n\nPlease ensure the server is running (double-click run.bat or run 'python -m uvicorn app:app --host 127.0.0.1 --port 8000').");
    } else {
        alert("Detection Error: " + err.message);
    }
    } finally {
        analyzeBtn.disabled = false;
        analyzeText.textContent = "Run Voice Analysis";
        analyzeIcon.className = "w-5 h-5";
        safeCreateIcons();
    }
}

// Render Master Results into Right Panel
function renderDetectionResults(data) {
    const isAi = data.classification === "AI_GENERATED";
    const percent = data.confidencePercent || Math.round(data.confidenceScore * 100);

    verdictBadge.textContent = isAi ? "🚨 AI-GENERATED" : "👤 AUTHENTIC HUMAN";
    verdictBadge.className = isAi 
        ? "text-xs font-mono font-bold px-3 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-700 animate-pulse" 
        : "text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700";

    verdictTitle.textContent = data.verdictTitle;
    verdictRisk.textContent = data.riskLevel;

    if (isAi) {
        verdictCard.className = "border border-rose-500/70 bg-gradient-to-br from-cyber-900 via-rose-950/20 to-cyber-950 rounded-2xl p-6 relative overflow-hidden transition-all shadow-xl shadow-rose-950/40";
        confidenceScoreVal.className = "text-3xl font-extrabold font-mono text-rose-400";
        gaugeCircle.style.stroke = "#f43f5e";
        verdictIcon.innerHTML = `<svg class="w-10 h-10 text-rose-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    } else {
        verdictCard.className = "border border-emerald-500/70 bg-gradient-to-br from-cyber-900 via-emerald-950/20 to-cyber-950 rounded-2xl p-6 relative overflow-hidden transition-all shadow-xl shadow-emerald-950/40";
        confidenceScoreVal.className = "text-3xl font-extrabold font-mono text-emerald-400";
        gaugeCircle.style.stroke = "#10b981";
        verdictIcon.innerHTML = `<svg class="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>`;
    }

    confidenceScoreVal.textContent = `${percent}%`;

    // Radial Gauge Progress (Circumference = 282.7)
    const offset = 282.7 - (282.7 * percent / 100);
    gaugeCircle.style.strokeDashoffset = offset;

    // Explanation Banner
    explanationBanner.textContent = data.explanation;

    // Acoustic Metrics
    if (data.features) {
        metricPitchMean.textContent = `${data.features.pitch_mean} Hz`;
        metricPitchStd.textContent = `${data.features.pitch_std} Hz`;
        metricSpectral.textContent = `${data.features.spectral_centroid_mean} Hz`;
        metricRms.textContent = `${data.features.rms_std}`;

        if (data.features.mfccs) {
            renderMfccChart(data.features.mfccs);
        }
    }

    if (data.waveformPeaks && data.waveformPeaks.length > 0) {
        drawStaticWaveform(data.waveformPeaks);
    }
}

// Render MFCC Bar Chart
function renderMfccChart(mfccs) {
    mfccChart.innerHTML = "";
    const minVal = -300;
    const maxVal = 300;

    mfccs.forEach(m => {
        const val = m.value;
        const normalized = Math.max(0, Math.min(100, ((val - minVal) / (maxVal - minVal)) * 100));

        const barContainer = document.createElement("div");
        barContainer.className = "flex-1 flex flex-col items-center gap-1 group relative";
        barContainer.innerHTML = `
            <div class="w-full bg-cyber-950 rounded-t h-full flex items-end overflow-hidden p-0.5">
                <div class="w-full bg-gradient-to-t from-cyan-600 to-emerald-400 rounded-t transition-all duration-500 group-hover:from-cyan-400 group-hover:to-teal-300" style="height: ${normalized}%;"></div>
            </div>
            <span class="text-[9px] font-mono text-slate-500">${m.index}</span>
            <div class="hidden group-hover:block absolute bottom-full mb-1 bg-cyber-950 text-cyan-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyber-700 shadow whitespace-nowrap z-20">
                ${m.label}: ${val}
            </div>
        `;
        mfccChart.appendChild(barContainer);
    });
}

// History Management
function setupHistory() {
    renderHistory();
    clearHistoryBtn.addEventListener("click", () => {
        localStorage.removeItem("voice_history");
        renderHistory();
    });
}

function saveHistoryItem(data, filename) {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem("voice_history") || "[]");
    } catch(e){}

    const newItem = {
        id: Date.now(),
        filename: filename,
        classification: data.classification,
        confidence: data.confidencePercent || Math.round(data.confidenceScore * 100),
        duration: data.duration || 0,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    history.unshift(newItem);
    if (history.length > 8) history.pop();
    localStorage.setItem("voice_history", JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem("voice_history") || "[]");
    } catch(e){}

    if (history.length === 0) {
        historyList.innerHTML = '<p class="text-xs text-slate-500 py-3 text-center">No previous scans recorded yet.</p>';
        return;
    }

    historyList.innerHTML = "";
    history.forEach(item => {
        const isAi = item.classification === "AI_GENERATED";
        const row = document.createElement("div");
        row.className = "flex items-center justify-between p-2.5 rounded-lg bg-cyber-900/60 border border-cyber-800/80 text-xs";
        row.innerHTML = `
            <div class="flex items-center space-x-2.5 truncate">
                <span class="w-2 h-2 rounded-full ${isAi ? 'bg-rose-500' : 'bg-emerald-500'}"></span>
                <span class="font-medium text-white truncate max-w-[140px]">${item.filename}</span>
            </div>
            <div class="flex items-center space-x-3 text-right">
                <span class="font-mono ${isAi ? 'text-rose-400' : 'text-emerald-400'} font-bold">${isAi ? 'AI' : 'Human'} (${item.confidence}%)</span>
                <span class="text-[10px] font-mono text-slate-500">${item.time}</span>
            </div>
        `;
        historyList.appendChild(row);
    });
}

// API Tabs Setup
function setupApiTabs() {
    const pythonTab = document.getElementById("apiPythonTab");
    const curlTab = document.getElementById("apiCurlTab");
    const nodeTab = document.getElementById("apiNodeTab");
    const pythonCode = document.getElementById("apiPythonCode");
    const curlCode = document.getElementById("apiCurlCode");
    const nodeCode = document.getElementById("apiNodeCode");

    const tabs = [
        { btn: pythonTab, code: pythonCode },
        { btn: curlTab, code: curlCode },
        { btn: nodeTab, code: nodeCode }
    ];

    tabs.forEach(t => {
        if (!t.btn) return;
        t.btn.addEventListener("click", () => {
            tabs.forEach(item => {
                item.btn.classList.remove("text-cyan-400", "border-cyan-500");
                item.btn.classList.add("text-slate-400", "border-transparent");
                item.code.classList.add("hidden");
            });
            t.btn.classList.add("text-cyan-400", "border-cyan-500");
            t.btn.classList.remove("text-slate-400", "border-transparent");
            t.code.classList.remove("hidden");
        });
    });
}
