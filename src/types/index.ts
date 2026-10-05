export type UserRole = 'admin' | 'member';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type ExperienceLevel = 
  | 'משיט 60 (סקיפר בינלאומי)'
  | 'משיט 30 (סקיפר חופי)'
  | 'משיט 40 (סקיפר מסחרי)'
  | 'איש צוות מנוסה'
  | 'סקיפר מתלמד'
  | 'חובב / מתחיל';

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
  | 'password_reset';

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
}

export interface PasswordResetToken {
  token: string;
  email: string;
  code: string;
  expiresAt: string;
}
