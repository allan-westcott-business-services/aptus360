import Banner from "../../components/Banner.jsx";
import AvInvoicesPage from "../av/AvInvoicesPage.jsx";

/* Invoices for one project.

   The same register as Commercial › AV Invoices, scoped to this project.
   One implementation rather than a second view of the same rows: the
   rules about what counts as earned and what counts as claimed live in
   the AV_Register view, and a project-shaped copy of them would be one
   more thing to keep in step.

   Audacia CVR import is still outstanding — those are invoices coming
   the other way, matched on contract number, and they need a schema
   before they can be real. Said out loud rather than left as a silent
   gap, since "Invoices" now shows something and could look complete. */
export default function InvoicesTab({ projectId, projectRef }) {
  return (
    <div>
      <AvInvoicesPage projectId={projectId} embedded />

      <Banner kind="muted">
        Asset value only. Audacia CVR lines for{" "}
        <strong>{projectRef}</strong> aren’t imported yet &mdash; they need an
        <code> Invoice_Line</code> table and a match on contract number.
      </Banner>
    </div>
  );
}
