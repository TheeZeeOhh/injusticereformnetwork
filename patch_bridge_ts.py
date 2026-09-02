with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "| { id: string; type: \"error\"; message: string };" in line:
        lines[i] = "  | { id: string; type: \"error\"; message: string }\n  | { id: string; type: \"approval_request\"; action_id: string; cmd: string; args: unknown };\n"
        break

for i, line in enumerate(lines):
    if "onToken?: (text: string) => void;" in line:
        lines.insert(i + 1, "  onApproval?: (actionId: string, cmd: string, args: unknown) => void;\n")
        break

for i, line in enumerate(lines):
    if "if (msg.type === \"token\") {" in line:
        lines.insert(i, """  if (msg.type === "approval_request") {
    entry.onApproval?.(msg.action_id, msg.cmd, msg.args);
    return;
  }
""")
        break

for i, line in enumerate(lines):
    if "onToken?: (text: string) => void," in line:
        lines.insert(i + 1, "  onApproval?: (actionId: string, cmd: string, args: unknown) => void,\n")
        break

for i, line in enumerate(lines):
    if "pending.set(id, { resolve, reject, onToken });" in line:
        lines[i] = "    pending.set(id, { resolve, reject, onToken, onApproval });\n"
        break

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "w") as f:
    f.writelines(lines)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "a") as f:
    f.write("""
export function operate(
  prompt: string,
  model: string,
  onToken: (text: string) => void,
  onApproval: (actionId: string, cmd: string, args: unknown) => void,
): Promise<string> {
  return call("operate", { prompt, model }, onToken, onApproval) as Promise<string>;
}

export const approve = (actionId: string, approved: boolean) => call("approve", { action_id: actionId, approved });
""")
