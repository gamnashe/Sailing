import {
  UserProfile,
  Sail,
  SailRegistration,
  ClubPost,
  AppNotification,
  ClubSettings,
  SailPhoto,
  UserRole,
  UserStatus,
  SailStatus,
  SailType,
  Boat,
  BoatStatus,
  BoatIssue,
  IssueSeverity,
  IssueStatus,
  ExperienceLevel,
  PasswordResetToken,
  CreditRequest,
  NotificationType,
} from '../types';
import { DEFAULT_EXPERIENCE_LEVELS, isStaff } from '../types';
import type { DataStore, JoinDetails, NewMember, Result } from './dataStore';
import { validatePasswordComplexity, findBoatConflict, mayTakeBoat, boatConflictMessage, sailUsesBoat } from './sailRules';

// Using v2 clean storage key to clear out old test mock clutter
const STORAGE_KEY = 'sailing_club_v2_clean';
const CURRENT_USER_KEY = 'sailing_club_current_user_id';

interface AppData {
  users: UserProfile[];
  passwords: Record<string, string>; // userId -> password
  sails: Sail[];
  registrations: SailRegistration[];
  posts: ClubPost[];
  notifications: AppNotification[];
  settings: ClubSettings;
  boats: Boat[];
  boatIssues: BoatIssue[];
  resetTokens: PasswordResetToken[];
  /** Missing in data saved before these features existed. */
  creditRequests?: CreditRequest[];
  inviteCode?: string;
}

const DEFAULT_INVITE_CODE = 'demo-join';
const newId = (prefix: string) => prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

// Initial clean settings
const INITIAL_SETTINGS: ClubSettings = {
  clubName: 'מועדון שייט גלי ים',
  logoUrl: '/icon.svg',
  defaultMaxParticipants: 6,
  whoCanCreateSails: 'all_members',
  cancellationDeadlineHours: 12,
  experienceLevels: DEFAULT_EXPERIENCE_LEVELS,
};

// Clean initial admin user
const INITIAL_USERS: UserProfile[] = [
  {
    id: 'u1',
    email: 'admin@sailingclub.co.il',
    username: 'yossi',
    fullName: 'יוסי כהן',
    phone: '050-1234567',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    experienceLevel: 'משיט 60 (סקיפר בינלאומי)',
    role: 'admin',
    status: 'approved',
    joinedAt: '2025-01-01T10:00:00.000Z',
    credits: 20,
  }
];

const INITIAL_PASSWORDS: Record<string, string> = {
  u1: 'Admin1234!', // Complex password satisfying >= 8 chars, letters and numbers
};

export const INITIAL_BOATS: Boat[] = [
  {
    id: 'boat-1',
    name: 'גלית',
    model: 'Bavaria 38 Cruiser',
    status: 'available',
    statusNotes: 'תקינה לחלוטין ומוכנה להפלגות מועדון ופרטיות',
    berthLocation: 'מרינה הרצליה, רציף B',
    year: 2021,
    capacity: 8,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'boat-2',
    name: 'רוח ים',
    model: 'Beneteau Oceanis 41',
    status: 'available',
    statusNotes: 'מאובזרת ומתוחזקת',
    berthLocation: 'מרינה תל אביב, רציף ראשי',
    year: 2022,
    capacity: 10,
    createdAt: '2024-02-15T00:00:00Z',
  },
  {
    id: 'boat-3',
    name: 'אלת הים',
    model: 'Jeanneau Sun Odyssey 349',
    status: 'maintenance',
    statusNotes: 'בהספנה שנתית - טיפול מנוע ואנטי-פאולינג',
    berthLocation: 'מרינה הרצליה, מספנה רציף C',
    year: 2020,
    capacity: 6,
    createdAt: '2024-03-01T00:00:00Z',
  },
];

function triggerWebNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/icon.svg',
          badge: '/pwa-192x192.png',
        });
      } catch {
        // ignore
      }
    }
  }
}

/** Demo-mode data store: all data lives in this browser's localStorage. */
export class LocalStore implements DataStore {
  public readonly mode = 'local' as const;
  private data: AppData;
  private listeners: Set<() => void> = new Set();
  private currentUserId: string | null = null;
  /** Set while an admin adds a member, so register() does not sign the new member in. */
  private addingMember = false;

  constructor() {
    this.data = this.loadData();
    const savedUserId = typeof localStorage !== 'undefined' ? localStorage.getItem(CURRENT_USER_KEY) : null;
    if (savedUserId && this.data.users.some(u => u.id === savedUserId)) {
      this.currentUserId = savedUserId;
    }
  }

  public isLoading(): boolean {
    return false;
  }

  public getLastError(): string | null {
    return null;
  }

  public clearLastError() {}

  public async refresh() {
    this.notify();
  }

  public isPasswordRecovery(): boolean {
    return false;
  }

  public async logout() {
    this.currentUserId = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
    this.notify();
  }

  private loadData(): AppData {
    if (typeof localStorage === 'undefined') {
      return {
        users: INITIAL_USERS,
        passwords: INITIAL_PASSWORDS,
        sails: [],
        registrations: [],
        posts: [],
        notifications: [],
        settings: INITIAL_SETTINGS,
        boats: INITIAL_BOATS,
        boatIssues: [],
        resetTokens: [],
      };
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      console.warn('Could not read from localStorage, using fresh initial data');
    }

    const fresh: AppData = {
      users: INITIAL_USERS,
      passwords: INITIAL_PASSWORDS,
      sails: [],
      registrations: [],
      posts: [],
      notifications: [],
      settings: INITIAL_SETTINGS,
      boats: INITIAL_BOATS,
      boatIssues: [],
      resetTokens: [],
    };
    this.saveData(fresh);
    return fresh;
  }

  private saveData(data: AppData) {
    this.data = data;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (err) {
        console.error('Failed to save to localStorage:', err);
      }
    }
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // --- Auth & Users ---
  public getCurrentUser(): UserProfile | null {
    return this.data.users.find(u => u.id === this.currentUserId) || null;
  }

