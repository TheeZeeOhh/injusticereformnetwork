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

// Restrict WASM threads to prevent WebKitGTK CPU starvation mid-session.
// By default ONNX spawns one worker per logical core, which saturates the CPU 
// during 30s-chunk inference and completely locks the UI thread.
env.backends.onnx.wasm.numThreads = 1;

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
      // fetch_model_file now returns raw bytes via tauri::ipc::Response, which
      // the JS bridge surfaces as an ArrayBuffer/Uint8Array rather than a
      // number array. Normalise both shapes so this keeps working either way.
      const bytes = await invoke('fetch_model_file', { url });
      let arr;
      if (bytes instanceof Uint8Array) arr = bytes;
      else if (bytes instanceof ArrayBuffer) arr = new Uint8Array(bytes);
      else if (ArrayBuffer.isView(bytes)) arr = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      else arr = new Uint8Array(bytes);
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
// Memoise the IN-FLIGHT promise, not just the resolved value (finding A2).
// Previously `transcriber` was only assigned AFTER `await pipeline(...)`
// resolved, so the `if (!transcriber)` guard was still false for any caller
// that arrived during the ~75MB first-run download. AudioIntake posts 'load'
// and then starts capturing immediately, so the first 'transcribe' landed
// mid-download and kicked off a SECOND concurrent pipeline() — two parallel
// model downloads and two ONNX sessions, on one thread. Holding the promise
// makes every caller await the same single load.
let transcriberPromise = null;

// Inference is serialised through this chain (finding A3). `self.onmessage` is
// async, so the worker event loop dispatches the NEXT message as soon as the
// current handler hits its first await — meaning several transcriptions ran
// interleaved against one transformers.js pipeline, which is not re-entrant.
let inferenceChain = Promise.resolve();

function getTranscriber() {
  if (transcriber) return Promise.resolve(transcriber);
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      // Force full-precision (fp32) weights. The default picks a quantized
      // variant (q4/q8) whose format the bundled onnxruntime-web cannot decode
      // ("Missing required scale … TransposeDQWeightsForMatMulNBits") — loading
      // fp32 sidesteps that broken quantization path. Larger download, reliable.
      dtype: 'fp32',
      // progress_callback streams model-download progress to the UI.
      progress_callback: (p) => {
        self.postMessage({ type: 'model-progress', payload: p });
      }
    })
      .then((t) => {
        transcriber = t;
        return t;
      })
      .catch((err) => {
        // Clear the memo so a retry can genuinely retry instead of resolving
        // the same rejected promise forever.
        transcriberPromise = null;
        throw err;
      });
  }
  return transcriberPromise;
}

self.onmessage = (e) => {
  const { type, audio, id, translate } = e.data;

  if (type === 'load') {
    getTranscriber()
      .then(() => self.postMessage({ type: 'model-ready' }))
      .catch((err) => self.postMessage({ type: 'error', payload: String(err) }));
    return;
  }

  if (type === 'transcribe') {
    // Queue behind whatever is already running rather than racing it.
    inferenceChain = inferenceChain.then(async () => {
      try {
        const asr = await getTranscriber();

        // Original-language transcription.
        const original = await asr(audio, { task: 'transcribe' });

        // English translation of the same audio. This is a SECOND full pass
        // over the same window, so it roughly doubles per-chunk cost — the
        // single biggest contributor to capture outrunning inference. It is
        // now opt-in from the UI instead of unconditional.
        let translated = '';
        if (translate) {
          const t = await asr(audio, { task: 'translate' });
          translated = (t.text || '').trim();
        }

        self.postMessage({
          type: 'result',
          id,
          payload: { original: (original.text || '').trim(), translated }
        });
      } catch (err) {
        self.postMessage({ type: 'error', id, payload: String(err) });
      } finally {
        // ALWAYS ack, success or failure. The main thread frees its in-flight
        // slot on this message; if an error swallowed the ack, one bad chunk
        // would wedge the session forever — the original freeze, relocated.
        self.postMessage({ type: 'chunk-done', id });
      }
    });
  }
};
