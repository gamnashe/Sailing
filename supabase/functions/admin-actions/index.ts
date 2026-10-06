// Account actions run with the service role.
//
// Public (no sign-in needed):
//   POST { action: 'join_with_invite', code, email, password, fullName, phone, experienceLevel }
//        → sign-up through the club's invite link: a confirmed account (no email step) that stays
//          pending until a manager or assistant approves it
//   POST { action: 'request_password_help', email }
//        → a member who forgot their password asks the managers for a new temporary one
//   POST { action: 'login_with_username', username, password }
//        → signs in by username and returns the session; the email behind it never leaves the server
//
// Platform admin only (profiles.is_platform_admin): opening and configuring clubs. The platform admin
// does not see members, sails or other data inside other clubs.
//   POST { action: 'list_clubs' }
//   POST { action: 'create_club', name, location: { name, lat, lon, seaLat?, seaLon? }, adminEmail, adminName, adminPhone }
//        → a new, empty club (no boats or members) with its first admin and a temporary password
//   POST { action: 'update_club', clubId, name?, location? }
//   POST { action: 'add_club_admin', clubId, email, fullName, phone }
//   POST { action: 'reset_club_admin_password', clubId, userId }
//
// Staff only (verified from the caller's own token), always within the caller's own club:
// Admins may do everything; assistant managers only act on regular members' accounts, cannot set
// credits and cannot reset club activity.
//   POST { action: 'delete_member', userId }  → deletes the auth account (profile and data cascade)
//   POST { action: 'reset_club_activity' }    → deletes sails, posts, boat issues and notifications
//   POST { action: 'create_member', email, fullName, phone, experienceLevel, credits }
//        → creates a confirmed, approved account with a temporary password the admin hands over
//          (no email is sent: Supabase's built-in mailer only reaches the project's own team)
//   POST { action: 'reset_member_password', userId }
//        → gives a member a new temporary password, for resending their login details
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 10 characters from an unambiguous alphabet, always with letters and digits (meets the app's password rule).
function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const chars = Array.from(bytes, (b) => all[b % all.length])
  chars[0] = letters[bytes[0] % letters.length]
  chars[9] = digits[bytes[9] % digits.length]
  return chars.join('')
}

