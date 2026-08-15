// Sanctuary Posture — a Cinnamon desklet that reads the wards.
//
// Runs `sable-posture.sh --json` on an interval and shows each ward's state
// (ok / warn / alert / unknown), tinting the border by the worst state. It
// reports STATE only — never contents, never PHI. Left-click opens the full
// text report in a terminal.
//
// __POSTURE_PATH__ and __TERM_CMD__ are filled in by the installer.

const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const Lang = imports.lang;

const POSTURE = "__POSTURE_PATH__";  // absolute path to sable-posture.sh
const TERM_CMD = "__TERM_CMD__";     // e.g. "konsole -e"
const INTERVAL = 20;                 // seconds between reads

const STATE = {
    ok:      { color: "#7ad38a", mark: "✓" },
    warn:    { color: "#ffcc66", mark: "!" },
    alert:   { color: "#ff6b6b", mark: "⚠" },
    unknown: { color: "#8a94a0", mark: "·" }
};
const BORDER = { ok: "rgba(122,211,138,0.45)", warn: "rgba(255,204,102,0.55)",
                 alert: "rgba(255,107,107,0.7)", unknown: "rgba(138,148,160,0.4)" };

function PostureDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

PostureDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        this.setHeader("Sanctuary");

        this._rows = new St.BoxLayout({ vertical: true });
        this._box = new St.BoxLayout({ vertical: true });
        this._box.set_style(this._boxStyle("unknown"));
        this._box.add(this._rows);
        this.setContent(this._box);

        this.actor.connect("button-press-event", Lang.bind(this, this._onClick));
        this._timeout = 0;
        this._update();
    },

    _boxStyle: function (worst) {
        return "width: 240px; padding: 12px 14px; background-color: rgba(12,16,22,0.9); " +
               "border-radius: 12px; border: 1px solid " + (BORDER[worst] || BORDER.unknown) + ";";
    },

    _onClick: function (actor, event) {
        var button = event ? event.get_button() : 1;
        if (button !== 1) return;
        try {
            // Keep the terminal open so the report is readable.
            Util.spawnCommandLine(TERM_CMD + " bash -c '" + POSTURE + "; echo; read -n1 -s'");
        } catch (e) {
            global.logError("Posture click: " + e);
        }
    },

    _update: function () {
        try {
            Util.spawnCommandLineAsyncIO(POSTURE + " --json", Lang.bind(this, this._onOutput));
        } catch (e) {
            global.logError("Posture spawn: " + e);
        }
        this._timeout = Mainloop.timeout_add_seconds(INTERVAL, Lang.bind(this, this._update));
        return false;
    },

    _onOutput: function (stdout) {
        try {
            var line = (stdout || "").trim().split("\n").filter(function (l) { return l; }).pop();
            if (!line) return;
            var d = JSON.parse(line);
            this._box.set_style(this._boxStyle(d.worst || "unknown"));
            this._rows.destroy_all_children();
            var items = d.items || [];
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                var st = STATE[it.state] || STATE.unknown;
                var row = new St.BoxLayout({ vertical: false });
                var dot = new St.Label({ text: st.mark + "  " });
                dot.set_style("color: " + st.color + "; font-family: monospace; min-width: 16px;");
                var lab = new St.Label({ text: it.label });
                lab.set_style("color: #c9d1d9; font-size: 12px; min-width: 92px;");
                var val = new St.Label({ text: String(it.value || "") });
                val.set_style("color: " + st.color + "; font-size: 12px;");
                val.clutter_text.set_single_line_mode(true);
                val.clutter_text.set_ellipsize(3 /* Pango.EllipsizeMode.END */);
                row.add(dot); row.add(lab); row.add(val);
                this._rows.add(row);
            }
            this.setHeader("Sanctuary · " + (d.worst || "?"));
        } catch (e) {
            global.logError("Posture parse: " + e);
        }
    },

    on_desklet_removed: function () {
        if (this._timeout) { Mainloop.source_remove(this._timeout); this._timeout = 0; }
    }
};

function main(metadata, desklet_id) {
    return new PostureDesklet(metadata, desklet_id);
}
