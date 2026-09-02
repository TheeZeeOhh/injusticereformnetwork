with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Left Footer Actions
footer_old = """          onFooter={(item) => setDiagnostics((d) => [...d, `${item}: not wired yet`])}"""
footer_new = """          onFooter={(item) => {
            if (item === "Settings") {
              setRightOpen(true);
            } else if (item === "Activity") {
              // Activity expands diagnostics
              document.querySelector("details.diagnostics")?.setAttribute("open", "true");
            } else if (item === "Help") {
              setTurns(t => [...t, { role: "zee", text: "Help: I am Zee Zee. I can see your screen, run tools, and remember our chats." }]);
            }
          }}"""

text = text.replace(footer_old, footer_new)

# Right Panel onLook
look_fn = """  const doLook = async () => {
    setRightOpen(false);
    setBusy(true);
    setTurns((t) => [...t, { role: "you", text: "Describe my screen." }, { role: "zee", text: "looking..." }]);
    try {
      const res = await bridge.look("Describe my screen.");
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = { role: "zee", text: res };
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = { role: "zee", text: `[vision error] ${msg}` };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };
"""

text = text.replace("  async function send() {", look_fn + "\n  async function send() {")

rp_old = "          onToggleOperator={() => setOperatorOn(v => !v)}"
rp_new = "          onToggleOperator={() => setOperatorOn(v => !v)}\n          onLook={doLook}"
text = text.replace(rp_old, rp_new)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
