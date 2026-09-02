with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "a") as f:
    f.write("""
export const speak = (text: string, speed: number = 0) => call("speak", { text, speed }) as Promise<boolean>;
export const listen = () => call("listen", {}) as Promise<string>;
export const waitWake = () => call("wait_wake", {}) as Promise<boolean>;
export const stopWake = () => call("stop_wake", {}) as Promise<boolean>;
""")
