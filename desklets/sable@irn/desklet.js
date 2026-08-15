// Sable — a Cinnamon desktop desklet for the Sanctuary familiar.
//
// Runs `node pet.js --bar` every few seconds, parses the one-line waybar JSON
// it emits ({ text, tooltip, class }), and renders her compact face tinted by
// mood. Purely local and read-only — pet.js never writes to the repo, and this
// desklet only spawns it and reads its stdout. Click Sable to open the full
// terminal view (`node pet.js --watch`).
//
// __PET_PATH__, __ASK_PATH__ and __TERM_CMD__ are filled in by install-sable-desklet.sh.

const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const Lang = imports.lang;

const PET = "__PET_PATH__";        // absolute path to pet.js
const ASK = "__ASK_PATH__";        // absolute path to sable-ask.sh (Amina front door)
const TERM_CMD = "__TERM_CMD__";   // e.g. "konsole -e" — opens a terminal
const INTERVAL = 5;                // seconds between reads

// Mood -> color, mirroring the waybar module's palette (install-sable-bar.sh).
const MOOD_COLOR = {
    content: "#7ab8ff", happy: "#7ab8ff", proud: "#7ab8ff",
    eager: "#7ab8ff", busy: "#7ab8ff",
    anxious: "#ffcc66", worried: "#ffcc66", curious: "#ffcc66",
    tangled: "#ffcc66",
    sleepy: "#6b7a8d",
    alarmed: "#ff6b6b", guarding: "#ff6b6b"
};

const FACE_STYLE = "font-size: 26px; font-family: monospace; ";

function SableDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

SableDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

        this.setHeader("Sable");

        this._face = new St.Label({ text: "◕ᴥ◕" });
        this._face.set_style(FACE_STYLE + "color: #7ab8ff;");

        this._box = new St.BoxLayout({ vertical: true });
        this._box.set_style(
            "padding: 10px 16px; background-color: rgba(16,39,61,0.85); " +
            "border-radius: 12px; border: 1px solid rgba(122,184,255,0.25);"
        );
        this._box.add(this._face);
        this.setContent(this._box);

        // Left-click: ask Amina (the Reading Room front door).
        // Middle-click: open her live mood/watch view.
        this.actor.connect("button-press-event", Lang.bind(this, this._onClick));

        this._timeout = 0;
        this._update();
    },

    _onClick: function (actor, event) {
        try {
            var button = event ? event.get_button() : 1;
            if (button === 2) {
                Util.spawnCommandLine(TERM_CMD + " node " + PET + " --watch");
            } else if (button === 1) {
                Util.spawnCommandLine(TERM_CMD + " bash " + ASK);
            }
            // right-click (3) falls through to Cinnamon's desklet context menu.
        } catch (e) {
            global.logError("Sable desklet click: " + e);
        }
    },

    _update: function () {
        try {
            // spawnCommandLineAsyncIO calls back with (stdout, stderr, exitCode).
            Util.spawnCommandLineAsyncIO(
                "node " + PET + " --bar",
                Lang.bind(this, this._onOutput)
            );
        } catch (e) {
            global.logError("Sable desklet spawn: " + e);
        }
        // one-shot timer; _update re-arms it so teardown only has one to clear.
        this._timeout = Mainloop.timeout_add_seconds(
            INTERVAL, Lang.bind(this, this._update)
        );
        return false;
    },

    _onOutput: function (stdout) {
        try {
            var lines = (stdout || "").trim().split("\n").filter(function (l) { return l; });
            if (!lines.length) return;
            var data = JSON.parse(lines[lines.length - 1]);
            var color = MOOD_COLOR[data["class"]] || "#7ab8ff";
            this._face.set_text(data.text || "◕ᴥ◕");
            this._face.set_style(FACE_STYLE + "color: " + color + ";");
            this.setHeader("Sable" + (data["class"] ? " · " + data["class"] : ""));
        } catch (e) {
            global.logError("Sable desklet parse: " + e);
        }
    },

    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = 0;
        }
    }
};

function main(metadata, desklet_id) {
    return new SableDesklet(metadata, desklet_id);
}