  public setCurrentUser(userId: string) {
    const user = this.data.users.find(u => u.id === userId);
    if (user) {
      this.currentUserId = userId;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CURRENT_USER_KEY, userId);
      }
      this.notify();
    }
  }

  public getUsers(): UserProfile[] {
    return [...this.data.users];
  }

  public getUserById(userId: string): UserProfile | undefined {
    return this.data.users.find(u => u.id === userId);
  }

  public async register(
    email: string,
    password: string,
    fullName: string,
    phone: string,
    experienceLevel: ExperienceLevel,
    avatar?: string
  ): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'יש להזין כתובת מייל תקינה' };
    }

    const pwCheck = validatePasswordComplexity(password);
    if (!pwCheck.valid) {
      return { success: false, error: pwCheck.error };
    }

    if (!fullName.trim()) return { success: false, error: 'יש להזין שם מלא' };
    if (!phone.trim()) return { success: false, error: 'יש להזין מספר טלפון' };

    if (this.data.users.some(u => u.email === cleanEmail)) {
      return { success: false, error: 'כתובת מייל זו כבר רשומה במערכת' };
    }

    const isFirstUser = this.data.users.length === 0;
    const username = cleanEmail.split('@')[0];

    const newUser: UserProfile = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      email: cleanEmail,
      username,
      fullName: fullName.trim(),
      phone: phone.trim(),
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
      experienceLevel,
      role: isFirstUser ? 'admin' : 'member',
      status: isFirstUser ? 'approved' : 'pending',
      joinedAt: new Date().toISOString(),
      credits: isFirstUser ? 20 : 5,
    };

    const newUsers = [...this.data.users, newUser];
    const newPasswords = { ...this.data.passwords, [newUser.id]: password };

    // Notify the managers (admins and assistants) about the pending user
    const newNotifications = [...this.data.notifications];
    if (!isFirstUser) {
      this.data.users.filter(u => isStaff(u.role) && u.status === 'approved').forEach(admin => {
        newNotifications.unshift({
          id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          userId: admin.id,
          type: 'member_request',
          title: 'בקשת הצטרפות חדשה למועדון',
          message: `${newUser.fullName} (${newUser.email}) נרשם וממתין לאישורך.`,
          read: false,
          createdAt: new Date().toISOString(),
        });
      });
    }

    this.saveData({
      ...this.data,
      users: newUsers,
      passwords: newPasswords,
      notifications: newNotifications,
    });

    if (!this.addingMember) this.setCurrentUser(newUser.id);
    return { success: true, user: newUser };
  }

  public async joinWithInvite(inviteCode: string, details: JoinDetails) {
    if (inviteCode !== (this.data.inviteCode ?? DEFAULT_INVITE_CODE)) {
      return { success: false, error: 'קישור ההצטרפות אינו בתוקף. בקש מהנהלת המועדון קישור חדש.' };
    }
    return this.register(details.email, details.password, details.fullName, details.phone, details.experienceLevel);
  }

  public getInviteCode() {
    return isStaff(this.getCurrentUser()?.role) ? this.data.inviteCode ?? DEFAULT_INVITE_CODE : null;
  }

  public async regenerateInviteCode(): Promise<Result> {
    if (!isStaff(this.getCurrentUser()?.role)) return { success: false, error: 'פעולה זו מותרת לצוות ההנהלה בלבד' };
    this.saveData({ ...this.data, inviteCode: Math.random().toString(36).slice(2, 12) });
    return { success: true };
  }

  /** Adds notifications for the given users (newest first). */
  private withNotifications(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    targetId?: string
  ): AppNotification[] {
    const created = userIds.map(userId => ({
      id: newId('notif'),
      userId,
      type,
      title,
      message,
      targetId,
      read: false,
      createdAt: new Date().toISOString(),
    }));
    return [...created, ...this.data.notifications];
  }

  public async requestPasswordHelp(email: string): Promise<Result> {
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) return { success: false, error: 'יש להזין כתובת מייל תקינה' };
    const user = this.data.users.find(u => u.email === clean);
    if (!user || user.status === 'rejected') return { success: true };
    // Assistants may only reset regular members' passwords
    const helpers = this.data.users.filter(
      u => u.id !== user.id && u.status === 'approved' && (u.role === 'admin' || (u.role === 'assistant' && user.role === 'member'))
    );
    this.saveData({
      ...this.data,
      notifications: this.withNotifications(
        helpers.map(h => h.id),
        'password_help',
        '🔑 בקשה לאיפוס סיסמה',
        `${user.fullName} (${user.email}) שכח/ה את הסיסמה ומבקש/ת סיסמה זמנית חדשה.`,
        user.id
      ),
    });
    return { success: true };
  }

  public async login(identifier: string, password: string): Promise<{ success: boolean; error?: string; user?: UserProfile }> {
    const cleanId = identifier.trim().toLowerCase();
    const user = this.data.users.find(u => u.email === cleanId || u.username === cleanId);
    if (!user) {
      return { success: false, error: 'כתובת מייל או סיסמה שגויים' };
    }

    const storedPass = this.data.passwords[user.id] || this.data.passwords[user.username];
    if (storedPass !== password) {
      return { success: false, error: 'כתובת מייל או סיסמה שגויים' };
    }

    this.setCurrentUser(user.id);
    return { success: true, user };
  }

  // --- Password Reset via Email ---
  public async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string; resetCode?: string; resetLink?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.data.users.find(u => u.email === cleanEmail);
    if (!user) {
      return { success: false, error: 'לא נמצא משתמש המשויך לכתובת מייל זו' };
    }

    const token = 'rst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 minutes

    const newTokens = [
      ...this.data.resetTokens.filter(t => t.email !== cleanEmail),
      { token, email: cleanEmail, code, expiresAt },
    ];

    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://sailingclub.co.il';
    const resetLink = `${origin}/#reset=${token}`;

    this.saveData({
      ...this.data,
      resetTokens: newTokens,
    });

    return {
      success: true,
      resetCode: code,
      resetLink,
    };
  }

  public async resetPassword(_email: string, tokenOrCode: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const pwCheck = validatePasswordComplexity(newPassword);
    if (!pwCheck.valid) {
      return { success: false, error: pwCheck.error };
    }

    const item = this.data.resetTokens.find(
      t => (t.token === tokenOrCode || t.code === tokenOrCode) && new Date(t.expiresAt) > new Date()
    );

    if (!item) {
      return { success: false, error: 'קוד האיפוס או הקישור פג תוקף או אינו תקין' };
    }

    const user = this.data.users.find(u => u.email === item.email);
    if (!user) return { success: false, error: 'משתמש לא נמצא' };

    const newPasswords = { ...this.data.passwords, [user.id]: newPassword };
    const remainingTokens = this.data.resetTokens.filter(t => t.email !== item.email);

    this.saveData({
      ...this.data,
      passwords: newPasswords,
      resetTokens: remainingTokens,
    });

    return { success: true };
  }

  public async changePassword(newPassword: string): Promise<Result> {
    const pwCheck = validatePasswordComplexity(newPassword);
    if (!pwCheck.valid) return { success: false, error: pwCheck.error };
    if (!this.currentUserId) return { success: false, error: 'יש להתחבר תחילה' };
    this.saveData({ ...this.data, passwords: { ...this.data.passwords, [this.currentUserId]: newPassword } });
    return { success: true };
  }

  public async createMember(member: NewMember) {
    const temporaryPassword = 'Sail' + Math.floor(100000 + Math.random() * 900000);
    this.addingMember = true;
    const res = await this.register(member.email, temporaryPassword, member.fullName, member.phone || '-', member.experienceLevel).finally(() => {
      this.addingMember = false;
    });
    if (!res.success || !res.user) return { success: false, error: res.error };
    const users = this.data.users.map(u =>
      u.id === res.user!.id ? { ...u, status: 'approved' as UserStatus, credits: Math.max(0, member.credits) } : u
    );
    this.saveData({ ...this.data, users });
    return { success: true, email: res.user.email, temporaryPassword };
  }

  public async resetMemberPassword(userId: string) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'משתמש לא נמצא' };
    const temporaryPassword = 'Sail' + Math.floor(100000 + Math.random() * 900000);
    this.saveData({ ...this.data, passwords: { ...this.data.passwords, [userId]: temporaryPassword } });
    return { success: true, email: user.email, temporaryPassword };
  }

  public async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'משתמש לא נמצא' };

    // Safeguard: Cannot delete the last admin!
    if (user.role === 'admin') {
      const adminCount = this.data.users.filter(u => u.role === 'admin' && u.status === 'approved').length;
      if (adminCount <= 1) {
        return { success: false, error: 'לא ניתן למחוק את המנהל האחרון במערכת!' };
      }
    }

    const newUsers = this.data.users.filter(u => u.id !== userId);
    const newRegs = this.data.registrations.filter(r => r.userId !== userId);
    const newPosts = this.data.posts.filter(p => p.authorId !== userId);
    const newNotifs = this.data.notifications.filter(n => n.userId !== userId);

    this.saveData({
      ...this.data,
      users: newUsers,
      registrations: newRegs,
      posts: newPosts,
      notifications: newNotifs,
    });

    if (this.currentUserId === userId) {
      await this.logout();
    }

    return { success: true };
  }

  public async updateUserQualification(userId: string, newLevel: ExperienceLevel): Promise<boolean> {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;

    const updatedUsers = this.data.users.map(u => (u.id === userId ? { ...u, experienceLevel: newLevel } : u));
    const newNotifications = [
      {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId,
        type: 'member_approved' as const,
        title: '🎖️ עודכנה רמת הסמכת השייט שלך',
        message: `הנהלת המועדון עדכנה את רמת הסמכתך ל: ${newLevel}.`,
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...this.data.notifications,
    ];

    this.saveData({
      ...this.data,
      users: updatedUsers,
      notifications: newNotifications,
    });
    return true;
  }

  public async approveMember(userId: string): Promise<boolean> {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;

    const updatedUsers = this.data.users.map(u => (u.id === userId ? { ...u, status: 'approved' as UserStatus } : u));
    const newNotifications = [
      {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId,
        type: 'member_approved' as const,
        title: 'ברוך הבא למועדון השייט! 🎉',
        message: 'הנהלת המועדון אישרה את חברותך. כעת באפשרותך להצטרף להפלגות ולפרסם בפיד.',
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...this.data.notifications,
    ];

    this.saveData({
      ...this.data,
      users: updatedUsers,
      notifications: newNotifications,
    });
    return true;
  }

  public async rejectMember(userId: string): Promise<boolean> {
    const updatedUsers = this.data.users.map(u => (u.id === userId ? { ...u, status: 'rejected' as UserStatus } : u));
    this.saveData({ ...this.data, users: updatedUsers });
    return true;
  }

  public async toggleMemberRole(userId: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'משתמש לא נמצא' };

    if (user.role === 'admin' && newRole !== 'admin') {
      const adminCount = this.data.users.filter(u => u.role === 'admin' && u.status === 'approved').length;
      if (adminCount <= 1) {
        return { success: false, error: 'לא ניתן להוריד מנהל זה: חייב להישאר לפחות מנהל אחד פעיל במועדון!' };
      }
    }

    const updatedUsers = this.data.users.map(u => (u.id === userId ? { ...u, role: newRole } : u));
    this.saveData({ ...this.data, users: updatedUsers });
    return { success: true };
  }

  public async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<Result> {
    const updatedUsers = this.data.users.map(u => (u.id === userId ? { ...u, ...updates } : u));
    this.saveData({ ...this.data, users: updatedUsers });
    return { success: true };
  }

  public async setMyAvatar(imageDataUrl: string | null): Promise<Result> {
    const me = this.getCurrentUser();
    if (!me) return { success: false, error: 'יש להתחבר תחילה' };
    const avatar = imageDataUrl ?? `https://api.dicebear.com/7.x/bottts/svg?seed=${me.username}`;
    this.saveData({ ...this.data, users: this.data.users.map(u => (u.id === me.id ? { ...u, avatar } : u)) });
    return { success: true };
  }

  public async updateMemberCredits(
    userId: string,
    changeAmount: number,
    reason: string,
    adminName: string
  ): Promise<{ success: boolean; newCredits: number }> {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, newCredits: 0 };

    const newCredits = Math.max(0, (user.credits || 0) + changeAmount);
    const updatedUsers = this.data.users.map(u => (u.id === userId ? { ...u, credits: newCredits } : u));

    const newNotifications = [
      {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId,
        type: 'credit_update' as const,
        title: changeAmount >= 0 ? `🪙 נוספו לך ${changeAmount} נקודות קרדיט!` : `🪙 הופחתו ${Math.abs(changeAmount)} נקודות קרדיט`,
        message: `${adminName} עדכן/ה את מאזן הקרדיטים שלך. ${reason ? `סיבה: ${reason}. ` : ''}יתרה עדכנית: ${newCredits} קרדיטים.`,
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...this.data.notifications,
    ];

    this.saveData({
      ...this.data,
      users: updatedUsers,
      notifications: newNotifications,
    });
    return { success: true, newCredits };
  }

  // --- Sails & Registrations ---
  public getSails(): Sail[] {
    return [...this.data.sails].sort((a, b) => {
      return new Date(a.date + 'T' + a.departureTime).getTime() - new Date(b.date + 'T' + b.departureTime).getTime();
    });
  }

  public getSailById(sailId: string): Sail | undefined {
    return this.data.sails.find(s => s.id === sailId);
  }

  public getRegistrations(sailId?: string): SailRegistration[] {
    if (sailId) {
      return this.data.registrations.filter(r => r.sailId === sailId && r.status !== 'cancelled');
    }
    return [...this.data.registrations];
  }

  public getConfirmedParticipants(sailId: string): UserProfile[] {
    const confirmedRegs = this.data.registrations.filter(r => r.sailId === sailId && r.status === 'confirmed');
    return confirmedRegs
      .map(r => this.data.users.find(u => u.id === r.userId))
      .filter((u): u is UserProfile => Boolean(u));
  }

  public getWaitlistParticipants(sailId: string): Array<{ user: UserProfile; position: number }> {
    const waitlistRegs = this.data.registrations
      .filter(r => r.sailId === sailId && r.status === 'waitlist')
      .sort((a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));

    return waitlistRegs
      .map(r => {
        const u = this.data.users.find(user => user.id === r.userId);
        return u ? { user: u, position: r.waitlistPosition || 1 } : null;
      })
      .filter((item): item is { user: UserProfile; position: number } => Boolean(item));
  }

  public getUserRegistrationForSail(sailId: string, userId: string): SailRegistration | undefined {
    return this.data.registrations.find(r => r.sailId === sailId && r.userId === userId && r.status !== 'cancelled');
  }

  public async createSail(sailData: Omit<Sail, 'id' | 'createdAt' | 'photos'>): Promise<Sail> {
    // Same booking rules as create_sail in schema.sql: no overlapping sails per boat, and only
    // permitted skippers (club sail) / openers (private sail) on a restricted boat.
    const boat =
      this.data.boats.find(b => b.id === sailData.boatId) ??
      this.data.boats.find(b => sailUsesBoat({ ...sailData, id: '', boatId: undefined } as Sail, b));
    if (boat) {
      const conflict = findBoatConflict(this.data.sails, boat, sailData.date, sailData.departureTime, sailData.estimatedReturnTime);
      if (conflict) throw new Error(boatConflictMessage(conflict, boat.name));
      const takerId = sailData.sailType === 'private' ? sailData.createdBy : sailData.skipperId;
      const restricted = (boat.allowedLevels?.length ?? 0) > 0 || (boat.allowedMemberIds?.length ?? 0) > 0;
      if (takerId ? !mayTakeBoat(boat, this.data.users.find(u => u.id === takerId)) : restricted && this.getUserById(sailData.createdBy)?.role === 'member') {
        throw new Error(
          sailData.sailType === 'private'
            ? `אין לך הרשאה להוציא את ${boat.name}. פנה להנהלת המועדון.`
            : `הסקיפר שנבחר אינו מורשה להוציא את ${boat.name}.`
        );
      }
    }

    const newSail: Sail = {
      ...sailData,
      boatId: boat?.id ?? sailData.boatId,
      id: 'sail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: new Date().toISOString(),
      photos: [],
    };

    let newUsers = this.data.users;
    let newRegistrations = [...this.data.registrations];

    // If private sail: creator books the boat and pays creditCost
    if (newSail.sailType === 'private') {
      const creator = newUsers.find(u => u.id === newSail.createdBy);
      const cost = newSail.creditCost;
      newUsers = newUsers.map(u =>
        u.id === newSail.createdBy ? { ...u, credits: Math.max(0, (u.credits || 0) - cost) } : u
      );

      newRegistrations.push({
        id: 'reg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        sailId: newSail.id,
        userId: newSail.createdBy,
        status: 'confirmed',
        creditsCharged: cost,
        registeredAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      });
    } else {
      // Club sail: if skipper is a member, register skipper (skippers on club sail usually sail free or 1 credit)
      if (newSail.skipperId) {
        newRegistrations.push({
          id: 'reg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          sailId: newSail.id,
          userId: newSail.skipperId,
          status: 'confirmed',
          creditsCharged: 0,
          registeredAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
        });
      }
    }

    const newNotifications = [...this.data.notifications];
    this.data.users.filter(u => u.status === 'approved' && u.id !== newSail.createdBy).forEach(member => {
      newNotifications.unshift({
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId: member.id,
        type: 'new_sail',
        title: `⛵ ${newSail.sailType === 'private' ? 'הפלגה פרטית' : 'הפלגת מועדון'} נפתחה!`,
        message: `${newSail.title} בתאריך ${newSail.date} בשעה ${newSail.departureTime} (סקיפר: ${newSail.skipperName})`,
        targetId: newSail.id,
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    this.saveData({
      ...this.data,
      users: newUsers,
      sails: [newSail, ...this.data.sails],
      registrations: newRegistrations,
      notifications: newNotifications,
    });

    triggerWebNotification('הפלגה חדשה נפתחה!', `${newSail.title} - ${newSail.date}`);
    return newSail;
  }

  public async editSail(sailId: string, updates: Partial<Sail>): Promise<boolean> {
    const sail = this.data.sails.find(s => s.id === sailId);
    if (!sail) return false;

    const updatedSails = this.data.sails.map(s => (s.id === sailId ? { ...s, ...updates } : s));
    this.saveData({ ...this.data, sails: updatedSails });
    return true;
  }

  public async cancelSail(sailId: string, reason: string, adminName: string): Promise<boolean> {
    const sail = this.data.sails.find(s => s.id === sailId);
    if (!sail) return false;

    const updatedSails = this.data.sails.map(s =>
      s.id === sailId ? { ...s, status: 'cancelled' as SailStatus, cancellationReason: reason } : s
    );

    const affectedRegs = this.data.registrations.filter(r => r.sailId === sailId && r.status !== 'cancelled');
    let updatedUsers = this.data.users;

    // Refund exact credits charged
    affectedRegs.forEach(reg => {
      if (reg.status === 'confirmed' && reg.creditsCharged > 0) {
        updatedUsers = updatedUsers.map(u =>
          u.id === reg.userId ? { ...u, credits: (u.credits || 0) + reg.creditsCharged } : u
        );
      }
    });

    const newNotifications = [...this.data.notifications];
    affectedRegs.forEach(reg => {
      const wasConfirmed = reg.status === 'confirmed';
      newNotifications.unshift({
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId: reg.userId,
        type: 'sail_cancelled',
        title: '⚠️ הפלגה בוטלה ע״י מנהל',
        message: `ההפלגה "${sail.title}" (${sail.date}) בוטלה ע"י ${adminName}. סיבה: ${reason || 'לא צוינה סיבה'}.${wasConfirmed && reg.creditsCharged > 0 ? ` הוחזרו ${reg.creditsCharged} נקודות קרדיט.` : ''}`,
        targetId: sail.id,
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    this.saveData({
      ...this.data,
      users: updatedUsers,
      sails: updatedSails,
      notifications: newNotifications,
    });
    return true;
  }

  public async joinSail(sailId: string, userId: string): Promise<{ success: boolean; status: 'confirmed' | 'waitlist'; message: string }> {
    const sail = this.data.sails.find(s => s.id === sailId);
    if (!sail) return { success: false, status: 'confirmed', message: 'הפלגה לא נמצאה' };
    if (sail.status !== 'open') return { success: false, status: 'confirmed', message: 'ההרשמה להפלגה זו סגורה או בוטלה' };

    const boat = this.data.boats.find(b => b.name === sail.boatName || sail.boatName.includes(b.name));
    if (boat && boat.status !== 'available') {
      return {
        success: false,
        status: 'confirmed',
        message: `כלי השייט (${boat.name}) בסטטוס ${boat.status === 'maintenance' ? 'בהספנה / תיקון' : 'לא זמין'} כרגע.`,
      };
    }

    const existing = this.data.registrations.find(r => r.sailId === sailId && r.userId === userId && r.status !== 'cancelled');
    if (existing) {
      return {
        success: false,
        status: existing.status as any,
        message: existing.status === 'confirmed' ? 'הנך כבר רשום להפלגה זו!' : 'הנך כבר ברשימת ההמתנה להפלגה זו!',
      };
    }

    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, status: 'confirmed', message: 'משתמש לא נמצא' };

    const creditCost = sail.sailType === 'club' ? 1 : sail.creditCost;
    if ((user.credits || 0) < creditCost) {
      return {
        success: false,
        status: 'confirmed',
        message: `אין ברשותך מספיק נקודות קרדיט (נדרש: ${creditCost}, יתרה: ${user.credits || 0}). פנה למנהל המועדון להטענת קרדיטים.`,
      };
    }

    const confirmedCount = this.data.registrations.filter(r => r.sailId === sailId && r.status === 'confirmed').length;

    let newStatus: 'confirmed' | 'waitlist';
    let waitlistPosition: number | undefined = undefined;
    let message = '';
    let creditsCharged = 0;

    if (confirmedCount < sail.maxParticipants) {
      newStatus = 'confirmed';
      creditsCharged = creditCost;
      message = `נרשמת בהצלחה להפלגה! מקומך מובטח ⛵ (ירד קרדיט ${creditCost})`;
    } else {
      newStatus = 'waitlist';
      const existingWaitlist = this.data.registrations.filter(r => r.sailId === sailId && r.status === 'waitlist');
      waitlistPosition = existingWaitlist.length + 1;
      message = `ההפלגה מלאה. נכנסת לרשימת המתנה (מקום ${waitlistPosition} בתור). הקרדיט יחויב רק כשתעלה להפלגה.`;
    }

    const newReg: SailRegistration = {
      id: 'reg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      sailId,
      userId,
      status: newStatus,
      waitlistPosition,
      creditsCharged,
      registeredAt: new Date().toISOString(),
      confirmedAt: newStatus === 'confirmed' ? new Date().toISOString() : undefined,
    };

    const updatedRegs = this.data.registrations.filter(r => !(r.sailId === sailId && r.userId === userId));
    updatedRegs.push(newReg);

    let updatedUsers = this.data.users;
    if (newStatus === 'confirmed') {
      updatedUsers = this.data.users.map(u =>
        u.id === userId ? { ...u, credits: Math.max(0, (u.credits || 0) - creditCost) } : u
      );
    }

    this.saveData({
      ...this.data,
      users: updatedUsers,
      registrations: updatedRegs,
    });

    return { success: true, status: newStatus, message };
  }

  public async cancelRegistration(
    sailId: string,
    userId: string,
    isAdminOverride = false
  ): Promise<{ success: boolean; message: string; promotedUserId?: string }> {
    const sail = this.data.sails.find(s => s.id === sailId);
    if (!sail) return { success: false, message: 'הפלגה לא נמצאה' };

    const reg = this.data.registrations.find(r => r.sailId === sailId && r.userId === userId && r.status !== 'cancelled');
    if (!reg) return { success: false, message: 'לא נמצאה הרשמה פעילה להפלגה זו' };

    if (!isAdminOverride) {
      const sailDateTime = new Date(`${sail.date}T${sail.departureTime}`).getTime();
      const now = Date.now();
      const hoursRemaining = (sailDateTime - now) / (1000 * 60 * 60);

      if (hoursRemaining < this.data.settings.cancellationDeadlineHours && hoursRemaining > 0) {
        return {
          success: false,
          message: `נעילת ביטול: לא ניתן לבטל פחות מ-${this.data.settings.cancellationDeadlineHours} שעות לפני היציאה. פנה למנהל המועדון.`,
        };
      }
    }

    const wasConfirmed = reg.status === 'confirmed';
    let updatedRegs = this.data.registrations.map(r => (r.id === reg.id ? { ...r, status: 'cancelled' as const } : r));
    let updatedUsers = this.data.users;

    // Refund charged credits
    if (wasConfirmed && reg.creditsCharged > 0) {
      updatedUsers = updatedUsers.map(u => (u.id === userId ? { ...u, credits: (u.credits || 0) + reg.creditsCharged } : u));
    }

    let promotedUserId: string | undefined = undefined;
    const newNotifications = [...this.data.notifications];

    if (wasConfirmed && sail.sailType === 'club') {
      const waitlist = updatedRegs
        .filter(r => r.sailId === sailId && r.status === 'waitlist')
        .sort((a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));

      if (waitlist.length > 0) {
        const nextInLine = waitlist[0];
        promotedUserId = nextInLine.userId;

        // Charge 1 credit to nextInLine
        updatedUsers = updatedUsers.map(u =>
          u.id === nextInLine.userId ? { ...u, credits: Math.max(0, (u.credits || 0) - 1) } : u
        );

        updatedRegs = updatedRegs.map(r => {
          if (r.id === nextInLine.id) {
            return {
              ...r,
              status: 'confirmed' as const,
              waitlistPosition: undefined,
              creditsCharged: 1,
              confirmedAt: new Date().toISOString(),
            };
          }
          if (r.sailId === sailId && r.status === 'waitlist') {
            return {
              ...r,
              waitlistPosition: (r.waitlistPosition || 2) - 1,
            };
          }
          return r;
        });

        newNotifications.unshift({
          id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          userId: nextInLine.userId,
          type: 'waitlist_promoted',
          title: '🎉 מקום התפנה בהפלגה! עלית מרשימת ההמתנה!',
          message: `מישהו ביטל את השתתפותו בהפלגה "${sail.title}" (${sail.date}). מקומך אושר אוטומטית! (חויב קרדיט 1)`,
          targetId: sail.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      const myPos = reg.waitlistPosition || 1;
      updatedRegs = updatedRegs.map(r => {
        if (r.sailId === sailId && r.status === 'waitlist' && (r.waitlistPosition || 0) > myPos) {
          return { ...r, waitlistPosition: (r.waitlistPosition || 0) - 1 };
        }
        return r;
      });
    }

    this.saveData({
      ...this.data,
      users: updatedUsers,
      registrations: updatedRegs,
      notifications: newNotifications,
    });

    return {
      success: true,
      message: wasConfirmed ? 'ביטול ההשתתפות בוצע בהצלחה ונקודות הקרדיט הוחזרו.' : 'הוסרת מרשימת ההמתנה.',
      promotedUserId,
    };
  }

  public async addParticipantManually(sailId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const sail = this.data.sails.find(s => s.id === sailId);
    if (!sail) return { success: false, message: 'הפלגה לא נמצאה' };

    const user = this.data.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'חבר מועדון לא נמצא' };

    const existing = this.data.registrations.find(
      r => r.sailId === sailId && r.userId === userId && r.status !== 'cancelled'
    );
    if (existing) return { success: false, message: 'משתמש זה כבר רשום להפלגה' };

    const newReg: SailRegistration = {
      id: 'reg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      sailId,
      userId,
      status: 'confirmed',
      creditsCharged: 0,
      registeredAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };

    const newNotifications = [
      {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId,
        type: 'new_sail' as const,
        title: '⛵ צורפת להפלגה ע״י מנהל',
        message: `צורפת להפלגה "${sail.title}" (${sail.date}) ע"י הנהלת המועדון.`,
        targetId: sail.id,
        read: false,
        createdAt: new Date().toISOString(),
      },
      ...this.data.notifications,
    ];

    this.saveData({
      ...this.data,
      registrations: [...this.data.registrations, newReg],
      notifications: newNotifications,
    });

    return { success: true, message: `${user.fullName} נוסף בהצלחה להפלגה!` };
  }

  public async removeParticipantManually(sailId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.cancelRegistration(sailId, userId, true);
  }

  public async addSailPhoto(sailId: string, photoUrl: string, caption: string, uploaderId: string): Promise<boolean> {
    const sail = this.data.sails.find(s => s.id === sailId);
    const uploader = this.data.users.find(u => u.id === uploaderId);
    if (!sail || !uploader) return false;

    const newPhoto: SailPhoto = {
      id: 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      url: photoUrl,
      caption: caption || undefined,
      uploadedBy: uploaderId,
      uploaderName: uploader.fullName,
      uploadedAt: new Date().toISOString(),
    };

    const updatedSails = this.data.sails.map(s =>
      s.id === sailId ? { ...s, photos: [newPhoto, ...s.photos] } : s
    );

    this.saveData({ ...this.data, sails: updatedSails });
    return true;
  }

  // --- Posts & Community Feed ---
  public getPosts(): ClubPost[] {
    return [...this.data.posts].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public async createPost(
    authorId: string,
    content: string,
    images: string[] = [],
    linkPreview?: ClubPost['linkPreview'],
    sailId?: string
  ): Promise<ClubPost | null> {
    const author = this.data.users.find(u => u.id === authorId);
    if (!author) return null;

    let sailTitle: string | undefined = undefined;
    if (sailId) {
      const sail = this.data.sails.find(s => s.id === sailId);
      sailTitle = sail?.title;
    }

    const newPost: ClubPost = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      authorId,
      authorName: author.fullName,
      authorAvatar: author.avatar,
      authorRole: author.role,
      content,
      images,
      linkPreview,
      isPinned: false,
      sailId,
      sailTitle,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };

    this.saveData({
      ...this.data,
      posts: [newPost, ...this.data.posts],
    });
    return newPost;
  }

  public async togglePostLike(postId: string, userId: string): Promise<boolean> {
    const post = this.data.posts.find(p => p.id === postId);
    if (!post) return false;

    const hasLiked = post.likes.includes(userId);
    const newLikes = hasLiked ? post.likes.filter(id => id !== userId) : [...post.likes, userId];

    const updatedPosts = this.data.posts.map(p => (p.id === postId ? { ...p, likes: newLikes } : p));
    this.saveData({ ...this.data, posts: updatedPosts });
    return true;
  }

  public async addPostComment(postId: string, userId: string, content: string): Promise<boolean> {
    const post = this.data.posts.find(p => p.id === postId);
    const author = this.data.users.find(u => u.id === userId);
    if (!post || !author || !content.trim()) return false;

    const newComment = {
      id: 'comm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      postId,
      authorId: userId,
      authorName: author.fullName,
      authorAvatar: author.avatar,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedPosts = this.data.posts.map(p =>
      p.id === postId ? { ...p, comments: [...p.comments, newComment] } : p
    );

    this.saveData({ ...this.data, posts: updatedPosts });
    return true;
  }

  public async togglePinPost(postId: string): Promise<boolean> {
    const updatedPosts = this.data.posts.map(p => (p.id === postId ? { ...p, isPinned: !p.isPinned } : p));
    this.saveData({ ...this.data, posts: updatedPosts });
    return true;
  }

  public async deletePost(postId: string): Promise<boolean> {
    const updatedPosts = this.data.posts.filter(p => p.id !== postId);
    this.saveData({ ...this.data, posts: updatedPosts });
    return true;
  }

  // --- Credit requests ---
  public getCreditRequests(): CreditRequest[] {
    const me = this.getCurrentUser();
    if (!me) return [];
    const all = this.data.creditRequests ?? [];
    return (me.role === 'admin' ? all : all.filter(r => r.userId === me.id)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  public async requestCredits(amount: number, note: string): Promise<Result> {
    const me = this.getCurrentUser();
    if (!me || me.status !== 'approved') return { success: false, error: 'רק חברים מאושרים יכולים לבקש קרדיטים' };
    const n = Math.floor(amount);
    if (!(n >= 1 && n <= 100)) return { success: false, error: 'יש לבקש בין 1 ל-100 קרדיטים' };
    const all = this.data.creditRequests ?? [];
    if (all.some(r => r.userId === me.id && r.status === 'pending')) {
      return { success: false, error: 'כבר יש לך בקשה ממתינה. ההנהלה תטפל בה בקרוב.' };
    }
    const request: CreditRequest = {
      id: newId('creq'),
      userId: me.id,
      amount: n,
      note: note.trim().slice(0, 300),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const admins = this.data.users.filter(u => u.role === 'admin' && u.status === 'approved').map(u => u.id);
    this.saveData({
      ...this.data,
      creditRequests: [request, ...all],
      notifications: this.withNotifications(
        admins,
        'credit_request',
        '🪙 בקשה לקרדיטים נוספים',
        `${me.fullName} מבקש/ת ${n} קרדיטים (יתרה נוכחית: ${me.credits}).${request.note ? ` "${request.note}"` : ''}`,
        request.id
      ),
    });
    return { success: true };
  }

  public async resolveCreditRequest(requestId: string, approve: boolean, amount?: number): Promise<Result> {
    if (this.getCurrentUser()?.role !== 'admin') return { success: false, error: 'רק מנהל יכול לאשר קרדיטים' };
    const all = this.data.creditRequests ?? [];
    const request = all.find(r => r.id === requestId);
    if (!request) return { success: false, error: 'הבקשה לא נמצאה' };
    if (request.status !== 'pending') return { success: false, error: 'הבקשה כבר טופלה' };
    const grant = Math.floor(amount ?? request.amount);
    if (approve && !(grant >= 1 && grant <= 100)) return { success: false, error: 'יש לאשר בין 1 ל-100 קרדיטים' };

    const user = this.data.users.find(u => u.id === request.userId);
    const newCredits = (user?.credits ?? 0) + (approve ? grant : 0);
    const handled: CreditRequest = {
      ...request,
      status: approve ? 'approved' : 'rejected',
      granted: approve ? grant : undefined,
      handledAt: new Date().toISOString(),
    };
    this.data = {
      ...this.data,
      // The admins' "please approve" notifications are done
      notifications: this.data.notifications.map(n =>
        n.type === 'credit_request' && n.targetId === requestId ? { ...n, read: true } : n
      ),
    };
    this.saveData({
      ...this.data,
      users: this.data.users.map(u => (u.id === request.userId ? { ...u, credits: newCredits } : u)),
      creditRequests: all.map(r => (r.id === requestId ? handled : r)),
      notifications: this.withNotifications(
        [request.userId],
        'credit_update',
        approve ? '🪙 בקשת הקרדיטים אושרה!' : 'בקשת הקרדיטים לא אושרה',
        approve
          ? `נוספו לך ${grant} קרדיטים. יתרה עדכנית: ${newCredits} קרדיטים.`
          : `הנהלת המועדון לא אישרה את בקשתך ל-${request.amount} קרדיטים. לפרטים פנה להנהלה.`
      ),
    });
    return { success: true };
  }

  // --- Notifications ---
  public getNotifications(userId: string): AppNotification[] {
    return this.data.notifications.filter(n => n.userId === userId);
  }

  public async markNotificationAsRead(notifId: string) {
    const updated = this.data.notifications.map(n => (n.id === notifId ? { ...n, read: true } : n));
    this.saveData({ ...this.data, notifications: updated });
  }

  public async markAllNotificationsAsRead(userId: string) {
    const updated = this.data.notifications.map(n => (n.userId === userId ? { ...n, read: true } : n));
    this.saveData({ ...this.data, notifications: updated });
  }

  // --- Settings ---
  public getSettings(): ClubSettings {
    // Data saved before levels became editable has no list yet.
    return { ...INITIAL_SETTINGS, ...this.data.settings };
  }

  public async renameExperienceLevel(oldName: string, newName: string): Promise<Result> {
    const name = newName.trim();
    if (!name) return { success: false, error: 'יש להזין שם לרמת ההסמכה' };
    const levels = this.getSettings().experienceLevels.map(l => (l === oldName ? name : l));
    const users = this.data.users.map(u => (u.experienceLevel === oldName ? { ...u, experienceLevel: name } : u));
    this.saveData({ ...this.data, users, settings: { ...this.getSettings(), experienceLevels: levels } });
    return { success: true };
  }

  public async updateSettings(settings: Partial<ClubSettings>) {
    this.saveData({
      ...this.data,
      settings: { ...this.data.settings, ...settings },
    });
  }

  // --- Boats & Fleet Management ---
  public getBoats(): Boat[] {
    return [...this.data.boats];
  }

  public getBoatById(boatId: string): Boat | undefined {
    return this.data.boats.find(b => b.id === boatId);
  }

  public async createBoat(boatData: Omit<Boat, 'id' | 'createdAt'>): Promise<Boat> {
    const newBoat: Boat = {
      ...boatData,
      id: 'boat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
    };
    this.saveData({
      ...this.data,
      boats: [...this.data.boats, newBoat],
    });
    return newBoat;
  }

  public async updateBoat(boatId: string, updates: Partial<Boat>): Promise<boolean> {
    const boat = this.data.boats.find(b => b.id === boatId);
    if (!boat) return false;

    const updated = this.data.boats.map(b => (b.id === boatId ? { ...b, ...updates } : b));
    this.saveData({ ...this.data, boats: updated });
    return true;
  }

  public async deleteBoat(boatId: string): Promise<boolean> {
    const updated = this.data.boats.filter(b => b.id !== boatId);
    this.saveData({ ...this.data, boats: updated });
    return true;
  }

  // --- Boat Issues & Fault Reporting ---
  public getBoatIssues(): BoatIssue[] {
    return [...this.data.boatIssues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async reportBoatIssue(issueData: Omit<BoatIssue, 'id' | 'createdAt' | 'status'>): Promise<BoatIssue> {
    const newIssue: BoatIssue = {
      ...issueData,
      id: 'issue_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    let updatedBoats = this.data.boats;
    if (newIssue.severity === 'critical') {
      updatedBoats = this.data.boats.map(b =>
        b.id === newIssue.boatId
          ? {
              ...b,
              status: 'maintenance' as BoatStatus,
              statusNotes: `תקלה משביתה: ${newIssue.title}`,
            }
          : b
      );
    }

    const newNotifications = [...this.data.notifications];
    this.data.users.forEach(u => {
      newNotifications.unshift({
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId: u.id,
        type: 'boat_issue',
        title: `🚨 דיווח תקלה: ${newIssue.boatName}`,
        message: `${newIssue.reporterName} דיווח על: "${newIssue.title}" (${newIssue.category})`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    this.saveData({
      ...this.data,
      boats: updatedBoats,
      boatIssues: [newIssue, ...this.data.boatIssues],
      notifications: newNotifications,
    });

    return newIssue;
  }

  public async updateBoatIssueStatus(
    issueId: string,
    status: IssueStatus,
    adminNotes?: string,
    resolverName?: string
  ): Promise<boolean> {
    const issue = this.data.boatIssues.find(i => i.id === issueId);
    if (!issue) return false;

    const updatedIssues = this.data.boatIssues.map(i =>
      i.id === issueId
        ? {
            ...i,
            status,
            adminNotes: adminNotes !== undefined ? adminNotes : i.adminNotes,
            resolvedAt: status === 'resolved' ? new Date().toISOString() : undefined,
            resolvedBy: status === 'resolved' ? resolverName : undefined,
          }
        : i
    );

    let updatedBoats = this.data.boats;
    if (status === 'resolved') {
      const otherCritical = updatedIssues.some(
        i => i.boatId === issue.boatId && i.status !== 'resolved' && i.severity === 'critical'
      );
      if (!otherCritical) {
        updatedBoats = this.data.boats.map(b =>
          b.id === issue.boatId && b.status === 'maintenance'
            ? { ...b, status: 'available' as BoatStatus, statusNotes: 'תוקנה וחזרה לכשירות' }
            : b
        );
      }
    }

    this.saveData({
      ...this.data,
      boats: updatedBoats,
      boatIssues: updatedIssues,
    });
    return true;
  }

  // Reset database completely to clean slate
  public async resetToSeed() {
    this.saveData({
      users: INITIAL_USERS,
      passwords: INITIAL_PASSWORDS,
      sails: [],
      registrations: [],
      posts: [],
      notifications: [],
      settings: INITIAL_SETTINGS,
      boats: INITIAL_BOATS,
      boatIssues: [],
      resetTokens: [],
    });
    this.setCurrentUser('u1');
  }
}
