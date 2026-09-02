with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

# Add wakeArmed state
text = text.replace(
    "const [voiceOn, setVoiceOn] = useState(false);",
    "const [voiceOn, setVoiceOn] = useState(false);\n  const [wakeArmed, setWakeArmed] = useState(false);"
)

# Speak after send
send_end = """        await bridge.chat(prompt, model, onToken);
      }
    } catch (e) {"""

send_end_new = """        const res = await bridge.chat(prompt, model, onToken);
        if (voiceOn) void bridge.speak(res, speed);
      }
    } catch (e) {"""
text = text.replace(send_end, send_end_new)

operate_end = """      if (operatorOn) {
        await bridge.operate(prompt, model, onToken, onApproval);"""

operate_end_new = """      if (operatorOn) {
        const res = await bridge.operate(prompt, model, onToken, onApproval);
        if (voiceOn) void bridge.speak(res, speed);"""
text = text.replace(operate_end, operate_end_new)

# doListen and wake loop
listen_fn = """  const doListen = async () => {
    setRightOpen(false);
    try {
      note("Listening...");
      const text = await bridge.listen();
      if (text.trim()) {
        setInput(text);
      }
    } catch (e) {
      note(`Listen failed: ${e}`);
    }
  };

  useEffect(() => {
    let active = wakeArmed;
    if (active) {
      note("Wake word armed.");
      (async () => {
        while (active) {
          try {
            await bridge.waitWake();
            if (active) {
              await doListen();
            }
          } catch {
            break;
          }
        }
      })();
    } else {
      void bridge.stopWake();
    }
    return () => { active = false; };
  }, [wakeArmed]);
"""

text = text.replace("  const doLook", listen_fn + "\n  const doLook")

# Right Panel props
rp_old = "          onLook={doLook}"
rp_new = "          onLook={doLook}\n          wakeArmed={wakeArmed}\n          onToggleWake={() => setWakeArmed(v => !v)}\n          onSpeakToZeeZee={doListen}"
text = text.replace(rp_old, rp_new)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
