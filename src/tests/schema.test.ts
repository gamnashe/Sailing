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

function sailJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    title: 'הפלגת בדיקה',
    sailType: 'club',
    date: '2099-06-01',
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
