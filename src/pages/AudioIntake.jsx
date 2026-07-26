import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Whisper wants 16 kHz mono Float32 audio. We capture ~5s windows and send each
// to the off-thread worker for on-device transcription + English translation.
const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 5;

export default function AudioIntake() {
  const { vaultAKey } = useAuthStore();
  const [hasConsent, setHasConsent] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micMode, setMicMode] = useState('continuous');
  const [enlargeText, setEnlargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [modelState, setModelState] = useState('idle'); // idle | loading | ready | error
  const [modelProgress, setModelProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  // Microphone selection. The webview auto-grants mic permission and grabs the
  // default device, so with multiple mics you couldn't choose. Enumerate inputs
  // and let the operator pick which one to record from.
  const [mics, setMics] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  useEffect(() => {
    let cancelled = false;
    const enumerate = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        if (!cancelled) setMics(inputs);
      } catch { /* enumeration may need permission first; ignored */ }
    };
    enumerate();
    // Labels populate only after permission is granted; re-enumerate on change.
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerate);
    return () => { cancelled = true; navigator.mediaDevices?.removeEventListener?.('devicechange', enumerate); };
  }, []);

  // Client association + save state. A transcript is client PHI, so saving it
  // requires a selected client and routes through the encrypted Vault A.
  const [clientDirectory, setClientDirectory] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [saveStatus, setSaveStatus] = useState(null); // { ok, msg }
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);

  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const bufferRef = useRef([]); // accumulates Float32 samples until a chunk is full
  const chunkIdRef = useRef(0);

  // Lazily create the transcription worker. Spawning it eagerly on page mount
  // pulls in the multi-MB transformers.js/WASM module immediately, which stalls
  // the webview and froze the app the moment you opened Audio Intake. Create it
  // ONLY when a session actually starts, so opening the page is instant.
  const ensureWorker = () => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL('../workers/whisperWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'model-progress') {
        if (payload?.status === 'progress' && typeof payload.progress === 'number') {
          setModelProgress(Math.round(payload.progress));
        }
      } else if (type === 'model-ready') {
        setModelState('ready');
        setStatusMsg('On-device model ready. Recording…');
      } else if (type === 'result') {
        const { original, translated } = payload;
        if (original || translated) {
          setTranscript(prev => [...prev, { original, translated }]);
        }
      } else if (type === 'error') {
        setModelState('error');
        setStatusMsg('Transcription error: ' + payload);
      }
    };
    workerRef.current = worker;
    return worker;
  };

  // Tear the worker down on unmount so nothing persists.
  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  // Load the encrypted client directory so a transcript can be attached to a
  // client. Same pattern as ClientsModule; empty/failed load → no clients.
  useEffect(() => {
    async function loadDirectory() {
      if (!vaultAKey) return;
      try {
        const dir = await loadSecureRecord(vaultAKey, 'client_directory', 'A');
        if (Array.isArray(dir)) setClientDirectory(dir);
      } catch {
        // No directory yet — leave the picker empty.
      }
    }
    loadDirectory();
  }, [vaultAKey]);

  // Persist the current transcript to the selected client's encrypted record.
  // PHI: routes through saveSecureRecord (AES-256-GCM, Vault A) only — never
  // localStorage/plaintext/network. Appends to a list of dated sessions so
  // prior transcripts are preserved.
  const handleSaveTranscript = async () => {
    setSaveStatus(null);
    if (!vaultAKey) { setSaveStatus({ ok: false, msg: 'Vault is locked.' }); return; }
    if (!selectedClientId) { setSaveStatus({ ok: false, msg: 'Select a client before saving.' }); return; }
    const lines = transcript.filter(Boolean);
    if (lines.length === 0) { setSaveStatus({ ok: false, msg: 'Nothing to save yet.' }); return; }

    setIsSavingTranscript(true);
    try {
      const recordId = `transcript_${selectedClientId}`;
      let sessions = [];
      try {
        const existing = await loadSecureRecord(vaultAKey, recordId, 'A');
        if (Array.isArray(existing)) sessions = existing;
      } catch {
        // No prior transcript record — start a fresh list.
      }
      sessions.push({ savedAt: new Date().toISOString(), lines });
      await saveSecureRecord(vaultAKey, recordId, sessions, 'A');
      setSaveStatus({ ok: true, msg: `Transcript saved to vault (${sessions.length} session(s) on file).` });
    } catch (err) {
      setSaveStatus({ ok: false, msg: err?.message || 'Failed to save transcript.' });
    }
    setIsSavingTranscript(false);
  };

  // Send whatever samples we've accumulated to the worker as one chunk.
  const flushChunk = () => {
    if (bufferRef.current.length === 0) return;
    const audio = Float32Array.from(bufferRef.current);
    bufferRef.current = [];
    workerRef.current?.postMessage(
      { type: 'transcribe', audio, id: chunkIdRef.current++ },
      [audio.buffer] // transfer ownership; no copy, nothing retained here
    );
  };

  const stopRecording = () => {
    setIsRecording(false);
    // Flush any trailing audio, then tear down capture.
    flushChunk();
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    bufferRef.current = [];
    setStatusMsg('Session stopped. Audio discarded.');
  };

  const startRecording = async () => {
    setTranscript([]);
    setStatusMsg('Requesting microphone…');
    try {
      // Use the chosen mic if one is selected; otherwise the system default.
      const audioConstraint = selectedMic ? { deviceId: { exact: selectedMic } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      streamRef.current = stream;
      // After permission is granted, device labels become available — refresh.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMics(devices.filter((d) => d.kind === 'audioinput'));
      } catch { /* ignore */ }

      // Create the worker now (first time only) and load the model. This is when
      // the heavy transformers.js/WASM work happens — deliberately NOT on page
      // mount, so opening Audio Intake stays instant.
      const worker = ensureWorker();
      if (modelState !== 'ready') {
        setModelState('loading');
        setStatusMsg('Loading on-device speech model (first run downloads it once)…');
        worker.postMessage({ type: 'load' });
      }

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessor is deprecated but universally available in webviews and
      // sufficient for chunked capture; each callback appends mono samples.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const samplesPerChunk = SAMPLE_RATE * CHUNK_SECONDS;

      processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i++) bufferRef.current.push(input[i]);
        // When a full window is buffered, flush it for transcription.
        if (bufferRef.current.length >= samplesPerChunk) flushChunk();
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setIsRecording(true);
    } catch (err) {
      setStatusMsg('Microphone access denied or unavailable: ' + err.message);
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // Ensure capture is torn down and audio discarded when leaving the page.
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      bufferRef.current = [];
    };
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div>
        <h1 style={{ color: 'var(--gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Local Voice Layer</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          Zero-network NLLB-200 + Whisper.cpp. Auto language-detect.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem', flex: 1, overflow: 'hidden' }}>
        
        {/* Controls Sidebar */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>
          
          {/* Consent Gate */}
          <div style={{ background: 'rgba(226, 85, 43, 0.1)', border: '1px solid var(--ember)', padding: '1rem', borderRadius: '4px' }}>
            <h4 style={{ color: 'var(--ember)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-serif)' }}>42 CFR / BAA Consent Gate</h4>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={hasConsent} onChange={(e) => setHasConsent(e.target.checked)} style={{ marginTop: '0.2rem' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--bone)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                Client explicitly consents to on-device audio transcription. Audio is never stored; the text transcript is only saved to the encrypted vault if you press Save.
              </span>
            </label>
          </div>

          {/* Client association — required before a transcript can be saved. */}
          <div>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Client</h4>
            <select
              value={selectedClientId}
              onChange={(e) => { setSelectedClientId(e.target.value); setSaveStatus(null); }}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            >
              <option value="">— Select a client —</option>
              {clientDirectory.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id.replace('client_', '')}</option>
              ))}
            </select>
            {clientDirectory.length === 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '0.35rem' }}>
                No clients found. Add one in the Clients module first.
              </div>
            )}
          </div>

          {/* Microphone selection */}
          <div>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Microphone</h4>
            <select
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              disabled={isRecording}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--charcoal-lighter)', border: '1px solid var(--border-color)', color: 'var(--bone)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            >
              <option value="">System default</option>
              {mics.map((m, i) => (
                <option key={m.deviceId || i} value={m.deviceId}>
                  {m.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '0.35rem' }}>
              {mics.length === 0
                ? 'Device names appear after you start a session once (grants mic access).'
                : `${mics.length} input${mics.length === 1 ? '' : 's'} detected.`}
            </div>
          </div>

          <button
            disabled={!hasConsent}
            onClick={toggleRecording}
            className="btn-primary"
            style={{
              background: !hasConsent ? 'var(--charcoal-lighter)' : (isRecording ? 'var(--charcoal)' : 'var(--ember)'),
              color: !hasConsent ? 'var(--text-tertiary)' : (isRecording ? 'var(--ember)' : 'white'),
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              border: isRecording ? '2px solid var(--ember)' : 'none'
            }}>
            {isRecording ? '⏹ STOP SESSION' : '⏺ START SESSION'}
          </button>

          {/* Explicit save — encrypted Vault A, only with a client + content. */}
          <div>
            <button
              disabled={isSavingTranscript || !selectedClientId || transcript.length === 0}
              onClick={handleSaveTranscript}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontWeight: 'bold',
                background: (!selectedClientId || transcript.length === 0) ? 'var(--charcoal-lighter)' : 'var(--gold)',
                color: (!selectedClientId || transcript.length === 0) ? 'var(--text-tertiary)' : 'var(--charcoal)',
                border: 'none',
                cursor: (isSavingTranscript || !selectedClientId || transcript.length === 0) ? 'not-allowed' : 'pointer'
              }}
            >
              {isSavingTranscript ? 'Encrypting…' : '💾 Save Transcript to Vault'}
            </button>
            {saveStatus && (
              <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: saveStatus.ok ? '#4ade80' : '#fda4af', marginTop: '0.4rem', lineHeight: 1.4 }}>
                {saveStatus.msg}
              </div>
            )}
          </div>

          {(statusMsg || modelState === 'loading') && (
            <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: modelState === 'error' ? '#fda4af' : 'var(--text-secondary)', background: '#020617', padding: '0.6rem', borderRadius: '4px', lineHeight: 1.4 }}>
              {modelState === 'loading' && (
                <div style={{ marginBottom: '0.25rem', color: 'var(--gold)' }}>
                  Downloading model… {modelProgress > 0 ? `${modelProgress}%` : ''}
                </div>
              )}
              {statusMsg}
            </div>
          )}

          {/* Settings */}
          <div>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 1rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Mic Mode</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="radio" name="micMode" checked={micMode === 'continuous'} onChange={() => setMicMode('continuous')} /> Continuous
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="radio" name="micMode" checked={micMode === 'ptt'} onChange={() => setMicMode('ptt')} /> Push-to-Talk
              </label>
            </div>
          </div>

          <div>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 1rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Accessibility Display</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="checkbox" checked={enlargeText} onChange={(e) => setEnlargeText(e.target.checked)} /> Enlarge Text (Client)
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} /> High Contrast
              </label>
            </div>
          </div>

          <div>
            <h4 style={{ color: 'var(--gold)', margin: '0 0 0.5rem 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>Pinned Glossary</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              <span style={{ background: 'var(--charcoal)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid var(--border-color)', color: 'var(--bone)' }}>Reentry Document Recovery</span>
              <span style={{ background: 'var(--charcoal)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid var(--border-color)', color: 'var(--bone)' }}>42 CFR</span>
              <span style={{ background: 'var(--charcoal)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid var(--border-color)', color: 'var(--bone)' }}>MHA Voucher</span>
            </div>
          </div>
        </div>

        {/* Live Feed Canvas */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', background: highContrast ? '#000' : 'var(--charcoal-dark)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h3 style={{ color: highContrast ? '#fff' : 'var(--bone)', margin: 0, fontFamily: 'var(--font-serif)' }}>Side-by-Side Live Feed</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Original preserved for accuracy disputes. Tap text to inline-edit.</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {transcript.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {isRecording ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--ember)', animation: 'pulse 1.5s infinite' }}></div>
                    Listening for audio...
                  </div>
                ) : (
                  "Session empty. Audio is discarded immediately post-transcription."
                )}
              </div>
            ) : (
              transcript.filter(Boolean).map((line, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  gap: '2rem', 
                  padding: '1rem', 
                  background: highContrast ? '#111' : 'var(--charcoal)', 
                  borderRadius: '4px',
                  border: highContrast ? '1px solid #fff' : '1px solid rgba(255,255,255,0.05)',
                  fontSize: enlargeText ? '1.25rem' : '1rem'
                }}>
                  <div style={{ flex: 1, color: highContrast ? '#fff' : 'var(--text-secondary)', fontFamily: 'var(--font-serif)', fontStyle: 'italic', borderRight: '1px dashed var(--border-color)', paddingRight: '1rem' }}>
                    {line?.original}
                  </div>
                  <div style={{ flex: 1, color: highContrast ? '#fff' : 'var(--bone)', fontFamily: 'var(--font-mono)', fontWeight: 'bold', paddingLeft: '1rem' }}>
                    {line?.translated}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
      
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(226, 85, 43, 0.7); }
          70% { box-shadow: 0 0 0 15px rgba(226, 85, 43, 0); }
          100% { box-shadow: 0 0 0 0 rgba(226, 85, 43, 0); }
        }
      `}</style>
    </div>
  );
}
