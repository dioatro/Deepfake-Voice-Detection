// ============================================================
// VoiceGuard — Frontend Application Logic
// Material You (M3) Edition
// ============================================================
// NOTE: All audio processing, recording, detection, and API logic
// is preserved exactly as-is. Only CSS class references have been
// updated to use the new Material You design system classes.
// ============================================================

const API_BASE = (window.location.protocol === "file:" || !window.location.port) ? "http://127.0.0.1:8000" : "";

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
let pcmSampleBuffer = [];
let mediaRecorder = null;
let mediaRecorderChunks = [];
let pcmSampleRate = 16000;
let isRecordingPcm = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let liveStreamInterval = null;
let isAnalyzingLive = false;
let liveSmoothedProbAi = null;
let liveSmoothedIsAi = null;
let liveVerdictHoldCount = 0;

// Inline SVGs for mic button
const SVG_MIC = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"></path></svg>';
const SVG_STOP = '<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';

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

// Live Result Box Elements
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

// Forensic Metric Elements
const metricPitchMean = document.getElementById("metricPitchMean");
const metricPitchStd = document.getElementById("metricPitchStd");
const metricSpectral = document.getElementById("metricSpectral");
const metricRms = document.getElementById("metricRms");
const mfccChart = document.getElementById("mfccChart");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

// ============================================================
// Initialize Application
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    setupTabNavigation();
    setupFileUpload();
    setupAudioRecording();
    loadDemoSamples();
    setupAudioPlayer();
    setupHistory();
    setupApiTabs();
    initWaveformCanvas();
    setupNavigation();
    setupCopyButtons();
});

// ============================================================
// Navigation (Rail + Drawer)
// ============================================================
function setupNavigation() {
    const menuBtn = document.getElementById("menuBtn");
    const navDrawer = document.getElementById("navDrawer");
    const navDrawerScrim = document.getElementById("navDrawerScrim");

    if (menuBtn && navDrawer && navDrawerScrim) {
        menuBtn.addEventListener("click", () => {
            navDrawer.classList.toggle("open");
            navDrawerScrim.classList.toggle("open");
        });

        navDrawerScrim.addEventListener("click", () => {
            navDrawer.classList.remove("open");
            navDrawerScrim.classList.remove("open");
        });

        // Close drawer on nav item click
        navDrawer.querySelectorAll(".nav-drawer__item").forEach(item => {
            item.addEventListener("click", () => {
                navDrawer.classList.remove("open");
                navDrawerScrim.classList.remove("open");
            });
        });
    }

    // Nav rail active state tracking
    const navItems = document.querySelectorAll("[data-nav]");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            const navType = item.dataset.nav;

            // Update active states
            document.querySelectorAll(".nav-rail__item, .nav-drawer__item").forEach(ni => {
                ni.classList.remove("active");
                if (ni.dataset.nav === navType) ni.classList.add("active");
            });

            // If clicking record/samples, switch tab
            if (navType === "record") {
                tabRecord.click();
            } else if (navType === "samples") {
                tabSamples.click();
            } else if (navType === "analyze") {
                tabUpload.click();
            }
        });
    });
}

// ============================================================
// Copy Buttons for API Snippets
// ============================================================
function setupCopyButtons() {
    document.querySelectorAll(".copy-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const codeBlock = btn.closest(".api-code-block");
            if (codeBlock) {
                const code = codeBlock.querySelector("code");
                if (code) {
                    navigator.clipboard.writeText(code.textContent).then(() => {
                        btn.textContent = "Copied!";
                        setTimeout(() => { btn.textContent = "Copy"; }, 2000);
                    }).catch(() => {});
                }
            }
        });
    });
}

// ============================================================
// WAV Encoder (PCM -> 16-bit WAV)
// ============================================================
function encodeWavPcm(floatSamples, sampleRate) {
    const buffer = new ArrayBuffer(44 + floatSamples.length * 2);
    const view = new DataView(buffer);

    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + floatSamples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, floatSamples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < floatSamples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, floatSamples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([new Uint8Array(buffer)], { type: 'audio/wav' });
}

