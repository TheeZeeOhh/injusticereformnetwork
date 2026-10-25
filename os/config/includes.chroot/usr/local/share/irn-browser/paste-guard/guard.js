// IRN paste guard: stop client information from being pasted into a website
// without a deliberate second click.
//
// Runs in every page. On paste (or a text drop) into a site that isn't this
// machine or on the policy's allow list, it checks the text with detect.js. If
// it finds an identifier, the paste is held and a dialog says what was found
// and where it would go. Nothing is sent, logged or stored: the held text lives
// in this closure until the dialog closes.
"use strict";

(function () {
  const { findPHI, isAllowed } = globalThis.irnPasteGuard;
  let allow = [];
  const api = typeof browser !== "undefined" ? browser : null;
  if (api && api.storage && api.storage.managed) {
    api.storage.managed.get("allow").then((r) => {
      if (Array.isArray(r.allow)) allow = r.allow.filter((x) => typeof x === "string");
    }).catch(() => { /* no policy: only this machine is allowed */ });
  }

  let open = null;

  function editable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && /^(text|search|email|url|tel|password|)$/i.test(el.type || "");
  }

  function insert(target, text) {
    target.focus();
    // insertText keeps the page's undo history and fires the events a site expects.
    if (document.execCommand && document.execCommand("insertText", false, text)) return;
    if (typeof target.setRangeText === "function") {
      const s = target.selectionStart ?? target.value.length;
      const e = target.selectionEnd ?? s;
      target.setRangeText(text, s, e, "end");
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
    }
  }

  function intercept(e, text) {
    if (open || !text || isAllowed(location.href, allow)) return;
    const target = e.target && e.target.nodeType === 1 ? e.target : document.activeElement;
    if (!editable(target)) return;
    const found = findPHI(text);
    if (!found.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ask(target, text, found);
  }

  window.addEventListener("paste", (e) => {
    intercept(e, e.clipboardData && e.clipboardData.getData("text/plain"));
  }, true);
  window.addEventListener("drop", (e) => {
    intercept(e, e.dataTransfer && e.dataTransfer.getData("text/plain"));
  }, true);

  function list(items) {
    const words = items.map((f) => f.label);
    if (words.length === 1) return words[0];
    return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
  }

  function el(doc, tag, attrs, text) {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  }

  const CSS = `
    :host { all: initial; }
    .scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
      padding: 16px; background: rgba(12, 11, 13, 0.55); font: 400 16px/1.5 system-ui, sans-serif; }
    .box { box-sizing: border-box; inline-size: min(30rem, 100%); padding: 24px; border-radius: 4px;
      background: #141215; color: #efe8d9; border: 1px solid #d6b87d;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45); }
    h2 { margin: 0 0 8px; font: 600 20px/1.3 system-ui, sans-serif; }
    p { margin: 0 0 12px; overflow-wrap: anywhere; }
    .host { font-family: ui-monospace, monospace; }
    .note { color: #b8ad9c; font-size: 14px; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    button { min-block-size: 44px; padding: 0 16px; border-radius: 2px; cursor: pointer;
      font: 500 15px/1 system-ui, sans-serif; }
    .keep { background: #d6b87d; color: #0c0b0d; border: 1px solid #d6b87d; }
    .keep:hover { background: #e6cd9b; }
    .send { background: transparent; color: #efe8d9; border: 1px solid #9e9485; }
    .send:hover { background: rgba(214, 184, 125, 0.12); }
    button:focus-visible { outline: 2px solid #e6cd9b; outline-offset: 2px; }
    @media (prefers-color-scheme: light) {
      .scrim { background: rgba(29, 26, 27, 0.35); }
      .box { background: #fbf8f2; color: #1d1a1b; border-color: #7a5c22; }
      .note { color: #5f574d; }
      .keep { background: #7a5c22; color: #fbf8f2; border-color: #7a5c22; }
      .keep:hover { background: #5e4618; }
      .send { color: #1d1a1b; border-color: #5f574d; }
      button:focus-visible { outline-color: #7a5c22; }
    }
    @media (forced-colors: active) {
      .box { border: 2px solid CanvasText; }
      .keep { forced-color-adjust: none; background: ButtonText; color: ButtonFace; }
    }`;

  function ask(target, text, found) {
    const doc = document;
    const host = el(doc, "div", { "data-irn-paste-guard": "" });
    const root = host.attachShadow({ mode: "closed" });
    const style = el(doc, "style");
    style.textContent = CSS;
    const scrim = el(doc, "div", { class: "scrim" });
    const box = el(doc, "div", { class: "box", role: "alertdialog", "aria-modal": "true",
      "aria-labelledby": "t", "aria-describedby": "d" });
    const where = location.hostname || location.origin;
    const desc = el(doc, "p", { id: "d" });
    desc.append(`The text you're pasting includes ${list(found)}. Pasting it here sends it to `,
      el(doc, "span", { class: "host" }, where), ".");
    const keep = el(doc, "button", { class: "keep", type: "button" }, "Don't paste");
    const send = el(doc, "button", { class: "send", type: "button" }, "Paste anyway");
    const row = el(doc, "div", { class: "row" });
    row.append(send, keep);
    box.append(el(doc, "h2", { id: "t" }, "This looks like client information"), desc,
      el(doc, "p", { class: "note" }, "Client records belong in Sanctuary. Nothing was sent or saved."), row);
    scrim.append(box);
    root.append(style, scrim);

    let held = text;
    const close = (paste) => {
      doc.removeEventListener("keydown", onKey, true);
      host.remove();
      open = null;
      const t = held;
      held = null;
      if (paste) insert(target, t);
      else target.focus();
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (e.key === "Tab") {
        // Two buttons; keep focus inside the dialog.
        e.preventDefault(); e.stopPropagation();
        (root.activeElement === keep ? send : keep).focus();
      }
    };
    keep.addEventListener("click", () => close(false));
    send.addEventListener("click", () => close(true));
    doc.addEventListener("keydown", onKey, true);
    (doc.body || doc.documentElement).append(host);
    open = host;
    keep.focus();
  }
})();
