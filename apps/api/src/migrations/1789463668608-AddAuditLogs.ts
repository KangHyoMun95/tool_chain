import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditLogs1789463668608 implements MigrationInterface {
    name = 'AddAuditLogs1789463668608'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action" character varying(64) NOT NULL, "entity_type" character varying(64) NOT NULL, "entity_id" character varying(64), "column_name" character varying(64), "old_value" text, "new_value" text, "actor_by" character varying(64), "actor_role" character varying(32), "reason" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea9ba3dfb39050f831ee3be40d" ON "audit_logs" ("entity_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_85c204d8e47769ac183b32bf9c" ON "audit_logs" ("entity_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4a733409d4cf5dcff41cc4dc5e" ON "audit_logs" ("actor_by") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_4a733409d4cf5dcff41cc4dc5e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_85c204d8e47769ac183b32bf9c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ea9ba3dfb39050f831ee3be40d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
