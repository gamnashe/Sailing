// Admin-only destructive actions, run with the service role after verifying the caller is an approved admin.
//   POST { action: 'delete_member', userId }  → deletes the auth account (profile and data cascade)
//   POST { action: 'reset_club_activity' }    → deletes sails, posts, boat issues and notifications
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  let body: { action?: string; userId?: string };
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

  return json({ success: false, message: 'פעולה לא מוכרת' }, 400);
});
