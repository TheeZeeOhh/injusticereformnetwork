const fs = require("fs");
const path = "/home/aziza/Desktop/code/ai_twin_app/src/App.tsx";
let text = fs.readFileSync(path, "utf-8");

text = text.replace("          onSpeakToZeeZee={doListen}", "          onSpeakToZeeZee={doListen}\n          onPortal={setActivePortal}");

const portalRender = `      {activePortal && <PortalModal id={activePortal} onClose={() => setActivePortal(null)} onSubmit={submitPortal} />}`;
text = text.replace("      {showEq && <EqModal onClose={() => setShowEq(false)} />}", "      {showEq && <EqModal onClose={() => setShowEq(false)} />}\n" + portalRender);

fs.writeFileSync(path, text);
