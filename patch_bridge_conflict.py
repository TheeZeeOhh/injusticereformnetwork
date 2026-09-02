with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "r") as f:
    text = f.read()

text = text.replace(
    "export const listen = () => call(\"listen\", {}) as Promise<string>;",
    "export const transcribe = () => call(\"listen\", {}) as Promise<string>;"
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "w") as f:
    f.write(text)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "r") as f:
    text = f.read()

text = text.replace(
    "const text = await bridge.listen();",
    "const text = await bridge.transcribe();"
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/App.tsx", "w") as f:
    f.write(text)
