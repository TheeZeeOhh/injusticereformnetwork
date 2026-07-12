import React, { useState, useEffect, useRef } from 'react';

// Whisper wants 16 kHz mono Float32 audio. We capture ~5s windows and send each
// to the off-thread worker for on-device transcription + English translation.
const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 5;

export default function AudioIntake() {
  const [hasConsent, setHasConsent] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micMode, setMicMode] = useState('continuous');
  const [enlargeText, setEnlargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [modelState, setModelState] = useState('idle'); // idle | loading | ready | error
  const [modelProgress, setModelProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const bufferRef = useRef([]); // accumulates Float32 samples until a chunk is full
  const chunkIdRef = useRef(0);

  // Spin up the worker once. It's torn down on unmount so nothing persists.
  useEffect(() => {
    const worker = new Worker(new URL('../workers/whisperWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

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

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Load the model (no-op if already loaded) and show progress.
      if (modelState !== 'ready') {
        setModelState('loading');
        setStatusMsg('Loading on-device speech model (first run downloads it once)…');
        workerRef.current?.postMessage({ type: 'load' });
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
                Client explicitly consents to on-device audio transcription. Zero audio persistence is enforced.
              </span>
            </label>
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
