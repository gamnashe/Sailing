// Admin-only destructive actions, run with the service role after verifying the caller is an approved admin.
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

  // Client acting as the caller: RLS and auth.uid() apply.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc('is_admin');
  if (adminErr || isAdmin !== true) {
    return json({ success: false, message: 'פעולה זו מותרת למנהלים בלבד' }, 403);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let body: {
    action?: string;
    userId?: string;
    email?: string;
    fullName?: string;
    phone?: string;
    experienceLevel?: string;
    credits?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'בקשה לא תקינה' }, 400);
  }

  if (body.action === 'delete_member') {
    if (!body.userId) return json({ success: false, message: 'חסר מזהה משתמש' }, 400);
    const { data: target } = await admin.from('profiles').select('role, status').eq('id', body.userId).maybeSingle();
    if (!target) return json({ success: false, message: 'משתמש לא נמצא' });
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
    const credits = Number.isFinite(body.credits) ? Math.max(0, Math.floor(body.credits!)) : 5;
    const { error: profileError } = await admin
      .from('profiles')
      .update({ status: 'approved', credits })
      .eq('id', data.user.id);
    if (profileError) return json({ success: false, message: profileError.message }, 500);

    return json({ success: true, userId: data.user.id, email, temporaryPassword: password });
  }

  if (body.action === 'reset_member_password') {
    if (!body.userId) return json({ success: false, message: 'חסר מזהה משתמש' }, 400);
    const password = temporaryPassword();
    const { data, error } = await admin.auth.admin.updateUserById(body.userId, { password });
    if (error || !data.user) return json({ success: false, message: error?.message ?? 'משתמש לא נמצא' });
    return json({ success: true, userId: data.user.id, email: data.user.email, temporaryPassword: password });
  }

  return json({ success: false, message: 'פעולה לא מוכרת' }, 400);
});
