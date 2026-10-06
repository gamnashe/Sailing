/**
 * Boat booking rules shared by the UI and the demo store (the database enforces the same in create_sail).
 * Run via: bun run test
 */
import { boatBusyMessage, findBoatConflict, findReservationConflict, mayTakeBoat, sailUsesBoat, sailWindow, windowsOverlap } from '../services/sailRules';
import { LocalStore } from '../services/localStore';

let failures = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failures++;
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

const galit = { id: 'b1', name: 'גלית' };
const sail = (over: Record<string, unknown>) => ({
  id: 's1', title: 'בוקר', date: '2099-01-01', departureTime: '10:00', estimatedReturnTime: '14:00',
  status: 'open', boatId: 'b1', boatName: 'גלית (Bavaria 38 Cruiser)', ...over,
});

assert(windowsOverlap(sailWindow('10:00', '14:00'), sailWindow('13:00', '17:00')), 'overlapping windows overlap');
assert(!windowsOverlap(sailWindow('10:00', '14:00'), sailWindow('14:00', '17:00')), 'back-to-back windows do not overlap');
assert(sailWindow('20:00', '01:00')[1] === 24 * 60, 'a return after midnight runs to the end of the day');
assert(sailUsesBoat(sail({ boatId: undefined }) as any, galit), 'older sails match their boat by label');
assert(!sailUsesBoat(sail({ boatId: 'b2' }) as any, galit), 'a sail on another boat does not use it');

const sails = [sail({}), sail({ id: 's2', departureTime: '15:00', estimatedReturnTime: '18:00', status: 'cancelled' })];
assert(findBoatConflict(sails as any, galit, '2099-01-01', '12:00', '13:00')?.id === 's1', 'a sail inside an existing one conflicts');
assert(!findBoatConflict(sails as any, galit, '2099-01-01', '15:00', '18:00'), 'a cancelled sail does not block the boat');
assert(!findBoatConflict(sails as any, galit, '2099-01-02', '10:00', '14:00'), 'another day is free');
assert(!findBoatConflict(sails as any, galit, '2099-01-01', '10:00', '14:00', 's1'), 'a sail does not conflict with itself');

const dana = { id: 'u1', experienceLevel: 'סקיפר מתלמד' };
const yossi = { id: 'u2', experienceLevel: 'משיט 60 (סקיפר בינלאומי)' };
assert(mayTakeBoat({}, dana), 'an unrestricted boat is open to everyone');
assert(mayTakeBoat({ allowedLevels: ['משיט 60 (סקיפר בינלאומי)'] }, yossi), 'an allowed level may take the boat');
assert(!mayTakeBoat({ allowedLevels: ['משיט 60 (סקיפר בינלאומי)'] }, dana), 'other levels may not');
assert(mayTakeBoat({ allowedLevels: ['משיט 60 (סקיפר בינלאומי)'], allowedMemberIds: ['u1'] }, dana), 'a listed member may, whatever their level');
assert(!mayTakeBoat({ allowedMemberIds: ['u1'] }, undefined), 'a guest skipper does not pass a restricted boat');

// The demo store enforces the same rules.
const store = new LocalStore();
await store.resetToSeed();
const boat = store.getBoats()[0];
const base = {
  title: 'בדיקה', sailType: 'club' as const, date: '2099-03-01', departureTime: '10:00', estimatedReturnTime: '13:00',
  durationHours: 3, boatName: `${boat.name} (${boat.model})`, boatId: boat.id, skipperName: 'יוסי', skipperId: 'u1',
  departurePoint: 'מרינה', notes: '', minParticipants: 3, maxParticipants: 6, creditCost: 1, status: 'open' as const,
  createdBy: 'u1', creatorName: 'יוסי',
};
await store.createSail(base);
let refused = '';
try {
  await store.createSail({ ...base, departureTime: '12:00', estimatedReturnTime: '15:00' });
} catch (e: any) {
  refused = e.message;
}
assert(/תפוסה/.test(refused), 'demo store refuses an overlapping sail on the same boat');
await store.updateBoat(boat.id, { allowedLevels: ['חובב / מתחיל'] });
refused = '';
try {
  await store.createSail({ ...base, date: '2099-03-02' });
} catch (e: any) {
  refused = e.message;
}
assert(/אינו מורשה/.test(refused), 'demo store refuses an unauthorised skipper on a restricted boat');

// --- Management reservations ---
const lesson = { id: 'r1', boatId: 'b1', date: '2099-05-05', startTime: '09:00', endTime: '12:00', title: 'שיעור' };
assert(findReservationConflict([lesson], 'b1', '2099-05-05', '11:00', '14:00')?.id === 'r1', 'a sail overlapping a lesson is found');
assert(!findReservationConflict([lesson], 'b1', '2099-05-05', '12:00', '14:00'), 'a sail right after the lesson is fine');
assert(!findReservationConflict([lesson], 'b2', '2099-05-05', '10:00', '11:00'), 'the reservation only blocks its own boat');
assert(/משוריינת/.test(boatBusyMessage([], [lesson], galit, '2099-05-05', '10:00', '11:00') ?? ''), 'busy message names the reservation');
assert(boatBusyMessage([], [lesson], galit, '2099-05-06', '10:00', '11:00') === null, 'other days are free');

// Demo store: a sail cannot take a reserved boat
await store.updateBoat(boat.id, { allowedLevels: [] });
const reserved = await store.createBoatReservation({ boatId: boat.id, date: '2099-03-03', startTime: '09:00', endTime: '13:00', kind: 'lesson', title: 'קורס' });
assert(reserved.success, 'demo store: staff reserve a boat');
refused = '';
try {
  await store.createSail({ ...base, date: '2099-03-03' });
} catch (e: any) {
  refused = e.message;
}
assert(/משוריינת/.test(refused), 'demo store refuses a sail on a reserved boat');
const clash = await store.createBoatReservation({ boatId: boat.id, date: '2099-03-01', startTime: '09:00', endTime: '11:00', kind: 'special', title: 'אירוע' });
assert(!clash.success, 'demo store refuses a reservation over an existing sail');

console.log(failures === 0 ? '\n🎉 All booking tests passed' : `\n${failures} booking test(s) failed`);
process.exit(failures === 0 ? 0 : 1);
