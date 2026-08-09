import { gatherFormData } from "./gather.js";

/* Gathers the data and builds the document, ready to be shown.

   Nothing here opens anything. The first version opened a popup window
   and wrote into it, which fails silently wherever popups are blocked
   \u2014 the button appears to do nothing at all, with the explanation
   sitting in a banner at the top of a page the user has scrolled past.
   Building the document and handing it back lets the caller show it
   somewhere that cannot be blocked. */
export async function prepareForm({ form, poc, projectId, lookups }) {
  if (!form?.build) {
    return { ok: false, reason: `The ${form?.title ?? "operator"} form is not built yet.` };
  }
  try {
    const data = await gatherFormData({ poc, projectId, lookups });
    return { ok: true, ...form.build(data) };
  } catch (e) {
    return {
      ok: false,
      reason: `Could not build the ${form.title} form: ${e.message || String(e)}`,
    };
  }
}