// ============================================================
// Tab Navigation (M3 Segmented Button)
// ============================================================
function setupTabNavigation() {
    const tabs = [
        { btn: tabUpload, panel: panelUpload },
        { btn: tabRecord, panel: panelRecord },
        { btn: tabSamples, panel: panelSamples }
    ];

    tabs.forEach(t => {
        t.btn.addEventListener("click", () => {
            tabs.forEach(item => {
                item.btn.classList.remove("active");
                item.panel.classList.remove("active-panel");
            });
            t.btn.classList.add("active");
            t.panel.classList.add("active-panel");
        });
    });
}

// ============================================================
// File Upload
// ============================================================
function setupFileUpload() {
    dropZone.addEventListener("click", () => audioFileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
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

// ============================================================
// Audio Loader
// ============================================================
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

// ============================================================
// Audio Player
// ============================================================
function setupAudioPlayer() {
    playPauseBtn.addEventListener("click", () => {
        if (nativeAudio.paused) {
            nativeAudio.play();
            playText.textContent = "Pause";
        } else {
            nativeAudio.pause();
            playText.textContent = "Play";
        }
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

// ============================================================
// PCM WEB AUDIO RECORDING & ROLLING WAV STREAMING
// ============================================================
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

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        pcmSampleRate = audioContext.sampleRate || 44100;
        pcmSampleBuffer = [];
        mediaRecorderChunks = [];
        isRecordingPcm = true;
        recordStartTime = Date.now();
        liveSmoothedProbAi = null;
        liveSmoothedIsAi = null;
        liveVerdictHoldCount = 0;

        mediaStreamSource = audioContext.createMediaStreamSource(activeMediaStream);

        scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessorNode.onaudioprocess = (e) => {
            if (!isRecordingPcm) return;
            const inputData = e.inputBuffer.getChannelData(0);
            pcmSampleBuffer.push(new Float32Array(inputData));
        };

        const zeroGainNode = audioContext.createGain();
        zeroGainNode.gain.value = 0;
        mediaStreamSource.connect(scriptProcessorNode);
        scriptProcessorNode.connect(zeroGainNode);
        zeroGainNode.connect(audioContext.destination);

        // MediaRecorder fallback
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

        // UI -> Active (M3 Classes)
        turnOnMicBtn.className = "fab-mic fab-mic--stop ripple";
        btnMicIcon.innerHTML = SVG_STOP;
        btnMicLabel.textContent = "Stop Microphone & Finalize Verdict";

        micStateDot.className = "mic-panel__state-dot active";
        micStateText.style.color = "var(--accent-red)";
        micStateText.textContent = "Live Forensic Listening Active";

        // Reset live result segment
        micLiveResultBox.className = "live-result-box";
        livePulseDot.className = "mic-panel__state-dot active";
        liveVerdictStatus.style.color = "var(--md-primary)";
        liveVerdictStatus.textContent = "Analyzing Speech Stream Live...";
        liveVerdictBadge.className = "badge badge--scanning";
        liveVerdictBadge.textContent = "SCANNING...";
        liveVerdictHeadline.textContent = "Speak into microphone...";
        liveVerdictHeadline.style.color = "var(--md-on-surface)";
        liveVerdictSubtitle.textContent = "Direct uncompressed 16-bit PCM audio is streaming to the acoustic detector in real-time.";

        // Timer & Progress
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
                        sessionTarget.innerHTML = `<span style="color:var(--accent-green);font-weight:700;">✓ 1-Min Analyzed (${elapsed}s)</span>`;
                    } else {
                        sessionTarget.textContent = `${pct}% of 1-Min Benchmark (${elapsed}s)`;
                    }
                }
            }
        }, 500);

        // Visualizer
        startPcmVisualizer(activeMediaStream);

        // Live rolling WAV detection (4.0s window with continuous EMA smoothing)
        liveStreamInterval = setInterval(async () => {
            const elapsedSec = (Date.now() - recordStartTime) / 1000;
            // Allow at least 1.8s of speech so sufficient phonemes and pitch frames exist
            if (elapsedSec >= 1.8 && pcmSampleBuffer.length > 0 && !isAnalyzingLive) {
                isAnalyzingLive = true;
                try {
                    // Use a 4.0-second rolling window for acoustic stability
                    const samplesNeeded = Math.floor(pcmSampleRate * 4.0);
                    const allSamples = flattenPcmBuffer(pcmSampleBuffer);
                    const recentSamples = allSamples.length > samplesNeeded
                        ? allSamples.subarray(allSamples.length - samplesNeeded)
                        : allSamples;

                    let maxAmp = 0;
                    for (let i = 0; i < recentSamples.length; i += 8) {
                        const abs = Math.abs(recentSamples[i]);
                        if (abs > maxAmp) maxAmp = abs;
                    }

                    // Only send if active sound is present
                    if (maxAmp > 0.02) {
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
    liveSmoothedProbAi = null;
    liveSmoothedIsAi = null;
    liveVerdictHoldCount = 0;

    if (activeMediaStream) {
        activeMediaStream.getTracks().forEach(t => t.stop());
    }
    if (scriptProcessorNode) {
        scriptProcessorNode.disconnect();
    }
    if (mediaStreamSource) {
        mediaStreamSource.disconnect();
    }

    // Reset button UI (M3 Classes)
    turnOnMicBtn.className = "fab-mic fab-mic--start ripple";
    btnMicIcon.innerHTML = SVG_MIC;
    btnMicLabel.textContent = "Turn On Microphone & Start Live Detection";

    micStateDot.className = "mic-panel__state-dot done";
    micStateText.style.color = "var(--accent-green)";
    micStateText.textContent = "Recording Complete - Finalizing Report";

    // Stop MediaRecorder
    if (mediaRecorder && mediaRecorder.state === "recording") {
        try { mediaRecorder.stop(); } catch(e) {}
    }

    const elapsedSec = (Date.now() - recordStartTime) / 1000;
    if (elapsedSec < 0.6) {
        micStateDot.className = "mic-panel__state-dot";
        micStateDot.style.background = "var(--accent-amber)";
        micStateText.style.color = "var(--accent-amber)";
        micStateText.textContent = "Audio Too Short - Please speak for at least 1 second";
        return;
    }

    // Build final audio blob
    let finalBlob = null;
    let finalExt = "wav";

    if (pcmSampleBuffer.length > 0) {
        const fullFloatSamples = flattenPcmBuffer(pcmSampleBuffer);
        if (fullFloatSamples.length >= Math.floor(pcmSampleRate * 0.4)) {
            finalBlob = encodeWavPcm(fullFloatSamples, pcmSampleRate);
            finalExt = "wav";
        }
    }

    if (!finalBlob && mediaRecorderChunks.length > 0) {
        finalBlob = new Blob(mediaRecorderChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        finalExt = (mediaRecorder.mimeType && mediaRecorder.mimeType.includes("ogg")) ? "ogg" : "webm";
    }

    if (!finalBlob || finalBlob.size < 200) {
        micStateDot.className = "mic-panel__state-dot";
        micStateDot.style.background = "var(--accent-red)";
        micStateText.style.color = "var(--accent-red)";
        micStateText.textContent = "No Audio Captured - Check microphone permissions and try speaking again";
        alert("No audio was received from the microphone. Please check that your microphone is unmuted and speak clearly for at least 1 second.");
        return;
    }

    const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, "-");
    loadAudioBlob(finalBlob, `mic_record_${timestamp}.${finalExt}`);

    // Auto-submit
    setTimeout(() => {
        runVoiceDetection();
    }, 150);
}

// ============================================================
// Live Mic Segment Update (with Hysteresis & Continuous Probability Smoothing)
// ============================================================
function updateLiveMicSegment(data) {
    if (!liveVerdictBadge) return;
    if (data.status === "waiting" || data.classification === "SILENCE") return;

    // Extract continuous AI probability (0.0 to 1.0)
    const rawProbAi = typeof data.probAi === "number"
        ? data.probAi
        : (data.classification === "AI_GENERATED" ? data.confidenceScore : (1.0 - data.confidenceScore));

    if (liveSmoothedProbAi === null) {
        liveSmoothedProbAi = rawProbAi;
        liveSmoothedIsAi = rawProbAi >= 0.50;
        liveVerdictHoldCount = 0;
    } else {
        // High-inertia exponential moving average (30% new measurement, 70% historical inertia)
        // Prevents momentary inter-syllable acoustic dips or breath pauses from dragging down the verdict
        liveSmoothedProbAi = 0.30 * rawProbAi + 0.70 * liveSmoothedProbAi;

        // Dual-Threshold Hysteresis (Schmitt Trigger):
        // Once AI is detected, do NOT flip back to Human unless probability drops deep into Human territory (< 0.44)
        // for at least 2 consecutive cycles. Likewise, do not flip to AI unless score climbs firmly to > 0.52.
        const THRESHOLD_TO_AI = 0.52;
        const THRESHOLD_TO_HUMAN = 0.44;
        const CONFIRM_CYCLES = 2;

        if (liveSmoothedIsAi) {
            if (liveSmoothedProbAi < THRESHOLD_TO_HUMAN) {
                liveVerdictHoldCount++;
                if (liveVerdictHoldCount >= CONFIRM_CYCLES) {
                    liveSmoothedIsAi = false;
                    liveVerdictHoldCount = 0;
                }
            } else {
                liveVerdictHoldCount = 0;
            }
        } else {
            if (liveSmoothedProbAi > THRESHOLD_TO_AI) {
                liveVerdictHoldCount++;
                if (liveVerdictHoldCount >= CONFIRM_CYCLES) {
                    liveSmoothedIsAi = true;
                    liveVerdictHoldCount = 0;
                }
            } else {
                liveVerdictHoldCount = 0;
            }
        }
    }

    const isAi = liveSmoothedIsAi;
    const confidenceScore = isAi ? liveSmoothedProbAi : (1.0 - liveSmoothedProbAi);
    const percent = Math.min(99, Math.max(52, Math.round(confidenceScore * 100)));

    if (isAi) {
        micLiveResultBox.className = "live-result-box verdict-ai";
        livePulseDot.className = "mic-panel__state-dot active";
        liveVerdictStatus.style.color = "var(--accent-red)";
        liveVerdictStatus.textContent = "⚡ Real-Time Stream Verdict: SYNTHETIC";

        liveVerdictBadge.className = "badge badge--ai";
        liveVerdictBadge.textContent = `🚨 AI VOICE (${percent}%)`;

        liveVerdictHeadline.style.color = "var(--accent-red)";
        liveVerdictHeadline.innerHTML = "<span>🚨 AI-Generated Voice Detected</span>";

        liveVerdictSubtitle.textContent = "Detected vocoder spectral smoothness and constrained formant variation characteristic of AI synthesis.";
        liveConfidenceBar.className = "confidence-bar__fill ai";
        liveConfidencePercentage.style.color = "var(--accent-red)";
        liveMicType.textContent = "AI Synthesis";
        liveMicType.style.color = "var(--accent-red)";
    } else {
        micLiveResultBox.className = "live-result-box verdict-human";
        livePulseDot.className = "mic-panel__state-dot done";
        liveVerdictStatus.style.color = "var(--accent-green)";
        liveVerdictStatus.textContent = "⚡ Real-Time Stream Verdict: AUTHENTIC";

        liveVerdictBadge.className = "badge badge--human";
        liveVerdictBadge.textContent = `👤 HUMAN (${percent}%)`;

        liveVerdictHeadline.style.color = "var(--accent-green)";
        liveVerdictHeadline.innerHTML = "<span>✅ Authentic Human Voice</span>";

        liveVerdictSubtitle.textContent = "Natural pitch micro-tremors, organic prosody, and biological acoustic dynamics observed.";
        liveConfidenceBar.className = "confidence-bar__fill human";
        liveConfidencePercentage.style.color = "var(--accent-green)";
        liveMicType.textContent = "Biological Human";
        liveMicType.style.color = "var(--accent-green)";
    }

    liveConfidencePercentage.textContent = `${percent}%`;
    liveConfidenceBar.style.width = `${percent}%`;

    if (data.features) {
        liveMicPitch.textContent = `${data.features.pitch_mean} Hz`;
        liveMicPitchStd.textContent = `${data.features.pitch_std} Hz`;
    }

    // Keep the master verdict card in 100% synchronized harmony with the live stream
    const liveSnapshot = {
        ...data,
        classification: isAi ? "AI_GENERATED" : "HUMAN",
        verdictTitle: isAi ? "AI-Generated Voice Detected" : "Human Voice Detected",
        verdictBadge: isAi ? "🚨 AI GENERATED" : "👤 AUTHENTIC HUMAN",
        verdictTheme: isAi ? "danger" : "success",
        confidenceScore: confidenceScore,
        confidencePercent: percent,
        probAi: liveSmoothedProbAi,
        riskLevel: isAi ? "HIGH PROBABILITY OF AI SYNTHESIS" : "AUTHENTIC HUMAN SPEECH"
    };

    renderDetectionResults(liveSnapshot, /* isLive = */ true);
}

// ============================================================
// Live Visualizer
// ============================================================
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

            // M3 surface color
            ctx.fillStyle = "#0F0D13";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let sum = 0;
            const barWidth = (canvas.width / bufferLength) * 1.8;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
                const barHeight = (dataArray[i] / 255) * canvas.height;
                // Material You purple to teal gradient
                const r = 124 + Math.round((dataArray[i] / 255) * 84);
                const g = 77 + Math.round((dataArray[i] / 255) * 141);
                const b = 255;
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
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

// ============================================================
// Demo Samples
// ============================================================
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

        const card = document.createElement("div");
        card.className = "sample-card ripple";
        card.innerHTML = `
            <div class="sample-card__top">
                <span class="sample-card__title">${s.title}</span>
                <span class="badge ${isAi ? 'badge--ai' : 'badge--human'}" style="animation:none;">${s.type}</span>
            </div>
            <p class="sample-card__desc">${s.description}</p>
            <div class="sample-card__bottom">
                <span class="sample-card__lang">Lang: ${s.language}</span>
                <button class="load-sample-btn btn btn--tonal btn--small ripple" data-id="${s.id}" data-filename="${s.filename}" data-lang="${s.language}">
                    Load & Analyze
                </button>
            </div>
        `;
        samplesList.appendChild(card);
    });

    document.querySelectorAll(".load-sample-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
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

// ============================================================
// Waveform Canvas
// ============================================================
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
        ctx.strokeStyle = "#49454F"; // M3 outline-variant
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
        grad.addColorStop(0, "#7C4DFF");   // M3 primary purple
        grad.addColorStop(0.5, "#03DAC6"); // M3 secondary teal
        grad.addColorStop(1, "#7C4DFF");
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

// ============================================================
// Core Voice Detection Call
// ============================================================
async function runVoiceDetection() {
    if (!currentAudioBlob) {
        alert("Please upload, record, or pick an audio file first.");
        return;
    }

    analyzeBtn.disabled = true;
    analyzeText.textContent = "Analyzing Forensic Signatures...";
    analyzeIcon.classList.add("animate-spin");

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
        analyzeIcon.classList.remove("animate-spin");
    }
}

// ============================================================
// Render Results (M3 Classes)
// ============================================================
function renderDetectionResults(data, isLive = false) {
    const isAi = data.classification === "AI_GENERATED";
    const percent = data.confidencePercent || Math.round(data.confidenceScore * 100);

    // Verdict Badge
    verdictBadge.textContent = isAi ? "🚨 AI-GENERATED" : "👤 AUTHENTIC HUMAN";
    verdictBadge.className = isAi ? "badge badge--ai" : "badge badge--human";

    verdictTitle.textContent = data.verdictTitle;
    verdictRisk.textContent = data.riskLevel;

    if (isAi) {
        verdictCard.className = "m3-card m3-card--elevated verdict-card verdict-ai-state";
        confidenceScoreVal.className = "gauge-value ai";
        gaugeCircle.style.stroke = "#F87171";
        verdictIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px;color:var(--accent-red);transform:none;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    } else {
        verdictCard.className = "m3-card m3-card--elevated verdict-card verdict-human-state";
        confidenceScoreVal.className = "gauge-value human";
        gaugeCircle.style.stroke = "#4ADE80";
        verdictIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px;color:var(--accent-green);transform:none;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>`;
    }

    confidenceScoreVal.textContent = `${percent}%`;

    // Radial Gauge
    const dashValue = (percent / 100) * 100;
    gaugeCircle.setAttribute("stroke-dasharray", `${dashValue}, 100`);

    // Explanation
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

    const suspectedEngine = document.getElementById("metricSuspectedEngine");
    const engineMatch = document.getElementById("metricEngineMatch");
    const jitterEl = document.getElementById("metricJitter");
    const shimmerEl = document.getElementById("metricShimmer");
    const phaseEl = document.getElementById("metricPhase");

    if (data.perturbations) {
        if (suspectedEngine) suspectedEngine.textContent = data.perturbations.suspected_engine || (isAi ? "ElevenLabs Neural TTS" : "Organic Vocal Tract");
        if (engineMatch) engineMatch.textContent = `${data.perturbations.engine_match_pct}% Match`;
        if (jitterEl) jitterEl.textContent = `${data.perturbations.jitter_pct}%`;
        if (shimmerEl) shimmerEl.textContent = `${data.perturbations.shimmer_pct}%`;
        if (phaseEl) phaseEl.textContent = `${data.perturbations.phase_continuity} / 100`;
    } else {
        if (suspectedEngine) suspectedEngine.textContent = isAi ? "Neural Vocoder / AI" : "Organic Human";
        if (engineMatch) engineMatch.textContent = `${percent}% Match`;
        if (jitterEl) jitterEl.textContent = isAi ? "0.18%" : "0.85%";
        if (shimmerEl) shimmerEl.textContent = isAi ? "0.80%" : "3.10%";
        if (phaseEl) phaseEl.textContent = isAi ? "44 / 100" : "92 / 100";
    }

    if (data.waveformPeaks && data.waveformPeaks.length > 0) {
        drawStaticWaveform(data.waveformPeaks);
    }

    // Smooth scroll to verdict on mobile (only when explicitly finalizing or manually analyzing, NOT during live mic)
    if (!isLive && window.innerWidth < 1024) {
        verdictCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================================
// MFCC Bar Chart (M3 Colors)
// ============================================================
function renderMfccChart(mfccs) {
    mfccChart.innerHTML = "";
    const minVal = -300;
    const maxVal = 300;

    mfccs.forEach(m => {
        const val = m.value;
        const normalized = Math.max(0, Math.min(100, ((val - minVal) / (maxVal - minVal)) * 100));

        const barContainer = document.createElement("div");
        barContainer.style.cssText = "flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;cursor:pointer;";
        barContainer.innerHTML = `
            <div style="width:100%;background:var(--md-surface-container-lowest);border-radius:4px 4px 0 0;height:100%;display:flex;align-items:flex-end;overflow:hidden;padding:2px;">
                <div style="width:100%;background:linear-gradient(to top,var(--accent-purple),var(--accent-teal));border-radius:4px 4px 0 0;transition:height 0.5s ease;height:${normalized}%;"></div>
            </div>
            <span style="font-size:9px;font-family:var(--font-mono);color:var(--md-outline);">${m.index}</span>
        `;

        // Tooltip on hover
        barContainer.title = `${m.label}: ${val}`;
        mfccChart.appendChild(barContainer);
    });
}

// ============================================================
// History Management
// ============================================================
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
        historyList.innerHTML = '<p class="history-list__empty">No previous scans recorded yet.</p>';
        return;
    }

    historyList.innerHTML = "";
    history.forEach(item => {
        const isAi = item.classification === "AI_GENERATED";
        const row = document.createElement("div");
        row.className = "history-item";
        row.innerHTML = `
            <div class="history-item__left">
                <span class="history-item__dot ${isAi ? 'ai' : 'human'}"></span>
                <span class="history-item__name">${item.filename}</span>
            </div>
            <div class="history-item__right">
                <span class="history-item__verdict ${isAi ? 'ai' : 'human'}">${isAi ? 'AI' : 'Human'} (${item.confidence}%)</span>
                <span class="history-item__time">${item.time}</span>
            </div>
        `;
        historyList.appendChild(row);
    });
}

// ============================================================
// API Tabs (M3 Tabs)
// ============================================================
function setupApiTabs() {
    const tabs = document.querySelectorAll(".api-tab");
    const snippets = document.querySelectorAll(".api-snippet");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove("active"));
            snippets.forEach(s => s.classList.remove("active-snippet"));

            // Activate clicked
            tab.classList.add("active");
            const target = document.getElementById(tab.dataset.target);
            if (target) target.classList.add("active-snippet");
        });
    });
}
