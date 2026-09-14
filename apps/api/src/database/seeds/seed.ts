import 'reflect-metadata';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { hashPassword } from '../../common/utils/password';
import { Admin } from '../entities/admin.entity';
import AppDataSource from '../data-source';

/**
 * Idempotent seed: ensures one Admin(Host) account exists for testing.
 * Credentials come from HOST_USERNAME / HOST_PASSWORD (see .env), with
 * safe defaults. Run: `pnpm --filter @toolhackchain/api seed`.
 */
async function seed(): Promise<void> {
  const username = process.env.HOST_USERNAME ?? 'host';
  const password = process.env.HOST_PASSWORD ?? 'Host@12345';

  await AppDataSource.initialize();
  try {
    const admins = AppDataSource.getRepository(Admin);

    const existing = await admins.findOne({ where: { username } });
    if (existing) {
      console.log(`[seed] Admin(Host) "${username}" already exists — skipping.`);
      return;
    }

    const admin = admins.create({
      username,
      passwordHash: await hashPassword(password),
      role: Role.HOST,
      status: AccountStatus.ACTIVE,
      points: 0,
    });
    await admins.save(admin);

    console.log('[seed] Created Admin(Host):');
    console.log(`         id:       ${admin.id}`);
    console.log(`         username: ${username}`);
    console.log(`         password: ${password}`);
    console.log('[seed] Change the password after first login.');
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
