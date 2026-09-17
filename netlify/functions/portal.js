/* The portal: what somebody who is not staff is allowed to see.

   One endpoint rather than letting the portal read the ordinary
   project endpoints, because the question it answers is different.
   Staff ask "show me project 412"; a developer asks "show me MY
   sites", and the answer has to be computed from who they are rather
   than from what they asked for. An endpoint that took a project id
   from a portal user and checked it afterwards would be one missing
   check away from showing somebody another developer's scheme.

   So nothing here takes a project id from the caller without proving
   it belongs to them first. `mine()` is that proof, and every route
   goes through it.

   ── Identity comes from the token, never from the request ──

   `withAuth` verifies the token and hands over the user. The email on
   that user is matched against Portal_Access. A body that carried an
   email, a customer or an audience would be a body somebody could
   edit. */

import { supabase, json, fail, withAuth } from "./_supabase.js";

/* The columns a project actually has. `Project_Name` and
   `Project_Number` were guesses and neither exists: a project is known
   by its SITE NAME and by Display_Ref, which is the reference printed
   on everything a developer will have seen from us. */
const PROJECT_COLS = "Project_ID,Display_Ref,Project_Ref,Site_Name,"
  + "Site_Address,Postcode,Project_Status_ID,Customer_ID,Organisation_Branch_ID";

/* Who this caller is, as the portal understands it. Null where the
   account has no portal record: an ordinary staff account signing in
   at the developer door is not a developer, and gets nothing here. */
async function accessFor(db, user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return null;
  const { data, error } = await db
    .from("Portal_Access")
    .select("Portal_Access_ID,Email,Audience,Customer_ID,Organisation_ID,"
      + "Branch_ID,Full_Name,Is_Active")
    .ilike("Email", email)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.Is_Active === false) return null;
  return data;
}

/* The projects this caller may see, as ids.

   A developer's sites are the ones their customer owns — by
   Project.Customer_ID, and by Project_Developer for schemes where more
   than one developer is involved and the project's own customer is
   somebody else. Both, because either alone leaves sites out. */
async function mine(db, access) {
  if (!access) return [];
  if (access.Audience === "staff") return null;          // null = no limit

  const ids = new Set();

  if (access.Customer_ID != null) {
    const [own, shared] = await Promise.all([
      db.from("Project").select("Project_ID").eq("Customer_ID", access.Customer_ID),
      db.from("Project_Developer").select("Project_ID")
        .eq("Customer_ID", access.Customer_ID),
    ]);
    if (own.error) throw own.error;
    if (shared.error) throw shared.error;
    for (const r of own.data || []) ids.add(Number(r.Project_ID));
    for (const r of shared.data || []) ids.add(Number(r.Project_ID));
  }

  /* An account recorded against an organisation — which is how a
     developer contact is held: a branch of an organisation, from
     Organisation_Branch — finds its sites through Project_Developer.

     By BRANCH where the account has one, because a group with several
     offices runs several schemes and an account tied to the whole
     group would show Leeds the Northampton jobs. By organisation where
     it does not, which suits a developer with one office. */
  if (access.Organisation_ID != null && access.Audience === "developer") {
    /* Which branches count as theirs: the one on their record, or every
       branch of their organisation where the record names none. */
    let branchIds = access.Branch_ID != null ? [Number(access.Branch_ID)] : null;
    if (branchIds === null) {
      const { data: mineBranches, error: bErr } = await db
        .from("Organisation_Branch").select("Organisation_Branch_ID")
        .eq("Organisation_ID", access.Organisation_ID);
      if (bErr) throw bErr;
      branchIds = (mineBranches || []).map((b) => Number(b.Organisation_Branch_ID));
    }

    if (branchIds.length) {
      /* ── Project_Developer ONLY, and this matters ──

         `Project.Organisation_Branch_ID` looks like the obvious route
         and must not be used. It is a CACHED COPY of the main
         developer, written by sync_project_main_developer(), and
         projects.js says so beside the code that maintains it. A cache
         drifts, and this one has: on the live data eleven unrelated
         schemes all carry branch 17, including sites belonging to
         other developers entirely.

         Reading it would have shown one developer another developer's
         projects. `Project_Developer` is the record rather than the
         copy of it, so it is the only thing asked.

         The general rule, worth more than this instance: a
         denormalised convenience column is fine for a screen that
         staff can see is wrong, and is not fit to decide who may see
         what. Authorisation reads the record. */
      const { data, error } = await db
        .from("Project_Developer").select("Project_ID")
        .in("Organisation_Branch_ID", branchIds);
      if (error) throw error;
      for (const r of data || []) ids.add(Number(r.Project_ID));
    }
  }

  /* A DNO or IDNO account is scoped by organisation too, but the
     routes that use it are not built yet — so they get their empty
     set rather than a link that has not been designed. */
  return [...ids];
}

