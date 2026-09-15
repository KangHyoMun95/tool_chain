import { MigrationInterface, QueryRunner } from "typeorm";

export class HomepagesAsHostname1789477349623 implements MigrationInterface {
    name = 'HomepagesAsHostname1789477349623'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Replace the JSON-based homepage_configs with a relational hostname model.
        await queryRunner.query(`DROP TABLE IF EXISTS "homepage_configs"`);
        await queryRunner.query(`CREATE TABLE "hostname" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "url" character varying(1024) NOT NULL, "owner_sub_admin_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_152a6ac1d6d112044ad316312a5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e4dba1b174e20fa71a6fc95c05" ON "hostname" ("owner_sub_admin_id") `);
        await queryRunner.query(`CREATE TABLE "user_hostnames" ("user_id" uuid NOT NULL, "hostname_id" uuid NOT NULL, CONSTRAINT "PK_30be9852be70be970e1189c2358" PRIMARY KEY ("user_id", "hostname_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_65702cb07625c173c1f197d32e" ON "user_hostnames" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_54d2d6af918567075cf5f0696f" ON "user_hostnames" ("hostname_id") `);
        await queryRunner.query(`ALTER TABLE "hostname" ADD CONSTRAINT "FK_e4dba1b174e20fa71a6fc95c057" FOREIGN KEY ("owner_sub_admin_id") REFERENCES "sub_admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_hostnames" ADD CONSTRAINT "FK_65702cb07625c173c1f197d32ef" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_hostnames" ADD CONSTRAINT "FK_54d2d6af918567075cf5f0696fd" FOREIGN KEY ("hostname_id") REFERENCES "hostname"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_hostnames" DROP CONSTRAINT "FK_54d2d6af918567075cf5f0696fd"`);
        await queryRunner.query(`ALTER TABLE "user_hostnames" DROP CONSTRAINT "FK_65702cb07625c173c1f197d32ef"`);
        await queryRunner.query(`ALTER TABLE "hostname" DROP CONSTRAINT "FK_e4dba1b174e20fa71a6fc95c057"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_54d2d6af918567075cf5f0696f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_65702cb07625c173c1f197d32e"`);
        await queryRunner.query(`DROP TABLE "user_hostnames"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4dba1b174e20fa71a6fc95c05"`);
        await queryRunner.query(`DROP TABLE "hostname"`);
        // Restore the previous JSON-based homepage_configs table.
        await queryRunner.query(`CREATE TABLE "homepage_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "admin_con_id" uuid NOT NULL, "content" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_6fd280bfac1e94e1d020b4c5bb" UNIQUE ("admin_con_id"), CONSTRAINT "PK_7ee95dd2a2b46669bbcf7ec05b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "homepage_configs" ADD CONSTRAINT "FK_6fd280bfac1e94e1d020b4c5bba" FOREIGN KEY ("admin_con_id") REFERENCES "sub_admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
