with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "r") as f:
    text = f.read()

text = text.replace(
    "  onToggleOperator: () => void;\n}) {",
    "  onToggleOperator: () => void;\n  onLook: () => void;\n}) {"
)

text = text.replace(
    "  onToggleOperator,\n}: {",
    "  onToggleOperator,\n  onLook,\n}: {"
)

text = text.replace(
    """<Row label="Describe my screen (local vision)" why={`${notYet} (Brain.look)`} />""",
    """<Row label="Describe my screen (local vision)" onClick={onLook} />"""
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "w") as f:
    f.write(text)
