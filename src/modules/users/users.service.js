import { prisma } from '../../lib/prisma.js';

export function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      username: true,
      nama: true,
      role: true,
      isActive: true,
      rt: { select: { id: true, noRt: true, noRw: true } },
    },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  });
}
