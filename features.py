import numpy as np
import librosa

def extract_features(audio, sr):
    features = {}

    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    pitch_values = pitches[pitches > 0]

    features["pitch_mean"] = float(np.mean(pitch_values)) if len(pitch_values) > 0 else 0.0
    features["pitch_std"] = float(np.std(pitch_values)) if len(pitch_values) > 0 else 0.0

    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfcc_means = np.mean(mfcc, axis=1)

    for i, val in enumerate(mfcc_means):
        features[f"mfcc_{i+1}"] = float(val)

    centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)
    features["spectral_centroid_mean"] = float(np.mean(centroid))

    rms = librosa.feature.rms(y=audio)
    features["rms_std"] = float(np.std(rms))

    zcr = librosa.feature.zero_crossing_rate(y=audio)
    features["zcr_mean"] = float(np.mean(zcr))

    return features

def extract_waveform_peaks(audio: np.ndarray, num_peaks: int = 70) -> list:
    if len(audio) == 0:
        return [0.0] * num_peaks
    chunk_size = max(1, len(audio) // num_peaks)
    peaks = []
    for i in range(num_peaks):
        start = i * chunk_size
        end = min(len(audio), start + chunk_size)
        if start < len(audio):
            val = float(np.max(np.abs(audio[start:end])))
        else:
            val = 0.0
        peaks.append(round(val, 3))
    max_peak = max(peaks) if peaks and max(peaks) > 0 else 1.0
    return [round(p / max_peak, 3) for p in peaks]

