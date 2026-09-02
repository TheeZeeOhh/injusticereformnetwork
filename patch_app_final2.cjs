const fs = require("fs");
const path = "/home/aziza/Desktop/code/ai_twin_app/src/App.tsx";
let text = fs.readFileSync(path, "utf-8");

const portalRender = `      {activePortal && <PortalModal id={activePortal} onClose={() => setActivePortal(null)} onSubmit={submitPortal} />}`;
text = text.replace("    </main>", portalRender + "\n    </main>");

fs.writeFileSync(path, text);
