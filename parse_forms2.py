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
    
    if current_def:
        # getText
        m2 = re.search(r'QInputDialog\.getText\(self,\s*"([^"]+)",\s*"([^"]+)"(?:,\s*text="([^"]+)")?', line)
        if m2:
            forms[current_def]["title"] = m2.group(1)
            forms[current_def]["fields"].append({"type": "text", "label": m2.group(2), "default": m2.group(3) or ""})
        
        # getItem
        m3 = re.search(r'QInputDialog\.getItem\(self,\s*"([^"]+)",\s*"([^"]+)",\s*([^,]+)', line)
        if m3:
            forms[current_def]["title"] = m3.group(1)
            forms[current_def]["fields"].append({"type": "select", "label": m3.group(2), "options_var": m3.group(3).strip()})

print(json.dumps(forms, indent=2))
