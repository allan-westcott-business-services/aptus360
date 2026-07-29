import { supabase, json, fail } from "./_supabase.js";

const ORG = "Organisation_ID,Name,Trading_Name,Code,Registration_Number,Address_1,Address_2,Town,County,Postcode,Phone,Email,Website,VAT_Registered,VAT_Rate,Notes,Is_Active";
const BRANCH = "Organisation_Branch_ID,Organisation_ID,Branch_Name,Branch_Dropdown,Region_ID,Address_1,Town,Postcode,Phone,Is_Active";
const CONTACT = "Organisation_Contact_ID,Organisation_Branch_ID,Organisation_Type_ID,Contact_Name,Job_Title,Email,Phone,Mobile,Is_Primary,Notes,Is_Active";
/* A role's type is its identity — the unique constraint is on the
   triple, so changing it is a remove and an add. Only the reference and
   the active flag are editable in place. */
const ROLE = "Organisation_Role_ID,Reference,Is_Active";

/* Writable columns: the select list without the primary key, minus
   anything the database maintains itself. Branch_Dropdown is written by
   org_branch_dropdown_trg, and only when Branch_Name or Organisation_ID
   changes — so a PATCH carrying a stale one would stick. */
const only = (cols, skip = []) => {
  const set = new Set(cols.split(",").slice(1).filter((c) => !skip.includes(c)));
  return (o) => Object.fromEntries(
    Object.entries(o).filter(([k]) => set.has(k)).map(([k, v]) => [k, v === "" ? null : v])
  );
};
const pickOrg = only(ORG);
const pickBranch = only(BRANCH, ["Branch_Dropdown"]);
const pickContact = only(CONTACT);
const pickRole = only(ROLE);

/* 23505 is a unique index doing its job. The raw message names an index,
   which tells the person nothing about what they just typed. */
const DUPLICATE = {
  organisation: "An organisation with that name already exists.",
  branch: "This organisation already has a branch with that name.",
  contact: "That branch already has a primary contact for this role. Clear the other one first.",
  role: "This organisation already holds that role.",
};

export default async function handler(req, context) {
  const db = supabase();
  const url = new URL(req.url);
  const what = url.searchParams.get("what") || "organisations";
  const id = url.searchParams.get("id");
  const kind = ["branch", "contact", "role"].includes(what) ? what : "organisation";

  try {
    /* ── Lookups the screen needs once ── */
    if (req.method === "GET" && what === "types") {
      const [types, subtypes] = await Promise.all([
        db.from("Organisation_Type").select("*").eq("Is_Active", true).order("Sort_Order"),
        db.from("Organisation_Subtype").select("*").order("Sort_Order"),
      ]);
      if (types.error) throw types.error;
      if (subtypes.error) throw subtypes.error;
      return json({ types: types.data || [], subtypes: subtypes.data || [] });
    }

    /* ── Everything about one organisation ── */
    if (req.method === "GET" && what === "detail" && id) {
      const [org, roles, branches] = await Promise.all([
        db.from("Organisation").select(ORG).eq("Organisation_ID", id).single(),
        db.from("Organisation_Role").select("*").eq("Organisation_ID", id),
        db.from("Organisation_Branch").select(BRANCH).eq("Organisation_ID", id).order("Branch_Name"),
      ]);
      if (org.error) throw org.error;
      if (roles.error) throw roles.error;
      if (branches.error) throw branches.error;

      const branchIds = (branches.data || []).map((b) => b.Organisation_Branch_ID);
      let contacts = [];
      if (branchIds.length) {
        const { data, error } = await db.from("Organisation_Contact")
          .select(CONTACT).in("Organisation_Branch_ID", branchIds).order("Contact_Name");
        if (error) throw error;
        contacts = data || [];
      }
      return json({ organisation: org.data, roles: roles.data || [], branches: branches.data || [], contacts });
    }

    /* ── The list, with role summary from the view ── */
    if (req.method === "GET") {
      const { data, error } = await db.from("Organisation_Summary")
        .select("Organisation_ID,Name,Code,Is_Active,roles,trades,branch_count,contact_count")
        .order("Name");
      if (error) throw error;
      return json({ rows: data || [] });
    }

    if (req.method === "POST") {
      const body = await req.json();

      if (what === "branch") {
        const { data, error } = await db.from("Organisation_Branch")
          .insert(pickBranch(body)).select(BRANCH).single();
        if (error) throw error;
        return json(data, 201);
      }
      if (what === "contact") {
        const { data, error } = await db.from("Organisation_Contact")
          .insert(pickContact(body)).select(CONTACT).single();
        if (error) throw error;
        return json(data, 201);
      }
      if (what === "role") {
        const { error } = await db.from("Organisation_Role").insert({
          Organisation_ID: Number(body.Organisation_ID),
          Organisation_Type_ID: Number(body.Organisation_Type_ID),
          Organisation_Subtype_ID: body.Organisation_Subtype_ID
            ? Number(body.Organisation_Subtype_ID) : null,
          Reference: body.Reference || null,
        });
        if (error && error.code !== "23505") throw error;
        return json({ added: true }, 201);
      }

      const { data, error } = await db.from("Organisation")
        .insert(pickOrg(body)).select(ORG).single();
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH" && id) {
      const body = await req.json();
      const table = what === "branch" ? "Organisation_Branch"
        : what === "contact" ? "Organisation_Contact"
        : what === "role" ? "Organisation_Role" : "Organisation";
      const pk = what === "branch" ? "Organisation_Branch_ID"
        : what === "contact" ? "Organisation_Contact_ID"
        : what === "role" ? "Organisation_Role_ID" : "Organisation_ID";
      const cols = what === "branch" ? BRANCH
        : what === "contact" ? CONTACT
        : what === "role" ? ROLE : ORG;
      const pick = what === "branch" ? pickBranch
        : what === "contact" ? pickContact
        : what === "role" ? pickRole : pickOrg;

      const { data, error } = await db.from(table)
        .update(pick(body)).eq(pk, id).select(cols).single();
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE" && id) {
      const table = what === "branch" ? "Organisation_Branch"
        : what === "contact" ? "Organisation_Contact"
        : what === "role" ? "Organisation_Role" : "Organisation";
      const pk = what === "branch" ? "Organisation_Branch_ID"
        : what === "contact" ? "Organisation_Contact_ID"
        : what === "role" ? "Organisation_Role_ID" : "Organisation_ID";

      const { error } = await db.from(table).delete().eq(pk, id);
      /* The last-branch rule is a database trigger, so its message is
         the one worth showing. */
      if (error) return json({ error: error.message }, 409);
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    if (e?.code === "23505") {
      return json({ error: DUPLICATE[kind] ?? "That record already exists." }, 409);
    }
    return fail(e, 400);
  }
}

export const config = { path: "/api/organisations" };
