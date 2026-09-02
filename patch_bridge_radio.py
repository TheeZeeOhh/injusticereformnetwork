import re

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "r") as f:
    lines = f.readlines()

new_methods = """
import zee_portals

def m_radio_channels(req, params):
    return zee_portals.SovereignRadio.CHANNELS

def m_radio_play(req, params):
    channel = params.get("channel", "1")
    volume = params.get("volume", 65)
    return zee_portals.SovereignRadio.play_channel(channel, volume=volume)

def m_radio_stop(req, params):
    return zee_portals.SovereignRadio.stop_radio()

def m_radio_eq_gain(req, params):
    band = params.get("band", 0)
    gain = params.get("gain", 0)
    zee_portals.SovereignRadio.set_eq_gain(band, gain)
    return True

def m_radio_eq_preset(req, params):
    preset = params.get("preset", "Flat")
    return zee_portals.SovereignRadio.apply_eq_preset(preset)
"""

for i, line in enumerate(lines):
    if "def m_sessions_list" in line:
        lines.insert(i, new_methods + "\n")
        break

for i, line in enumerate(lines):
    if '"session_load": m_session_load,' in line:
        lines.insert(i + 1, '    "radio_channels": m_radio_channels,\n    "radio_play": m_radio_play,\n    "radio_stop": m_radio_stop,\n    "radio_eq_gain": m_radio_eq_gain,\n    "radio_eq_preset": m_radio_eq_preset,\n')
        break

with open("/home/aziza/vault/Desktop/code/zee_bridge.py", "w") as f:
    f.writelines(lines)
