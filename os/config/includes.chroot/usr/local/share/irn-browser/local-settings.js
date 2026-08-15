// IRN Browser autoconfig loader. Installed to <firefox>/defaults/pref/.
// Points Firefox at mozilla.cfg (in the Firefox install dir) and disables the
// obscuration (obscure_value 0 = the .cfg is plain text, not byte-rotated).
pref("general.config.filename", "mozilla.cfg");
pref("general.config.obscure_value", 0);
pref("general.config.sandbox_enabled", false);
