import { useState } from "react";
import ProjectsList from "./ProjectsList.jsx";
import ProjectDetail from "./ProjectDetail.jsx";
import AddProjectPage from "./AddProjectPage.jsx";

/* Single entry point for everything project-shaped. The table is the
   home screen; creating and editing happen inside it rather than as
   separate sidebar destinations. */
export default function ProjectsPage() {
  const [mode, setMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [initialTab, setInitialTab] = useState("details");
  const [refresh, setRefresh] = useState(0);

  function backToList() {
    setSelected(null);
    setMode("list");
    setRefresh((n) => n + 1); // remount the table so it refetches
  }

  if (mode === "new") return <AddProjectPage onBack={backToList} />;

  if (mode === "edit") return <ProjectDetail project={selected} initialTab={initialTab} onBack={backToList} />;

  return (
    <ProjectsList
      key={refresh}
      onNew={() => setMode("new")}
      onRefresh={() => setRefresh((n) => n + 1)}
      onOpen={(project, tab = "details") => {
        setSelected(project);
        setInitialTab(tab);
        setMode("edit");
      }}
    />
  );
}
