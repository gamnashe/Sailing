/**
 * Comprehensive Automated Test Suite for:
 * 1. Password Complexity & Validation (8 chars, letters + digits)
 * 2. Password Reset via Email Flow
 * 3. User Deletion & Last Admin Protection
 * 4. Skipper Qualification Level Updates
 * 5. Club Sails (min 3, max 6, 1 credit per member)
 * 6. Private Sails (min 3 hours, 3 credits + 1 per extra hour)
 * 7. Clean Database Reset
 *
 * Run via: npx tsx src/tests/sailLogic.test.ts
 */

import { LocalStore } from '../services/localStore';
import {
  validatePasswordComplexity,
  calculateDurationHours,
  calculatePrivateSailCredits
} from '../services/sailRules';

const store = new LocalStore();

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

async function runTests() {
  console.log('\n--- 🧪 מתחיל הרצת בדיקות מקיפות למערכת מועדון השייט ---\n');

  // Test 0: Reset store to clean state
  await store.resetToSeed();
  assert(store.getUsers().length === 1, 'אתחול מסד נתונים נקי: מנהל ראשי יחיד בלבד במערכת');
  assert(store.getSails().length === 0, 'אתחול מסד נתונים נקי: 0 הפלגות טסט ישנות');

  // Test 1: Password Complexity
  const weak1 = validatePasswordComplexity('123456');
  assert(!weak1.valid, 'חסימת סיסמה קצרה מ-8 תווים');

  const weak2 = validatePasswordComplexity('abcdefgh');
  assert(!weak2.valid, 'חסימת סיסמה ללא ספרות');

  const weak3 = validatePasswordComplexity('12345678');
  assert(!weak3.valid, 'חסימת סיסמה ללא אותיות');

  const strong = validatePasswordComplexity('Sailor2026!');
  assert(strong.valid, 'אישור סיסמה מורכבת בת 8+ תווים המשלבת אותיות וספרות');

  // Test 2: Member Registration with Email & Complex Password
  const regRes = await store.register(
    'sailor.david@example.com',
    'Yacht1234!',
    'דוד שחר',
    '050-9876543',
    'משיט 30 (סקיפר חופי)'
  );
  assert(regRes.success === true, 'חבר חדש נרשם בהצלחה עם מייל וסיסמה מורכבת');
  assert(regRes.user?.status === 'pending', 'חבר חדש מתחיל במצב ממתין לאישור');
  assert(regRes.user?.role === 'member', 'חבר חדש מקבל תפקיד member');

  const davidId = regRes.user!.id;

  // Test 3: Password Reset via Email
  const resetReq = await store.requestPasswordReset('sailor.david@example.com');
  assert(resetReq.success === true, 'בקשת איפוס סיסמה למייל נוצרה בהצלחה');
  assert(Boolean(resetReq.resetCode && resetReq.resetLink), 'הופק קוד אימות בן 6 ספרות וקישור איפוס');

  const resetAction = await store.resetPassword('sailor.david@example.com', resetReq.resetCode!, 'NewYacht5678!');
  assert(resetAction.success === true, 'איפוס סיסמה באמצעות קוד מהמייל בוצע בהצלחה');

  const loginWithNewPw = await store.login('sailor.david@example.com', 'NewYacht5678!');
  assert(loginWithNewPw.success === true, 'התחברות עם הסיסמה החדשה הצליחה');

  // Test 4: Admin Approves Member & Updates Qualification
  await store.approveMember(davidId);
  assert(store.getUserById(davidId)?.status === 'approved', 'חבר אושר בהצלחה ע״י מנהל');

  await store.updateUserQualification(davidId, 'משיט 60 (סקיפר בינלאומי)');
  assert(
    store.getUserById(davidId)?.experienceLevel === 'משיט 60 (סקיפר בינלאומי)',
    'רמת הסמכת המשיט עודכנה בהצלחה למשיט 60'
  );

  // Test 5: Member Credits Adjustment
  await store.updateMemberCredits(davidId, 10, 'הטענת קרדיטים ראשונית', 'מנהל');
  assert(store.getUserById(davidId)?.credits === 15, 'מאזן קרדיטים עודכן כראוי (5 בסיס + 10 = 15)');

  // Test 6: Club Sail Logic (Min 3, Max 6, 1 Credit per member)
  const clubSail = await store.createSail({
    title: 'הפלגת מועדון שישי',
    sailType: 'club',
    date: '2026-10-20',
    departureTime: '15:00',
    estimatedReturnTime: '18:00',
    durationHours: 3,
    boatName: 'גלית (Bavaria 38)',
    skipperName: 'יוסי כהן',
    departurePoint: 'מרינה הרצליה',
    notes: 'הפלגת אימון',
    minParticipants: 3,
    maxParticipants: 6,
    creditCost: 1,
    status: 'open',
    createdBy: 'u1',
    creatorName: 'יוסי כהן',
  });

  assert(clubSail.minParticipants === 3, 'הפלגת מועדון מוגדרת למינימום 3 משתתפים לסגירה');
  assert(clubSail.maxParticipants === 6, 'הפלגת מועדון מוגבלת למקסימום 6 משתתפים');

  // David joins club sail -> 1 credit deducted
  const davidCreditsBefore = store.getUserById(davidId)!.credits;
  const joinClub = await store.joinSail(clubSail.id, davidId);
  assert(joinClub.success && joinClub.status === 'confirmed', 'דוד הצטרף להפלגת המועדון');
  assert(store.getUserById(davidId)!.credits === davidCreditsBefore - 1, 'להפלגת מועדון ירד בדיוק 1 קרדיט');

  // Cancel club sail registration -> credit refunded
  await store.cancelRegistration(clubSail.id, davidId, true);
  assert(store.getUserById(davidId)!.credits === davidCreditsBefore, 'ביטול השתתפות החזיר את הקרדיט במלואו');

  // Test 7: Private Sail Calculations (Min 3 hours = 3 credits, +1 per extra hour)
  assert(calculatePrivateSailCredits(3) === 3, 'הפלגה פרטית בת 3 שעות עולה בדיוק 3 קרדיטים');
  assert(calculatePrivateSailCredits(4) === 4, 'הפלגה פרטית בת 4 שעות עולה בדיוק 4 קרדיטים (3+1)');
  assert(calculatePrivateSailCredits(5.5) === 6, 'הפלגה פרטית בת 5.5 שעות עולה 6 קרדיטים');

  const privateSail = await store.createSail({
    title: 'הפלגה פרטית לחגיגת יום הולדת',
    sailType: 'private',
    date: '2026-10-22',
    departureTime: '10:00',
    estimatedReturnTime: '14:00',
    durationHours: 4, // 4 hours -> 4 credits
    boatName: 'רוח ים',
    skipperName: 'דוד שחר',
    skipperId: davidId,
    departurePoint: 'מרינה תל אביב',
    notes: 'הפלגה משפחתית',
    minParticipants: 1,
    maxParticipants: 6,
    creditCost: 4,
    status: 'open',
    createdBy: davidId,
    creatorName: 'דוד שחר',
  });

  assert(store.getUserById(davidId)!.credits === davidCreditsBefore - 4, 'עבור הפלגה פרטית של 4 שעות ירדו 4 קרדיטים');

  // Test 8: Admin cancels sail -> full credit refund to creator
  await store.cancelSail(privateSail.id, 'תנאי ים סוערים', 'יוסי כהן');
  assert(store.getUserById(davidId)!.credits === davidCreditsBefore, 'ביטול הפלגה פרטית ע״י מנהל החזיר 4 קרדיטים במלואם');

  // Test 9: User Deletion & Last Admin Demotion Safeguard
  const deleteMemberRes = await store.deleteUser(davidId);
  assert(deleteMemberRes.success === true, 'מחיקת משתמש רגיל עברה בהצלחה');
  assert(store.getUserById(davidId) === undefined, 'המשתמש שנמחק אינו מופיע יותר ברשימת המשתמשים');

  const deleteAdminRes = await store.deleteUser('u1');
  assert(!deleteAdminRes.success, 'חסימת מחיקת המנהל האחרון במערכת עובדת בהצלחה');

  console.log('\n🎉 כל הבדיקות המקיפות עברו בהצלחה מושלמת!\n');
}

runTests();
