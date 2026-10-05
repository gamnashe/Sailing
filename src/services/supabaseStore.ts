import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  UserProfile,
  Sail,
  SailRegistration,
  ClubPost,
  AppNotification,
  ClubSettings,
  UserRole,
  Boat,
  BoatIssue,
  IssueStatus,
  ExperienceLevel,
  NotificationType,
  CreditRequest,
} from '../types';
import type { DataStore, JoinDetails, MessageResult, NewMember, Result } from './dataStore';
import { DEFAULT_EXPERIENCE_LEVELS } from '../types';
import { validatePasswordComplexity } from './sailRules';

type Row = Record<string, any>;

interface Snapshot {
  settings: ClubSettings;
  users: UserProfile[];
  sails: Sail[];
  registrations: SailRegistration[];
  posts: ClubPost[];
  notifications: AppNotification[];
  boats: Boat[];
  boatIssues: BoatIssue[];
  creditRequests: CreditRequest[];
  /** Staff only. */
  inviteCode: string | null;
}

const DEFAULT_SETTINGS: ClubSettings = {
  clubName: 'מועדון שייט גלי ים',
  logoUrl: '/icon.svg',
  defaultMaxParticipants: 6,
  whoCanCreateSails: 'all_members',
  cancellationDeadlineHours: 12,
  experienceLevels: DEFAULT_EXPERIENCE_LEVELS,
};

const emptySnapshot = (settings: ClubSettings = DEFAULT_SETTINGS): Snapshot => ({
  settings,
  users: [],
  sails: [],
  registrations: [],
  posts: [],
  notifications: [],
  boats: [],
  boatIssues: [],
  creditRequests: [],
  inviteCode: null,
});

/** Translates the Supabase Auth errors users are likely to hit into Hebrew. */
function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'כתובת מייל או סיסמה שגויים';
  if (m.includes('email not confirmed')) return 'יש לאשר את כתובת המייל דרך הקישור שנשלח אליך לפני ההתחברות';
  if (m.includes('already registered')) return 'כתובת מייל זו כבר רשומה במערכת';
  if (m.includes('rate limit') || m.includes('too many')) return 'בוצעו יותר מדי ניסיונות. נסה שוב בעוד מספר דקות';
  if (m.includes('token has expired') || m.includes('invalid')) return 'קוד האיפוס או הקישור פג תוקף או אינו תקין';
  if (m.includes('should be different')) return 'הסיסמה החדשה חייבת להיות שונה מהסיסמה הקודמת';
  return message;
}

const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

function mapSettings(r: Row): ClubSettings {
  return {
    clubName: r.club_name,
    logoUrl: r.logo_url ?? '/icon.svg',
    defaultMaxParticipants: r.default_max_participants,
    whoCanCreateSails: r.who_can_create_sails,
    cancellationDeadlineHours: r.cancellation_deadline_hours,
    experienceLevels: r.experience_levels?.length ? r.experience_levels : DEFAULT_EXPERIENCE_LEVELS,
  };
}

