import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserType = 'student' | 'tutor' | 'admin';
export type GenderType = 'male' | 'female' | 'other';
export type DocumentVerificationType = 'pending' | 'verified' | 'rejected';

export interface TutorDetails {
  register_fees_paid: boolean;
  bio?: string;
  qualifications?: string | {
    education: string;
    certifications: string[];
    experience_years: number;
  };
  teaching_experience?: string;
  specializations?: string[];
  languages_spoken?: string[];
  expertise_areas?: string[];
  verification_status: 'pending' | 'verified' | 'rejected';
  bank_details?: {
    account_holder_name: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    account_type: 'savings' | 'current';
    verified: boolean;
  };
}

export interface StudentDetails {
  degree?: string;
  college_name?: string;
  interests?: string[];
  learning_goals?: string[];
  preferred_languages?: string[];
  education_level?: string;
  experience_level?: string;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image?: string;

  @Column({ 
    type: 'enum',
    enum: ['male', 'female', 'other'],
    nullable: true 
  })
  gender?: GenderType;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'date', nullable: true })
  dob?: Date;

  @Column({
    type: 'enum',
    enum: ['student', 'tutor', 'admin'],
    nullable: true,
  })
  user_type?: UserType | null;

  @Column({ type: 'jsonb', nullable: true })
  tutor_details?: TutorDetails;

  @Column({ type: 'jsonb', nullable: true })
  student_details?: StudentDetails;

  @Column({ type: 'boolean', nullable: true })
  onboarding_complete?: boolean;

  @Column({
    type: 'enum',
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
    nullable: true,
  })
  document_verification?: DocumentVerificationType;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at!: Date;
}
