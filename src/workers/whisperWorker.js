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

// Fetch the model from the HuggingFace CDN (first run) and rely on the browser
// HTTP cache thereafter — transformers.js runs offline once cached.
//
// IMPORTANT (finding: desktop model-load failure): in the Tauri desktop build the
// app is served from `tauri://localhost`, which has no filesystem model path. If
// local models are allowed, transformers.js tries a local URL first, the app
// server answers unknown paths with index.html, and the HTML ("<") fails JSON
// parsing → "Unrecognized token '<'". So we DISABLE local model lookup and force
// the remote path. remoteHost defaults to https://huggingface.co/.
env.allowLocalModels = false;
env.allowRemoteModels = true;

// Route model downloads through the Rust backend (finding: HF Xet CDN vs
// tauri:// CORS freeze). HuggingFace redirects model files to a Xet CDN whose
// CORS only allows the huggingface.co origin, so the webview's own fetch hangs.
// The Rust `fetch_model_file` command downloads server-side (no CORS) and returns
// the bytes, which we wrap back into a Response. Non-HF URLs and non-Tauri
// contexts (browser dev) fall through to native fetch unchanged.
const nativeFetch = globalThis.fetch.bind(globalThis);

// Detect a Tauri context (internals injected on the global scope). In a worker
// there is no `window`; Tauri v2 also injects internals into workers via self.
const inTauri = typeof self !== 'undefined' && !!self.__TAURI_INTERNALS__;

env.fetch = async (urlOrPath, options) => {
  const url = typeof urlOrPath === 'string' ? urlOrPath : urlOrPath?.url;
  const isHf = typeof url === 'string' && /^https?:\/\/(huggingface\.co|hf\.co|cdn-lfs[^/]*\.huggingface\.co)\//.test(url);

  if (isHf && inTauri) {
    try {
      // Import lazily so browser-dev (no Tauri) never pulls this path.
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes = await invoke('fetch_model_file', { url });
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return new Response(arr, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    } catch (err) {
      // Surface the backend error rather than silently hanging.
      return new Response(null, { status: 502, statusText: String(err) });
    }
  }
  return nativeFetch(urlOrPath, options);
};

// whisper-tiny (fp32 ~75MB) is the default: far smaller/faster first-run
// download than whisper-base (fp32 ~290MB), at some cost to accuracy on noisy
// field speech. Swap to 'Xenova/whisper-base' if transcription quality matters
// more than download size. (We stay on fp32 regardless — see dtype note below.)
const MODEL_ID = 'Xenova/whisper-tiny';

let transcriber = null;

async function getTranscriber() {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
      // Force full-precision (fp32) weights. The default picks a quantized
      // variant (q4/q8) whose format the bundled onnxruntime-web cannot decode
      // ("Missing required scale … TransposeDQWeightsForMatMulNBits") — loading
      // fp32 sidesteps that broken quantization path. Larger download, reliable.
      dtype: 'fp32',
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
