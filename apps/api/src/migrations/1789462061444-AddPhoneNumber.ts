import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPhoneNumber1789462061444 implements MigrationInterface {
    name = 'AddPhoneNumber1789462061444'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "phone_number" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "sub_admins" ADD "phone_number" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "homepage_configs" ALTER COLUMN "content" SET DEFAULT '{}'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "homepage_configs" ALTER COLUMN "content" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "sub_admins" DROP COLUMN "phone_number"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_number"`);
    }

}
