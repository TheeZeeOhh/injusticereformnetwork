import re

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "r") as f:
    lines = f.readlines()

new_method = """
def m_look(req, params):
    brain = get_brain(params.get("model"))
    res = brain.look(params.get("question", "Describe what is on my screen."))
    return res
"""

for i, line in enumerate(lines):
    if "def m_approve" in line:
        lines.insert(i, new_method + "\n")
        break

for i, line in enumerate(lines):
    if '"approve": m_approve,' in line:
        lines.insert(i + 1, '    "look": m_look,\n')
        break

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "w") as f:
    f.writelines(lines)