// Same rule as the database (_valid_username): 3–20 chars, a-z 0-9 . _ -, starting with a letter or digit
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: {
    action?: string;
    userId?: string;
    email?: string;
    fullName?: string;
    phone?: string;
    experienceLevel?: string;
    credits?: number;
    code?: string;
    password?: string;
    username?: string;
    clubId?: string;
    name?: string;
    location?: { name?: string; lat?: number; lon?: number; seaLat?: number | null; seaLon?: number | null };
    adminEmail?: string;
    adminName?: string;
    adminPhone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'בקשה לא תקינה' }, 400);
  }

  // ---------- Public actions ----------

  if (body.action === 'join_with_invite') {
    const { data: invite } = body.code
      ? await admin.from('club_invite').select('club_id').eq('code', body.code).maybeSingle()
      : { data: null };
    if (!invite?.club_id) {
      return json({ success: false, message: 'קישור ההצטרפות אינו בתוקף. בקש מהנהלת המועדון קישור חדש.' }, 403);
    }
    const email = (body.email ?? '').trim().toLowerCase();
    const fullName = (body.fullName ?? '').trim();
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';
    if (!email.includes('@')) return json({ success: false, message: 'יש להזין כתובת מייל תקינה' }, 400);
    if (!fullName) return json({ success: false, message: 'יש להזין שם מלא' }, 400);
    if (!phone) return json({ success: false, message: 'יש להזין מספר טלפון' }, 400);
    if (password.length < 8 || !/[a-zA-Zא-ת]/.test(password) || !/[0-9]/.test(password)) {
      return json({ success: false, message: 'הסיסמה חייבת להכיל לפחות 8 תווים ולשלב אותיות ומספרים' }, 400);
    }
    const username = (body.username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      return json({ success: false, message: 'שם משתמש: 3–20 תווים באנגלית (אותיות קטנות), ספרות, נקודה, מקף או קו תחתון' }, 400);
    }
    const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (taken) return json({ success: false, message: `שם המשתמש "${username}" כבר תפוס. בחר שם אחר.` });

    // The sign-up trigger creates the profile as pending and notifies the managers.
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        experience_level: (body.experienceLevel ?? '').trim() || 'איש צוות מנוסה',
        club_id: invite.club_id,
        username,
      },
    });
    if (error) {
      const exists = /already|registered|exists/i.test(error.message);
      return json({ success: false, message: exists ? 'כתובת מייל זו כבר רשומה במערכת. נסה להתחבר.' : error.message });
    }
    return json({ success: true });
  }

  if (body.action === 'request_password_help') {
    // Always the same answer, so the form can't be used to find out who is a member.
    const done = json({ success: true });
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email.includes('@')) return json({ success: false, message: 'יש להזין כתובת מייל תקינה' }, 400);
    const { data: member } = await admin
      .from('profiles')
      .select('id, full_name, email, role, status, club_id')
      .eq('email', email)
      .maybeSingle();
    if (!member || member.status === 'rejected') return done;

    // At most one request per member every 15 minutes
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'password_help')
      .eq('target_id', member.id)
      .gte('created_at', since);
    if ((count ?? 0) > 0) return done;

    // Assistants may only reset regular members' passwords
    const roles = member.role === 'member' ? ['admin', 'assistant'] : ['admin'];
    const { data: helpers } = await admin
      .from('profiles')
      .select('id')
      .in('role', roles)
      .eq('club_id', member.club_id)
      .eq('status', 'approved')
      .neq('id', member.id);
    if (helpers?.length) {
      await admin.from('notifications').insert(
        helpers.map((h) => ({
          user_id: h.id,
          type: 'password_help',
          title: '🔑 בקשה לאיפוס סיסמה',
          message: `${member.full_name} (${member.email}) שכח/ה את הסיסמה ומבקש/ת סיסמה זמנית חדשה.`,
          target_id: member.id,
        }))
      );
    }
    return done;
  }

  if (body.action === 'login_with_username') {
    const wrong = json({ success: false, message: 'שם משתמש או סיסמה שגויים' });
    const username = (body.username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username) || !body.password) return wrong;
    const { data: profile } = await admin.from('profiles').select('email').eq('username', username).maybeSingle();
    if (!profile?.email) return wrong;
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.signInWithPassword({ email: profile.email, password: body.password });
    if (error || !data.session) {
      if (/rate limit|too many/i.test(error?.message ?? '')) {
        return json({ success: false, message: 'בוצעו יותר מדי ניסיונות. נסה שוב בעוד מספר דקות' }, 429);
      }
      return wrong;
    }
    return json({ success: true, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  // Client acting as the caller: RLS and auth.uid() apply.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  // ---------- Platform admin: clubs ----------

  const PLATFORM_ACTIONS = ['list_clubs', 'create_club', 'update_club', 'add_club_admin', 'reset_club_admin_password'];
  if (PLATFORM_ACTIONS.includes(body.action ?? '')) {
    const { data: isPlatform } = await asCaller.rpc('is_platform_admin');
    if (isPlatform !== true) return json({ success: false, message: 'פעולה זו מותרת למנהל המערכת בלבד' }, 403);
    return platformAction(admin, body);
  }

  // ---------- Staff actions ----------

  const [{ data: isStaff, error: staffErr }, { data: isAdmin }, { data: callerClub }] = await Promise.all([
    asCaller.rpc('is_staff'),
    asCaller.rpc('is_admin'),
    asCaller.rpc('my_club_id'),
  ]);
  if (staffErr || isStaff !== true) {
    return json({ success: false, message: 'פעולה זו מותרת לצוות ההנהלה בלבד' }, 403);
  }
  const callerIsAdmin = isAdmin === true;

  /** Only members of the caller's own club; assistants only regular members, admins anyone. */
  const mayManage = async (userId: string): Promise<{ ok: boolean; role?: string; status?: string }> => {
    const { data } = await admin
      .from('profiles')
      .select('role, status')
      .eq('id', userId)
      .eq('club_id', callerClub)
      .maybeSingle();
    if (!data) return { ok: false };
    return { ok: callerIsAdmin || data.role === 'member', role: data.role, status: data.status };
  };
  const notAllowed = () => json({ success: false, message: 'רק מנהל יכול לבצע פעולה זו על מנהל או עוזר מנהל' }, 403);

  if (body.action === 'delete_member') {
    if (!body.userId) return json({ success: false, message: 'חסר מזהה משתמש' }, 400);
    const target = await mayManage(body.userId);
    if (!target.role) return json({ success: false, message: 'משתמש לא נמצא' });
    if (!target.ok) return notAllowed();
    if (target.role === 'admin' && target.status === 'approved') {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('club_id', callerClub)
        .eq('status', 'approved');
      if ((count ?? 0) <= 1) return json({ success: false, message: 'לא ניתן למחוק את המנהל האחרון במערכת!' });
    }
    const { error } = await admin.auth.admin.deleteUser(body.userId);
    if (error) return json({ success: false, message: error.message }, 500);
    return json({ success: true });
  }

  if (body.action === 'reset_club_activity') {
    if (!callerIsAdmin) return json({ success: false, message: 'איפוס נתוני המועדון מותר למנהל בלבד' }, 403);
    // Only this club's activity
    for (const table of ['posts', 'sails', 'boat_issues', 'boat_reservations']) {
      const { error } = await admin.from(table).delete().eq('club_id', callerClub);
      if (error) return json({ success: false, message: `${table}: ${error.message}` }, 500);
    }
    const { data: clubUsers } = await admin.from('profiles').select('id').eq('club_id', callerClub);
    const ids = (clubUsers ?? []).map((u) => u.id);
    if (ids.length) {
      const { error } = await admin.from('notifications').delete().in('user_id', ids);
      if (error) return json({ success: false, message: `notifications: ${error.message}` }, 500);
    }
    return json({ success: true });
  }

  if (body.action === 'create_member') {
    const email = (body.email ?? '').trim().toLowerCase();
    const fullName = (body.fullName ?? '').trim();
    if (!email.includes('@')) return json({ success: false, message: 'יש להזין כתובת מייל תקינה' }, 400);
    if (!fullName) return json({ success: false, message: 'יש להזין שם מלא' }, 400);

    const password = temporaryPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: (body.phone ?? '').trim(),
        experience_level: body.experienceLevel || 'איש צוות מנוסה',
        club_id: callerClub,
      },
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? '');
      return json({ success: false, message: exists ? 'כתובת מייל זו כבר רשומה במערכת' : (error?.message ?? 'יצירת החבר נכשלה') });
    }

    // The sign-up trigger created the profile as pending; an admin-added member starts approved.
    // Only admins set credits; members an assistant adds start with the default.
    const credits = callerIsAdmin && Number.isFinite(body.credits) ? Math.max(0, Math.floor(body.credits!)) : 5;
    const { error: profileError } = await admin
      .from('profiles')
      .update({ status: 'approved', credits })
      .eq('id', data.user.id);
    if (profileError) return json({ success: false, message: profileError.message }, 500);

    const { data: created } = await admin.from('profiles').select('username').eq('id', data.user.id).maybeSingle();
    return json({ success: true, userId: data.user.id, email, username: created?.username, temporaryPassword: password });
  }

  if (body.action === 'reset_member_password') {
    if (!body.userId) return json({ success: false, message: 'חסר מזהה משתמש' }, 400);
    const target = await mayManage(body.userId);
    if (!target.role) return json({ success: false, message: 'משתמש לא נמצא' });
    if (!target.ok) return notAllowed();
    const password = temporaryPassword();
    const { data, error } = await admin.auth.admin.updateUserById(body.userId, { password });
    if (error || !data.user) return json({ success: false, message: error?.message ?? 'משתמש לא נמצא' });
    // The member's "forgot password" requests are now handled for every manager
    await admin.from('notifications').update({ read: true }).eq('type', 'password_help').eq('target_id', body.userId);
    return json({ success: true, userId: data.user.id, email: data.user.email, temporaryPassword: password });
  }

  return json({ success: false, message: 'פעולה לא מוכרת' }, 400);
});

