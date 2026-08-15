// Reading Room — a Cinnamon desklet showing the library's passage of the day.
//
// Runs `reading-room-daily.py --json` (local FTS over 514 books; no network),
// shows the passage + citation, and rotates at midnight. Left-click asks Amina
// about the day's book via sable-ask.sh.
//
// __DAILY_PATH__, __ASK_PATH__, __PY__ and __TERM_CMD__ are filled in by the
// installer.

const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const Lang = imports.lang;

const DAILY = "__DAILY_PATH__";    // absolute path to reading-room-daily.py
const ASK = "__ASK_PATH__";        // absolute path to sable-ask.sh
const PY = "__PY__";               // python3
const TERM_CMD = "__TERM_CMD__";   // e.g. "konsole -e"
const INTERVAL = 1800;             // re-read every 30 min (text is day-stable)

function ReadingRoomDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

ReadingRoomDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        this.setHeader("Reading Room");
        this._book = "";

        this._passage = new St.Label({ text: "…" });
        this._passage.clutter_text.line_wrap = true;
        this._passage.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._passage.set_style(
            "font-size: 14px; font-style: italic; color: #e8e2d0; " +
            "font-family: Georgia, serif;"
        );

        this._cite = new St.Label({ text: "" });
        this._cite.set_style("font-size: 12px; color: #b89b6e; padding-top: 8px;");

        this._box = new St.BoxLayout({ vertical: true });
        this._box.set_style(
            "width: 320px; padding: 16px 18px; background-color: rgba(20,16,10,0.88); " +
            "border-radius: 12px; border: 1px solid rgba(184,155,110,0.30);"
        );
        this._box.add(this._passage);
        this._box.add(this._cite);
        this.setContent(this._box);

        this.actor.connect("button-press-event", Lang.bind(this, this._onClick));

        this._timeout = 0;
        this._update();
    },

    _onClick: function (actor, event) {
        // Left-click: ask Amina about today's book.
        var button = event ? event.get_button() : 1;
        if (button !== 1 || !this._book) return;
        try {
            var q = "tell me about the book '" + this._book.replace(/'/g, "") + "'";
            Util.spawnCommandLine(TERM_CMD + " bash " + ASK + " " + GLib_quote(q));
        } catch (e) {
            global.logError("Reading Room click: " + e);
        }
    },

    _update: function () {
        try {
            Util.spawnCommandLineAsyncIO(
                PY + " " + DAILY + " --json", Lang.bind(this, this._onOutput)
            );
        } catch (e) {
            global.logError("Reading Room spawn: " + e);
        }
        this._timeout = Mainloop.timeout_add_seconds(INTERVAL, Lang.bind(this, this._update));
        return false;
    },

    _onOutput: function (stdout) {
        try {
            var line = (stdout || "").trim().split("\n").filter(function (l) { return l; }).pop();
            if (!line) return;
            var d = JSON.parse(line);
            this._book = d.book || "";
            this._passage.set_text("“" + (d.text || "") + "”");
            var cite = d.book ? ("— " + d.book + (d.author ? ", " + d.author : "")) : "";
            this._cite.set_text(cite);
            this.setHeader(d.book ? "Reading Room · click to ask Amina" : "Reading Room");
        } catch (e) {
            global.logError("Reading Room parse: " + e);
        }
    },

    on_desklet_removed: function () {
        if (this._timeout) { Mainloop.source_remove(this._timeout); this._timeout = 0; }
    }
};

// Single-quote a string for the shell (the ask script takes the question as $*).
function GLib_quote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function main(metadata, desklet_id) {
    return new ReadingRoomDesklet(metadata, desklet_id);
}
