import re

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Add state
text = text.replace(
    "const [speed, setSpeed] = useState(0);",
    "const [speed, setSpeed] = useState(0);\n  const [operatorOn, setOperatorOn] = useState(false);\n  const [approval, setApproval] = useState<{ id: string; cmd: string; args: unknown } | null>(null);"
)

# Replace send() implementation
send_old = """    try {
      await bridge.chat(prompt, model, (tok) => {
        // Append into the last turn as tokens arrive.
        setTurns((t) => {
          const next = [...t];
          next[next.length - 1] = {
            role: "zee",
            text: next[next.length - 1].text + tok,
          };
          return next;
        });
      });
    } catch (e) {"""

send_new = """    try {
      const onToken = (tok: string) => {
        setTurns((t) => {
          const next = [...t];
          next[next.length - 1] = {
            role: "zee",
            text: next[next.length - 1].text + tok,
          };
          return next;
        });
      };
      
      const onApproval = (id: string, cmd: string, args: unknown) => {
        setApproval({ id, cmd, args });
      };

      if (operatorOn) {
        await bridge.operate(prompt, model, onToken, onApproval);
      } else {
        await bridge.chat(prompt, model, onToken);
      }
    } catch (e) {"""

text = text.replace(send_old, send_new)

# RightPanel props
rp_old = """<RightPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          models={models}
          model={model}
          onModel={setModel}
          voiceOn={voiceOn}
          onToggleVoice={() => setVoiceOn((v) => !v)}
          speed={speed}
          onSpeed={setSpeed}
          onDistill={() => {"""

rp_new = rp_old + """
            void bridge
"""

rp_old_full = """        <RightPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          models={models}
          model={model}
          onModel={setModel}
          voiceOn={voiceOn}
          onToggleVoice={() => setVoiceOn((v) => !v)}
          speed={speed}
          onSpeed={setSpeed}
          onDistill={() => {
            void bridge
              .remember(turns.map((t) => `${t.role}: ${t.text}`).join("\\n"), "distilled")
              .then(() => setDiagnostics((d) => [...d, "memory distilled from this chat"]))
              .catch((e) => setDiagnostics((d) => [...d, `distill failed: ${e.message}`]));
          }}
        />"""

rp_new_full = """        <RightPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          models={models}
          model={model}
          onModel={setModel}
          voiceOn={voiceOn}
          onToggleVoice={() => setVoiceOn((v) => !v)}
          speed={speed}
          onSpeed={setSpeed}
          operatorOn={operatorOn}
          onToggleOperator={() => setOperatorOn(v => !v)}
          onDistill={() => {
            void bridge
              .remember(turns.map((t) => `${t.role}: ${t.text}`).join("\\n"), "distilled")
              .then(() => setDiagnostics((d) => [...d, "memory distilled from this chat"]))
              .catch((e) => setDiagnostics((d) => [...d, `distill failed: ${e.message}`]));
          }}
        />"""

text = text.replace(rp_old_full, rp_new_full)

# Approval dialog before </main>
dialog = """
      {approval && (
        <div className="approval-dialog" style={{ position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)', background: '#1e1e1e', padding: '20px', borderRadius: '8px', zIndex: 1000, border: '1px solid #444', color: '#eee', minWidth: '300px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <h3 style={{ marginTop: 0, color: '#facc15' }}>Operator Mode Approval</h3>
          <p>The Brain wants to execute a tool:</p>
          <div style={{ marginBottom: '10px' }}><strong>Command:</strong> <code style={{ color: '#60a5fa' }}>{approval.cmd}</code></div>
          <pre style={{ background: '#000', padding: '10px', overflowX: 'auto', borderRadius: '4px', fontSize: '0.85em' }}>{JSON.stringify(approval.args, null, 2)}</pre>
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button style={{ flex: 1, padding: '8px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { void bridge.approve(approval.id, true); setApproval(null); }}>Approve</button>
            <button style={{ flex: 1, padding: '8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { void bridge.approve(approval.id, false); setApproval(null); }}>Deny</button>
          </div>
        </div>
      )}
"""
text = text.replace("    </main>", dialog + "    </main>")

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
