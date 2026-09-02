with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "a") as f:
    f.write("""
export const sessionsList = () => call("sessions_list", {}) as Promise<{ id: string, title: string, updated_at: number }[]>;
export const sessionLoad = (id: string) => call("session_load", { id }) as Promise<{ role: "you" | "zee", text: string }[]>;
export const sessionSave = (id: string, title: string, turns: { role: "you" | "zee", text: string }[]) => call("session_save", { id, title, turns }) as Promise<boolean>;
""")
