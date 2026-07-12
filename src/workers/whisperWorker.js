// whisperWorker.js
//
// Runs OpenAI Whisper fully on-device via transformers.js (WASM), off the main
// thread so the UI never blocks. Zero network at inference time: after the
// model files are cached, no audio or text leaves the machine. The model is
// fetched once from the HF CDN on first use and then served from browser cache.
//
// Two tasks are run per audio buffer:
//   - 'transcribe': text in the ORIGINAL spoken language
//   - 'translate' : the same speech rendered into ENGLISH (Whisper does this
//                   natively, so no separate translation model is needed)
import { pipeline, env } from '@huggingface/transformers';

// Allow remote model download (first run) + local cache thereafter. We do NOT
// set any telemetry; transformers.js runs offline once cached.
env.allowLocalModels = true;

// whisper-base is a good accuracy/size tradeoff (~145MB) for field speech.
// whisper-tiny (~40MB) is the faster fallback.
const MODEL_ID = 'Xenova/whisper-base';

let transcriber = null;

async function getTranscriber() {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
      // progress_callback streams model-download progress to the UI.
      progress_callback: (p) => {
        self.postMessage({ type: 'model-progress', payload: p });
      }
    });
  }
  return transcriber;
}

self.onmessage = async (e) => {
  const { type, audio, id } = e.data;

  if (type === 'load') {
    try {
      await getTranscriber();
      self.postMessage({ type: 'model-ready' });
    } catch (err) {
      self.postMessage({ type: 'error', payload: String(err) });
    }
    return;
  }

  if (type === 'transcribe') {
    try {
      const asr = await getTranscriber();

      // Original-language transcription.
      const original = await asr(audio, { task: 'transcribe' });
      // English translation of the same audio.
      const translated = await asr(audio, { task: 'translate' });

      self.postMessage({
        type: 'result',
        id,
        payload: {
          original: (original.text || '').trim(),
          translated: (translated.text || '').trim()
        }
      });
    } catch (err) {
      self.postMessage({ type: 'error', id, payload: String(err) });
    }
  }
};
