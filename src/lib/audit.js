import { prisma } from './prisma.js';

// Records who changed what (audit_log). Pass the transaction client as `db` so the log entry
// commits or rolls back together with the change it describes. Never put password hashes in `data`.
//   await audit(tx, { userId: actor.id, aksi: 'user.create', entitas: 'user', entitasId: user.id, data })
export function audit(db = prisma, { userId, aksi, entitas, entitasId, data }) {
  return db.auditLog.create({
    data: {
      userId: userId ?? null,
      aksi,
      entitas,
      entitasId: entitasId == null ? null : String(entitasId),
      data,
    },
  });
}

// { field: { dari, ke } } for the fields that actually changed — the `data` of *.update entries.
export function diff(before, after) {
  const changes = {};
  for (const [key, value] of Object.entries(after)) {
    if (value !== undefined && before[key] !== value) {
      changes[key] = { dari: before[key] ?? null, ke: value };
    }
  }
  return changes;
}
