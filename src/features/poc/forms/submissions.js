import { updatePoc } from "../../../api/poc.js";

/* Recording that a form was sent.

   Kept apart from the registry so that file stays pure — a list of
   operators and the rules for matching them, with nothing that needs a
   browser or a database behind it. That is what lets the matching be
   checked directly; the moment the registry imports the API layer it
   can only be exercised by running the whole application.

   The form cannot write to the database itself — it is a plain document
   in another window with no session — so it posts a message and this
   does the work, then answers so the form can say whether it took. A
   form that reported success while nothing had been saved would be
   worse than one that said nothing at all.

   Returns a cleanup function. */
export function listenForSubmissions({ projectId, onUpdated }) {
  const handler = async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== "poc:formSubmitted" || !msg.pocId) return;

    const reply = (ok) => {
      try {
        event.source?.postMessage({ type: "poc:formSubmitted:done", ok }, "*");
      } catch {
        /* The form window has been closed since it sent the message.
           Nothing to tell, and nothing worth reporting. */
      }
    };

    try {
      const today = new Date().toISOString().slice(0, 10);
      await updatePoc(projectId, msg.pocId, { Submitted_Date: today });
      onUpdated?.(msg.pocId, today);
      reply(true);
    } catch {
      reply(false);
    }
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
