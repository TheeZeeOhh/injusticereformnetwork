with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bars.tsx", "r") as f:
    text = f.read()

text = text.replace(
    """  onPet: () => void;
  note: (msg: string) => void;
}) {""",
    """  onPet: () => void;
  note: (msg: string) => void;
  onRadio: () => void;
  onEq: () => void;
}) {"""
)

text = text.replace(
    """  onPet,
  note,
}: {""",
    """  onPet,
  note,
  onRadio,
  onEq,
}: {"""
)

text = text.replace(
    """      {/* Radio and EQ were in-process audio in the PyQt build; there is no
          equivalent here yet, so they are marked rather than faked. */}
      <button className="iconbtn off" disabled title="Sovereign Radio — not ported yet">📻</button>
      <button className="iconbtn off" disabled title="Radio Equalizer — not ported yet">🎚️</button>""",
    """      <button className="iconbtn" onClick={onRadio} title="Sovereign Radio">📻</button>
      <button className="iconbtn" onClick={onEq} title="Radio Equalizer">🎚️</button>"""
)

with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bars.tsx", "w") as f:
    f.write(text)
