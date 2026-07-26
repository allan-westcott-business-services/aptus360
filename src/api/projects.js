import { http, USE_MOCKS } from "./client.js";
import { demoProject, demoScopes, mockList } from "../lib/mockData.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* Reference generator. Server-owned in production so two people creating a
   project at once cannot collide — the mock is for offline work only. */
function mockRef() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}.${String(Math.floor(Math.random() * 900) + 100)}`;
}

export async function nextProjectRef() {
  if (USE_MOCKS) {
    await delay(120);
    return mockRef();
  }
  const { ref } = await http.get("/next-project-ref");
  return ref;
}

export async function listProjects(params = {}) {
  if (USE_MOCKS) {
    await delay(200);
    return { rows: mockList, total: mockList.length };
  }
  const qs = new URLSearchParams(params).toString();
  return http.get(`/projects${qs ? `?${qs}` : ""}`);
}

export async function getProject(id) {
  if (USE_MOCKS) {
    await delay(200);
    return { ...demoProject, scopes: demoScopes };
  }
  return http.get(`/projects/${id}`);
}

export async function createProject(payload) {
  if (USE_MOCKS) {
    await delay(450);
    return { Project_ID: 4711, ...payload };
  }
  return http.post("/projects", payload);
}

export async function updateProject(id, payload) {
  if (USE_MOCKS) {
    await delay(450);
    return { Project_ID: id, ...payload };
  }
  return http.patch(`/projects/${id}`, payload);
}

/* Transitions are separate endpoints, not PATCH, because they have side
   effects: history rows, hold records, points recalculation, and the
   Status_Transition_Guard checks that currently run in the browser. */
export async function transitionProject(id, statusId) {
  if (USE_MOCKS) {
    await delay(300);
    return { Project_ID: id, Project_Status_ID: statusId };
  }
  return http.post(`/projects/${id}/transition`, { status_id: statusId });
}

export async function promoteToContract(id, payload) {
  if (USE_MOCKS) {
    await delay(300);
    return { Project_ID: id, ...payload };
  }
  return http.post(`/projects/${id}/promote`, payload);
}

export async function saveScopes(projectId, scopes) {
  if (USE_MOCKS) {
    await delay(300);
    return scopes;
  }
  return http.patch(`/projects/${projectId}/scopes`, { scopes });
}

export async function setPriority(projectId, isPriority) {
  if (USE_MOCKS) {
    await delay(200);
    return { Project_ID: projectId, Is_Priority: isPriority };
  }
  return http.patch(`/projects/${projectId}`, { Is_Priority: isPriority });
}

export async function deleteProject(projectId) {
  if (USE_MOCKS) {
    await delay(250);
    return { deleted: true };
  }
  return http.del(`/projects/${projectId}`);
}
