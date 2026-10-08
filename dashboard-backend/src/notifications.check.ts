// Run with `npx tsx src/notifications.check.ts`: checks when each staff notification is due and its booking text.
import assert from 'node:assert';
import { bookingsText, dueNotification } from './notifications';

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
assert.equal(bookingsText(0, 0), 'Ingen bookinger i dag');
assert.equal(bookingsText(1, 12), 'Vi har 1 booking i dag · 12 gjester');
assert.equal(bookingsText(2, 34), 'Vi har 2 bookinger i dag · 34 gjester');
console.log('notification checks ok');
