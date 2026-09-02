with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "r") as f:
    text = f.read()

text = text.replace(
    "onDistill:\n",
    "onDistill: () => void;\n  operatorOn: boolean;\n  onToggleOperator: () => void;\n"
)
text = text.replace(
    "onDistill,\n}: {",
    "onDistill,\n  operatorOn,\n  onToggleOperator,\n}: {"
)
text = text.replace(
    """<Row label="🛠  Operator Mode  ●" why={`${notYet} (Brain.operate needs an approval flow)`} />""",
    """<Row label={`🛠  Operator Mode  ${operatorOn ? "●" : "○"}`} onClick={onToggleOperator} />"""
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "w") as f:
    f.write(text)