export default withAuth(async function handler(req, context, user) {
  const db = supabase();
  const url = new URL(req.url);
  const what = context?.params?.what || url.searchParams.get("what") || "me";

  try {
    const access = await accessFor(db, user);

    /* Who am I, and what am I allowed to open? Answered even for an
       account with no portal record, because the app needs to know
       that in order to send somebody to the right place. */
    if (what === "me") {
      return json({
        /* A marker for WHICH version of this file is answering.

           Added because a fix and a deployed fix are different things,
           and telling them apart cost a round trip: the portal showed
           twelve sites where it should have shown one, and the only
           way to know whether the new code was live was to count them.

           `scope` says how a developer's sites are found. Anything but
           "project_developer" means an older build is still serving:
           the cached Project.Organisation_Branch_ID column has drifted
           on live data, and scoping on it shows one developer another
           developer's sites. */
        scope: "project_developer",
        email: user?.email ?? null,
        audience: access?.Audience ?? null,
        name: access?.Full_Name ?? null,
        customerId: access?.Customer_ID ?? null,
        organisationId: access?.Organisation_ID ?? null,
        branchId: access?.Branch_ID ?? null,
      });
    }

    if (!access || access.Audience === "staff") {
      /* Staff have the whole app; there is nothing for them here, and
         saying so plainly beats returning an empty list that looks
         like a developer with no sites. */
      return json({ error: "This is the client portal. Staff use the app." }, 403);
    }

    const allowed = await mine(db, access);

    if (what === "sites") {
      if (!allowed.length) return json({ sites: [] });
      const { data, error } = await db
        .from("Project").select(PROJECT_COLS)
        .in("Project_ID", allowed)
        .order("Site_Name");
      if (error) throw error;

      /* The latest achieved milestone per site, so a list can say where
         each one has got to without a round trip per row. */
      const { data: ms, error: msErr } = await db
        .from("Project_Milestone")
        .select("Project_ID,Milestone_Key,Label,Achieved_On,Party,Sort_Order")
        .in("Project_ID", allowed)
        .not("Achieved_On", "is", null)
        .order("Sort_Order");
      if (msErr) throw msErr;

      const latest = new Map();
      for (const m of ms || []) latest.set(Number(m.Project_ID), m);

      /* And how many documents are waiting on them, which is the one
         number a developer actually acts on. */
      const { data: docs, error: dErr } = await db
        .from("Portal_Document")
        .select("Project_ID,Direction,Storage_Path,Responded_At,Is_Active")
        .in("Project_ID", allowed);
      if (dErr) throw dErr;

      const waiting = new Map();
      for (const d of docs || []) {
        if (d.Is_Active === false) continue;
        const needsUpload = d.Direction === "from_developer" && !d.Storage_Path;
        const needsReply = d.Direction === "to_developer" && !d.Responded_At;
        if (!needsUpload && !needsReply) continue;
        waiting.set(Number(d.Project_ID), (waiting.get(Number(d.Project_ID)) ?? 0) + 1);
      }

      return json({
        sites: (data || []).map((p) => ({
          ...p,
          latestMilestone: latest.get(Number(p.Project_ID)) ?? null,
          waitingOnYou: waiting.get(Number(p.Project_ID)) ?? 0,
        })),
      });
    }

    /* Everything below is about one site, and the id is checked against
       the caller's own list before anything is read. */
    const projectId = Number(url.searchParams.get("project"));
    if (!Number.isFinite(projectId) || !allowed.includes(projectId)) {
      /* 404 rather than 403: a portal user should not be able to learn
         which project numbers exist by watching which ones are
         refused. */
      return json({ error: "No such site." }, 404);
    }

    if (what === "site") {
      const [proj, types, marks, docs] = await Promise.all([
        db.from("Project").select(PROJECT_COLS).eq("Project_ID", projectId).single(),
        db.from("Milestone_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("Project_Milestone").select("*").eq("Project_ID", projectId),
        db.from("Portal_Document").select("*").eq("Project_ID", projectId)
          .eq("Is_Active", true).order("Sort_Order"),
      ]);
      for (const r of [proj, types, marks, docs]) if (r.error) throw r.error;

      /* Every milestone the business tracks, with the ones this site
         has reached filled in. A developer seeing only what has
         happened cannot tell what is still to come, which is most of
         what they want to know. */
      const byKey = new Map((marks.data || []).map((m) => [m.Milestone_Key, m]));
      const milestones = (types.data || []).map((t) => {
        const m = byKey.get(t.Milestone_Key);
        return {
          key: t.Milestone_Key,
          label: m?.Label || t.Label,
          detail: m?.Detail ?? t.Detail ?? null,
          wantsParty: !!t.Wants_Party,
          achievedOn: m?.Achieved_On ?? null,
          dueOn: m?.Due_On ?? null,
          party: m?.Party ?? null,
          source: m?.Source ?? null,
        };
      });

      return json({ site: proj.data, milestones, documents: docs.data || [] });
    }

    /* A signed link to read a document we have given them, or to put
       one where we asked for it. Signed and short-lived: the portal
       never learns a bucket path it could walk. */
    if (what === "download") {
      const id = Number(url.searchParams.get("id"));
      const { data: doc, error } = await db.from("Portal_Document")
        .select("*").eq("Portal_Document_ID", id).eq("Project_ID", projectId)
        .single();
      if (error) throw error;
      if (!doc?.Storage_Path) return json({ error: "Nothing uploaded yet." }, 404);

      const { data: link, error: sErr } = await db.storage
        .from("portal").createSignedUrl(doc.Storage_Path, 300);
      if (sErr) throw sErr;
      return json({ url: link?.signedUrl ?? null, fileName: doc.File_Name });
    }

    if (what === "upload" && req.method === "POST") {
      const body = await req.json();
      const id = Number(body?.id);
      const fileName = String(body?.fileName || "").slice(0, 200);
      if (!Number.isFinite(id) || !fileName) return fail("A file and a request are needed.");

      const { data: doc, error } = await db.from("Portal_Document")
        .select("Portal_Document_ID,Direction,Project_ID")
        .eq("Portal_Document_ID", id).eq("Project_ID", projectId).single();
      if (error) throw error;
      if (doc.Direction !== "from_developer") {
        return json({ error: "That is not something we asked you for." }, 400);
      }

      /* The path is composed HERE, from the project and the row, and
         never taken from the caller. A path from a body is a path
         somebody can point at another site's folder. */
      const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "-");
      const path = `project-${projectId}/doc-${id}/${Date.now()}-${safe}`;
      const { data: link, error: sErr } = await db.storage
        .from("portal").createSignedUploadUrl(path);
      if (sErr) throw sErr;

      return json({ url: link?.signedUrl ?? null, token: link?.token ?? null, path });
    }

    if (what === "uploaded" && req.method === "POST") {
      const body = await req.json();
      const id = Number(body?.id);
      const path = String(body?.path || "");
      /* The path is accepted back only if it is the one this endpoint
         would have composed for this row \u2014 the caller cannot claim a
         file somewhere else is theirs. */
      if (!path.startsWith(`project-${projectId}/doc-${id}/`)) {
        return json({ error: "That file does not belong to this request." }, 400);
      }
      const { error } = await db.from("Portal_Document").update({
        Storage_Path: path,
        File_Name: String(body?.fileName || "").slice(0, 200) || null,
        Uploaded_By: user?.email ?? null,
        Uploaded_At: new Date().toISOString(),
      }).eq("Portal_Document_ID", id).eq("Project_ID", projectId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (what === "respond" && req.method === "POST") {
      const body = await req.json();
      const id = Number(body?.id);
      const { error } = await db.from("Portal_Document").update({
        Responded_At: new Date().toISOString(),
      }).eq("Portal_Document_ID", id).eq("Project_ID", projectId)
        .eq("Direction", "to_developer");
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown request." }, 400);
  } catch (e) {
    return fail(e);
  }
});

/* Routed as /api/portal/<what>, which is how the app asks: the app's
   client prefixes /api, and Netlify matches this path to this file.

   Without a config a function has no route at all — it exists, deploys,
   and answers nothing. That is what happened on the first attempt: the
   sign-in screen asked for the organisations, got a 404, and quietly
   showed "None listed", which reads as an empty database rather than a
   missing route. */
export const config = { path: "/api/portal/:what" };
