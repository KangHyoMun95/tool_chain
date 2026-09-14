import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1789373757852 implements MigrationInterface {
    name = 'InitSchema1789373757852'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('HOST', 'ADMIN_CON', 'USER')`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(64) NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'USER', "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "points" integer NOT NULL DEFAULT '0', "managed_by_admin_con_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username") `);
        await queryRunner.query(`CREATE INDEX "IDX_01cb71ac500daa945f2ef568ad" ON "users" ("managed_by_admin_con_id") `);
        await queryRunner.query(`CREATE TABLE "homepage_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "admin_con_id" uuid NOT NULL, "content" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_6fd280bfac1e94e1d020b4c5bb" UNIQUE ("admin_con_id"), CONSTRAINT "PK_7ee95dd2a2b46669bbcf7ec05b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6fd280bfac1e94e1d020b4c5bb" ON "homepage_configs" ("admin_con_id") `);
        await queryRunner.query(`CREATE TYPE "public"."sub_admins_role_enum" AS ENUM('HOST', 'ADMIN_CON', 'USER')`);
        await queryRunner.query(`CREATE TYPE "public"."sub_admins_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "sub_admins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(64) NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."sub_admins_role_enum" NOT NULL DEFAULT 'ADMIN_CON', "status" "public"."sub_admins_status_enum" NOT NULL DEFAULT 'ACTIVE', "points" integer NOT NULL DEFAULT '0', "host_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b38b551abd5cfac5da700d1738a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_99ad6655c0d7e408ba4bc7db1e" ON "sub_admins" ("username") `);
        await queryRunner.query(`CREATE INDEX "IDX_66852eabba28e4c7552af1b724" ON "sub_admins" ("host_id") `);
        await queryRunner.query(`CREATE TYPE "public"."admins_role_enum" AS ENUM('HOST', 'ADMIN_CON', 'USER')`);
        await queryRunner.query(`CREATE TYPE "public"."admins_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "admins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "username" character varying(64) NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."admins_role_enum" NOT NULL DEFAULT 'HOST', "status" "public"."admins_status_enum" NOT NULL DEFAULT 'ACTIVE', "points" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4ba6d0c734d53f8e1b2e24b6c5" ON "admins" ("username") `);
        await queryRunner.query(`CREATE TYPE "public"."point_transactions_to_entity_type_enum" AS ENUM('ADMIN_CON', 'USER')`);
        await queryRunner.query(`CREATE TABLE "point_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "from_admin_id" uuid NOT NULL, "to_entity_type" "public"."point_transactions_to_entity_type_enum" NOT NULL, "to_entity_id" uuid NOT NULL, "amount" integer NOT NULL, "reason" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ceb5185b63f070e23d65509b0a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9d0c8d98f6747992226b33e003" ON "point_transactions" ("from_admin_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_aa4ba73bcaa58f84cbff920052" ON "point_transactions" ("to_entity_id") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_01cb71ac500daa945f2ef568ad8" FOREIGN KEY ("managed_by_admin_con_id") REFERENCES "sub_admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "homepage_configs" ADD CONSTRAINT "FK_6fd280bfac1e94e1d020b4c5bba" FOREIGN KEY ("admin_con_id") REFERENCES "sub_admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sub_admins" ADD CONSTRAINT "FK_66852eabba28e4c7552af1b7241" FOREIGN KEY ("host_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sub_admins" DROP CONSTRAINT "FK_66852eabba28e4c7552af1b7241"`);
        await queryRunner.query(`ALTER TABLE "homepage_configs" DROP CONSTRAINT "FK_6fd280bfac1e94e1d020b4c5bba"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_01cb71ac500daa945f2ef568ad8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa4ba73bcaa58f84cbff920052"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9d0c8d98f6747992226b33e003"`);
        await queryRunner.query(`DROP TABLE "point_transactions"`);
        await queryRunner.query(`DROP TYPE "public"."point_transactions_to_entity_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4ba6d0c734d53f8e1b2e24b6c5"`);
        await queryRunner.query(`DROP TABLE "admins"`);
        await queryRunner.query(`DROP TYPE "public"."admins_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."admins_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_66852eabba28e4c7552af1b724"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_99ad6655c0d7e408ba4bc7db1e"`);
        await queryRunner.query(`DROP TABLE "sub_admins"`);
        await queryRunner.query(`DROP TYPE "public"."sub_admins_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."sub_admins_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6fd280bfac1e94e1d020b4c5bb"`);
        await queryRunner.query(`DROP TABLE "homepage_configs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01cb71ac500daa945f2ef568ad"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
