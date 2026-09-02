import re

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "r") as f:
    lines = f.readlines()

new_logic = """
    low = prompt.lower().strip()
    if low in ("usb", "hardware", "peripherals", "devices"):
        import zee_portals
        res = zee_portals.PeripheralSentinel.scan_hardware()
        return res
    if low in ("bench", "benchmark", "tps", "speed test", "ollama bench"):
        import zee_portals
        res = zee_portals.HardwareSentinel.ollama_bench()
        return res
    if low in ("stop beat", "stop 808", "mute beat", "kill beat"):
        import zee_portals
        return zee_portals.DrumSynth808.stop_beat()
    if low in ("808", "beat", "drums", "trap beat", "synth"):
        import zee_portals
        return zee_portals.DrumSynth808.play_beat(bpm=140)
    if low.startswith("808 ") or low.startswith("beat "):
        import zee_portals
        try:
            bpm_val = int(low.split(" ")[1])
        except Exception:
            bpm_val = 140
        return zee_portals.DrumSynth808.play_beat(bpm=bpm_val)
    if low.startswith("play "):
        url = prompt.strip()[len("play "):].strip()
        import zee_youtube
        return zee_youtube.play_url(url)
    if low.startswith("search "):
        q = prompt.strip()[len("search "):].strip()
        import zee_web
        return zee_web.DuckDuckGo.search(q, max_results=5)
    if low.startswith("notes "):
        q = prompt.strip()[len("notes "):].strip()
        import zee_memory
        return zee_memory.search_notes(q)
    if low in ("mesh", "mesh status"):
        import zee_hivemind
        return zee_hivemind.P2P_Sync.status()
"""

for i, line in enumerate(lines):
    if "def m_chat" in line:
        # Find 'if not prompt:' inside m_chat
        for j in range(i, i+15):
            if "if not prompt:" in lines[j]:
                lines.insert(j + 2, new_logic)
                break
        break

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "w") as f:
    f.writelines(lines)
