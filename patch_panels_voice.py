with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "r") as f:
    text = f.read()

text = text.replace(
    "  onLook: () => void;\n}) {",
    "  onLook: () => void;\n  wakeArmed: boolean;\n  onToggleWake: () => void;\n  onSpeakToZeeZee: () => void;\n}) {"
)

text = text.replace(
    "  onLook,\n}: {",
    "  onLook,\n  wakeArmed,\n  onToggleWake,\n  onSpeakToZeeZee,\n}: {"
)

text = text.replace(
    """<Row label="Speak to Zee Zee" why={notYet} />""",
    """<Row label="Speak to Zee Zee (listen)" onClick={onSpeakToZeeZee} />"""
)

text = text.replace(
    """<Row label="Arm 'Hey Zee Zee'" why={notYet} />""",
    """<Row label={`Arm 'Hey Zee Zee'  ${wakeArmed ? "●" : "○"}`} onClick={onToggleWake} />"""
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "w") as f:
    f.write(text)
