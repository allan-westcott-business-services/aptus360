import ProjectInvoicesTab from "./ProjectInvoicesTab.jsx";

/* Invoices for one project: the invoices themselves, each opening to the
   plot lines it bills for. The register on Commercial › AV Invoices
   answers the other question — what has been earned and not yet claimed. */
export default function InvoicesTab({ projectId, projectRef }) {
  return <ProjectInvoicesTab projectId={projectId} projectRef={projectRef} />;
}
