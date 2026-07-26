import { useState } from "react";
import AddProjectForm from "./features/projects/AddProjectForm.jsx";
import EditContractForm from "./features/projects/EditContractForm.jsx";
import { USE_MOCKS } from "./api/client.js";

/* Temporary shell. Replace with a router (react-router-dom) once there is
   more than one feature area — see README "Next steps". */
export default function App() {
  const [tab, setTab] = useState("add");
  return (
    <div className="app">
      {USE_MOCKS && (
        <div className="mock-bar">
          Sample data &mdash; set <code>VITE_USE_MOCKS=false</code> once the Project tables exist.
        </div>
      )}
      <div className="tabs">
        <button className={tab === "add" ? "tab on" : "tab"} onClick={() => setTab("add")}>
          Add project
        </button>
        <button className={tab === "edit" ? "tab on" : "tab"} onClick={() => setTab("edit")}>
          Edit contract
        </button>
      </div>
      <div className="card">{tab === "add" ? <AddProjectForm /> : <EditContractForm />}</div>
    </div>
  );
}
