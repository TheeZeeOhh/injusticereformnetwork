with open("/home/aziza/Desktop/code/ai_twin_app/src/bridge.ts", "a") as f:
    f.write("\nexport const stopGen = () => call(\"stop_gen\", {}) as Promise<boolean>;\n")
