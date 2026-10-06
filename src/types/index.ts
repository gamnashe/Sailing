/** admin: everything. assistant: like admin except credits, roles and other staff accounts. */
export type UserRole = 'admin' | 'assistant' | 'member';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/** A qualification level; the club's list is editable (ClubSettings.experienceLevels). */
export type ExperienceLevel = string;

export const DEFAULT_EXPERIENCE_LEVELS: ExperienceLevel[] = [
  'משיט 60 (סקיפר בינלאומי)',
  'משיט 30 (סקיפר חופי)',
  'משיט 40 (סקיפר מסחרי)',
  'איש צוות מנוסה',
  'סקיפר מתלמד',
  'חובב / מתחיל',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל',
  assistant: 'עוזר מנהל',
  member: 'חבר מועדון',
};

/** Management staff: admins and assistant managers. */
export function isStaff(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'assistant';
}

/** The club's levels, plus the member's current one if it has since been removed from the list. */
export function levelOptions(levels: ExperienceLevel[], current?: ExperienceLevel): ExperienceLevel[] {
  return current && !levels.includes(current) ? [...levels, current] : levels;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  fullName: string;
  phone: string;
  avatar: string;
  experienceLevel: ExperienceLevel;
  role: UserRole;
  status: UserStatus;
  joinedAt: string;
  credits: number; // Member sailing credits balance
}

export type BoatStatus = 'available' | 'unavailable' | 'maintenance';

export interface Boat {
  id: string;
  name: string;
  model: string;
  status: BoatStatus;
  statusNotes?: string;
  berthLocation?: string;
  year?: number;
  capacity?: number;
  /** Who may take the boat out (skipper / private sail opener). Both empty = everyone. */
  allowedLevels?: ExperienceLevel[];
  allowedMemberIds?: string[];
  createdAt: string;
}

export type ReservationKind = 'lesson' | 'special' | 'maintenance';

export const RESERVATION_KIND_LABELS: Record<ReservationKind, string> = {
  lesson: 'שיעור',
  special: 'פעילות מיוחדת',
  maintenance: 'תחזוקה',
};

export const RESERVATION_KIND_ICONS: Record<ReservationKind, string> = {
  lesson: '🎓',
  special: '⭐',
  maintenance: '🔧',
};

/** A boat blocked by the management for a time slot (lessons, special events, maintenance). */
export interface BoatReservation {
  id: string;
  boatId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  kind: ReservationKind;
  title: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';

export interface BoatIssue {
  id: string;
  boatId: string;
  boatName: string;
  reporterId: string;
  reporterName: string;
  reporterPhone: string;
  title: string;
  description: string;
  category: 'מנוע' | 'מפרשים וחבלים' | 'חשמל ואלקטרוניקה' | 'משאבות ושיפוליים' | 'ציוד בטיחות' | 'גוף סירה וסיפון' | 'אחר';
  severity: IssueSeverity;
  status: IssueStatus;
  photoUrl?: string;
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type SailStatus = 'open' | 'closed' | 'cancelled' | 'completed';
export type SailType = 'club' | 'private';

export interface SailPhoto {
  id: string;
  url: string;
  caption?: string;
  uploadedBy: string;
  uploaderName: string;
  uploadedAt: string;
}

export interface Sail {
  id: string;
  title: string;
  sailType: SailType; // 'club' = מועדון (3-6 משתתפים, 1 קרדיט), 'private' = פרטית (מינימום 3 שעות, 3 קרדיטים + 1 לכל שעה נוספת)
  date: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  estimatedReturnTime: string; // HH:mm
  durationHours: number; // Minimum 3 hours for private
  boatName: string;
  /** The boat the sail books; older sails only carry boatName. */
  boatId?: string;
  skipperName: string;
  skipperId?: string;
  departurePoint: string;
  notes: string;
  minParticipants: number; // default 3 for club sail
  maxParticipants: number; // default 6 for club sail
  creditCost: number; // 1 for club sail, 3+ for private sail
  status: SailStatus;
  cancellationReason?: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  photos: SailPhoto[];
}

export type RegistrationStatus = 'confirmed' | 'waitlist' | 'cancelled';

export interface SailRegistration {
  id: string;
  sailId: string;
  userId: string;
  status: RegistrationStatus;
  waitlistPosition?: number;
  creditsCharged: number;
  registeredAt: string;
  confirmedAt?: string;
}

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image?: string;
  domain?: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
}

export interface ClubPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: UserRole;
  content: string;
  images: string[];
  linkPreview?: LinkPreviewData;
  isPinned: boolean;
  sailId?: string;
  sailTitle?: string;
  likes: string[]; // array of userIds
  comments: PostComment[];
  createdAt: string;
}

