import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('tutor_document_sets')
export class TutorDocumentSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  documents!: Array<{ time: string; file_type: string; file_url: string; file_name: string }>;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;
}


