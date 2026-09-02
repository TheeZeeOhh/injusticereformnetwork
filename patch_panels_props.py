with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "r") as f:
    text = f.read()

text = text.replace(
    "  onDistill: () => void;\n}) {",
    "  onDistill: () => void;\n  operatorOn: boolean;\n  onToggleOperator: () => void;\n}) {"
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/panels.tsx", "w") as f:
    f.write(text)
