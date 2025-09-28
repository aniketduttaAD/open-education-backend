import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import {
  StudentTokenAllocation,
  TutorDocument,
  // TutorEarning, // Commented out - duplicate entity exists in PaymentsModule
  TutorWithdrawal,
  TutorLeaderboard,
} from '../entities';
import {
  UpdateTutorDetailsDto,
  UpdateStudentDetailsDto,
} from '../../auth/dto';

/**
 * Users service for managing user profiles, achievements, and tutor-specific features
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(StudentTokenAllocation)
    private studentTokenAllocationRepository: Repository<StudentTokenAllocation>,
    @InjectRepository(TutorDocument)
    private tutorDocumentRepository: Repository<TutorDocument>,
    // @InjectRepository(TutorEarning) // Commented out - duplicate entity exists in PaymentsModule
    // private tutorEarningRepository: Repository<TutorEarning>,
  // @InjectRepository(TutorWithdrawal)
  // private tutorWithdrawalRepository: Repository<TutorWithdrawal>,
    @InjectRepository(TutorLeaderboard)
    private tutorLeaderboardRepository: Repository<TutorLeaderboard>,
  ) {}

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User> {
    this.logger.log(`Getting user by ID: ${userId}`);
    
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updateData: any): Promise<User> {
    this.logger.log(`Updating user profile for user: ${userId}`);
    
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, updateData);
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Update tutor details
   */
  async updateTutorDetails(userId: string, tutorDetails: UpdateTutorDetailsDto): Promise<User> {
    this.logger.log(`Updating tutor details for user: ${userId}`);
    
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.user_type !== 'tutor') {
      throw new BadRequestException('User is not a tutor');
    }

    user.tutor_details = {
      register_fees_paid: false,
      verification_status: 'pending' as const,
      ...user.tutor_details,
      ...tutorDetails
    };
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Update student details
   */
  async updateStudentDetails(userId: string, studentDetails: UpdateStudentDetailsDto): Promise<User> {
    this.logger.log(`Updating student details for user: ${userId}`);
    
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.user_type !== 'student') {
      throw new BadRequestException('User is not a student');
    }

    user.student_details = { ...user.student_details, ...studentDetails };
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Update onboarding status
   */
  async updateOnboardingStatus(userId: string, onboardingComplete: boolean): Promise<User> {
    this.logger.log(`Updating onboarding status for user: ${userId}`);
    
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.onboarding_complete = onboardingComplete;
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Get tutors
   */
  async getTutors(page: number = 1, limit: number = 10): Promise<{ users: User[]; total: number }> {
    this.logger.log(`Getting tutors - page: ${page}, limit: ${limit}`);
    
    const [users, total] = await this.userRepository.findAndCount({
      where: { user_type: 'tutor' },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    return { users, total };
  }

  /**
   * Get students
   */
  async getStudents(page: number = 1, limit: number = 10): Promise<{ users: User[]; total: number }> {
    this.logger.log(`Getting students - page: ${page}, limit: ${limit}`);
    
    const [users, total] = await this.userRepository.findAndCount({
      where: { user_type: 'student' },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    return { users, total };
  }

  /**
   * Get current user details with profile information (legacy method)
   */
  async getCurrentUser(userId: string): Promise<User> {
    return this.getUserById(userId);
  }

  /**
   * Complete student onboarding
   */
  async completeStudentOnboarding(userId: string, onboardingData: any): Promise<User> {
    this.logger.log(`Completing student onboarding for user: ${userId}`);

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.user_type !== 'student') {
      throw new BadRequestException('User is not a student');
    }

    // Update user basic information and student details
    user.name = onboardingData.name;
    user.image = onboardingData.profile_image_url || user.image;
    user.student_details = {
      ...user.student_details,
      preferred_languages: onboardingData.preferred_languages || ['English'],
      learning_goals: onboardingData.learning_goals,
      education_level: onboardingData.education_level,
    };
    user.onboarding_complete = true;

    await this.userRepository.save(user);

    // Legacy gamification initialization removed - module deleted

    this.logger.log(`Student onboarding completed for user: ${userId}`);
    return this.getCurrentUser(userId);
  }

  /**
   * Complete tutor onboarding
   */
  async completeTutorOnboarding(userId: string, onboardingData: any): Promise<User> {
    this.logger.log(`Completing tutor onboarding for user: ${userId}`);

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.user_type !== 'tutor') {
      throw new BadRequestException('User is not a tutor');
    }

    // Update user basic information and tutor details
    user.name = onboardingData.name;
    user.image = onboardingData.profile_image_url || user.image;
    user.tutor_details = {
      ...user.tutor_details,
      bio: onboardingData.bio,
      qualifications: onboardingData.qualifications,
      teaching_experience: onboardingData.teaching_experience,
      specializations: onboardingData.specializations || [],
      languages_spoken: onboardingData.languages_spoken || ['English'],
      verification_status: 'pending',
      register_fees_paid: false,
    };

    await this.userRepository.save(user);

    // Create initial leaderboard entry
    await this.createInitialLeaderboardEntry(userId);

    this.logger.log(`Tutor onboarding completed for user: ${userId}`);
    return this.getCurrentUser(userId);
  }

  /**
   * Update student profile
   */
  async updateStudentProfile(userId: string, updateData: any): Promise<User> {
    this.logger.log(`Updating student profile for user: ${userId}`);

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || user.user_type !== 'student') {
      throw new NotFoundException('Student not found');
    }

    // Update user information
    if (updateData.name) user.name = updateData.name;
    if (updateData.profile_image_url) user.image = updateData.profile_image_url;

    // Update student details
    if (user.student_details) {
      user.student_details = { ...user.student_details, ...updateData };
    } else {
      user.student_details = updateData;
    }

    await this.userRepository.save(user);
    return this.getCurrentUser(userId);
  }

  /**
   * Update tutor profile
   */
  async updateTutorProfile(userId: string, updateData: any): Promise<User> {
    this.logger.log(`Updating tutor profile for user: ${userId}`);

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || user.user_type !== 'tutor') {
      throw new NotFoundException('Tutor not found');
    }

    // Update user information
    if (updateData.name) user.name = updateData.name;
    if (updateData.profile_image_url) user.image = updateData.profile_image_url;

    // Update tutor details
    if (user.tutor_details) {
      user.tutor_details = { ...user.tutor_details, ...updateData };
    } else {
      user.tutor_details = updateData;
    }

    await this.userRepository.save(user);
    return this.getCurrentUser(userId);
  }

  /**
   * Get verified tutors list
   */
  async getVerifiedTutors(page: number = 1, limit: number = 10): Promise<{ tutors: User[]; total: number }> {
    this.logger.log(`Getting verified tutors - page: ${page}, limit: ${limit}`);

    const [tutors, total] = await this.userRepository.findAndCount({
      where: {
        user_type: 'tutor',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const verifiedTutors = tutors.filter(tutor =>
      tutor.tutor_details?.verification_status === 'verified'
    );

    return {
      tutors: verifiedTutors.map(tutor => this.sanitizeUser(tutor)),
      total: verifiedTutors.length,
    };
  }

  // Legacy gamification methods removed - module deleted

  /**
   * Get student token allocations
   */
  async getStudentTokenAllocations(userId: string): Promise<StudentTokenAllocation[]> {
    this.logger.log(`Getting token allocations for student: ${userId}`);

    return this.studentTokenAllocationRepository.find({
      where: { user_id: userId },
      order: { allocation_month: 'DESC' },
    });
  }

  // Legacy wishlist methods removed - module deleted

  /**
   * Get tutor earnings
   */
  async getTutorEarnings(userId: string): Promise<any[]> {
    this.logger.log(`Getting earnings for tutor: ${userId}`);
    return [];
  }

  /**
   * Request withdrawal
   */
  // async requestWithdrawal(userId: string, withdrawalData: any): Promise<TutorWithdrawal> {
  //   this.logger.log(`Processing withdrawal request for tutor: ${userId}`);
  //   const withdrawal = this.tutorWithdrawalRepository.create({ user_id: userId, ...withdrawalData, status: 'pending' });
  //   return this.tutorWithdrawalRepository.save(withdrawal);
  // }

  /**
   * Get withdrawal history
   */
  // async getWithdrawalHistory(userId: string): Promise<TutorWithdrawal[]> {
  //   this.logger.log(`Getting withdrawal history for tutor: ${userId}`);
  //   return await this.tutorWithdrawalRepository.find({ where: { user_id: userId }, order: { created_at: 'DESC' } });
  // }

  /**
   * Get tutor leaderboard
   */
  async getTutorLeaderboard(limit: number = 10): Promise<TutorLeaderboard[]> {
    this.logger.log(`Getting tutor leaderboard - limit: ${limit}`);

    return this.tutorLeaderboardRepository.find({
      relations: ['user'],
      order: { rank_position: 'ASC' },
      take: limit,
    });
  }

  // Legacy gamification method removed - module deleted

  /**
   * Create initial leaderboard entry
   */
  private async createInitialLeaderboardEntry(userId: string): Promise<void> {
    const existingEntry = await this.tutorLeaderboardRepository.findOne({
      where: { user_id: userId },
    });

    if (!existingEntry) {
      const leaderboardEntry = this.tutorLeaderboardRepository.create({
        user_id: userId,
        total_courses: 0,
        total_students: 0,
        average_rating: 0,
        total_ratings: 0,
        total_earnings: 0,
        completion_rate: 0,
        rank_position: 0,
        previous_rank: 0,
        rank_change: 0,
      });

      await this.tutorLeaderboardRepository.save(leaderboardEntry);
    }
  }

  /**
   * Sanitize user data for response
   */
  private sanitizeUser(user: User): User {
    // Remove sensitive data if needed
    return user;
  }
}
