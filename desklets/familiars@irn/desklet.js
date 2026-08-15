// Familiars — a Cinnamon desklet showing one Sable-mood face per IRN codebase.
//
// For each configured repo it runs `pet.js --bar --repo <path>` and renders the
// repo's name + mood face, tinted by state. A glance tells you which repo has a
// red test, unpushed work, or a staged secret. Click a row for that repo's full
// terminal view. Local and read-only (pet.js never writes to any repo).
//
// __PET_PATH__, __REPOS_JSON__ and __TERM_CMD__ are filled in by the installer.

const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const Lang = imports.lang;

const PET = "__PET_PATH__";
const REPOS = __REPOS_JSON__;      // [{name, path}, …]
const TERM_CMD = "__TERM_CMD__";
const INTERVAL = 8;                // seconds between full sweeps

const MOOD_COLOR = {
    content: "#7ab8ff", happy: "#7ab8ff", proud: "#7ab8ff",
    eager: "#7ab8ff", busy: "#7ab8ff",
    anxious: "#ffcc66", worried: "#ffcc66", curious: "#ffcc66", tangled: "#ffcc66",
    sleepy: "#8a94a0",
    alarmed: "#ff6b6b", guarding: "#ff6b6b"
};

function FamiliarsDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

FamiliarsDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        this.setHeader("Familiars");

        this._faces = [];   // one St.Label per repo, index-aligned with REPOS
        var box = new St.BoxLayout({ vertical: true });
        box.set_style(
            "padding: 12px 16px; background-color: rgba(14,20,30,0.9); " +
            "border-radius: 12px; border: 1px solid rgba(122,184,255,0.22);"
        );

        for (var i = 0; i < REPOS.length; i++) {
            var row = new St.BoxLayout({ vertical: false, reactive: true, track_hover: true });
            row.set_style("padding: 2px 0;");
            var name = new St.Label({ text: REPOS[i].name });
            name.set_style("color: #c9d1d9; font-size: 13px; min-width: 150px;");
            var face = new St.Label({ text: "…" });
            face.set_style("font-family: monospace; font-size: 15px; color: #8a94a0;");
            row.add(name);
            row.add(face);
            row.connect("button-press-event", Lang.bind(this, this._onRowClick, REPOS[i].path));
            box.add(row);
            this._faces.push(face);
        }

        this.setContent(box);
        this._timeout = 0;
        this._update();
    },

    _onRowClick: function (actor, event, path) {
        var button = event ? event.get_button() : 1;
        if (button !== 1) return;
        try {
            Util.spawnCommandLine(TERM_CMD + " node " + PET + " --watch --repo " + path);
        } catch (e) {
            global.logError("Familiars click: " + e);
        }
        return true;
    },

    _readOne: function (idx) {
        var self = this;
        var path = REPOS[idx].path;
        Util.spawnCommandLineAsyncIO(
            "node " + PET + " --bar --repo " + path,
            function (stdout) {
                try {
                    var line = (stdout || "").trim().split("\n").filter(function (l) { return l; }).pop();
                    if (!line) return;
                    var d = JSON.parse(line);
                    var face = self._faces[idx];
                    if (!face) return;
                    face.set_text(d.text || "◕ᴥ◕");
                    face.set_style("font-family: monospace; font-size: 15px; color: " +
                                   (MOOD_COLOR[d["class"]] || "#8a94a0") + ";");
                } catch (e) {
                    global.logError("Familiars parse: " + e);
                }
            }
        );
    },

    _update: function () {
        for (var i = 0; i < REPOS.length; i++) this._readOne(i);
        this._timeout = Mainloop.timeout_add_seconds(INTERVAL, Lang.bind(this, this._update));
        return false;
    },

    on_desklet_removed: function () {
        if (this._timeout) { Mainloop.source_remove(this._timeout); this._timeout = 0; }
    }
};

function main(metadata, desklet_id) {
    return new FamiliarsDesklet(metadata, desklet_id);
}
