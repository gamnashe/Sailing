// Account actions run with the service role.
//
// Public (no sign-in needed):
//   POST { action: 'join_with_invite', code, email, password, fullName, phone, experienceLevel }
//        → sign-up through the club's invite link: a confirmed account (no email step) that stays
//          pending until a manager or assistant approves it
//   POST { action: 'request_password_help', email }
//        → a member who forgot their password asks the managers for a new temporary one
//
// Staff only (verified from the caller's own token):
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
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'בקשה לא תקינה' }, 400);
  }

  // ---------- Public actions ----------

  if (body.action === 'join_with_invite') {
    const { data: invite } = await admin.from('club_invite').select('code').eq('id', 1).maybeSingle();
    if (!invite?.code || !body.code || body.code !== invite.code) {
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

    // The sign-up trigger creates the profile as pending and notifies the managers.
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        experience_level: (body.experienceLevel ?? '').trim() || 'איש צוות מנוסה',
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
      .select('id, full_name, email, role, status')
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

  // ---------- Staff actions ----------

  // Client acting as the caller: RLS and auth.uid() apply.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const [{ data: isStaff, error: staffErr }, { data: isAdmin }] = await Promise.all([
    asCaller.rpc('is_staff'),
    asCaller.rpc('is_admin'),
  ]);
  if (staffErr || isStaff !== true) {
    return json({ success: false, message: 'פעולה זו מותרת לצוות ההנהלה בלבד' }, 403);
  }
  const callerIsAdmin = isAdmin === true;

  /** Assistants may only act on regular members; admins on anyone. */
  const mayManage = async (userId: string): Promise<{ ok: boolean; role?: string; status?: string }> => {
    const { data } = await admin.from('profiles').select('role, status').eq('id', userId).maybeSingle();
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
        .eq('status', 'approved');
      if ((count ?? 0) <= 1) return json({ success: false, message: 'לא ניתן למחוק את המנהל האחרון במערכת!' });
    }
    const { error } = await admin.auth.admin.deleteUser(body.userId);
    if (error) return json({ success: false, message: error.message }, 500);
    return json({ success: true });
  }

  if (body.action === 'reset_club_activity') {
    if (!callerIsAdmin) return json({ success: false, message: 'איפוס נתוני המועדון מותר למנהל בלבד' }, 403);
    for (const table of ['posts', 'sails', 'boat_issues', 'notifications']) {
      const { error } = await admin.from(table).delete().not('id', 'is', null);
      if (error) return json({ success: false, message: `${table}: ${error.message}` }, 500);
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

    return json({ success: true, userId: data.user.id, email, temporaryPassword: password });
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