export type NotificationType = 
  | 'new_sail'
  | 'waitlist_promoted'
  | 'sail_cancelled'
  | 'sail_reminder'
  | 'pinned_post'
  | 'member_approved'
  | 'boat_issue'
  | 'credit_update'
  | 'password_reset'
  /** Staff: someone signed up and waits for approval. */
  | 'member_request'
  /** Admins: a member asked for more credits (targetId = request id). */
  | 'credit_request'
  /** Staff: a member forgot their password and asked for a new one (targetId = member id). */
  | 'password_help';

/** Notification types that lead to the management screen rather than a sail. */
export const STAFF_NOTIFICATION_TYPES: NotificationType[] = ['member_request', 'credit_request', 'password_help'];

export type CreditRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CreditRequest {
  id: string;
  userId: string;
  amount: number;
  note: string;
  status: CreditRequestStatus;
  /** Credits actually added when approved (the admin may adjust the amount). */
  granted?: number;
  createdAt: string;
  handledAt?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  targetId?: string;
  read: boolean;
  createdAt: string;
}

export interface ClubSettings {
  clubName: string;
  logoUrl: string;
  defaultMaxParticipants: number;
  whoCanCreateSails: 'admin_only' | 'all_members';
  cancellationDeadlineHours: number;
  /** Qualification levels the club offers, highest first. */
  experienceLevels: ExperienceLevel[];
  /** Where the forecast is taken from (set by the management). */
  weatherLocation: WeatherLocation;
  /** From this wind (knots) or wave height (metres) a day counts as rough and is flagged in the calendar. */
  roughWindKn: number;
  roughWaveM: number;
}

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
  /** A point just offshore for the wave forecast; defaults to lat/lon. */
  seaLat?: number;
  seaLon?: number;
}

export const DEFAULT_WEATHER_LOCATION: WeatherLocation = {
  name: 'מרינה הרצליה',
  lat: 32.163,
  lon: 34.792,
  seaLat: 32.165,
  seaLon: 34.77,
};

/** Common sailing spots in Israel, each with an offshore point for waves. */
export const WEATHER_PRESETS: WeatherLocation[] = [
  DEFAULT_WEATHER_LOCATION,
  { name: 'מרינה תל אביב', lat: 32.087, lon: 34.771, seaLat: 32.087, seaLon: 34.755 },
  { name: 'נמל יפו', lat: 32.053, lon: 34.75, seaLat: 32.055, seaLon: 34.735 },
  { name: 'מרינה אשדוד', lat: 31.799, lon: 34.637, seaLat: 31.805, seaLon: 34.615 },
  { name: 'מרינה אשקלון', lat: 31.681, lon: 34.556, seaLat: 31.685, seaLon: 34.535 },
  { name: 'מרינה חיפה (קישון)', lat: 32.81, lon: 35.03, seaLat: 32.83, seaLon: 35.0 },
  { name: 'מרינה עכו', lat: 32.92, lon: 35.068, seaLat: 32.92, seaLon: 35.05 },
  { name: 'מרינה אילת', lat: 29.547, lon: 34.959, seaLat: 29.535, seaLon: 34.955 },
  { name: 'כנרת – טבריה', lat: 32.79, lon: 35.545 },
];

export interface PasswordResetToken {
  token: string;
  email: string;
  code: string;
  expiresAt: string;
}
