/**
 * Database schema tests: loads schema.sql into an in-process Postgres (PGlite)
 * with a minimal Supabase shim (auth.users, auth.uid(), anon/authenticated roles)
 * and exercises the RPCs and RLS policies as real users would.
 *
 * Run via: bun run test:db
 */

import { readFileSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const SUPABASE_SHIM = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb
  );
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
  $$;
  CREATE PUBLICATION supabase_realtime;
`;

const GRANTS = `
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
`;

let failures = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failures++;
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

const db = new PGlite();

async function signUp(email: string, meta: Record<string, string> = {}): Promise<string> {
  const res = await db.query<{ id: string }>(
    'INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id',
    [email, JSON.stringify(meta)]
  );
  return res.rows[0].id;
}

/** Runs fn as the given Supabase user (role authenticated, auth.uid() = uid). */
async function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await tx.query('SET LOCAL ROLE authenticated');
    return fn(tx);
  });
}

async function rpc(uid: string, sql: string, params: unknown[] = []): Promise<any> {
  return as(uid, async (tx) => (await tx.query<{ r: any }>(`SELECT ${sql} AS r`, params)).rows[0].r);
}

async function fails(uid: string, sql: string, params: unknown[] = []): Promise<boolean> {
  try {
    await as(uid, (tx) => tx.query(sql, params));
    return false;
  } catch {
    return true;
  }
}

async function credits(uid: string): Promise<number> {
  return (await db.query<{ credits: number }>('SELECT credits FROM profiles WHERE id = $1', [uid])).rows[0].credits;
}

async function notificationCount(uid: string, type?: string): Promise<number> {
  const res = await db.query<{ n: number }>(
    'SELECT COUNT(*)::INT AS n FROM notifications WHERE user_id = $1 AND ($2::TEXT IS NULL OR type = $2)',
    [uid, type ?? null]
  );
  return res.rows[0].n;
}

// Each test sail gets its own day by default, so sails on the same boat never collide by accident.
let sailDay = 0;
function sailJson(overrides: Record<string, unknown> = {}) {
  sailDay += 1;
  return JSON.stringify({
    title: 'הפלגת בדיקה',
    sailType: 'club',
    date: `2099-06-${String(sailDay).padStart(2, '0')}`,
    departureTime: '09:00',
    estimatedReturnTime: '13:00',
    durationHours: 4,
    boatName: 'גלית',
    skipperName: 'יוסי',
    departurePoint: 'מרינה הרצליה',
    minParticipants: 3,
    maxParticipants: 6,
    creditCost: 1,
    ...overrides,
  });
}

async function run() {
  await db.exec(SUPABASE_SHIM);
  await db.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'));
  await db.exec(GRANTS);
  console.log('✅ schema.sql loaded without errors\n');

  // --- Sign-up & profile bootstrap ---
  const admin = await signUp('Admin@Club.co.il', { full_name: 'יוסי כהן', phone: '050-1' });
  const dana = await signUp('dana@club.co.il', { full_name: 'דנה לוי' });
  const tomer = await signUp('tomer@club.co.il', { full_name: 'תומר' });
  const guy = await signUp('guy@club.co.il', { full_name: 'גיא' });

  const adminProfile = (await db.query<any>('SELECT * FROM profiles WHERE id = $1', [admin])).rows[0];
  assert(adminProfile.role === 'admin' && adminProfile.status === 'approved', 'first user becomes an approved admin');
  assert(adminProfile.credits === 20, 'first user starts with 20 credits');
  assert(adminProfile.email === 'admin@club.co.il', 'email is stored lowercased');
  const danaProfile = (await db.query<any>('SELECT * FROM profiles WHERE id = $1', [dana])).rows[0];
  assert(danaProfile.role === 'member' && danaProfile.status === 'pending', 'later users start as pending members');
  assert(danaProfile.credits === 5, 'later users start with 5 credits');
  assert((await notificationCount(admin)) === 3, 'admin is notified about each pending sign-up');

  const sameLocalPart = await signUp('dana@other.com');
  const dup = (await db.query<any>('SELECT username FROM profiles WHERE id = $1', [sameLocalPart])).rows[0];
  assert(dup.username === 'dana2', 'duplicate usernames get a numeric suffix');

  // --- Pending users are locked out ---
  const pendingSails = await as(dana, (tx) => tx.query('SELECT * FROM sails'));
  assert(pendingSails.rows.length === 0, 'pending member sees no sails');
  const pendingProfiles = await as(dana, (tx) => tx.query('SELECT * FROM profiles'));
  assert(pendingProfiles.rows.length === 1, 'pending member sees only their own profile');
  const anonSettings = await db.transaction(async (tx) => {
    await tx.query('SET LOCAL ROLE anon');
    return tx.query<any>('SELECT club_name FROM club_settings');
  });
  assert(anonSettings.rows.length === 1, 'club settings are readable before login');

  // --- Admin-only RPCs reject members ---
  const notAdmin = await rpc(dana, 'approve_member($1)', [dana]);
  assert(notAdmin.success === false, 'member cannot approve themselves');

  // --- Approvals ---
  for (const uid of [dana, tomer, guy]) {
    const r = await rpc(admin, 'approve_member($1)', [uid]);
    assert(r.success, `admin approves member ${uid.slice(0, 8)}`);
  }
  assert((await notificationCount(dana, 'member_approved')) === 1, 'approved member gets a welcome notification');

  // --- Protected profile columns ---
  assert(
    await fails(dana, 'UPDATE profiles SET credits = 999 WHERE id = $1', [dana]),
    'member cannot change their own credits'
  );
  assert(
    await fails(dana, `UPDATE profiles SET role = 'admin' WHERE id = $1`, [dana]),
    'member cannot promote themselves to admin'
  );
  await as(dana, (tx) => tx.query(`UPDATE profiles SET full_name = 'דנה לוי-כהן' WHERE id = $1`, [dana]));
  const renamed = (await db.query<any>('SELECT full_name FROM profiles WHERE id = $1', [dana])).rows[0];
  assert(renamed.full_name === 'דנה לוי-כהן', 'member can edit their own name');
  const otherEdit = await as(dana, (tx) =>
    tx.query(`UPDATE profiles SET full_name = 'hacked' WHERE id = $1`, [tomer])
  );
  assert(otherEdit.affectedRows === 0, "member cannot edit another member's profile");
  assert(
    await fails(dana, `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'x', 'x', 'x')`, [tomer]),
    'member cannot create notifications directly'
  );

  // --- Club sail: join, waitlist, cancel, promotion ---
  const created = await rpc(admin, 'create_sail($1::jsonb)', [sailJson({ maxParticipants: 2 })]);
  assert(created.success && created.sail_id, 'admin creates a club sail');
  const sailId = created.sail_id as string;
  assert((await notificationCount(dana, 'new_sail')) === 1, 'members are notified about a new sail');

  const j1 = await rpc(dana, 'join_sail($1)', [sailId]);
  assert(j1.success && j1.status === 'confirmed', 'dana joins and is confirmed');
  assert((await credits(dana)) === 4, 'joining a club sail costs exactly 1 credit');
  const again = await rpc(dana, 'join_sail($1)', [sailId]);
  assert(again.success === false, 'cannot join the same sail twice');

  const j2 = await rpc(tomer, 'join_sail($1)', [sailId]);
  assert(j2.status === 'confirmed', 'tomer fills the last seat');
  const j3 = await rpc(guy, 'join_sail($1)', [sailId]);
  assert(j3.success && j3.status === 'waitlist', 'guy is put on the waitlist when the sail is full');
  assert((await credits(guy)) === 5, 'waitlisted members are not charged');

  const c1 = await rpc(dana, 'cancel_registration($1)', [sailId]);
  assert(c1.success && c1.promoted_user_id === guy, 'cancellation promotes the first waitlisted member');
  assert((await credits(dana)) === 5, 'cancelling refunds the credit');
  assert((await credits(guy)) === 4, 'promoted member is charged 1 credit');
  assert((await notificationCount(guy, 'waitlist_promoted')) === 1, 'promoted member is notified');

  const rejoin = await rpc(dana, 'join_sail($1)', [sailId]);
  assert(rejoin.status === 'waitlist', 'a member who cancelled can re-register (now waitlisted)');

  const crossCancel = await rpc(tomer, 'cancel_registration($1, $2)', [sailId, guy]);
  assert(crossCancel.success === false, "member cannot cancel someone else's registration");

  // --- Cancellation deadline ---
  const soon = new Date(Date.now() + 2 * 3600 * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  const [soonDate, soonTime] = soon.split(' ');
  const soonSail = (await rpc(admin, 'create_sail($1::jsonb)', [
    sailJson({ date: soonDate, departureTime: soonTime.slice(0, 5) }),
  ])).sail_id;
  await rpc(tomer, 'join_sail($1)', [soonSail]);
  const late = await rpc(tomer, 'cancel_registration($1)', [soonSail]);
  assert(late.success === false, 'members cannot cancel inside the cancellation window');
  const override = await rpc(admin, 'cancel_registration($1, $2)', [soonSail, tomer]);
  assert(override.success, 'admin can cancel inside the cancellation window');

  // --- Private sail ---
  await rpc(admin, 'update_member_credits($1, $2, $3)', [tomer, 10, 'טעינה']);
  const tomerBefore = await credits(tomer);
  const priv = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson({ sailType: 'private', creditCost: 4 })]);
  assert(priv.success, 'member creates a private sail (all_members policy)');
  assert((await credits(tomer)) === tomerBefore - 4, 'private sail creator is charged its credit cost');

  const cs = await rpc(tomer, 'cancel_sail($1, $2)', [priv.sail_id, 'מזג אוויר']);
  assert(cs.success, 'creator can cancel their own sail');
  assert((await credits(tomer)) === tomerBefore, 'cancelling a sail refunds all confirmed participants');
  const strangerCancel = await rpc(dana, 'cancel_sail($1)', [sailId]);
  assert(strangerCancel.success === false, "member cannot cancel someone else's sail");

  await as(admin, (tx) => tx.query(`UPDATE club_settings SET who_can_create_sails = 'admin_only'`));
  const blocked = await rpc(dana, 'create_sail($1::jsonb)', [sailJson()]);
  assert(blocked.success === false, 'admin_only policy blocks members from creating sails');

  // --- Credits ---
  const neg = await rpc(admin, 'update_member_credits($1, $2)', [dana, -100]);
  assert(neg.success && neg.new_credits === 0, 'credits never go below zero');
  const poor = await rpc(dana, 'join_sail($1)', [
    (await rpc(admin, 'create_sail($1::jsonb)', [sailJson()])).sail_id,
  ]);
  assert(poor.success === false, 'members without credits cannot join');

  // --- Roles & deletion safeguards ---
  const demoteLast = await rpc(admin, `set_member_role($1, 'member')`, [admin]);
  assert(demoteLast.success === false, 'cannot demote the last admin');
  const promote = await rpc(admin, `set_member_role($1, 'admin')`, [tomer]);
  assert(promote.success, 'admin promotes another member');
  const demoteNow = await rpc(tomer, `set_member_role($1, 'member')`, [admin]);
  assert(demoteNow.success, 'with two admins, one can be demoted');

  // --- Assistant manager: staff powers without credits or roles ---
  // State here: tomer is the only admin; admin (the first user) is a member again.
  const rina = await signUp('rina@club.co.il', { full_name: 'רינה' });
  await rpc(tomer, 'approve_member($1)', [rina]);
  const makeAssistant = await rpc(tomer, `set_member_role($1, 'assistant')`, [rina]);
  assert(makeAssistant.success, 'admin makes a member an assistant manager');
  const rinaRole = (await db.query<any>('SELECT role FROM profiles WHERE id = $1', [rina])).rows[0].role;
  assert(rinaRole === 'assistant', 'assistant role is stored');

  const yael = await signUp('yael@club.co.il', { full_name: 'יעל' });
  const assistantApproves = await rpc(rina, 'approve_member($1)', [yael]);
  assert(assistantApproves.success, 'assistant approves a pending member');
  const assistantQual = await rpc(rina, `set_member_qualification($1, 'סקיפר מתלמד')`, [yael]);
  assert(assistantQual.success, 'assistant changes a qualification level');
  const assistantSail = await rpc(rina, 'create_sail($1::jsonb)', [sailJson({ boatName: 'רוח ים' })]);
  assert(assistantSail.success, 'assistant opens a sail even under the admin_only policy');
  const assistantCancel = await rpc(rina, 'cancel_sail($1, $2)', [assistantSail.sail_id, 'בדיקה']);
  assert(assistantCancel.success, 'assistant cancels a sail');

  const assistantCredits = await rpc(rina, 'update_member_credits($1, $2)', [yael, 10]);
  assert(assistantCredits.success === false, 'assistant cannot add credits');
  assert(
    await fails(rina, 'UPDATE profiles SET credits = 50 WHERE id = $1', [yael]),
    "assistant cannot set a member's credits directly"
  );
  assert(
    await fails(rina, 'UPDATE profiles SET credits = 50 WHERE id = $1', [rina]),
    'assistant cannot set their own credits'
  );
  const assistantRole = await rpc(rina, `set_member_role($1, 'admin')`, [rina]);
  assert(assistantRole.success === false, 'assistant cannot promote themselves to admin');
  assert(
    await fails(rina, `UPDATE profiles SET role = 'admin' WHERE id = $1`, [rina]),
    'assistant cannot change their role directly'
  );
  const rejectAdmin = await rpc(rina, 'reject_member($1)', [tomer]);
  assert(rejectAdmin.success === false, 'assistant cannot reject an admin');
  const editAdmin = await as(rina, (tx) => tx.query(`UPDATE profiles SET full_name = 'x' WHERE id = $1`, [tomer]));
  assert(editAdmin.affectedRows === 0, "assistant cannot edit an admin's profile");
  const editMember = await as(rina, (tx) => tx.query(`UPDATE profiles SET phone = '052-1' WHERE id = $1`, [yael]));
  assert(editMember.affectedRows === 1, "assistant can edit a member's profile");
  const assistantBoat = await as(rina, (tx) => tx.query(`UPDATE boats SET status_notes = 'נבדק' WHERE name = 'רוח ים'`));
  assert(assistantBoat.affectedRows === 1, 'assistant manages boats');

  // --- Editable qualification levels ---
  const memberRename = await rpc(dana, `rename_experience_level('סקיפר מתלמד', 'x')`);
  assert(memberRename.success === false, 'members cannot rename qualification levels');
  const rename = await rpc(rina, `rename_experience_level('סקיפר מתלמד', 'סקיפר בהכשרה')`);
  assert(rename.success && rename.members_updated === 1, 'renaming a level updates the members who hold it');
  const levels = (await db.query<any>('SELECT experience_levels FROM club_settings')).rows[0].experience_levels;
  assert(levels.includes('סקיפר בהכשרה') && !levels.includes('סקיפר מתלמד'), 'renaming a level updates the club list');
  const yaelLevel = (await db.query<any>('SELECT experience_level FROM profiles WHERE id = $1', [yael])).rows[0].experience_level;
  assert(yaelLevel === 'סקיפר בהכשרה', "the member's level follows the rename");
  const newLevels = await as(rina, (tx) =>
    tx.query(`UPDATE club_settings SET experience_levels = array_append(experience_levels, 'משיט ים פתוח')`)
  );
  assert(newLevels.affectedRows === 1, 'staff can add a qualification level');

  // Member deletion runs in the admin-actions Edge Function via auth.admin.deleteUser;
  // here we check the database side: removing the auth account cascades to all member data.
  await db.query('DELETE FROM auth.users WHERE id = $1', [guy]);
  const gone = await db.query('SELECT 1 FROM profiles WHERE id = $1', [guy]);
  const guyRegs = await db.query('SELECT 1 FROM sail_registrations WHERE user_id = $1', [guy]);
  assert(gone.rows.length === 0 && guyRegs.rows.length === 0, "deleting an auth account removes the member's profile and registrations");

  // --- Boat issues ---
  const boat = (await db.query<any>(`SELECT id FROM boats WHERE name = 'גלית'`)).rows[0].id;
  const issue = await rpc(dana, `report_boat_issue($1, 'מנוע לא מניע', 'לא מניע', 'מנוע', 'critical')`, [boat]);
  assert(issue.success, 'member reports a boat issue');
  const boatStatus = async () => (await db.query<any>('SELECT status FROM boats WHERE id = $1', [boat])).rows[0].status;
  assert((await boatStatus()) === 'maintenance', 'a critical issue takes the boat out of service');
  const blockedJoin = await rpc(dana, 'join_sail($1)', [sailId]);
  assert(blockedJoin.success === false, 'cannot join a sail on a boat under maintenance');
  const notAdminResolve = await rpc(dana, `update_boat_issue_status($1, 'resolved')`, [issue.issue_id]);
  assert(notAdminResolve.success === false, 'member cannot resolve issues');
  await rpc(tomer, `update_boat_issue_status($1, 'resolved', 'הוחלף מצבר')`, [issue.issue_id]);
  assert((await boatStatus()) === 'available', 'resolving the last critical issue returns the boat to service');
  const boatEdit = await as(dana, (tx) => tx.query(`UPDATE boats SET status = 'unavailable'`));
  assert(boatEdit.affectedRows === 0, 'member cannot edit boats directly');

  // --- Boat booking: no overlapping sails on the same boat ---
  const galit = (await db.query<any>(`SELECT id FROM boats WHERE name = 'גלית'`)).rows[0].id;
  const slot = { boatId: galit, boatName: 'גלית (Bavaria 38 Cruiser)', date: '2099-07-01', departureTime: '10:00', estimatedReturnTime: '14:00' };
  const first = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson(slot)]);
  assert(first.success, 'a sail books the boat for its window');
  const sailRow = (await db.query<any>('SELECT boat_id FROM sails WHERE id = $1', [first.sail_id])).rows[0];
  assert(sailRow.boat_id === galit, 'the sail is linked to its boat');
  const overlap = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson({ ...slot, departureTime: '13:00', estimatedReturnTime: '17:00' })]);
  assert(overlap.success === false && /תפוסה/.test(overlap.message), 'an overlapping sail on the same boat is refused');
  const byName = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson({ ...slot, boatId: undefined, departureTime: '11:00', estimatedReturnTime: '12:00' })]);
  assert(byName.success === false, 'the overlap check also finds the boat by its label');
  const backToBack = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson({ ...slot, departureTime: '14:00', estimatedReturnTime: '17:00' })]);
  assert(backToBack.success, 'a sail starting when the previous one returns is allowed');
  const otherBoat = (await db.query<any>(`SELECT id FROM boats WHERE name = 'רוח ים'`)).rows[0].id;
  const sameTimeOtherBoat = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson({ ...slot, boatId: otherBoat, boatName: 'רוח ים' })]);
  assert(sameTimeOtherBoat.success, 'another boat at the same time is fine');
  await rpc(tomer, 'cancel_sail($1)', [first.sail_id]);
  const afterCancel = await rpc(tomer, 'create_sail($1::jsonb)', [sailJson({ ...slot, departureTime: '11:00', estimatedReturnTime: '13:00' })]);
  assert(afterCancel.success, 'a cancelled sail frees the boat');

  // --- Boat permissions: who may take a boat out ---
  await as(rina, (tx) =>
    tx.query(`UPDATE boats SET allowed_levels = ARRAY['משיט 60 (סקיפר בינלאומי)'], allowed_member_ids = ARRAY[$1::uuid] WHERE id = $2`, [dana, otherBoat])
  );
  const restricted = { boatId: otherBoat, boatName: 'רוח ים', date: '2099-08-01' };
  await as(tomer, (tx) => tx.query(`UPDATE club_settings SET who_can_create_sails = 'all_members'`));
  const yaelPrivate = await rpc(yael, 'create_sail($1::jsonb)', [sailJson({ ...restricted, sailType: 'private', creditCost: 3 })]);
  assert(yaelPrivate.success === false && /הרשאה/.test(yaelPrivate.message), 'a member without permission cannot open a private sail on a restricted boat');
  await rpc(tomer, 'update_member_credits($1, $2)', [dana, 10]);
  const danaPrivate = await rpc(dana, 'create_sail($1::jsonb)', [sailJson({ ...restricted, sailType: 'private', creditCost: 3 })]);
  assert(danaPrivate.success, 'a member listed on the boat may open a private sail on it');
  await as(tomer, (tx) => tx.query(`UPDATE profiles SET experience_level = 'משיט 60 (סקיפר בינלאומי)' WHERE id = $1`, [tomer]));
  const levelSkipper = await rpc(rina, 'create_sail($1::jsonb)', [sailJson({ ...restricted, date: '2099-08-02', skipperId: tomer })]);
  assert(levelSkipper.success, 'a skipper with an allowed qualification may take the boat');
  const badSkipper = await rpc(rina, 'create_sail($1::jsonb)', [sailJson({ ...restricted, date: '2099-08-03', skipperId: yael })]);
  assert(badSkipper.success === false, 'a club sail with an unauthorised skipper is refused');
  const guestByMember = await rpc(dana, 'create_sail($1::jsonb)', [sailJson({ ...restricted, date: '2099-08-04' })]);
  assert(guestByMember.success === false, 'a member cannot put a guest skipper on a restricted boat');
  const guestByStaff = await rpc(rina, 'create_sail($1::jsonb)', [sailJson({ ...restricted, date: '2099-08-05' })]);
  assert(guestByStaff.success, 'staff may assign a guest skipper to a restricted boat');
  const memberEditsBoat = await as(yael, (tx) => tx.query(`UPDATE boats SET allowed_member_ids = ARRAY[$1::uuid] WHERE id = $2`, [yael, otherBoat]));
  assert(memberEditsBoat.affectedRows === 0, 'members cannot grant themselves boat permission');

  // --- Feed ---
  const post = await as(dana, (tx) =>
    tx.query<any>(`INSERT INTO posts (author_id, content) VALUES ($1, 'שלום') RETURNING id`, [dana])
  );
  const postId = post.rows[0].id;
  assert(
    await fails(dana, `INSERT INTO posts (author_id, content) VALUES ($1, 'מתחזה')`, [tomer]),
    'member cannot post as someone else'
  );
  await as(tomer, (tx) => tx.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [postId, tomer]));
  const pin = await as(dana, (tx) => tx.query('UPDATE posts SET is_pinned = TRUE WHERE id = $1', [postId]));
  assert(pin.affectedRows === 0, 'members cannot pin posts');

  // --- Invite link (state: tomer is the admin, rina an assistant, dana a member) ---
  const inviteForStaff = await as(rina, (tx) => tx.query<any>('SELECT code FROM club_invite'));
  assert(inviteForStaff.rows.length === 1 && inviteForStaff.rows[0].code.length >= 16, 'staff can read the invite code');
  const inviteForMember = await as(dana, (tx) => tx.query<any>('SELECT code FROM club_invite'));
  assert(inviteForMember.rows.length === 0, 'members cannot read the invite code');
  const newCode = await rpc(rina, 'regenerate_invite_code()');
  assert(newCode.success && newCode.code !== inviteForStaff.rows[0].code, 'staff can replace the invite link');
  assert((await rpc(dana, 'regenerate_invite_code()')).success === false, 'members cannot replace the invite link');
  const lior = await signUp('lior@club.co.il', { full_name: 'ליאור' });
  assert((await notificationCount(rina, 'member_request')) >= 1, 'assistants are notified about new sign-ups too');
  await rpc(tomer, 'reject_member($1)', [lior]);

  // --- Credit requests ---
  const danaCreditsBefore = await credits(dana);
  const req = await rpc(dana, 'request_credits($1, $2)', [5, 'לקראת הקיץ']);
  assert(req.success, 'member requests more credits');
  assert((await notificationCount(tomer, 'credit_request')) === 1, 'the admin is notified about the credit request');
  assert((await notificationCount(rina, 'credit_request')) === 0, 'assistants are not asked to grant credits');
  assert((await rpc(dana, 'request_credits($1)', [3])).success === false, 'only one pending request per member');
  assert((await rpc(dana, 'request_credits($1)', [500])).success === false, 'request amount is bounded');
  const otherSees = await as(guy, (tx) => tx.query<any>('SELECT id FROM credit_requests'));
  assert(otherSees.rows.length === 0, "members cannot see others' credit requests");
  assert(
    await fails(dana, `INSERT INTO credit_requests (user_id, amount) VALUES ($1, 50)`, [dana]) ||
      (await as(dana, (tx) => tx.query<any>(`SELECT count(*)::int AS n FROM credit_requests WHERE amount = 50`))).rows[0].n === 0,
    'members cannot insert credit requests directly'
  );
  assert(
    (await rpc(rina, 'resolve_credit_request($1, true)', [req.request_id])).success === false,
    'assistants cannot approve credit requests'
  );
  const approved = await rpc(tomer, 'resolve_credit_request($1, true, $2)', [req.request_id, 4]);
  assert(approved.success && (await credits(dana)) === danaCreditsBefore + 4, 'admin approves with an adjusted amount');
  assert(
    (await rpc(tomer, 'resolve_credit_request($1, true)', [req.request_id])).success === false,
    'a handled request cannot be approved twice'
  );
  const req2 = await rpc(dana, 'request_credits($1)', [2]);
  assert(req2.success, 'a new request is possible once the previous one was handled');
  await rpc(tomer, 'resolve_credit_request($1, false)', [req2.request_id]);
  assert((await credits(dana)) === danaCreditsBefore + 4, 'a rejected request adds nothing');

  // --- Boat reservations (state: tomer is the admin, rina an assistant, dana a member) ---
  const galitId = (await db.query<any>(`SELECT id FROM boats WHERE name = 'גלית'`)).rows[0].id;
  const resDay = '2097-03-15'; // a day no other test sail uses
  const reserve = (uid: string, over: Record<string, unknown> = {}) =>
    rpc(uid, 'create_boat_reservation($1::jsonb)', [
      JSON.stringify({ boatId: galitId, date: resDay, startTime: '09:00', endTime: '12:00', kind: 'lesson', title: 'שיעור מתחילים', ...over }),
    ]);
  assert((await reserve(dana)).success === false, 'members cannot reserve boats');
  const lesson = await reserve(rina);
  assert(lesson.success, 'assistant reserves a boat for a lesson');
  assert((await reserve(tomer, { startTime: '11:00', endTime: '13:00' })).success === false, 'overlapping reservations are refused');
  assert((await reserve(tomer, { startTime: '12:00', endTime: '14:00', kind: 'special', title: 'אירוע' })).success, 'back-to-back reservation is fine');
  assert((await reserve(tomer, { startTime: '15:00', endTime: '14:00' })).success === false, 'end must be after start');
  const sailOnLesson = await rpc(dana, 'create_sail($1::jsonb)', [
    JSON.stringify({ title: 'בוקר', sailType: 'private', date: resDay, departureTime: '10:00', estimatedReturnTime: '13:00', boatId: galitId, boatName: 'גלית', skipperName: 'דנה', departurePoint: 'מרינה', creditCost: 3 }),
  ]);
  assert(sailOnLesson.success === false && /משוריינת/.test(sailOnLesson.message), 'a sail cannot take a reserved boat');
  const sailAfter = await rpc(tomer, 'create_sail($1::jsonb)', [
    JSON.stringify({ title: 'ערב', sailType: 'club', date: resDay, departureTime: '16:00', estimatedReturnTime: '19:00', boatId: galitId, boatName: 'גלית', skipperName: 'תומר', skipperId: tomer, departurePoint: 'מרינה' }),
  ]);
  assert(sailAfter.success, 'a sail outside the reserved hours is fine');
  assert((await reserve(tomer, { startTime: '17:00', endTime: '18:00' })).success === false, 'a reservation cannot take a booked sail slot');
  const memberSees = await as(dana, (tx) => tx.query<any>('SELECT id FROM boat_reservations'));
  assert(memberSees.rows.length === 2, 'members see reservations in the calendar');
  const memberDeletes = await as(dana, (tx) => tx.query('DELETE FROM boat_reservations WHERE id = $1', [lesson.id]));
  assert(memberDeletes.affectedRows === 0, 'members cannot remove reservations');
  const staffDeletes = await as(rina, (tx) => tx.query('DELETE FROM boat_reservations WHERE id = $1', [lesson.id]));
  assert(staffDeletes.affectedRows === 1, 'staff remove a reservation');

  // --- Notifications privacy ---
  const visible = await as(dana, (tx) => tx.query<any>('SELECT user_id FROM notifications'));
  assert(
    visible.rows.length > 0 && visible.rows.every((r) => r.user_id === dana),
    'members only see their own notifications'
  );

  console.log(failures === 0 ? '\n🎉 All schema tests passed' : `\n${failures} schema test(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
