import re
with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "r") as f:
    text = f.read()

injection = """
def _with_persona_and_memory(prompt, brain):
    sysp = _system_prompt()
    mem_str = ""
    doc_str = ""
    
    if brain and hasattr(brain, "recall"):
        try:
            recall = brain.recall(prompt)
            if recall:
                mem_str = "[Long-term Memory / Known Facts about the user]:\\n" + recall
        except:
            pass
            
    if brain and hasattr(brain, "mem"):
        try:
            hits = brain.mem.search(prompt, k=3, use_embedding=True, kind="document")
            if hits:
                excerpts = [h["text"] for h in hits]
                doc_str = "[Relevant Document Excerpts]:\\n" + "\\n...\\n".join(excerpts)
        except:
            pass
            
    parts = []
    if sysp: parts.append(sysp)
    if mem_str: parts.append(mem_str)
    if doc_str: parts.append(doc_str)
    
    prefix = "\\n\\n".join(parts)
    return prefix + "\\n\\nUser: " + prompt if prefix else prompt
"""

# Inject the new function
text = text.replace("def _with_persona(prompt):", injection + "\ndef _with_persona(prompt):")

# Replace the usage in m_chat
m_chat_target = 'full = prompt if params.get("persona") is False else _with_persona(prompt)'
m_chat_replace = 'full = prompt if params.get("persona") is False else _with_persona_and_memory(prompt, brain)'
text = text.replace(m_chat_target, m_chat_replace)

with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "w") as f:
    f.write(text)