type Body = Record<string, any>;

async function newAccount(
  admin: ReturnType<typeof createClient>,
  clubId: string,
  email: string,
  fullName: string,
  phone: string
): Promise<{ ok: true; userId: string; password: string } | { ok: false; message: string }> {
  const password = temporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, club_id: clubId },
  });
  if (error || !data.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? '');
    return { ok: false, message: exists ? 'כתובת מייל זו כבר רשומה במערכת' : error?.message ?? 'יצירת החשבון נכשלה' };
  }
  // The sign-up trigger created the profile as a pending member of the club; make it its admin
  const { error: pe } = await admin
    .from('profiles')
    .update({ role: 'admin', status: 'approved', credits: 20 })
    .eq('id', data.user.id);
  if (pe) return { ok: false, message: pe.message };
  return { ok: true, userId: data.user.id, password };
}

function locationRow(loc: Body['location']): Body {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return {};
  return {
    weather_location_name: String(loc.name ?? '').trim() || 'מיקום המועדון',
    weather_lat: loc.lat,
    weather_lon: loc.lon,
    weather_sea_lat: typeof loc.seaLat === 'number' ? loc.seaLat : null,
    weather_sea_lon: typeof loc.seaLon === 'number' ? loc.seaLon : null,
  };
}

/** Club configuration only: never returns sails, posts or other data from inside a club. */
async function platformAction(admin: ReturnType<typeof createClient>, body: Body): Promise<Response> {
  if (body.action === 'list_clubs') {
    const [{ data: clubs }, { data: settings }, { data: people }] = await Promise.all([
      admin.from('clubs').select('id, name, created_at').order('created_at'),
      admin.from('club_settings').select('club_id, club_name, weather_location_name, weather_lat, weather_lon, weather_sea_lat, weather_sea_lon'),
      admin.from('profiles').select('id, club_id, full_name, email, role, status'),
    ]);
    const list = (clubs ?? []).map((c) => {
      const st = (settings ?? []).find((x) => x.club_id === c.id);
      const members = (people ?? []).filter((p) => p.club_id === c.id);
      return {
        id: c.id,
        name: st?.club_name ?? c.name,
        createdAt: c.created_at,
        location: st
          ? {
              name: st.weather_location_name,
              lat: Number(st.weather_lat),
              lon: Number(st.weather_lon),
              seaLat: st.weather_sea_lat != null ? Number(st.weather_sea_lat) : undefined,
              seaLon: st.weather_sea_lon != null ? Number(st.weather_sea_lon) : undefined,
            }
          : null,
        memberCount: members.filter((m) => m.status === 'approved').length,
        admins: members
          .filter((m) => m.role === 'admin' && m.status === 'approved')
          .map((m) => ({ id: m.id, fullName: m.full_name, email: m.email })),
      };
    });
    return json({ success: true, clubs: list });
  }

  if (body.action === 'create_club') {
    const name = String(body.name ?? '').trim();
    const email = String(body.adminEmail ?? '').trim().toLowerCase();
    const adminName = String(body.adminName ?? '').trim();
    if (!name) return json({ success: false, message: 'יש להזין שם למועדון' }, 400);
    if (!email.includes('@')) return json({ success: false, message: 'יש להזין מייל תקין למנהל המועדון' }, 400);
    if (!adminName) return json({ success: false, message: 'יש להזין את שם מנהל המועדון' }, 400);

    const { data: club, error: ce } = await admin.from('clubs').insert({ name }).select('id').single();
    if (ce || !club) return json({ success: false, message: ce?.message ?? 'יצירת המועדון נכשלה' }, 500);
    const undo = () => admin.from('clubs').delete().eq('id', club.id);

    const { error: se } = await admin.from('club_settings').insert({ club_id: club.id, club_name: name, ...locationRow(body.location) });
    const { error: ie } = await admin.from('club_invite').insert({ club_id: club.id });
    if (se || ie) {
      await undo();
      return json({ success: false, message: (se ?? ie)!.message }, 500);
    }
    const acc = await newAccount(admin, club.id, email, adminName, String(body.adminPhone ?? '').trim());
    if (!acc.ok) {
      await undo();
      return json({ success: false, message: acc.message });
    }
    return json({ success: true, clubId: club.id, email, temporaryPassword: acc.password });
  }

  if (body.action === 'update_club') {
    if (!body.clubId) return json({ success: false, message: 'חסר מזהה מועדון' }, 400);
    const row: Body = { ...locationRow(body.location), updated_at: new Date().toISOString() };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name) {
      row.club_name = name;
      await admin.from('clubs').update({ name }).eq('id', body.clubId);
    }
    const { error } = await admin.from('club_settings').update(row).eq('club_id', body.clubId);
    if (error) return json({ success: false, message: error.message }, 500);
    return json({ success: true });
  }

  if (body.action === 'add_club_admin') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.fullName ?? '').trim();
    if (!body.clubId) return json({ success: false, message: 'חסר מזהה מועדון' }, 400);
    if (!email.includes('@')) return json({ success: false, message: 'יש להזין מייל תקין' }, 400);
    if (!fullName) return json({ success: false, message: 'יש להזין שם מלא' }, 400);
    const { data: club } = await admin.from('clubs').select('id').eq('id', body.clubId).maybeSingle();
    if (!club) return json({ success: false, message: 'המועדון לא נמצא' });
    const acc = await newAccount(admin, club.id, email, fullName, String(body.phone ?? '').trim());
    if (!acc.ok) return json({ success: false, message: acc.message });
    return json({ success: true, email, temporaryPassword: acc.password });
  }

  if (body.action === 'reset_club_admin_password') {
    // Only the club's admins: the platform admin doesn't manage regular members' accounts
    const { data: target } = await admin
      .from('profiles')
      .select('id, email')
      .eq('id', body.userId ?? '')
      .eq('club_id', body.clubId ?? '')
      .eq('role', 'admin')
      .maybeSingle();
    if (!target) return json({ success: false, message: 'מנהל המועדון לא נמצא' });
    const password = temporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(target.id, { password });
    if (error) return json({ success: false, message: error.message });
    return json({ success: true, email: target.email, temporaryPassword: password });
  }

  return json({ success: false, message: 'פעולה לא מוכרת' }, 400);
}
