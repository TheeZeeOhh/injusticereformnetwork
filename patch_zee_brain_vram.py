with open("/home/aziza/Desktop/code/zee_brain.py", "r") as f:
    text = f.read()

# Replace the free memory calculation
old_calc = "free = _free_vram_bytes() or _free_memory_bytes()"
new_calc = "free = min(filter(None, [_free_vram_bytes(), _free_memory_bytes()]))"

text = text.replace(old_calc, new_calc)

with open("/home/aziza/Desktop/code/zee_brain.py", "w") as f:
    f.write(text)
