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
  CreditRequest,
  BoatReservation,
  ClubSummary,
  NewClub,
  WeatherLocation,
} from '../types';

export type NewMember = {
  email: string;
  fullName: string;
  phone: string;
  experienceLevel: ExperienceLevel;
  credits: number;
};

export type JoinDetails = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  experienceLevel: ExperienceLevel;
};

export type Result = { success: boolean; error?: string };
export type MessageResult = { success: boolean; message: string };

/**
 * Common API for the app's data layer.
 *
 * Reads are synchronous and served from an in-memory snapshot, so components can call them during render.
 * Writes are asynchronous; when they resolve, the snapshot is already updated and subscribers notified.
 *
 * Implementations:
 *   - LocalStore: demo mode, everything in the browser's localStorage (no server needed).
 *   - SupabaseStore: shared club data in Supabase (Postgres + Auth + Realtime).
 */
export interface DataStore {
  readonly mode: 'local' | 'supabase';

  subscribe(listener: () => void): () => void;
  /** True while the initial session/data load is in flight. */
  isLoading(): boolean;
  /** Latest error from a background operation (load/realtime/write), shown as a toast. */
  getLastError(): string | null;
  clearLastError(): void;
  /** Re-fetches data from the backend (no-op in demo mode). */
  refresh(): Promise<void>;

  // --- Auth & users ---
  getCurrentUser(): UserProfile | null;
  /** Demo mode only: switch the active user without a password. */
  setCurrentUser(userId: string): void;
  getUsers(): UserProfile[];
  getUserById(userId: string): UserProfile | undefined;
  register(
    email: string,
    password: string,
    fullName: string,
    phone: string,
    experienceLevel: ExperienceLevel,
    avatar?: string
  ): Promise<{ success: boolean; error?: string; user?: UserProfile; needsEmailConfirmation?: boolean }>;
  /**
   * Sign-up through the club's invite link: creates the account (no email confirmation step), signs it in,
   * and leaves it pending until a manager or assistant approves it.
   */
  joinWithInvite(inviteCode: string, details: JoinDetails): Promise<{ success: boolean; error?: string; user?: UserProfile }>;
  /** The current invite code (staff only; null for everyone else). */
  getInviteCode(): string | null;
  /** Replaces the invite code, so links sent earlier stop working. */
  regenerateInviteCode(): Promise<Result>;
  login(identifier: string, password: string): Promise<{ success: boolean; error?: string; user?: UserProfile }>;
  logout(): Promise<void>;
  /** In demo mode returns the "emailed" code and link so the UI can display them. */
  requestPasswordReset(email: string): Promise<{ success: boolean; error?: string; resetCode?: string; resetLink?: string }>;
  /**
   * A signed-out member who forgot their password asks the management for a new one (staff get a
   * notification and use resetMemberPassword). Always reports success so it can't reveal who is a member.
   */
  requestPasswordHelp(email: string): Promise<Result>;
  /** True after the user opened a password-recovery link and must now choose a new password. */
  isPasswordRecovery(): boolean;
  resetPassword(email: string, tokenOrCode: string, newPassword: string): Promise<Result>;
  /** The signed-in user changes their own password. */
  changePassword(newPassword: string): Promise<Result>;
  /**
   * Admin adds a member directly: an approved account with a temporary password the admin hands over.
   * No email is involved.
   */
  createMember(member: NewMember): Promise<{ success: boolean; error?: string; email?: string; temporaryPassword?: string }>;
  /** Admin issues a member a new temporary password, to resend their login details. */
  resetMemberPassword(userId: string): Promise<{ success: boolean; error?: string; email?: string; temporaryPassword?: string }>;
  deleteUser(userId: string): Promise<Result>;
  updateUserQualification(userId: string, newLevel: ExperienceLevel): Promise<boolean>;
  approveMember(userId: string): Promise<boolean>;
  rejectMember(userId: string): Promise<boolean>;
  toggleMemberRole(userId: string, newRole: UserRole): Promise<Result>;
  updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<Result>;
  /** The signed-in user's profile photo (a JPEG data URL); null goes back to the default picture. */
  setMyAvatar(imageDataUrl: string | null): Promise<Result>;
  updateMemberCredits(
    userId: string,
    changeAmount: number,
    reason: string,
    adminName: string
  ): Promise<{ success: boolean; newCredits: number }>;

  /**
   * A temporary link to the management tutorial video (private storage, staff only).
   * Null for non-staff, or when it isn't available (e.g. demo mode).
   */
  getStaffTutorialUrl(): Promise<string | null>;

  /** The club an invite code belongs to (for the join form, before signing in). */
  inviteClubName(code: string): Promise<string | null>;

