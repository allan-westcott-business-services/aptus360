import Banner from "../../components/Banner.jsx";
import ProjectInvoicesTab from "./ProjectInvoicesTab.jsx";

/* Invoices for one project.

   The invoices themselves, each opening to the plot lines it bills for —
   the shape the original's contract page uses. The register on
   Commercial › AV Invoices answers the other question, what has been
   earned and not yet claimed, and stays where it is.

   Audacia CVR import is still outstanding: those are invoices coming the
   other way, matched on contract number, and they need a schema before
   they can be real. Said out loud rather than left as a silent gap, now
   that this tab shows something and could look finished. */
export default function InvoicesTab({ projectId, projectRef }) {
  return (
    <div>
      <ProjectInvoicesTab projectId={projectId} projectRef={projectRef} />

      <Banner kind="muted">
        Asset value only. Audacia CVR lines for <strong>{projectRef}</strong> aren&rsquo;t
        imported yet &mdash; they need an <code>Invoice_Line</code> table and a match on
        contract number.
      </Banner>
    </div>
  );
}
