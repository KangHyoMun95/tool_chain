import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastLoginAt1789450756924 implements MigrationInterface {
    name = 'AddLastLoginAt1789450756924'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "last_login_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "sub_admins" ADD "last_login_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "last_login_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "homepage_configs" ALTER COLUMN "content" SET DEFAULT '{}'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "homepage_configs" ALTER COLUMN "content" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "last_login_at"`);
        await queryRunner.query(`ALTER TABLE "sub_admins" DROP COLUMN "last_login_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_login_at"`);
    }

}
