with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Add state
text = text.replace(
    "const [wakeArmed, setWakeArmed] = useState(false);",
    "const [wakeArmed, setWakeArmed] = useState(false);\n  const [showRadio, setShowRadio] = useState(false);\n  const [showEq, setShowEq] = useState(false);\n  const [radioChannels, setRadioChannels] = useState<any[]>([]);\n  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0]);"
)

# TopBar props
text = text.replace(
    "        onPet={() => {",
    """        onRadio={async () => {
          try {
            const ch = await bridge.radioChannels();
            setRadioChannels(ch);
            setShowRadio(true);
          } catch (e) { note(`radio error: ${e}`); }
        }}
        onEq={() => setShowEq(true)}
        onPet={() => {"""
)

# Render Modals
modals = """
      {showRadio && (
        <div className="approval-dialog" style={{ position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)', background: '#1e1e1e', padding: '20px', borderRadius: '8px', zIndex: 1000, border: '1px solid #444', color: '#eee', minWidth: '350px' }}>
          <h3 style={{ marginTop: 0, color: '#c9a84c' }}>Sovereign Radio</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {radioChannels.map((c) => (
              <button key={c.id} style={{ textAlign: 'left', padding: '8px', background: '#2c2d36', border: '1px solid #444', color: '#fff', cursor: 'pointer' }} onClick={async () => {
                await bridge.radioPlay(String(c.id));
                setTurns(t => [...t, { role: "zee", text: `Playing ${c.name}` }]);
                setShowRadio(false);
              }}>
                <strong>{c.id}. {c.name}</strong><br/>
                <small style={{ color: '#aaa' }}>{c.type}</small>
              </button>
            ))}
            <button style={{ textAlign: 'left', padding: '8px', background: '#dc2626', border: '1px solid #444', color: '#fff', cursor: 'pointer' }} onClick={async () => {
                await bridge.radioStop();
                setTurns(t => [...t, { role: "zee", text: `Radio stopped.` }]);
                setShowRadio(false);
            }}>⏹️ Stop Radio</button>
          </div>
          <button style={{ marginTop: '15px', padding: '8px', width: '100%' }} onClick={() => setShowRadio(false)}>Close</button>
        </div>
      )}
      
      {showEq && (
        <div className="approval-dialog" style={{ position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)', background: '#1e1e1e', padding: '20px', borderRadius: '8px', zIndex: 1000, border: '1px solid #444', color: '#eee', minWidth: '300px' }}>
          <h3 style={{ marginTop: 0, color: '#c9ccd6' }}>Radio Equalizer</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            {['60', '230', '910', '3600', '14000'].map((label, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <input type="range" orient="vertical" min="-24" max="24" value={eqGains[idx]} style={{ writingMode: 'vertical-lr', height: '110px' }} onChange={(e) => {
                  const val = Number(e.target.value);
                  const next = [...eqGains];
                  next[idx] = val;
                  setEqGains(next);
                  bridge.radioEqGain(idx, val);
                }} />
                <small style={{ marginTop: '5px' }}>{eqGains[idx]}</small>
                <small style={{ color: '#aaa' }}>{label}Hz</small>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '15px' }}>
            {['Flat', 'Voice', 'Bass Boost', 'Lofi / Telecom'].map(p => (
              <button key={p} style={{ flex: 1, padding: '5px' }} onClick={async () => {
                const gains = await bridge.radioEqPreset(p);
                setEqGains(gains);
              }}>{p}</button>
            ))}
          </div>
          <button style={{ padding: '8px', width: '100%' }} onClick={() => setShowEq(false)}>Close</button>
        </div>
      )}
"""
text = text.replace("    </main>", modals + "    </main>")

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
