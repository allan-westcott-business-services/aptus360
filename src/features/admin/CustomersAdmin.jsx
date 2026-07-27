import { useState, useEffect, useMemo } from "react";
import Banner from "../../components/Banner.jsx";
import { adminList, adminCreate, adminUpdate, adminDelete } from "../../api/admin.js";

/* Customers and their branches on one screen.

   Two separate admin entries for one hierarchy is how the branch table
   ended up with no way to reach it. Master-detail instead: pick a
   customer, edit its branches beside it. */
export default function CustomersAdmin() {
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [regions, setRegions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [custDraft, setCustDraft] = useState({ Customer_Name: "", Audacia_Customer_Name: "" });
  const [addingCust, setAddingCust] = useState(false);
  const [editingCust, setEditingCust] = useState(false);

  const [branchDraft, setBranchDraft] = useState({ Branch_Name: "", Region_ID: "" });
  const [editingBranch, setEditingBranch] = useState(null);

  async function load() {
    try {
      const [c, b, r] = await Promise.all([
        adminList("Customer"), adminList("Customer_Branch"), adminList("Region"),
      ]);
      setCustomers(c.rows || []);
      setBranches(b.rows || []);
      setRegions(r.rows || []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const current = customers.find((c) => c.Customer_ID === selected) || null;
  const mine = useMemo(
    () => branches.filter((b) => b.Customer_ID === selected)
                  .sort((a, b) => (a.Branch_Name || "").localeCompare(b.Branch_Name || "")),
    [branches, selected]
  );
  const countFor = (id) => branches.filter((b) => b.Customer_ID === id).length;

  const shown = customers.filter((c) =>
    !search.trim() || (c.Customer_Name || "").toLowerCase().includes(search.toLowerCase()));

  async function addCustomer() {
    if (!custDraft.Customer_Name.trim()) return setError("A customer needs a name.");
    try {
      const created = await adminCreate("Customer", { ...custDraft, Is_Active: true });
      setCustDraft({ Customer_Name: "", Audacia_Customer_Name: "" });
      setAddingCust(false);
      await load();
      setSelected(created?.Customer_ID ?? null);
    } catch (e) { setError(e.message); }
  }

  async function saveCustomer() {
    try {
      await adminUpdate("Customer", current.Customer_ID, {
        Customer_Name: custDraft.Customer_Name,
        Audacia_Customer_Name: custDraft.Audacia_Customer_Name || null,
      });
      setEditingCust(false);
      await load();
    } catch (e) { setError(e.message); }
  }

  async function removeCustomer() {
    const n = countFor(current.Customer_ID);
    if (n) return setError(`Remove its ${n} branch${n === 1 ? "" : "es"} first.`);
    if (!window.confirm(`Delete ${current.Customer_Name}?`)) return;
    try {
      await adminDelete("Customer", current.Customer_ID, "Customer_ID");
      setSelected(null);
      await load();
    } catch (e) { setError(e.message); }
  }

  async function submitBranch() {
    if (!branchDraft.Branch_Name.trim()) return setError("A branch needs a name.");
    try {
      const payload = {
        Customer_ID: selected,
        Branch_Name: branchDraft.Branch_Name.trim(),
        Region_ID: branchDraft.Region_ID ? Number(branchDraft.Region_ID) : null,
        Is_Active: true,
      };
      if (editingBranch) await adminUpdate("Customer_Branch", editingBranch, payload);
      else await adminCreate("Customer_Branch", payload);
      setBranchDraft({ Branch_Name: "", Region_ID: "" });
      setEditingBranch(null);
      setError("");
      await load();
    } catch (e) { setError(e.message); }
  }

  async function removeBranch(b) {
    if (!window.confirm(`Delete ${b.Branch_Name}?`)) return;
    try { await adminDelete("Customer_Branch", b.Branch_ID, "Branch_ID"); await load(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="loading">Loading customers&hellip;</div>;

  return (
    <div>
      <style>{CSS}</style>
      <h2 className="admin-title">Customers &amp; Branches</h2>
      <p className="ca-note">
        Projects are linked to a <strong>branch</strong>, not a customer &mdash; so every
        customer needs at least one.
      </p>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="ca-split">
        <div className="ca-list">
          <input className="ca-search" value={search} aria-label="Search customers" placeholder="Search customers&hellip;"
            onChange={(e) => setSearch(e.target.value)} />
          {shown.map((c) => {
            const n = countFor(c.Customer_ID);
            return (
              <button key={c.Customer_ID}
                className={selected === c.Customer_ID ? "ca-item on" : "ca-item"}
                onClick={() => { setSelected(c.Customer_ID); setEditingCust(false); setEditingBranch(null); }}>
                <span className="ca-name">{c.Customer_Name}</span>
                <span className={n ? "ca-count" : "ca-count zero"}>{n}</span>
              </button>
            );
          })}

          {addingCust ? (
            <div className="ca-add">
              <input autoFocus placeholder="Customer name" value={custDraft.Customer_Name}
                onChange={(e) => setCustDraft((d) => ({ ...d, Customer_Name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addCustomer()} />
              <input placeholder="Audacia name (optional)" value={custDraft.Audacia_Customer_Name}
                onChange={(e) => setCustDraft((d) => ({ ...d, Audacia_Customer_Name: e.target.value }))} />
              <div className="ca-add-actions">
                <button className="btn ghost sm" onClick={() => setAddingCust(false)}>Cancel</button>
                <button className="btn accent sm" onClick={addCustomer}>Add</button>
              </div>
            </div>
          ) : (
            <button className="ca-new" onClick={() => { setAddingCust(true); setCustDraft({ Customer_Name: "", Audacia_Customer_Name: "" }); }}>
              + Add customer
            </button>
          )}
        </div>

        <div className="ca-detail">
          {!current ? (
            <div className="ca-empty">Select a customer to manage its branches.</div>
          ) : (
            <>
              <div className="ca-head">
                {editingCust ? (
                  <div className="ca-edit">
                    <input value={custDraft.Customer_Name}
                      onChange={(e) => setCustDraft((d) => ({ ...d, Customer_Name: e.target.value }))} />
                    <input placeholder="Audacia name" value={custDraft.Audacia_Customer_Name}
                      onChange={(e) => setCustDraft((d) => ({ ...d, Audacia_Customer_Name: e.target.value }))} />
                    <button className="btn accent sm" onClick={saveCustomer}>Save</button>
                    <button className="btn ghost sm" onClick={() => setEditingCust(false)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <h3>{current.Customer_Name}</h3>
                      {current.Audacia_Customer_Name && (
                        <p className="ca-audacia">Audacia: {current.Audacia_Customer_Name}</p>
                      )}
                    </div>
                    <button className="row-edit" onClick={() => {
                      setCustDraft({
                        Customer_Name: current.Customer_Name || "",
                        Audacia_Customer_Name: current.Audacia_Customer_Name || "",
                      });
                      setEditingCust(true);
                    }}>Edit</button>
                    <button className="row-del" onClick={removeCustomer} title="Delete customer">&#10005;</button>
                  </>
                )}
              </div>

              <p className="panel-label">Branches</p>

              <div className="ca-bform">
                <input placeholder="Branch name, e.g. Yorkshire East" value={branchDraft.Branch_Name}
                  onChange={(e) => setBranchDraft((d) => ({ ...d, Branch_Name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submitBranch()} />
                <select value={branchDraft.Region_ID}
                  onChange={(e) => setBranchDraft((d) => ({ ...d, Region_ID: e.target.value }))}>
                  <option value="">Region&hellip;</option>
                  {regions.map((r) => (
                    <option key={r.Region_ID} value={r.Region_ID}>{r.Region}</option>
                  ))}
                </select>
                <button className="btn accent sm" onClick={submitBranch}>
                  {editingBranch ? "Save" : "+ Add"}
                </button>
                {editingBranch && (
                  <button className="btn ghost sm"
                    onClick={() => { setEditingBranch(null); setBranchDraft({ Branch_Name: "", Region_ID: "" }); }}>
                    Cancel
                  </button>
                )}
              </div>

              {mine.length === 0 ? (
                <p className="ca-nobranch">
                  No branches yet &mdash; this customer can&rsquo;t be put on a project until it has one.
                </p>
              ) : (
                <div className="ca-branches">
                  {mine.map((b) => (
                    <div className="ca-branch" key={b.Branch_ID}>
                      <span className="cb-name">{b.Branch_Name}</span>
                      <span className="cb-label">{b.Branch_Dropdown || "\u2014"}</span>
                      <span className="cb-region">
                        {regions.find((r) => r.Region_ID === b.Region_ID)?.Region || ""}
                      </span>
                      <button className="row-edit" onClick={() => {
                        setEditingBranch(b.Branch_ID);
                        setBranchDraft({ Branch_Name: b.Branch_Name || "", Region_ID: b.Region_ID ?? "" });
                      }}>Edit</button>
                      <button className="row-del" onClick={() => removeBranch(b)} title="Delete">&#10005;</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ca-note { font-size: 12.5px; color: var(--muted); margin: -10px 0 14px; max-width: 70ch; }
.ca-split { display: grid; grid-template-columns: 260px 1fr; gap: 18px; align-items: start; }
.ca-list { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px;
  max-height: 62vh; overflow-y: auto; }
.ca-search { margin-bottom: 8px; }
.ca-item { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; text-align: left; background: none; border: 1px solid transparent;
  border-radius: 6px; padding: 7px 9px; cursor: pointer; font: 500 12.5px inherit;
  color: var(--text); margin-bottom: 1px; }
.ca-item:hover { background: var(--bg); }
.ca-item.on { background: var(--accent-light); color: var(--accent); font-weight: 600; }
.ca-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ca-count { flex: none; font-size: 10.5px; font-weight: 700; background: var(--accent);
  color: #fff; border-radius: 20px; padding: 1px 7px; }
.ca-count.zero { background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); }
.ca-new { width: 100%; background: none; border: 1px dashed var(--border); border-radius: 6px;
  padding: 7px; margin-top: 6px; cursor: pointer; font: 600 12.5px inherit; color: var(--accent); }
.ca-new:hover { background: var(--accent-light); }
.ca-add { border: 1px solid var(--accent); border-radius: 6px; padding: 8px; margin-top: 6px; }
.ca-add input { margin-bottom: 6px; font-size: 12px; }
.ca-add-actions { display: flex; gap: 6px; }
.ca-add-actions .btn { flex: 1; }
.ca-detail { border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; min-height: 320px; }
.ca-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 90px 20px; }
.ca-head { display: flex; align-items: flex-start; gap: 10px; padding-bottom: 12px;
  border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.ca-head > div { flex: 1; }
.ca-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.ca-audacia { margin: 3px 0 0; font-size: 11.5px; color: var(--muted); }
.ca-edit { display: flex; gap: 7px; flex: 1; flex-wrap: wrap; }
.ca-edit input { flex: 1; min-width: 140px; }
.ca-bform { display: flex; gap: 8px; margin-bottom: 12px; }
.ca-bform input { flex: 1; }
.ca-bform select { width: auto; min-width: 130px; }
.ca-nobranch { font-size: 12.5px; color: var(--warn-text); background: var(--warn-bg);
  border: 1px solid var(--warn-border); border-radius: var(--radius); padding: 10px 12px; margin: 0; }
.ca-branches { display: flex; flex-direction: column; gap: 5px; }
.ca-branch { display: flex; align-items: center; gap: 12px; border: 1px solid var(--border);
  border-radius: var(--radius); padding: 8px 12px; }
.cb-name { font-size: 13px; font-weight: 600; min-width: 150px; }
.cb-label { flex: 1; font-size: 11.5px; color: var(--muted); }
.cb-region { font-size: 11px; color: var(--muted); background: var(--bg);
  border: 1px solid var(--border); border-radius: 4px; padding: 1px 7px; }
.btn.sm { padding: 5px 12px; font-size: 12px; }
.row-edit { background: none; border: none; cursor: pointer; color: var(--accent);
  font: 600 11.5px inherit; padding: 3px 7px; border-radius: 4px; }
.row-edit:hover { background: var(--accent-light); }
.row-del { background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 3px 6px; border-radius: 4px; }
.row-del:hover { background: #fef2f2; color: #ef4444; }
@media (max-width: 900px) { .ca-split { grid-template-columns: 1fr; } }
`;