function mapProfile(r: Row): UserProfile {
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    fullName: r.full_name,
    phone: r.phone ?? '',
    avatar: r.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${r.username}`,
    experienceLevel: r.experience_level,
    role: r.role,
    status: r.status,
    joinedAt: r.created_at,
    credits: r.credits,
  };
}

function mapBoat(r: Row): Boat {
  return {
    id: r.id,
    name: r.name,
    model: r.model,
    status: r.status,
    statusNotes: r.status_notes ?? undefined,
    berthLocation: r.berth_location ?? undefined,
    year: r.year ?? undefined,
    capacity: r.capacity ?? undefined,
    allowedLevels: r.allowed_levels ?? [],
    allowedMemberIds: r.allowed_member_ids ?? [],
    createdAt: r.created_at,
  };
}

function boatToRow(b: Partial<Boat>): Row {
  const row: Row = {};
  if (b.name !== undefined) row.name = b.name;
  if (b.model !== undefined) row.model = b.model;
  if (b.status !== undefined) row.status = b.status;
  if (b.statusNotes !== undefined) row.status_notes = b.statusNotes;
  if (b.berthLocation !== undefined) row.berth_location = b.berthLocation;
  if (b.year !== undefined) row.year = b.year;
  if (b.capacity !== undefined) row.capacity = b.capacity;
  if (b.allowedLevels !== undefined) row.allowed_levels = b.allowedLevels;
  if (b.allowedMemberIds !== undefined) row.allowed_member_ids = b.allowedMemberIds;
  return row;
}

function sailToRow(s: Partial<Sail>): Row {
  const row: Row = {};
  if (s.title !== undefined) row.title = s.title;
  if (s.sailType !== undefined) row.sail_type = s.sailType;
  if (s.date !== undefined) row.date = s.date;
  if (s.departureTime !== undefined) row.departure_time = s.departureTime;
  if (s.estimatedReturnTime !== undefined) row.estimated_return_time = s.estimatedReturnTime;
  if (s.durationHours !== undefined) row.duration_hours = s.durationHours;
  if (s.boatName !== undefined) row.boat_name = s.boatName;
  if (s.boatId !== undefined) row.boat_id = s.boatId || null;
  if (s.skipperName !== undefined) row.skipper_name = s.skipperName;
  if (s.skipperId !== undefined) row.skipper_id = s.skipperId || null;
  if (s.departurePoint !== undefined) row.departure_point = s.departurePoint;
  if (s.notes !== undefined) row.notes = s.notes;
  if (s.minParticipants !== undefined) row.min_participants = s.minParticipants;
  if (s.maxParticipants !== undefined) row.max_participants = s.maxParticipants;
  if (s.status !== undefined) row.status = s.status;
  if (s.cancellationReason !== undefined) row.cancellation_reason = s.cancellationReason;
  return row;
}

/**
 * Supabase-backed data store.
 *
 * Reads come from an in-memory snapshot of everything the signed-in user may see (RLS decides what that is).
 * Every write goes to Supabase (direct table write or RPC) and then reloads the snapshot; a Realtime
 * subscription reloads it whenever another device changes something.
 */
export class SupabaseStore implements DataStore {
  public readonly mode = 'supabase' as const;

  private snapshot: Snapshot = emptySnapshot();
  private currentUserId: string | null = null;
  private loading = true;
  private lastError: string | null = null;
  private passwordRecovery = false;
  private listeners = new Set<() => void>();
  private channel: RealtimeChannel | null = null;
  private realtimeTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private followUp: Promise<void> | null = null;

  constructor(private readonly sb: SupabaseClient) {
    this.readAuthLinkError();
    this.sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.passwordRecovery = true;
      }
      // Supabase warns against awaiting other client calls inside this callback, so defer the reload.
      setTimeout(() => {
        void this.refresh();
      }, 0);
    });
  }

  /**
   * An email link that failed (already used, expired) lands here with error_code in the URL.
   * Typical case: the confirmation link was opened twice; the first click already confirmed the account.
   */
  private readAuthLinkError() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search);
    const code = params.get('error_code');
    if (!code) return;
    this.lastError =
      code === 'otp_expired'
        ? 'הקישור מהמייל כבר נוצל או שפג תוקפו. אם כבר לחצת עליו פעם אחת — החשבון אושר, פשוט התחבר עם המייל והסיסמה.'
        : params.get('error_description')?.replace(/\+/g, ' ') || 'הקישור מהמייל אינו תקין';
    window.history.replaceState(null, '', window.location.pathname);
  }

  // --- Infrastructure ---

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public isLoading() {
    return this.loading;
  }

  public getLastError() {
    return this.lastError;
  }

  public clearLastError() {
    this.lastError = null;
    this.notify();
  }

  private reportError(message: string) {
    console.error('[supabase]', message);
    this.lastError = message;
    this.notify();
  }

  /** Reloads the snapshot. Concurrent callers share one in-flight load plus at most one follow-up. */
  public refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.load().finally(() => {
        this.inflight = null;
      });
      return this.inflight;
    }
    if (!this.followUp) {
      this.followUp = this.inflight.then(() => {
        this.followUp = null;
        return this.refresh();
      });
    }
    return this.followUp;
  }

  private async load() {
    try {
      const { data: sessionData } = await this.sb.auth.getSession();
      const session = sessionData.session;

      const settingsRes = await this.sb.from('club_settings').select('*').eq('id', 1).maybeSingle();
      const settings = settingsRes.data ? mapSettings(settingsRes.data) : this.snapshot.settings;

      if (!session) {
        this.currentUserId = null;
        this.snapshot = emptySnapshot(settings);
        this.stopRealtime();
        return;
      }

      const uid = session.user.id;
      const meRes = await this.sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (meRes.error) throw meRes.error;
      if (!meRes.data) {
        // Signed in but no profile (e.g. the account was deleted by an admin).
        this.currentUserId = null;
        this.snapshot = emptySnapshot(settings);
        await this.sb.auth.signOut();
        return;
      }

      const me = mapProfile(meRes.data);
      this.currentUserId = uid;

      if (me.status !== 'approved') {
        const notifs = await this.sb.from('notifications').select('*').order('created_at', { ascending: false });
        this.snapshot = { ...emptySnapshot(settings), users: [me], notifications: (notifs.data ?? []).map(this.mapNotification) };
        this.stopRealtime();
        return;
      }

      const staff = me.role === 'admin' || me.role === 'assistant';
      const [profiles, boats, issues, sails, regs, photos, posts, likes, comments, notifs, creditReqs, invite] = await Promise.all([
        this.sb.from('profiles').select('*').order('created_at'),
        this.sb.from('boats').select('*').order('created_at'),
        this.sb.from('boat_issues').select('*'),
        this.sb.from('sails').select('*'),
        this.sb.from('sail_registrations').select('*'),
        this.sb.from('sail_photos').select('*').order('created_at', { ascending: false }),
        this.sb.from('posts').select('*'),
        this.sb.from('post_likes').select('post_id, user_id'),
        this.sb.from('post_comments').select('*').order('created_at'),
        this.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
        this.sb.from('credit_requests').select('*').order('created_at', { ascending: false }).limit(200),
        staff
          ? this.sb.from('club_invite').select('code').eq('id', 1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      for (const res of [profiles, boats, issues, sails, regs, photos, posts, likes, comments, notifs, creditReqs, invite]) {
        if (res.error) throw res.error;
      }

      const users = (profiles.data ?? []).map(mapProfile);
      const userById = new Map(users.map((u) => [u.id, u]));
      const boatList = (boats.data ?? []).map(mapBoat);
      const boatById = new Map(boatList.map((b) => [b.id, b]));
      const nameOf = (id: string | null | undefined) => (id && userById.get(id)?.fullName) || 'חבר לשעבר';

      const photosBySail = new Map<string, Sail['photos']>();
      for (const p of photos.data ?? []) {
        const list = photosBySail.get(p.sail_id) ?? [];
        list.push({
          id: p.id,
          url: p.photo_url,
          caption: p.caption ?? undefined,
          uploadedBy: p.user_id,
          uploaderName: nameOf(p.user_id),
          uploadedAt: p.created_at,
        });
        photosBySail.set(p.sail_id, list);
      }

      const sailList: Sail[] = (sails.data ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        sailType: s.sail_type,
        date: s.date,
        departureTime: hhmm(s.departure_time),
        estimatedReturnTime: hhmm(s.estimated_return_time),
        durationHours: Number(s.duration_hours),
        boatName: s.boat_name,
        boatId: s.boat_id ?? undefined,
        skipperName: s.skipper_name,
        skipperId: s.skipper_id ?? undefined,
        departurePoint: s.departure_point,
        notes: s.notes ?? '',
        minParticipants: s.min_participants,
        maxParticipants: s.max_participants,
        creditCost: s.credit_cost,
        status: s.status,
        cancellationReason: s.cancellation_reason ?? undefined,
        createdBy: s.created_by,
        creatorName: nameOf(s.created_by),
        createdAt: s.created_at,
        photos: photosBySail.get(s.id) ?? [],
      }));
      const sailById = new Map(sailList.map((s) => [s.id, s]));

      const likesByPost = new Map<string, string[]>();
      for (const l of likes.data ?? []) {
        likesByPost.set(l.post_id, [...(likesByPost.get(l.post_id) ?? []), l.user_id]);
      }
      const commentsByPost = new Map<string, ClubPost['comments']>();
      for (const c of comments.data ?? []) {
        const author = userById.get(c.author_id);
        const list = commentsByPost.get(c.post_id) ?? [];
        list.push({
          id: c.id,
          postId: c.post_id,
          authorId: c.author_id,
          authorName: author?.fullName ?? 'חבר לשעבר',
          authorAvatar: author?.avatar ?? '',
          content: c.content,
          createdAt: c.created_at,
        });
        commentsByPost.set(c.post_id, list);
      }

      this.snapshot = {
        settings,
        users,
        boats: boatList,
        boatIssues: (issues.data ?? []).map((i) => {
          const reporter = userById.get(i.reporter_id);
          return {
            id: i.id,
            boatId: i.boat_id,
            boatName: boatById.get(i.boat_id)?.name ?? '',
            reporterId: i.reporter_id,
            reporterName: reporter?.fullName ?? 'חבר לשעבר',
            reporterPhone: reporter?.phone ?? '',
            title: i.title,
            description: i.description,
            category: i.category,
            severity: i.severity,
            status: i.status,
            photoUrl: i.photo_url ?? undefined,
            adminNotes: i.admin_notes ?? undefined,
            createdAt: i.created_at,
            resolvedAt: i.resolved_at ?? undefined,
            resolvedBy: i.resolved_by ? nameOf(i.resolved_by) : undefined,
          };
        }),
        sails: sailList,
        registrations: (regs.data ?? []).map((r) => ({
          id: r.id,
          sailId: r.sail_id,
          userId: r.user_id,
          status: r.status,
          waitlistPosition: r.waitlist_position ?? undefined,
          creditsCharged: r.credits_charged,
          registeredAt: r.registered_at,
          confirmedAt: r.confirmed_at ?? undefined,
        })),
        posts: (posts.data ?? []).map((p) => {
          const author = userById.get(p.author_id);
          return {
            id: p.id,
            authorId: p.author_id,
            authorName: author?.fullName ?? 'חבר לשעבר',
            authorAvatar: author?.avatar ?? '',
            authorRole: author?.role ?? 'member',
            content: p.content,
            images: p.images ?? [],
            linkPreview: p.link_preview ?? undefined,
            isPinned: p.is_pinned,
            sailId: p.sail_id ?? undefined,
            sailTitle: p.sail_id ? sailById.get(p.sail_id)?.title : undefined,
            likes: likesByPost.get(p.id) ?? [],
            comments: commentsByPost.get(p.id) ?? [],
            createdAt: p.created_at,
          };
        }),
        notifications: (notifs.data ?? []).map(this.mapNotification),
        creditRequests: (creditReqs.data ?? []).map((r) => ({
          id: r.id,
          userId: r.user_id,
          amount: r.amount,
          note: r.note ?? '',
          status: r.status,
          granted: r.granted ?? undefined,
          createdAt: r.created_at,
          handledAt: r.handled_at ?? undefined,
        })),
        inviteCode: (invite.data as Row | null)?.code ?? null,
      };
      this.startRealtime();
    } catch (err: any) {
      this.reportError(err?.message ?? 'שגיאה בטעינת הנתונים מהשרת');
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  private mapNotification = (n: Row): AppNotification => ({
    id: n.id,
    userId: n.user_id,
    type: n.type as NotificationType,
    title: n.title,
    message: n.message,
    targetId: n.target_id ?? undefined,
    read: n.read,
    createdAt: n.created_at,
  });

  private startRealtime() {
    if (this.channel) return;
    this.channel = this.sb
      .channel('club-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        // Bursts of row changes (e.g. one RPC touching many rows) collapse into one reload.
        if (this.realtimeTimer) clearTimeout(this.realtimeTimer);
        this.realtimeTimer = setTimeout(() => {
          this.realtimeTimer = null;
          void this.refresh();
        }, 300);
      })
      .subscribe();
  }

  private stopRealtime() {
    if (this.channel) {
      void this.sb.removeChannel(this.channel);
      this.channel = null;
    }
  }

  /** Calls an RPC that returns { success, message, ... } and reloads the snapshot afterwards. */
  private async rpc(fn: string, params: Row): Promise<Row> {
    const { data, error } = await this.sb.rpc(fn, params);
    if (error) {
      return { success: false, message: error.message };
    }
    await this.refresh();
    return (data as Row) ?? { success: false, message: 'תשובה ריקה מהשרת' };
  }

  /** Like rpc(), for callers that only need a boolean; failures are surfaced as a toast. */
  private async rpcOk(fn: string, params: Row): Promise<boolean> {
    const r = await this.rpc(fn, params);
    if (!r.success) this.reportError(r.message || 'הפעולה נכשלה');
    return Boolean(r.success);
  }

  /** Runs a direct table write, reports failures, and reloads the snapshot. */
  private async write(op: PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    const { error } = await op;
    if (error) {
      this.reportError(error.message);
      return false;
    }
    await this.refresh();
    return true;
  }

  // --- Auth & users ---

  public getCurrentUser() {
    return this.snapshot.users.find((u) => u.id === this.currentUserId) ?? null;
  }

  public setCurrentUser() {
    // Switching users without signing in is a demo-mode feature only.
  }

  public getUsers() {
    return [...this.snapshot.users];
  }

  public getUserById(userId: string) {
    return this.snapshot.users.find((u) => u.id === userId);
  }

  public async register(
    email: string,
    password: string,
    fullName: string,
    phone: string,
    experienceLevel: ExperienceLevel,
    avatar?: string
  ) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) return { success: false, error: 'יש להזין כתובת מייל תקינה' };
    const pwCheck = validatePasswordComplexity(password);
    if (!pwCheck.valid) return { success: false, error: pwCheck.error };
    if (!fullName.trim()) return { success: false, error: 'יש להזין שם מלא' };
    if (!phone.trim()) return { success: false, error: 'יש להזין מספר טלפון' };

    const { data, error } = await this.sb.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          experience_level: experienceLevel,
          ...(avatar ? { avatar_url: avatar } : {}),
        },
      },
    });
    if (error) return { success: false, error: authErrorMessage(error.message) };
    // With email confirmation on, Supabase hides existing accounts by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      return { success: false, error: 'כתובת מייל זו כבר רשומה במערכת' };
    }
    if (!data.session) {
      return { success: true, needsEmailConfirmation: true };
    }
    await this.refresh();
    return { success: true, user: this.getCurrentUser() ?? undefined };
  }

  public async joinWithInvite(inviteCode: string, details: JoinDetails) {
    const email = details.email.trim().toLowerCase();
    if (!email.includes('@')) return { success: false, error: 'יש להזין כתובת מייל תקינה' };
    const pwCheck = validatePasswordComplexity(details.password);
    if (!pwCheck.valid) return { success: false, error: pwCheck.error };
    if (!details.fullName.trim()) return { success: false, error: 'יש להזין שם מלא' };
    if (!details.phone.trim()) return { success: false, error: 'יש להזין מספר טלפון' };

    const r = await this.callFunction({ action: 'join_with_invite', code: inviteCode, ...details, email });
    if (!r.success) return { success: false, error: (r.message as string) || 'ההרשמה נכשלה' };
    return this.login(email, details.password);
  }

  public getInviteCode() {
    return this.snapshot.inviteCode;
  }

  public async regenerateInviteCode(): Promise<Result> {
    const r = await this.rpc('regenerate_invite_code', {});
    return { success: Boolean(r.success), error: r.message };
  }

  public async requestPasswordHelp(email: string): Promise<Result> {
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) return { success: false, error: 'יש להזין כתובת מייל תקינה' };
    const r = await this.callFunction({ action: 'request_password_help', email: clean });
    return r.success ? { success: true } : { success: false, error: (r.message as string) || 'שליחת הבקשה נכשלה' };
  }

  public async login(identifier: string, password: string) {
    const email = identifier.trim().toLowerCase();
    if (!email.includes('@')) {
      return { success: false, error: 'יש להתחבר עם כתובת המייל שאיתה נרשמת' };
    }
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: authErrorMessage(error.message) };
    await this.refresh();
    const user = this.getCurrentUser();
    return user ? { success: true, user } : { success: false, error: 'לא נמצא פרופיל חבר עבור חשבון זה' };
  }

  public async logout() {
    await this.sb.auth.signOut();
    this.passwordRecovery = false;
    await this.refresh();
  }

  public async requestPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    if (error) return { success: false, error: authErrorMessage(error.message) };
    return { success: true };
  }

  public isPasswordRecovery() {
    return this.passwordRecovery;
  }

  public async resetPassword(email: string, code: string, newPassword: string): Promise<Result> {
    const pwCheck = validatePasswordComplexity(newPassword);
    if (!pwCheck.valid) return { success: false, error: pwCheck.error };

    // Opening the emailed link already signs the user in with a recovery session; otherwise verify the code.
    if (!this.passwordRecovery) {
      const { error } = await this.sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'recovery' });
      if (error) return { success: false, error: authErrorMessage(error.message) };
    }
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: authErrorMessage(error.message) };

    this.passwordRecovery = false;
    await this.sb.auth.signOut();
    await this.refresh();
    return { success: true };
  }

  /** Calls the admin-actions Edge Function without reloading (also used signed out). */
  private async callFunction(body: Row): Promise<Row> {
    const { data, error } = await this.sb.functions.invoke('admin-actions', { body });
    if (error) {
      // Non-2xx responses still carry our { success, message } JSON in the response body.
      const payload = await (error as any).context?.json?.().catch(() => null);
      return payload ?? { success: false, message: error.message };
    }
    return (data as Row) ?? { success: false, message: 'תשובה ריקה מהשרת' };
  }

  /** Calls the admin-actions Edge Function (service-role operations guarded by a staff check). */
  private async adminAction(body: Row): Promise<Row> {
    const r = await this.callFunction(body);
    await this.refresh();
    return r;
  }

  public async changePassword(newPassword: string): Promise<Result> {
    const pwCheck = validatePasswordComplexity(newPassword);
    if (!pwCheck.valid) return { success: false, error: pwCheck.error };
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    return error ? { success: false, error: authErrorMessage(error.message) } : { success: true };
  }

  public async createMember(member: NewMember) {
    const r = await this.adminAction({ action: 'create_member', ...member });
    return r.success
      ? { success: true, email: r.email as string, temporaryPassword: r.temporaryPassword as string }
      : { success: false, error: (r.message as string) || 'הוספת החבר נכשלה' };
  }

  public async resetMemberPassword(userId: string) {
    const r = await this.adminAction({ action: 'reset_member_password', userId });
    return r.success
      ? { success: true, email: r.email as string, temporaryPassword: r.temporaryPassword as string }
      : { success: false, error: (r.message as string) || 'איפוס הסיסמה נכשל' };
  }

  public async deleteUser(userId: string): Promise<Result> {
    const r = await this.adminAction({ action: 'delete_member', userId });
    return { success: Boolean(r.success), error: r.message };
  }

  public async updateUserQualification(userId: string, newLevel: ExperienceLevel) {
    return this.rpcOk('set_member_qualification', { p_user_id: userId, p_level: newLevel });
  }

  public async approveMember(userId: string) {
    return this.rpcOk('approve_member', { p_user_id: userId });
  }

  public async rejectMember(userId: string) {
    return this.rpcOk('reject_member', { p_user_id: userId });
  }

  public async toggleMemberRole(userId: string, newRole: UserRole): Promise<Result> {
    const r = await this.rpc('set_member_role', { p_user_id: userId, p_role: newRole });
    return { success: r.success, error: r.message };
  }

  public async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<Result> {
    const row: Row = {};
    if (updates.fullName !== undefined) row.full_name = updates.fullName;
    if (updates.phone !== undefined) row.phone = updates.phone;
    if (updates.avatar !== undefined) row.avatar_url = updates.avatar;
    if (updates.experienceLevel !== undefined) row.experience_level = updates.experienceLevel;
    const ok = await this.write(this.sb.from('profiles').update(row).eq('id', userId));
    return ok ? { success: true } : { success: false, error: this.lastError ?? undefined };
  }

  public async setMyAvatar(imageDataUrl: string | null): Promise<Result> {
    const uid = this.currentUserId;
    if (!uid) return { success: false, error: 'יש להתחבר תחילה' };
    let avatarUrl: string | null = null;
    if (imageDataUrl) {
      const blob = await (await fetch(imageDataUrl)).blob();
      const path = `${uid}/avatar.jpg`;
      const { error } = await this.sb.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (error) return { success: false, error: `העלאת התמונה נכשלה: ${error.message}` };
      // The version parameter makes every device fetch the new photo instead of a cached one
      avatarUrl = `${this.sb.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    }
    const ok = await this.write(this.sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', uid));
    return ok ? { success: true } : { success: false, error: this.lastError ?? undefined };
  }

  public async updateMemberCredits(userId: string, changeAmount: number, reason: string) {
    const r = await this.rpc('update_member_credits', { p_user_id: userId, p_delta: changeAmount, p_reason: reason });
    return { success: r.success, newCredits: r.new_credits ?? 0 };
  }

  // --- Credit requests ---

  public getCreditRequests() {
    return [...this.snapshot.creditRequests];
  }

  public async requestCredits(amount: number, note: string): Promise<Result> {
    const r = await this.rpc('request_credits', { p_amount: Math.floor(amount), p_note: note });
    return { success: Boolean(r.success), error: r.message };
  }

  public async resolveCreditRequest(requestId: string, approve: boolean, amount?: number): Promise<Result> {
    const r = await this.rpc('resolve_credit_request', {
      p_request_id: requestId,
      p_approve: approve,
      p_amount: approve && amount !== undefined ? Math.floor(amount) : null,
    });
    return { success: Boolean(r.success), error: r.message };
  }

  // --- Sails & registrations ---

  public getSails() {
    return [...this.snapshot.sails].sort(
      (a, b) => new Date(a.date + 'T' + a.departureTime).getTime() - new Date(b.date + 'T' + b.departureTime).getTime()
    );
  }

  public getSailById(sailId: string) {
    return this.snapshot.sails.find((s) => s.id === sailId);
  }

  public getRegistrations(sailId?: string) {
    if (sailId) return this.snapshot.registrations.filter((r) => r.sailId === sailId && r.status !== 'cancelled');
    return [...this.snapshot.registrations];
  }

  public getConfirmedParticipants(sailId: string) {
    return this.snapshot.registrations
      .filter((r) => r.sailId === sailId && r.status === 'confirmed')
      .map((r) => this.getUserById(r.userId))
      .filter((u): u is UserProfile => Boolean(u));
  }

  public getWaitlistParticipants(sailId: string) {
    return this.snapshot.registrations
      .filter((r) => r.sailId === sailId && r.status === 'waitlist')
      .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
      .map((r) => {
        const user = this.getUserById(r.userId);
        return user ? { user, position: r.waitlistPosition ?? 1 } : null;
      })
      .filter((x): x is { user: UserProfile; position: number } => Boolean(x));
  }

  public getUserRegistrationForSail(sailId: string, userId: string) {
    return this.snapshot.registrations.find((r) => r.sailId === sailId && r.userId === userId && r.status !== 'cancelled');
  }

  public async createSail(sailData: Omit<Sail, 'id' | 'createdAt' | 'photos'>): Promise<Sail> {
    const r = await this.rpc('create_sail', { p_sail: sailData });
    const sail = r.success ? this.getSailById(r.sail_id) : undefined;
    if (!sail) throw new Error(r.message || 'שגיאה ביצירת ההפלגה');
    return sail;
  }

  public async editSail(sailId: string, updates: Partial<Sail>) {
    return this.write(this.sb.from('sails').update(sailToRow(updates)).eq('id', sailId));
  }

  public async cancelSail(sailId: string, reason: string) {
    return this.rpcOk('cancel_sail', { p_sail_id: sailId, p_reason: reason });
  }

  public async joinSail(sailId: string) {
    const r = await this.rpc('join_sail', { p_sail_id: sailId });
    return { success: r.success, status: (r.status ?? 'confirmed') as 'confirmed' | 'waitlist', message: r.message };
  }

  public async cancelRegistration(sailId: string, userId: string) {
    // The server decides whether the cancellation window applies (admins bypass it).
    const r = await this.rpc('cancel_registration', { p_sail_id: sailId, p_user_id: userId });
    return { success: r.success, message: r.message, promotedUserId: r.promoted_user_id ?? undefined };
  }

  public async addParticipantManually(sailId: string, userId: string): Promise<MessageResult> {
    const r = await this.rpc('add_participant', { p_sail_id: sailId, p_user_id: userId });
    return { success: r.success, message: r.message };
  }

  public async removeParticipantManually(sailId: string, userId: string): Promise<MessageResult> {
    return this.cancelRegistration(sailId, userId);
  }

  public async addSailPhoto(sailId: string, photoUrl: string, caption: string, uploaderId: string) {
    return this.write(
      this.sb.from('sail_photos').insert({ sail_id: sailId, user_id: uploaderId, photo_url: photoUrl, caption: caption || null })
    );
  }

  // --- Community feed ---

  public getPosts() {
    return [...this.snapshot.posts].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public async createPost(
    authorId: string,
    content: string,
    images: string[] = [],
    linkPreview?: ClubPost['linkPreview'],
    sailId?: string
  ) {
    const { data, error } = await this.sb
      .from('posts')
      .insert({ author_id: authorId, content, images, link_preview: linkPreview ?? null, sail_id: sailId ?? null })
      .select('id')
      .single();
    if (error) {
      this.reportError(error.message);
      return null;
    }
    await this.refresh();
    return this.snapshot.posts.find((p) => p.id === data.id) ?? null;
  }

  public async togglePostLike(postId: string, userId: string) {
    const post = this.snapshot.posts.find((p) => p.id === postId);
    if (!post) return false;
    if (post.likes.includes(userId)) {
      return this.write(this.sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId));
    }
    return this.write(this.sb.from('post_likes').insert({ post_id: postId, user_id: userId }));
  }

  public async addPostComment(postId: string, userId: string, content: string) {
    if (!content.trim()) return false;
    return this.write(this.sb.from('post_comments').insert({ post_id: postId, author_id: userId, content: content.trim() }));
  }

  public async togglePinPost(postId: string) {
    const post = this.snapshot.posts.find((p) => p.id === postId);
    if (!post) return false;
    return this.write(this.sb.from('posts').update({ is_pinned: !post.isPinned }).eq('id', postId));
  }

  public async deletePost(postId: string) {
    return this.write(this.sb.from('posts').delete().eq('id', postId));
  }

  // --- Notifications ---

  public getNotifications(userId: string) {
    return this.snapshot.notifications.filter((n) => n.userId === userId);
  }

  public async markNotificationAsRead(notifId: string) {
    await this.write(this.sb.from('notifications').update({ read: true }).eq('id', notifId));
  }

  public async markAllNotificationsAsRead(userId: string) {
    await this.write(this.sb.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false));
  }

  // --- Settings ---

  public getSettings() {
    return { ...this.snapshot.settings };
  }

  public async updateSettings(settings: Partial<ClubSettings>) {
    const row: Row = { updated_at: new Date().toISOString() };
    if (settings.clubName !== undefined) row.club_name = settings.clubName;
    if (settings.logoUrl !== undefined) row.logo_url = settings.logoUrl;
    if (settings.defaultMaxParticipants !== undefined) row.default_max_participants = settings.defaultMaxParticipants;
    if (settings.whoCanCreateSails !== undefined) row.who_can_create_sails = settings.whoCanCreateSails;
    if (settings.cancellationDeadlineHours !== undefined) row.cancellation_deadline_hours = settings.cancellationDeadlineHours;
    if (settings.experienceLevels !== undefined) row.experience_levels = settings.experienceLevels;
    await this.write(this.sb.from('club_settings').update(row).eq('id', 1));
  }

  public async renameExperienceLevel(oldName: string, newName: string): Promise<Result> {
    const r = await this.rpc('rename_experience_level', { p_old: oldName, p_new: newName });
    return { success: Boolean(r.success), error: r.message };
  }

  // --- Boats & issues ---

  public getBoats() {
    return [...this.snapshot.boats];
  }

  public getBoatById(boatId: string) {
    return this.snapshot.boats.find((b) => b.id === boatId);
  }

  public async createBoat(boatData: Omit<Boat, 'id' | 'createdAt'>) {
    const { data, error } = await this.sb.from('boats').insert(boatToRow(boatData)).select('id').single();
    if (error) {
      this.reportError(error.message);
      return null;
    }
    await this.refresh();
    return this.getBoatById(data.id) ?? null;
  }

  public async updateBoat(boatId: string, updates: Partial<Boat>) {
    return this.write(this.sb.from('boats').update(boatToRow(updates)).eq('id', boatId));
  }

  public async deleteBoat(boatId: string) {
    return this.write(this.sb.from('boats').delete().eq('id', boatId));
  }

  public getBoatIssues() {
    return [...this.snapshot.boatIssues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async reportBoatIssue(issueData: Omit<BoatIssue, 'id' | 'createdAt' | 'status'>) {
    const r = await this.rpc('report_boat_issue', {
      p_boat_id: issueData.boatId,
      p_title: issueData.title,
      p_description: issueData.description,
      p_category: issueData.category,
      p_severity: issueData.severity,
      p_photo_url: issueData.photoUrl ?? null,
    });
    if (!r.success) {
      this.reportError(r.message);
      return null;
    }
    return this.snapshot.boatIssues.find((i) => i.id === r.issue_id) ?? null;
  }

  public async updateBoatIssueStatus(issueId: string, status: IssueStatus, adminNotes?: string) {
    return this.rpcOk('update_boat_issue_status', {
      p_issue_id: issueId,
      p_status: status,
      p_admin_notes: adminNotes ?? null,
    });
  }

  public async resetToSeed() {
    const r = await this.adminAction({ action: 'reset_club_activity' });
    if (!r.success) this.reportError(r.message || 'האיפוס נכשל');
  }
}
