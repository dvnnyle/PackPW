// Run with `npx tsx src/notifications.check.ts`: checks when each staff notification is due and its booking text.
import assert from 'node:assert';
import { bookingsText, dueNotification, punchInText } from './notifications';

// 2026-10-08 is a Thursday (open 10–21), 2026-10-10 a Saturday (open 10–19).
assert.equal(dueNotification('2026-10-08', 9, 0), null);
assert.equal(dueNotification('2026-10-08', 10, 0), 'bookings');
assert.equal(dueNotification('2026-10-08', 10, 1), null);
assert.equal(dueNotification('2026-10-08', 11, 0), 'hourly');
assert.equal(dueNotification('2026-10-08', 20, 0), 'hourly');
assert.equal(dueNotification('2026-10-08', 21, 0), null);
assert.equal(dueNotification('2026-10-08', 21, 10), 'closing');
assert.equal(dueNotification('2026-10-10', 19, 0), null);
assert.equal(dueNotification('2026-10-10', 19, 10), 'closing');
assert.equal(bookingsText(0, 0), '📭 Ingen bookinger i dag');
assert.equal(bookingsText(1, 12), '🎉 Vi har 1 booking i dag · 👥 12 gjester');
assert.equal(bookingsText(2, 34), '🎉 Vi har 2 bookinger i dag · 👥 34 gjester');
const shift = { date: '2026-10-13', name: 'Mathea Hjulstad', group: 'Resepsjon', start: '09:50', end: '16:00', status: 'PunchclockStarted', punchIn: '09:48', punchOut: null };
assert.deepEqual(punchInText(shift), { title: '👋 Mathea Hjulstad er på jobb', body: '⏰ Stemplet inn 09:48 · Resepsjon · vakt 09:50–16:00' });
assert.equal(punchInText({ ...shift, group: null }).body, '⏰ Stemplet inn 09:48 · vakt 09:50–16:00');
console.log('notification checks ok');