  // --- Clubs (platform admin only: configuration, never the data inside a club) ---
  listClubs(): Promise<{ success: boolean; error?: string; clubs?: ClubSummary[] }>;
  /** A new empty club with its first admin; returns the admin's temporary password. */
  createClub(club: NewClub): Promise<{ success: boolean; error?: string; email?: string; temporaryPassword?: string }>;
  updateClub(clubId: string, changes: { name?: string; location?: WeatherLocation }): Promise<Result>;
  addClubAdmin(
    clubId: string,
    admin: { fullName: string; email: string; phone: string }
  ): Promise<{ success: boolean; error?: string; email?: string; temporaryPassword?: string }>;
  resetClubAdminPassword(
    clubId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string; email?: string; temporaryPassword?: string }>;

  // --- Credit requests ---
  /** The signed-in member's own requests; admins see everyone's. Newest first. */
  getCreditRequests(): CreditRequest[];
  requestCredits(amount: number, note: string): Promise<Result>;
  /** Admin only. amount overrides the requested amount when approving. */
  resolveCreditRequest(requestId: string, approve: boolean, amount?: number): Promise<Result>;

  // --- Sails & registrations ---
  getSails(): Sail[];
  getSailById(sailId: string): Sail | undefined;
  getRegistrations(sailId?: string): SailRegistration[];
  getConfirmedParticipants(sailId: string): UserProfile[];
  getWaitlistParticipants(sailId: string): Array<{ user: UserProfile; position: number }>;
  getUserRegistrationForSail(sailId: string, userId: string): SailRegistration | undefined;
  createSail(sailData: Omit<Sail, 'id' | 'createdAt' | 'photos'>): Promise<Sail>;
  editSail(sailId: string, updates: Partial<Sail>): Promise<boolean>;
  cancelSail(sailId: string, reason: string, adminName: string): Promise<boolean>;
  joinSail(sailId: string, userId: string): Promise<{ success: boolean; status: 'confirmed' | 'waitlist'; message: string }>;
  cancelRegistration(
    sailId: string,
    userId: string,
    isAdminOverride?: boolean
  ): Promise<{ success: boolean; message: string; promotedUserId?: string }>;
  addParticipantManually(sailId: string, userId: string): Promise<MessageResult>;
  removeParticipantManually(sailId: string, userId: string): Promise<MessageResult>;
  addSailPhoto(sailId: string, photoUrl: string, caption: string, uploaderId: string): Promise<boolean>;

  // --- Community feed ---
  getPosts(): ClubPost[];
  createPost(
    authorId: string,
    content: string,
    images?: string[],
    linkPreview?: ClubPost['linkPreview'],
    sailId?: string
  ): Promise<ClubPost | null>;
  togglePostLike(postId: string, userId: string): Promise<boolean>;
  addPostComment(postId: string, userId: string, content: string): Promise<boolean>;
  togglePinPost(postId: string): Promise<boolean>;
  deletePost(postId: string): Promise<boolean>;

  // --- Notifications ---
  getNotifications(userId: string): AppNotification[];
  markNotificationAsRead(notifId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // --- Settings ---
  getSettings(): ClubSettings;
  updateSettings(settings: Partial<ClubSettings>): Promise<void>;
  /** Renames a qualification level in the club list and for every member who holds it. */
  renameExperienceLevel(oldName: string, newName: string): Promise<Result>;

  // --- Boats & issues ---
  getBoats(): Boat[];
  getBoatById(boatId: string): Boat | undefined;
  createBoat(boatData: Omit<Boat, 'id' | 'createdAt'>): Promise<Boat | null>;
  updateBoat(boatId: string, updates: Partial<Boat>): Promise<boolean>;
  deleteBoat(boatId: string): Promise<boolean>;
  /** Management reservations (lessons, special events, maintenance), sorted by date and time. */
  getBoatReservations(): BoatReservation[];
  /** Staff only. Refused when the boat already has a sail or another reservation in that window. */
  createBoatReservation(data: Omit<BoatReservation, 'id' | 'createdBy' | 'createdAt'>): Promise<Result>;
  deleteBoatReservation(id: string): Promise<Result>;
  getBoatIssues(): BoatIssue[];
  reportBoatIssue(issueData: Omit<BoatIssue, 'id' | 'createdAt' | 'status'>): Promise<BoatIssue | null>;
  updateBoatIssueStatus(issueId: string, status: IssueStatus, adminNotes?: string, resolverName?: string): Promise<boolean>;

  /**
   * Demo mode: wipes everything back to the seed data.
   * Supabase mode: deletes club activity (sails, posts, issues, notifications); members, boats and settings stay.
   */
  resetToSeed(): Promise<void>;
}
