with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "a") as f:
    f.write("\nexport const look = (question: string) => call(\"look\", { question }) as Promise<string>;\n")
