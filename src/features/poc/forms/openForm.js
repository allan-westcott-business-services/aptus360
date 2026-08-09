import { gatherFormData } from "./gather.js";

/* Opens a form in its own window.

   The window is opened *before* the data is gathered. Browsers only
   allow a popup during the click that asked for it, and awaiting a
   fetch first loses that permission \u2014 the window is then blocked, on
   a click the user definitely made. So it opens immediately, shows that
   it is working, and has its content written once the data arrives. */
export async function openForm({ form, poc, projectId, lookups, onSubmitted }) {
  if (!form?.build) {
    return { ok: false, reason: `The ${form?.title ?? "operator"} form is not built yet.` };
  }

  const win = window.open("", "_blank");
  if (!win) {
    return {
      ok: false,
      reason: "Your browser blocked the form window. Allow pop-ups for this "
        + "site and try again.",
    };
  }
  win.document.write(
    `<!DOCTYPE html><html><head><title>Preparing ${form.type} form\u2026</title></head>`
    + `<body style="font:15px system-ui,sans-serif;padding:40px;color:#374151">`
    + `Preparing the ${form.title} application form\u2026</body></html>`);

  try {
    const data = await gatherFormData({ poc, projectId, lookups });
    win.document.open();
    win.document.write(form.build(data));
    win.document.close();
    return { ok: true, win };
  } catch (e) {
    /* The window is already open and showing "preparing", so it has to
       be told what went wrong; closing it silently looks like nothing
       happened at all. */
    win.document.open();
    win.document.write(
      `<!DOCTYPE html><html><head><title>Could not build the form</title></head>`
      + `<body style="font:15px system-ui,sans-serif;padding:40px;color:#b91c1c">`
      + `<h2>Could not build the ${escapeHtml(form.title)} form</h2>`
      + `<p style="color:#374151">${escapeHtml(e.message || String(e))}</p>`
      + `<p style="color:#6b7280">Close this window and try again. If it keeps `
      + `happening, the application may be missing data the form needs.</p></body></html>`);
    win.document.close();
    return { ok: false, reason: e.message || String(e) };
  } finally {
    void onSubmitted;
  }
}

const escapeHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
