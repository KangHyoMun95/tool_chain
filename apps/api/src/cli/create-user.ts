// src/cli/create-user.ts
// Tạo user đầu tiên (HOST) hoặc user cấp dưới, không qua HTTP và không hardcode hash trong migration.
//   pnpm --filter @toolhackchain/api create-host
//   pnpm --filter @toolhackchain/api create-user --role ADMIN --refer-phone <phone của HOST>
// Phone / mật khẩu lấy từ NEW_USER_PHONE / NEW_USER_PASSWORD, thiếu thì hỏi (mật khẩu được ẩn).
import "dotenv/config";
import argon2 from "argon2";
import pg from "pg";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { ROLES, UserStatus, type Role } from "@toolhackchain/shared";
import { ARGON2_OPTIONS } from "../auth/password.js";

const REFER_ROLE: Record<Role, Role | null> = { HOST: null, ADMIN: "HOST", USER: "ADMIN" };
const MIN_PASSWORD_LENGTH = 12;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    process.stdout.write(question);
    muted = hidden;
    rl.question("", (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const { values } = parseArgs({
  options: { role: { type: "string", default: "HOST" }, "refer-phone": { type: "string" } },
  allowPositionals: true,
});

const role = values.role as Role;
if (!ROLES.includes(role)) fail(`--role must be one of ${ROLES.join(", ")}`);
const referRole = REFER_ROLE[role];
if (referRole && !values["refer-phone"]) fail(`--refer-phone (phone of an ACTIVE ${referRole}) is required for ${role}`);
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set");

const phone = process.env.NEW_USER_PHONE?.trim() || (await ask("Phone number: "));
const password = process.env.NEW_USER_PASSWORD || (await ask("Password: ", true));
if (phone.length < 6 || phone.length > 20) fail("phone number must be 6-20 characters");
if (password.length < MIN_PASSWORD_LENGTH) fail(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");

  const roleRow = await client.query<{ role_id: number }>("SELECT role_id FROM roles WHERE role_name = $1", [role]);
  if (roleRow.rowCount === 0) fail(`role ${role} not found (did Flyway seed roles?)`);

  const exists = await client.query("SELECT 1 FROM users WHERE phone_number = $1", [phone]);
  if (exists.rowCount) fail("phone number already exists");

  let referUserId: string | null = null;
  if (referRole) {
    const refer = await client.query<{ user_id: string }>(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.phone_number = $1 AND r.role_name = $2 AND u.status = $3`,
      [values["refer-phone"], referRole, UserStatus.ACTIVE],
    );
    if (refer.rowCount === 0) fail(`no ACTIVE ${referRole} with phone ${values["refer-phone"]}`);
    referUserId = refer.rows[0].user_id;
  }

  const hash = await argon2.hash(password, ARGON2_OPTIONS);
  const created = await client.query<{ user_id: string }>(
    `INSERT INTO users (phone_number, password, role_id, refer_user_id, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
    [phone, hash, roleRow.rows[0].role_id, referUserId, UserStatus.ACTIVE],
  );
  await client.query("COMMIT");
  console.log(`Created ${role} user_id=${created.rows[0].user_id}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw e;
} finally {
  await client.end();
}
