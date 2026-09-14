import 'reflect-metadata';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { hashPassword } from '../../common/utils/password';
import { Admin } from '../entities/admin.entity';
import { AdminCon } from '../entities/admin-con.entity';
import AppDataSource from '../data-source';

/**
 * Idempotent seed for local testing:
 *  - one Admin(Host) from HOST_USERNAME / HOST_PASSWORD (defaults host / Host@12345)
 *  - one demo Admin(Con) from DEMO_ADMINCON_USERNAME / DEMO_ADMINCON_PASSWORD
 *    (defaults admin / admin) linked to that Host, so you can log into the
 *    (admin) area right away. This is a DEV/DEMO account — do not seed it in
 *    production.
 *
 * Run: `pnpm --filter @toolhackchain/api seed`.
 */
async function seed(): Promise<void> {
  const hostUsername = process.env.HOST_USERNAME ?? 'host';
  const hostPassword = process.env.HOST_PASSWORD ?? 'Host@12345';
  const conUsername = process.env.DEMO_ADMINCON_USERNAME ?? 'admin';
  const conPassword = process.env.DEMO_ADMINCON_PASSWORD ?? 'admin';

  await AppDataSource.initialize();
  try {
    const admins = AppDataSource.getRepository(Admin);
    const adminCons = AppDataSource.getRepository(AdminCon);

    // --- Admin(Host) ---
    let host = await admins.findOne({ where: { username: hostUsername } });
    if (host) {
      console.log(`[seed] Admin(Host) "${hostUsername}" already exists — skipping.`);
    } else {
      host = await admins.save(
        admins.create({
          username: hostUsername,
          passwordHash: await hashPassword(hostPassword),
          role: Role.HOST,
          status: AccountStatus.ACTIVE,
          points: 0,
        }),
      );
      console.log('[seed] Created Admin(Host):');
      console.log(`         id:       ${host.id}`);
      console.log(`         username: ${hostUsername}`);
      console.log(`         password: ${hostPassword}`);
    }

    // --- Demo Admin(Con) under that Host ---
    const existingCon = await adminCons.findOne({
      where: { username: conUsername },
    });
    if (existingCon) {
      console.log(`[seed] Admin(Con) "${conUsername}" already exists — skipping.`);
    } else {
      const con = await adminCons.save(
        adminCons.create({
          username: conUsername,
          passwordHash: await hashPassword(conPassword),
          role: Role.ADMIN_CON,
          status: AccountStatus.ACTIVE,
          points: 0,
          hostId: host.id,
        }),
      );
      console.log('[seed] Created demo Admin(Con):');
      console.log(`         id:       ${con.id}`);
      console.log(`         username: ${conUsername}`);
      console.log(`         password: ${conPassword}`);
    }

    console.log('[seed] Done. Change these passwords after first login.');
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
