# Windows dependencies to download

These cannot be bundled from the Linux build box — download them on the Windows
machine. Direct sources:

| Dependency | Why | Download |
|---|---|---|
| MSVC C++ Build Tools | Rust linker for Windows | https://visualstudio.microsoft.com/visual-cpp-build-tools/ (select "Desktop development with C++") |
| Rust (rustup) | Compiles the Tauri shell | https://rustup.rs |
| WebView2 Runtime | Renders the UI (WebKitGTK equivalent) | https://developer.microsoft.com/microsoft-edge/webview2/ |
| Node.js LTS (≥18) | npm, frontend build | https://nodejs.org |
| Ollama for Windows | Local Amina/Wifey AI (localhost:11434) | https://ollama.com/download |
| Zadig (if needed) | Install WinUSB driver for the USB token | https://zadig.akeo.ie |

## Model
After installing Ollama:
```
ollama pull llama3.2
```
(~2 GB. The app's local assistant expects a non-`:cloud` model.)

## Notes
- Everything above is a standard vendor download; nothing proprietary to IRN.
- The **source code** for Sanctuary is in the `sanctuary-source/` folder of this
  kit — no download needed for that.
- If the Windows machine is offline, fetch these on a connected machine first;
  Rust/Node/Ollama all have offline installers.
