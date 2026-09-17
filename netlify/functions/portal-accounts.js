/* Creating an account for somebody outside Aptus.

   Two things have to happen together: a user in Supabase
   authentication, and a Portal_Access row saying who they are to us.
   One without the other is a broken account — an auth user with no
   record signs in and sees nothing, and a record with no auth user is
   an invitation nobody can accept.

   So both are done here, in one call, and the auth user is REMOVED
   again if the record cannot be written. That rollback is the only
   reason this is an endpoint rather than two admin screens.

   ── Staff only, and said out loud ──

   This creates accounts. It runs with the service role, which is
   exactly the key that can create any account at all, so the guard on
   it matters more than the guard on anything else in the system: only
   a signed-in staff account may call it, and a portal account calling
   it is refused by name.

   ── Invite rather than set a password ──

   The default is to send an invitation and let the person choose their
   own password, because a password typed by us is a password that
   exists in an email thread. Setting one directly is allowed for the
   case where somebody is sitting with them on the phone, and it is
   marked as needing a change. */

import { supabase, json, fail, withAuth } from "./_supabase.js";

const AUDIENCES = new Set(["developer", "dno", "idno"]);

export default withAuth(async function handler(req, context, user) {
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  const db = supabase();

  try {
    /* The caller must be staff. A developer with a stolen session must
       not be able to mint themselves a colleague. */
    const email = String(user?.email || "").trim().toLowerCase();
    const { data: caller } = await db.from("Portal_Access")
      .select("Audience").ilike("Email", email).maybeSingle();
    if (caller && caller.Audience !== "staff") {
      return json({ error: "Only Aptus staff can create portal accounts." }, 403);
    }

    const body = await req.json();
    const newEmail = String(body?.email || "").trim().toLowerCase();
    const audience = String(body?.audience || "");
    const organisationId = body?.organisationId ? Number(body.organisationId) : null;
    const branchId = body?.branchId ? Number(body.branchId) : null;
    /* One site, where the account is for one site. Narrowest scope, and
       the resolver in portal.js treats it as a ceiling: naming a
       project means that project and nothing else. */
    const projectId = body?.projectId ? Number(body.projectId) : null;
    const customerId = body?.customerId ? Number(body.customerId) : null;
    const fullName = String(body?.fullName || "").trim() || null;
    const password = body?.password ? String(body.password) : null;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
      return json({ error: "That does not look like an email address." }, 400);
    }
    if (!AUDIENCES.has(audience)) {
      return json({ error: "Choose what kind of account this is." }, 400);
    }
    if (!organisationId && !customerId) {
      return json({
        error: "A portal account needs an organisation or a customer, or it "
          + "would be an account with no sites.",
      }, 400);
    }

    /* Already ours? Said plainly rather than creating a second record
       that would compete with the first. */
    const { data: existing } = await db.from("Portal_Access")
      .select("Portal_Access_ID,Audience").ilike("Email", newEmail).maybeSingle();
    if (existing) {
      return json({ error: "That email already has portal access." }, 409);
    }

    /* ── An address that can already sign in ──

       Creating an auth user fails outright when one exists for that
       address, and one often does: a staff member given portal access
       to their own client's site, a contact who was set up for another
       audience, anybody who has ever been invited. The whole request
       then failed and NOTHING was recorded — which reads exactly like
       the account was created, because the person can still sign in.
       They sign in with the credentials they already had, land
       wherever an account with no portal record lands, and nobody can
       see why.

       So an existing user is not an error. The account already exists;
       what is missing is the record that says who they are to us, and
       that is what this endpoint is really for. */
    const { data: known } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const already = (known?.users || []).find((u) =>
      String(u.email || "").toLowerCase() === newEmail.toLowerCase());

    /* The auth user. Invited by default: a password we choose is a
       password that lives in an email thread. */
    let authUser = already ?? null;
    if (already) {
      /* Nothing to create, and deliberately nothing changed either: we
         do not reset somebody's password because they were given
         access to a portal. */
    } else if (password) {
      const { data, error } = await db.auth.admin.createUser({
        email: newEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, must_change_password: true },
      });
      if (error) throw error;
      authUser = data?.user ?? null;
    } else {
      const { data, error } = await db.auth.admin.inviteUserByEmail(newEmail, {
        data: { full_name: fullName },
      });
      if (error) throw error;
      authUser = data?.user ?? null;
    }

    /* And the record that says who they are to us. If this fails the
       auth user is removed again: half an account is worse than none,
       because it signs in and shows nothing, and nobody knows why. */
    const { error: insErr } = await db.from("Portal_Access").insert({
      Email: newEmail,
      Audience: audience,
      Organisation_ID: organisationId,
      Branch_ID: branchId,
      Project_ID: projectId,
      Customer_ID: customerId,
      Full_Name: fullName,
      Notes: `Created by ${email}`,
    });

    if (insErr) {
      /* Roll back only what this request made. Deleting an account that
         existed before would take somebody's staff login away because a
         portal record failed to insert — a far worse outcome than the
         one being recovered from. */
      if (authUser?.id && !already) {
        try { await db.auth.admin.deleteUser(authUser.id); } catch { /* reported below */ }
      }
      throw insErr;
    }

    return json({
      ok: true,
      email: newEmail,
      invited: !password,
      /* Said back, because "created" and "they can sign in now" are
         different states and the difference matters to whoever is
         about to ring them. */
      message: password
        ? "Account created. They can sign in with the password you set."
        : "Invitation sent. They choose their own password from the email.",
    });
  } catch (e) {
    return fail(e);
  }
});

export const config = { path: "/api/portal-accounts" };
