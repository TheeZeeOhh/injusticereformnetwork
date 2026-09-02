with open("/home/aziza/vault/Desktop/code/ai_twin_app/src/bridge.ts", "a") as f:
    f.write("""
export const radioChannels = () => call("radio_channels", {}) as Promise<any[]>;
export const radioPlay = (channel: string, volume: number = 65) => call("radio_play", { channel, volume }) as Promise<string>;
export const radioStop = () => call("radio_stop", {}) as Promise<string>;
export const radioEqGain = (band: number, gain: number) => call("radio_eq_gain", { band, gain }) as Promise<boolean>;
export const radioEqPreset = (preset: string) => call("radio_eq_preset", { preset }) as Promise<number[]>;
""")
