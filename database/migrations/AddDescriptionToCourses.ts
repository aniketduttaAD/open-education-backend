import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDescriptionToCourses1700000000000 implements MigrationInterface {
    name = 'AddDescriptionToCourses1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "courses" 
            ADD COLUMN "description" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "courses" 
            DROP COLUMN "description"
        `);
    }
}
