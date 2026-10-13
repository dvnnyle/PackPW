// Run with `npx tsx src/notifications.check.ts`: checks when the scheduled notifications are due and their texts.
import assert from 'node:assert';
import {
  bookingSoonText,
  bookingsText,
  dayLabel,
  dueNotifications,
  missingPunchText,
  newBookingText,
  punchInText,
  punchOutText,
  rainText,
  weeklyText,
} from './notifications';

// 2026-10-08 is a Thursday (open 10–21), 2026-10-10 a Saturday (open 10–19), 2026-10-12 a Monday.
assert.deepEqual(dueNotifications('2026-10-08', 9, 0), []);
assert.deepEqual(dueNotifications('2026-10-08', 10, 0), ['bookings']);
assert.deepEqual(dueNotifications('2026-10-08', 10, 1), []);
assert.deepEqual(dueNotifications('2026-10-08', 11, 0), ['hourly']);
assert.deepEqual(dueNotifications('2026-10-08', 18, 0), ['hourly', 'weather']);
assert.deepEqual(dueNotifications('2026-10-08', 20, 0), ['hourly']);
assert.deepEqual(dueNotifications('2026-10-08', 21, 0), []);
assert.deepEqual(dueNotifications('2026-10-08', 21, 10), ['closing']);
assert.deepEqual(dueNotifications('2026-10-10', 19, 0), []);
assert.deepEqual(dueNotifications('2026-10-10', 19, 10), ['closing']);
assert.deepEqual(dueNotifications('2026-10-12', 9, 0), ['weekly']);
assert.deepEqual(dueNotifications('2026-10-13', 9, 0), []);

assert.equal(bookingsText(0, 0), '📭 Ingen bookinger i dag');
assert.equal(bookingsText(1, 12), '🎉 Vi har 1 booking i dag · 👥 12 gjester');
assert.equal(bookingsText(2, 34), '🎉 Vi har 2 bookinger i dag · 👥 34 gjester');
assert.equal(dayLabel('2026-10-18'), 'søn 18. okt');

const shift = { date: '2026-10-13', name: 'Mathea Hjulstad', group: 'Resepsjon', start: '09:50', end: '16:00', status: 'PunchclockFinished', punchIn: '09:48', punchOut: '16:02' };
assert.deepEqual(punchInText(shift), { title: '👋 Mathea Hjulstad er på jobb', body: '⏰ Stemplet inn 09:48 · Resepsjon · vakt 09:50–16:00' });
assert.equal(punchInText({ ...shift, group: null }).body, '⏰ Stemplet inn 09:48 · vakt 09:50–16:00');
assert.deepEqual(punchOutText(shift), { title: '🏁 Mathea Hjulstad har gått', body: '⏰ Stemplet ut 16:02 · Resepsjon · vakt 09:50–16:00' });
assert.deepEqual(missingPunchText(shift, 12), {
  title: '⚠️ Mathea Hjulstad har ikke stemplet inn',
  body: 'Resepsjon · vakt 09:50–16:00 · startet for 12 min siden',
});

const booking = {
  bookingNumber: 1769, time: '12:30', endTime: '14:30', name: 'Fiestarommet + Lek', guests: 14,
  birthdayChildren: [{ name: 'Stella', age: 12, birthDate: null }], price: 2965, customerName: 'Kari',
  customer: { firstName: 'Kari', lastName: 'Nordmann', phone: null, email: null }, createdAt: null, orderRows: [], paid: false, staffComment: null,
};
const created = newBookingText('2026-10-18', booking);
assert.deepEqual(created, { title: '🎈 Ny booking', body: 'søn 18. okt kl 12:30 · 👥 14 gjester · Fiestarommet + Lek' });
assert.ok(!JSON.stringify(created).includes('Kari') && !JSON.stringify(created).includes('Stella'), 'no names on the lock screen');
assert.deepEqual(bookingSoonText(booking, 30), {
  title: '⏰ Om 30 min: Fiestarommet + Lek',
  body: 'kl 12:30–14:30 · 👥 14 gjester · 🎂 1 bursdagsbarn',
});

const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, ' '); // Norwegian number formatting uses no-break spaces
assert.equal(plain(weeklyText(110000, 100000)), '💰 110 000 kr · uka før 100 000 kr (+10 %)');
assert.match(rainText(6.4, 10, 21), /^☔ Ca\. 6,4 mm regn i åpningstiden \(10–21\)/);
console.log('notification checks ok');
