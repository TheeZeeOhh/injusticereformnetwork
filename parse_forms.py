import re
import json

with open("/home/aziza/Desktop/code/ai_twin_widget.py", "r") as f:
    code = f.read()

forms = {}
current_def = None

for line in code.split("\n"):
    m = re.match(r"\s*def (prompt_\w+)\(self", line)
    if m:
        current_def = m.group(1)
        forms[current_def] = {"fields": []}
    
    if current_def and "QInputDialog.getText" in line:
        # e.g. client, ok1 = QInputDialog.getText(self, "Mutual Aid Invoice", "Client / Organization Name:")
        m2 = re.search(r'QInputDialog\.getText\(self,\s*"([^"]+)",\s*"([^"]+)"(?:,\s*text="([^"]+)")?', line)
        if m2:
            title = m2.group(1)
            label = m2.group(2)
            default = m2.group(3) or ""
            forms[current_def]["title"] = title
            forms[current_def]["fields"].append({
                "label": label,
                "default": default
            })

print(json.dumps(forms, indent=2))
