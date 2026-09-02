import re

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "r") as f:
    lines = f.readlines()

new_methods = """
import zee_voice

def m_speak(req, params):
    text = params.get("text", "")
    speed = params.get("speed", 0)
    def worker():
        try:
            zee_voice.speak(text, rate_pct=speed)
        except Exception:
            pass
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return True

def m_listen(req, params):
    try:
        return zee_voice.transcribe_once(timeout=params.get("timeout", 8), phrase_limit=params.get("phrase_limit", 10))
    except Exception as e:
        raise RuntimeError(f"listen failed: {e}")

_wake_listener = None
_wake_event = threading.Event()
_wake_lock = threading.Lock()

def _on_wake():
    _wake_event.set()

def m_wait_wake(req, params):
    global _wake_listener
    with _wake_lock:
        if _wake_listener is None:
            _wake_listener = zee_voice.WakeWordListener(on_wake=_on_wake)
            _wake_listener.start()
    
    _wake_event.clear()
    _wake_event.wait()
    return True

def m_stop_wake(req, params):
    global _wake_listener
    with _wake_lock:
        if _wake_listener:
            _wake_listener.stop()
            _wake_listener = None
    return True
"""

for i, line in enumerate(lines):
    if "def m_look" in line:
        lines.insert(i, new_methods + "\n")
        break

for i, line in enumerate(lines):
    if '"look": m_look,' in line:
        lines.insert(i + 1, '    "speak": m_speak,\n    "listen": m_listen,\n    "wait_wake": m_wait_wake,\n    "stop_wake": m_stop_wake,\n')
        break

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "w") as f:
    f.writelines(lines)
