import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let mockComments = [];
let nextId = 1;

const mockHistory = [
  { History_ID: 3, Field: "Project_Status_ID", Old_Value: "2", New_Value: "5", Changed_At: "2026-07-14T09:12:00Z" },
  { History_ID: 2, Field: "Estimator_ID", Old_Value: null, New_Value: "4", Changed_At: "2026-07-02T14:40:00Z" },
  { History_ID: 1, Field: "Site_Name", Old_Value: "Kirkstall Mdws", New_Value: "Kirkstall Meadows", Changed_At: "2026-06-28T11:05:00Z" },
];

export async function getActivity(projectId) {
  if (USE_MOCKS) {
    await delay(200);
    return { history: mockHistory, comments: [...mockComments] };
  }
  return http.get(`/projects/${projectId}/activity`);
}

/* Author_Email goes with it so the server can resolve the name from the
   Person table itself. The browser's copy of the people lookup is cached
   for the session and can be a deploy or two behind. */
export async function addComment(projectId, Comment, Author, Author_Email) {
  if (USE_MOCKS) {
    await delay(250);
    const c = { Comment_ID: nextId++, Comment, Author: Author || Author_Email,
      Created_At: new Date().toISOString() };
    mockComments = [c, ...mockComments];
    return c;
  }
  return http.post(`/projects/${projectId}/activity`, { Comment, Author, Author_Email });
}

export async function deleteComment(projectId, commentId) {
  if (USE_MOCKS) {
    await delay(150);
    mockComments = mockComments.filter((c) => c.Comment_ID !== commentId);
    return { deleted: true };
  }
  return http.del(`/projects/${projectId}/activity?comment_id=${commentId}`);
}
