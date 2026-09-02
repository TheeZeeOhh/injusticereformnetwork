import json

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src-tauri/capabilities/default.json", "r") as f:
    data = json.load(f)

if "core:window:default" not in data["permissions"]:
    data["permissions"].extend([
        "core:window:allow-set-fullscreen",
        "core:window:allow-set-always-on-top",
        "core:window:allow-minimize",
        "core:window:allow-close"
    ])

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src-tauri/capabilities/default.json", "w") as f:
    json.dump(data, f, indent=2)
