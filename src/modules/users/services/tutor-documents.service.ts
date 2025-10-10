import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { File } from '../../storage/entities/file.entity';
import { StorageService } from '../../storage/services/storage.service';
import { QueueService } from '../../queue/services/queue.service';
import { TutorDocumentSet } from '../entities/tutor-document-set.entity';

export interface TutorDocumentUploadDto {
  file_type: 'degree' | 'certificate' | 'id_proof' | 'address_proof' | 'other';
  description?: string;
}

@Injectable()
export class TutorDocumentsService {
  private readonly logger = new Logger(TutorDocumentsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
    @InjectRepository(TutorDocumentSet)
    private readonly docSetRepository: Repository<TutorDocumentSet>,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Upload verification document for tutor
   */
  async uploadVerificationDocument(
    userId: string,
    file: any,
    uploadData: TutorDocumentUploadDto,
  ): Promise<File> {
    // Enforce constraints: max 2MB per file
    const maxBytes = 2 * 1024 * 1024;
    if (file?.size > maxBytes) {
      throw new BadRequestException('File too large. Max 2MB allowed');
    }
    this.logger.log(`Uploading verification document for tutor: ${userId}`);

    // Verify user is a tutor
    const user = await this.userRepository.findOne({
      where: { id: userId, user_type: 'tutor' },
    });

    if (!user || !user.tutor_details) {
      throw new NotFoundException('Tutor not found');
    }

    if (user.document_verification === 'verified') {
      throw new BadRequestException('Tutor is already verified');
    }

    // Upload file with specific metadata for tutor verification
    const fileUploadData = {
      file_type: 'document' as const,
      is_public: false, 
      metadata: JSON.stringify({
        tutor_verification: true,
        document_type: uploadData.file_type,
        description: uploadData.description,
        user_id: userId,
      }),
    };

    // Enforce max 5 docs per tutor
    const existing = await this.getTutorDocuments(userId);
    if (existing.length >= 5) {
      throw new BadRequestException('Maximum 5 documents allowed');
    }

    const uploadedFile = await this.storageService.uploadFile(userId, file, fileUploadData);

    // Queue tutor verification job for document upload
    await this.queueService.queueTutorVerification({
      userId,
      action: 'documents_uploaded',
    });

    // Mark user's document_verification as pending on first document upload
    if (!user.document_verification || user.document_verification !== 'pending') {
      user.document_verification = 'pending';
      await this.userRepository.save(user);
    }

    // Upsert tutor_document_sets for this user
    const nowIso = new Date().toISOString();
    const entry = {
      time: nowIso,
      file_type: uploadData.file_type,
      file_url: uploadedFile.file_url,
      file_name: uploadedFile.file_name,
    };
    let set = await this.docSetRepository.findOne({ where: { user_id: userId } });
    if (!set) {
      set = this.docSetRepository.create({ user_id: userId, documents: [entry] });
    } else {
      const docs = Array.isArray(set.documents) ? set.documents : [];
      set.documents = [...docs, entry];
    }
    await this.docSetRepository.save(set);

    this.logger.log(`Verification document uploaded successfully: ${uploadedFile.id}`);
    return uploadedFile;
  }

  /**
   * Get tutor's verification documents
   */
  async getTutorDocuments(userId: string): Promise<File[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId, user_type: 'tutor' },
    });

    if (!user || !user.tutor_details) {
      throw new NotFoundException('Tutor not found');
    }

    const documents = await this.fileRepository.find({
      where: {
        user_id: userId,
        file_type: 'document',
      },
      order: { created_at: 'DESC' },
    });

    // Filter only verification documents
    this.logger.log(`Found ${documents.length} documents for user ${userId}`);
    
    const filteredDocs = documents.filter(doc => {
      try {
        // Metadata is already a JSONB object, no need to parse
        const metadata = doc.metadata || {};
        this.logger.log(`Document ${doc.id} metadata:`, metadata);
        const isVerificationDoc = metadata.tutor_verification === true;
        this.logger.log(`Document ${doc.id} is verification doc: ${isVerificationDoc}`);
        return isVerificationDoc;
      } catch (error) {
        this.logger.error(`Error processing metadata for document ${doc.id}:`, error);
        return false;
      }
    });
    
    this.logger.log(`Filtered to ${filteredDocs.length} verification documents`);
    return filteredDocs;
  }

  /**
   * Delete verification document
   */
  async deleteVerificationDocument(userId: string, documentId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, user_type: 'tutor' },
    });

    if (!user || !user.tutor_details) {
      throw new NotFoundException('Tutor not found');
    }

    if (user.document_verification === 'verified') {
      throw new BadRequestException('Cannot delete documents for verified tutors');
    }

    const document = await this.fileRepository.findOne({
      where: {
        id: documentId,
        user_id: userId,
        file_type: 'document',
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Verify it's a verification document
    try {
      const metadata = JSON.parse(typeof document.metadata === 'string' ? document.metadata : '{}');
      if (!metadata.tutor_verification) {
        throw new BadRequestException('Document is not a verification document');
      }
    } catch {
      throw new BadRequestException('Invalid document metadata');
    }

    await this.fileRepository.remove(document);
    // Remove from aggregate set
    const set = await this.docSetRepository.findOne({ where: { user_id: userId } });
    if (set && Array.isArray(set.documents)) {
      set.documents = set.documents.filter(d => d.file_name !== document.file_name && d.file_url !== (document as any).file_url);
      await this.docSetRepository.save(set);
    }
    this.logger.log(`Verification document deleted: ${documentId}`);
  }

  /**
   * Check if tutor has required documents for verification
   */
  async checkVerificationRequirements(userId: string): Promise<{
    hasRequiredDocuments: boolean;
    missingDocuments: string[];
    uploadedDocuments: string[];
  }> {
    const documents = await this.getTutorDocuments(userId);
    
    const requiredDocuments = ['degree', 'id_proof', 'address_proof'];
    const uploadedTypes = new Set<string>();

    documents.forEach(doc => {
      try {
        const metadata = JSON.parse(typeof doc.metadata === 'string' ? doc.metadata : '{}');
        if (metadata.document_type) {
          uploadedTypes.add(metadata.document_type);
        }
      } catch {
        // Ignore invalid metadata
      }
    });

    const missingDocuments = requiredDocuments.filter(type => !uploadedTypes.has(type));
    const hasRequiredDocuments = missingDocuments.length === 0;

    return {
      hasRequiredDocuments,
      missingDocuments,
      uploadedDocuments: Array.from(uploadedTypes),
    };
  }

  /**
   * Update verification document metadata
   */
  async updateVerificationDocument(
    userId: string,
    documentId: string,
    update: { description?: string; document_type?: 'degree' | 'certificate' | 'id_proof' | 'address_proof' | 'other' },
  ): Promise<File> {
    const user = await this.userRepository.findOne({ where: { id: userId, user_type: 'tutor' } });
    if (!user || !user.tutor_details) {
      throw new NotFoundException('Tutor not found');
    }

    const document = await this.fileRepository.findOne({ where: { id: documentId, user_id: userId, file_type: 'document' } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Ensure it's one of our verification docs
    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(typeof document.metadata === 'string' ? document.metadata : JSON.stringify(document.metadata || {}));
    } catch {
      metadata = {};
    }
    if (!metadata.tutor_verification) {
      throw new BadRequestException('Document is not a verification document');
    }

    if (update.description !== undefined) metadata.description = update.description;
    if (update.document_type !== undefined) metadata.document_type = update.document_type;

    const updated = await this.storageService.updateFileMetadata(documentId, userId, metadata);

    // Update aggregate set entry's file_type if provided
    if (update.document_type) {
      const set = await this.docSetRepository.findOne({ where: { user_id: userId } });
      if (set && Array.isArray(set.documents)) {
        const idx = set.documents.findIndex(d => d.file_name === updated.file_name || d.file_url === updated.file_url);
        if (idx >= 0) {
          set.documents[idx] = { ...set.documents[idx], file_type: update.document_type };
          await this.docSetRepository.save(set);
        }
      }
    }

    return updated;
  }

  /**
   * Get verification document stream for direct serving
   */
  async getVerificationDocumentStream(userId: string, documentId: string): Promise<{ stream: any; file: any }> {
    this.logger.log(`Getting verification document stream for user: ${userId}, document: ${documentId}`);

    const user = await this.userRepository.findOne({ where: { id: userId, user_type: 'tutor' } });
    if (!user || !user.tutor_details) {
      throw new NotFoundException('Tutor not found');
    }

    const document = await this.fileRepository.findOne({ where: { id: documentId, user_id: userId, file_type: 'document' } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Only allow access to verification documents
    const metadata = document.metadata || {};
    if (!metadata.tutor_verification) {
      throw new BadRequestException('Document is not a verification document');
    }

    // Get the file stream
    const { stream, file } = await this.storageService.getFileStream(documentId, userId);

    return { stream, file };
  }

  /**
   * Get a time-limited download URL for a verification document
   */
  async getVerificationDocumentUrl(userId: string, documentId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId, user_type: 'tutor' } });
    if (!user || !user.tutor_details) {
      throw new NotFoundException('Tutor not found');
    }

    const document = await this.fileRepository.findOne({ where: { id: documentId, user_id: userId, file_type: 'document' } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Only allow access to verification documents
    try {
      // Metadata is already a JSONB object, no need to parse
      const metadata = document.metadata || {};
      if (!metadata.tutor_verification) {
        throw new BadRequestException('Document is not a verification document');
      }
    } catch (error) {
      this.logger.error(`Error processing metadata for document ${documentId}:`, error);
      throw new BadRequestException('Invalid document metadata');
    }

    return this.storageService.getFileDownloadUrl(documentId, userId);
  }
}
