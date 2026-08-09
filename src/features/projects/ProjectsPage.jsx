import { useState, useEffect } from "react";
import ProjectsList from "./ProjectsList.jsx";
import ProjectDetail from "./ProjectDetail.jsx";
import AddProjectPage from "./AddProjectPage.jsx";
import { remember, recall } from "../../lib/session.js";

/* Single entry point for everything project-shaped. The table is the
   home screen; creating and editing happen inside it rather than as
   separate sidebar destinations. */
export default function ProjectsPage({ areaKey = null }) {
  /* Which project was open, and on which tab, across a reload.

     The shell remembers the page; this remembers the place within it.
     Coming back to the projects list after refreshing on a project's
     Outline Designs tab is most of the navigation done again.

     Only the list and an open project are remembered. "new" is a
     half-filled form that no longer exists after a reload, and putting
     someone back into an empty one would look like their typing had
     been kept. */
  const saved = recall("project", null);
  const [mode, setMode] = useState(saved?.project ? "edit" : "list");
  const [selected, setSelected] = useState(saved?.project ?? null);
  const [initialTab, setInitialTab] = useState(saved?.tab ?? "details");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    remember("project", mode === "edit" && selected
      ? { project: selected, tab: initialTab }
      : null);
  }, [mode, selected, initialTab]);

  function backToList() {
    setSelected(null);
    setMode("list");
    setRefresh((n) => n + 1); // remount the table so it refetches
  }

  if (mode === "new") return <AddProjectPage onBack={backToList} />;

  if (mode === "edit") return (
    <ProjectDetail project={selected} initialTab={initialTab} onBack={backToList}
      areaKey={areaKey}
      onTabChange={setInitialTab}
      /* Kept in step so the remembered position holds the current name
         rather than the one the project was opened with. */
      onProjectChange={(saved) => setSelected((p) => ({ ...p, ...saved }))}
      /* Switching option keeps you on the same screen rather than going
         back to the list and finding the sibling by eye. */
      onOpenOption={(o) => setSelected({ ...selected, ...o })} />
  );

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
