// Pure business rules shared by both data stores and the UI.

// Helper: Calculate duration in hours between two HH:mm strings
export function calculateDurationHours(depTime: string, retTime: string): number {
  try {
    const [depH, depM] = depTime.split(':').map(Number);
    const [retH, retM] = retTime.split(':').map(Number);
    let diffMinutes = (retH * 60 + retM) - (depH * 60 + depM);
    if (diffMinutes <= 0) {
      diffMinutes += 24 * 60; // Crosses midnight
    }
    const hours = Math.round((diffMinutes / 60) * 10) / 10;
    return hours > 0 ? hours : 3;
  } catch {
    return 3;
  }
}

// Helper: Calculate private sail credit cost (3 credits for min 3 hours + 1 per extra hour)
export function calculatePrivateSailCredits(durationHours: number): number {
  const roundedHours = Math.ceil(durationHours);
  if (roundedHours <= 3) return 3;
  return 3 + (roundedHours - 3);
}

// Password Complexity Validator: at least 8 characters, letters & numbers
export function validatePasswordComplexity(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: 'הסיסמה חייבת להכיל לפחות 8 תווים' };
  }
  const hasLetter = /[a-zA-Zא-ת]/.test(password);
  const hasDigit = /[0-9]/.test(password);

  if (!hasLetter || !hasDigit) {
    return { valid: false, error: 'הסיסמה חייבת לשלב אותיות ומספרים' };
  }
  return { valid: true };
}

// --- Boat booking rules (the database enforces the same in create_sail) ---

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** A sail's time window in minutes since midnight; a return at or before departure runs to midnight. */
export function sailWindow(departureTime: string, returnTime: string): [number, number] {
  const start = toMinutes(departureTime);
  const end = toMinutes(returnTime);
  return [start, end > start ? end : 24 * 60];
}

/** True when two same-day windows overlap (touching ends, e.g. 13:00–16:00 and 16:00–19:00, do not). */
export function windowsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

type BookableSail = {
  id: string;
  title: string;
  date: string;
  departureTime: string;
  estimatedReturnTime: string;
  status: string;
  boatId?: string;
  boatName: string;
};

type BookableBoat = { id: string; name: string };

/** Whether a sail uses the boat: by id, or for older sails by the boat's name in the sail's boat label. */
export function sailUsesBoat(sail: BookableSail, boat: BookableBoat): boolean {
  if (sail.boatId) return sail.boatId === boat.id;
  return sail.boatName === boat.name || sail.boatName.startsWith(`${boat.name} (`);
}

/** The first non-cancelled sail that already has the boat in that window, if any. */
export function findBoatConflict<S extends BookableSail>(
  sails: S[],
  boat: BookableBoat,
  date: string,
  departureTime: string,
  returnTime: string,
  ignoreSailId?: string
): S | undefined {
  const window = sailWindow(departureTime, returnTime);
  return sails.find(
    (s) =>
      s.id !== ignoreSailId &&
      s.status !== 'cancelled' &&
      s.date === date &&
      sailUsesBoat(s, boat) &&
      windowsOverlap(window, sailWindow(s.departureTime, s.estimatedReturnTime))
  );
}

/**
 * Whether a person may take the boat out (skipper a club sail / open a private sail on it).
 * A boat with no allowed levels and no allowed people is open to everyone.
 */
export function mayTakeBoat(
  boat: { allowedLevels?: string[]; allowedMemberIds?: string[] },
  person: { id: string; experienceLevel: string } | undefined
): boolean {
  const levels = boat.allowedLevels ?? [];
  const people = boat.allowedMemberIds ?? [];
  if (levels.length === 0 && people.length === 0) return true;
  if (!person) return false;
  return people.includes(person.id) || levels.includes(person.experienceLevel);
}

export function boatConflictMessage(conflict: { title: string; departureTime: string; estimatedReturnTime: string }, boatName: string): string {
  return `${boatName} כבר תפוסה בשעות האלה: "${conflict.title}" (${conflict.departureTime}–${conflict.estimatedReturnTime}). בחר שעה או סירה אחרת.`;
}

type Reservation = { id: string; boatId: string; date: string; startTime: string; endTime: string; title: string };

/** The first management reservation that blocks the boat in that window, if any. */
export function findReservationConflict<R extends Reservation>(
  reservations: R[],
  boatId: string,
  date: string,
  startTime: string,
  endTime: string,
  ignoreId?: string
): R | undefined {
  const window = sailWindow(startTime, endTime);
  return reservations.find(
    (r) =>
      r.id !== ignoreId &&
      r.boatId === boatId &&
      r.date === date &&
      windowsOverlap(window, sailWindow(r.startTime, r.endTime))
  );
}

export function reservationConflictMessage(r: { title: string; startTime: string; endTime: string }, boatName: string): string {
  return `${boatName} משוריינת בשעות האלה על ידי ההנהלה: "${r.title}" (${r.startTime}–${r.endTime}). בחר שעה או סירה אחרת.`;
}

/** Why the boat can't be booked in that window (a sail or a reservation already has it), or null. */
export function boatBusyMessage(
  sails: BookableSail[],
  reservations: Reservation[],
  boat: BookableBoat,
  date: string,
  startTime: string,
  endTime: string
): string | null {
  const sail = findBoatConflict(sails, boat, date, startTime, endTime);
  if (sail) return boatConflictMessage(sail, boat.name);
  const reservation = findReservationConflict(reservations, boat.id, date, startTime, endTime);
  return reservation ? reservationConflictMessage(reservation, boat.name) : null;
}
