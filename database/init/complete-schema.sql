-- Complete OpenEdu Database Schema
-- This file combines and organizes all database schema elements for the OpenEdu platform
-- Generated: 2025-09-27

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- ENUMS AND TYPES
-- =============================================

-- User system enums
CREATE TYPE user_type AS ENUM ('student', 'tutor', 'admin');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE document_verification_type AS ENUM ('pending', 'verified', 'rejected');

-- Payment system enums
CREATE TYPE payment_purpose AS ENUM ('course', 'registration');
CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'failed');

-- Order system enums
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending','payment_verified','captured','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE order_type AS ENUM ('tutor_registration','course_enrollment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payout_status AS ENUM ('pending','processing','paid','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Course system enums
DO $$ BEGIN
    CREATE TYPE embedding_kind AS ENUM ('course','section','subtopic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE enrollment_role AS ENUM ('tutor','student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================
-- CORE USER SYSTEM
-- =============================================

-- Users table with unified structure
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    image VARCHAR(500),
    gender gender_type,
    bio TEXT,
    dob DATE,
    user_type user_type DEFAULT NULL,
    tutor_details JSONB,
    student_details JSONB,
    onboarding_complete BOOLEAN DEFAULT NULL,
    document_verification document_verification_type DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- PAYMENT AND ORDER SYSTEM
-- =============================================

-- Legacy payments table for Razorpay integration
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose payment_purpose NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',
    transaction_id VARCHAR(255) UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature VARCHAR(255),
    gateway_response JSONB,
    failure_reason TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table (business orders)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    razorpay_order_id VARCHAR(255) UNIQUE,
    status order_status NOT NULL DEFAULT 'pending',
    receipt VARCHAR(255),
    order_type order_type NOT NULL,
    course_id UUID,
    tutor_id UUID,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order payments (Razorpay payment records for orders)
CREATE TABLE order_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    razorpay_payment_id VARCHAR(255) UNIQUE,
    razorpay_signature VARCHAR(255),
    payment_method VARCHAR(50),
    payment_captured BOOLEAN DEFAULT FALSE,
    captured_at TIMESTAMP WITH TIME ZONE,
    gateway_response JSONB,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor earnings (per sale)
CREATE TABLE tutor_earnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    course_id UUID,
    gross_amount BIGINT NOT NULL,
    platform_commission BIGINT NOT NULL,
    tutor_earnings BIGINT NOT NULL,
    payout_status payout_status NOT NULL DEFAULT 'pending',
    payout_date DATE,
    razorpay_payout_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Monthly payouts (aggregated payouts)
CREATE TABLE monthly_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL,
    total_earnings BIGINT NOT NULL,
    total_commission BIGINT NOT NULL,
    net_payout BIGINT NOT NULL,
    payout_status payout_status NOT NULL DEFAULT 'pending',
    payout_date DATE,
    razorpay_payout_id VARCHAR(255),
    bank_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook events (idempotency/audit)
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    payment_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- =============================================
-- FILE STORAGE SYSTEM
-- =============================================

-- Files table for uploaded assets (verification docs stored here)
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    bucket_name VARCHAR(100) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ready',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB,
    thumbnail_url VARCHAR(500),
    preview_url VARCHAR(500),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor document sets: one row per tutor, JSONB array of docs
CREATE TABLE tutor_document_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    documents JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- COURSE SYSTEM
-- =============================================

-- Courses
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    tutor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price_inr INTEGER, -- whole-number INR, no decimals
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Course sections
CREATE TABLE course_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id, index)
);

-- Course subtopics
CREATE TABLE course_subtopics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    markdown_path TEXT,
    transcript_path TEXT,
    audio_path TEXT,
    video_url TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(section_id, index)
);

-- Course roadmap storage (temporary before finalization)
CREATE TABLE course_roadmaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    tutor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roadmap_data JSONB NOT NULL, -- Complete roadmap structure
    status VARCHAR(50) DEFAULT 'draft', -- draft, finalizing, finalized
    redis_key VARCHAR(255), -- Reference to Redis storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finalized_at TIMESTAMP WITH TIME ZONE
);

-- Course generation progress tracking
CREATE TABLE course_generation_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    roadmap_id UUID NOT NULL REFERENCES course_roadmaps(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    current_step VARCHAR(100), -- e.g., "generating_md_files", "creating_transcripts"
    progress_percentage INTEGER DEFAULT 0, -- 0-100
    current_section_index INTEGER DEFAULT 0,
    current_subtopic_index INTEGER DEFAULT 0,
    total_sections INTEGER,
    total_subtopics INTEGER,
    estimated_time_remaining INTEGER, -- in minutes
    error_log JSONB DEFAULT '[]', -- Array of errors
    retry_count INTEGER DEFAULT 0,
    websocket_session_id VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enrollments
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role enrollment_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id, user_id)
);

-- =============================================
-- AI AND EMBEDDINGS SYSTEM
-- =============================================

-- Embeddings (pgvector)
-- Note: adjust dimension if embedding model changes
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_id UUID REFERENCES course_sections(id) ON DELETE CASCADE,
    subtopic_id UUID REFERENCES course_subtopics(id) ON DELETE CASCADE,
    kind embedding_kind NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Buddy chat system
CREATE TABLE ai_buddy_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_user_message BOOLEAN NOT NULL,
    response TEXT,
    embedding_results JSONB, -- Store search results for context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ASSESSMENT SYSTEM
-- =============================================

-- Assessments: Quizzes and Questions
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_id UUID REFERENCES course_sections(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quiz_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(quiz_id, index)
);

-- Quiz attempts and scores
CREATE TABLE quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL, -- out of total questions
    total_questions INTEGER NOT NULL,
    answers JSONB NOT NULL, -- Array of selected answers
    time_taken_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Flashcards
CREATE TABLE flashcards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_id UUID REFERENCES course_sections(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(course_id, section_id, index)
);

-- Flashcard review tracking
CREATE TABLE flashcard_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty INTEGER DEFAULT 0, -- 0=easy, 1=medium, 2=hard
    review_count INTEGER DEFAULT 0,
    next_review_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(flashcard_id, user_id)
);

-- =============================================
-- PROGRESS TRACKING SYSTEM
-- =============================================

-- Student progress tracking for courses
CREATE TABLE student_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    subtopic_id UUID NOT NULL REFERENCES course_subtopics(id) ON DELETE CASCADE,
    watch_time_seconds INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    last_watched_at TIMESTAMP WITH TIME ZONE,
    completion_percentage INTEGER DEFAULT 0, -- 0-100
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, course_id, subtopic_id)
);

-- =============================================
-- WEBSOCKET SYSTEM
-- =============================================

-- WebSocket session tracking
CREATE TABLE websocket_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_type VARCHAR(50) NOT NULL, -- 'course_generation', 'ai_buddy_chat'
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- INDEXES
-- =============================================

-- Users table indexes
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_user_type ON users (user_type);
CREATE INDEX idx_users_created_at ON users (created_at DESC);
CREATE INDEX idx_users_onboarding_complete ON users (onboarding_complete);
CREATE INDEX idx_users_type_onboarding ON users (user_type, onboarding_complete);
CREATE INDEX idx_users_email_type ON users (email, user_type);
CREATE INDEX idx_users_tutor_details_gin ON users USING GIN (tutor_details);
CREATE INDEX idx_users_student_details_gin ON users USING GIN (student_details);
CREATE INDEX idx_users_document_verification ON users(document_verification) WHERE user_type = 'tutor';
CREATE INDEX idx_users_pending_verification ON users(created_at) WHERE user_type = 'tutor' AND document_verification = 'pending';

-- Payments table indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_purpose ON payments(purpose);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX idx_payments_user_status ON payments(user_id, status);
CREATE INDEX idx_payments_purpose_status ON payments(purpose, status);
CREATE INDEX idx_payments_date_status ON payments(created_at, status);
CREATE INDEX idx_payments_razorpay_order_id ON payments(razorpay_order_id);
CREATE INDEX idx_payments_razorpay_payment_id ON payments(razorpay_payment_id);

-- Orders indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_type ON orders(order_type);
CREATE INDEX idx_orders_course_id ON orders(course_id);
CREATE INDEX idx_orders_tutor_id ON orders(tutor_id);
CREATE INDEX idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Order payments indexes
CREATE UNIQUE INDEX ux_order_payments_order_payment ON order_payments(order_id, razorpay_payment_id);
CREATE INDEX idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX idx_order_payments_razorpay_payment_id ON order_payments(razorpay_payment_id);
CREATE INDEX idx_order_payments_captured ON order_payments(payment_captured);

-- Tutor earnings indexes
CREATE INDEX idx_tutor_earnings_tutor_id ON tutor_earnings(tutor_id);
CREATE INDEX idx_tutor_earnings_order_id ON tutor_earnings(order_id);
CREATE INDEX idx_tutor_earnings_course_id ON tutor_earnings(course_id);
CREATE INDEX idx_tutor_earnings_payout_status ON tutor_earnings(payout_status);
CREATE INDEX idx_tutor_earnings_created_at ON tutor_earnings(created_at);

-- Monthly payouts indexes
CREATE INDEX idx_monthly_payouts_tutor_id ON monthly_payouts(tutor_id);
CREATE INDEX idx_monthly_payouts_month_year ON monthly_payouts(month_year);
CREATE INDEX idx_monthly_payouts_payout_status ON monthly_payouts(payout_status);
CREATE INDEX idx_monthly_payouts_created_at ON monthly_payouts(created_at);

-- Webhook events indexes
CREATE INDEX idx_webhook_events_order_id ON webhook_events(order_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);
CREATE UNIQUE INDEX ux_webhook_events_payment_event ON webhook_events(payment_id, event_type);

-- Files indexes
CREATE INDEX idx_files_user_id ON files (user_id);
CREATE INDEX idx_files_file_type ON files (file_type);

-- Tutor document sets indexes
CREATE INDEX idx_tutor_document_sets_user_id ON tutor_document_sets (user_id);
CREATE INDEX idx_tutor_document_sets_docs_gin ON tutor_document_sets USING GIN (documents);

-- Courses indexes
CREATE INDEX idx_courses_tutor ON courses(tutor_user_id);
CREATE INDEX idx_courses_created_at ON courses(created_at DESC);

-- Course sections indexes
CREATE INDEX idx_course_sections_course_index ON course_sections(course_id, index);

-- Course subtopics indexes
CREATE INDEX idx_course_subtopics_section_index ON course_subtopics(section_id, index);

-- Course roadmaps indexes
CREATE INDEX idx_course_roadmaps_course_id ON course_roadmaps(course_id);
CREATE INDEX idx_course_roadmaps_tutor_user_id ON course_roadmaps(tutor_user_id);
CREATE INDEX idx_course_roadmaps_status ON course_roadmaps(status);
CREATE INDEX idx_course_roadmaps_redis_key ON course_roadmaps(redis_key);

-- Course generation progress indexes
CREATE INDEX idx_course_generation_progress_course_id ON course_generation_progress(course_id);
CREATE INDEX idx_course_generation_progress_roadmap_id ON course_generation_progress(roadmap_id);
CREATE INDEX idx_course_generation_progress_status ON course_generation_progress(status);
CREATE INDEX idx_course_generation_progress_websocket_session ON course_generation_progress(websocket_session_id);

-- Enrollments indexes
CREATE INDEX idx_enrollments_course_user ON enrollments(course_id, user_id);
CREATE INDEX idx_enrollments_user ON enrollments(user_id);

-- Embeddings indexes
CREATE INDEX idx_embeddings_course_section_kind ON embeddings(course_id, section_id, kind);
-- Approximate vector index (HNSW) for cosine similarity
DO $$ BEGIN
    CREATE INDEX embeddings_vec_hnsw ON embeddings USING hnsw (embedding vector_cosine_ops);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- AI Buddy chats indexes
CREATE INDEX idx_ai_buddy_chats_course_id ON ai_buddy_chats(course_id);
CREATE INDEX idx_ai_buddy_chats_user_id ON ai_buddy_chats(user_id);
CREATE INDEX idx_ai_buddy_chats_session_id ON ai_buddy_chats(session_id);
CREATE INDEX idx_ai_buddy_chats_created_at ON ai_buddy_chats(created_at DESC);

-- Quizzes indexes
CREATE INDEX idx_quizzes_course_section ON quizzes(course_id, section_id);

-- Quiz questions indexes
CREATE INDEX idx_quiz_questions_quiz_index ON quiz_questions(quiz_id, index);

-- Quiz attempts indexes
CREATE INDEX idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id);
CREATE INDEX idx_quiz_attempts_user_id ON quiz_attempts(user_id);
CREATE INDEX idx_quiz_attempts_created_at ON quiz_attempts(created_at DESC);

-- Flashcards indexes
CREATE INDEX idx_flashcards_course_section_index ON flashcards(course_id, section_id, index);

-- Flashcard reviews indexes
CREATE INDEX idx_flashcard_reviews_flashcard_id ON flashcard_reviews(flashcard_id);
CREATE INDEX idx_flashcard_reviews_user_id ON flashcard_reviews(user_id);
CREATE INDEX idx_flashcard_reviews_next_review_date ON flashcard_reviews(next_review_date);

-- Student progress indexes
CREATE INDEX idx_student_progress_user_course ON student_progress(user_id, course_id);
CREATE INDEX idx_student_progress_subtopic ON student_progress(subtopic_id);
CREATE INDEX idx_student_progress_completion ON student_progress(is_completed);

-- WebSocket sessions indexes
CREATE INDEX idx_websocket_sessions_session_id ON websocket_sessions(session_id);
CREATE INDEX idx_websocket_sessions_user_id ON websocket_sessions(user_id);
CREATE INDEX idx_websocket_sessions_course_id ON websocket_sessions(course_id);
CREATE INDEX idx_websocket_sessions_is_active ON websocket_sessions(is_active);
CREATE INDEX idx_websocket_sessions_connection_type ON websocket_sessions(connection_type);

-- =============================================
-- TRIGGERS AND FUNCTIONS
-- =============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
    CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_order_payments_updated_at
    BEFORE UPDATE ON order_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_tutor_earnings_updated_at
    BEFORE UPDATE ON tutor_earnings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_monthly_payouts_updated_at
    BEFORE UPDATE ON monthly_payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_tutor_document_sets_updated_at
    BEFORE UPDATE ON tutor_document_sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_course_sections_updated_at
    BEFORE UPDATE ON course_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_course_subtopics_updated_at
    BEFORE UPDATE ON course_subtopics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_course_roadmaps_updated_at
    BEFORE UPDATE ON course_roadmaps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_course_generation_progress_updated_at
    BEFORE UPDATE ON course_generation_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_student_progress_updated_at
    BEFORE UPDATE ON student_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_flashcard_reviews_updated_at
    BEFORE UPDATE ON flashcard_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger to upsert by content_hash to avoid duplicates
CREATE OR REPLACE FUNCTION embeddings_before_insert_upsert()
RETURNS TRIGGER AS $$
DECLARE existing_id UUID;
BEGIN
    SELECT id INTO existing_id FROM embeddings WHERE content_hash = NEW.content_hash;
    IF existing_id IS NOT NULL THEN
        UPDATE embeddings
        SET embedding = NEW.embedding,
            course_id = NEW.course_id,
            section_id = NEW.section_id,
            subtopic_id = NEW.subtopic_id,
            kind = NEW.kind,
            created_at = NOW()
        WHERE id = existing_id;
        RETURN NULL; -- skip insert; treat as upsert
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER embeddings_before_insert
    BEFORE INSERT ON embeddings
    FOR EACH ROW
    EXECUTE FUNCTION embeddings_before_insert_upsert();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================

-- Payment utility functions
CREATE OR REPLACE FUNCTION get_user_payments(user_uuid UUID)
RETURNS TABLE (
    id UUID,
    purpose payment_purpose,
    status payment_status,
    amount DECIMAL(10,2),
    currency VARCHAR(3),
    transaction_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.purpose,
        p.status,
        p.amount,
        p.currency,
        p.transaction_id,
        p.created_at
    FROM payments p
    WHERE p.user_id = user_uuid
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_payment_stats()
RETURNS TABLE (
    total_payments BIGINT,
    total_amount DECIMAL(12,2),
    successful_payments BIGINT,
    failed_payments BIGINT,
    pending_payments BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) FILTER (WHERE status = 'paid') as successful_payments,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_payments,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_payments
    FROM payments;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_payment_status(
    payment_uuid UUID,
    new_status payment_status,
    razorpay_payment_id VARCHAR(255) DEFAULT NULL,
    razorpay_signature VARCHAR(255) DEFAULT NULL,
    gateway_response JSONB DEFAULT NULL,
    failure_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE payments
    SET
        status = new_status,
        razorpay_payment_id = COALESCE(update_payment_status.razorpay_payment_id, payments.razorpay_payment_id),
        razorpay_signature = COALESCE(update_payment_status.razorpay_signature, payments.razorpay_signature),
        gateway_response = COALESCE(update_payment_status.gateway_response, payments.gateway_response),
        failure_reason = COALESCE(update_payment_status.failure_reason, payments.failure_reason),
        processed_at = CASE
            WHEN new_status = 'paid' THEN NOW()
            ELSE payments.processed_at
        END,
        updated_at = NOW()
    WHERE id = payment_uuid;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_payments_by_purpose(payment_purpose_param payment_purpose)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    purpose payment_purpose,
    status payment_status,
    amount DECIMAL(10,2),
    currency VARCHAR(3),
    transaction_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.user_id,
        u.name as user_name,
        u.email as user_email,
        p.purpose,
        p.status,
        p.amount,
        p.currency,
        p.transaction_id,
        p.created_at
    FROM payments p
    JOIN users u ON p.user_id = u.id
    WHERE p.purpose = payment_purpose_param
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Order-based business functions
CREATE OR REPLACE FUNCTION calculate_tutor_earnings(
    course_amount BIGINT,
    commission_percentage INTEGER DEFAULT 30
)
RETURNS TABLE (
    gross_amount BIGINT,
    platform_commission BIGINT,
    tutor_earnings BIGINT
) AS $$
DECLARE
    commission_amount BIGINT;
    tutor_amount BIGINT;
BEGIN
    commission_amount := (course_amount * commission_percentage) / 100;
    tutor_amount := course_amount - commission_amount;
    RETURN QUERY SELECT course_amount, commission_amount, tutor_amount;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_tutor_monthly_earnings(
    tutor_uuid UUID,
    month_year_param VARCHAR(7)
)
RETURNS TABLE (
    tutor_id UUID,
    month_year VARCHAR(7),
    total_gross_amount BIGINT,
    total_commission BIGINT,
    total_tutor_earnings BIGINT,
    course_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.tutor_id,
        month_year_param,
        SUM(te.gross_amount),
        SUM(te.platform_commission),
        SUM(te.tutor_earnings),
        COUNT(te.id)
    FROM tutor_earnings te
    WHERE te.tutor_id = tutor_uuid
    AND DATE_TRUNC('month', te.created_at) = TO_DATE(month_year_param || '-01', 'YYYY-MM-DD')
    GROUP BY te.tutor_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_tutors_pending_payouts(month_year_param VARCHAR(7))
RETURNS TABLE (
    tutor_id UUID,
    tutor_name VARCHAR(255),
    tutor_email VARCHAR(255),
    total_earnings BIGINT,
    total_commission BIGINT,
    net_payout BIGINT,
    course_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.name,
        u.email,
        SUM(te.tutor_earnings),
        SUM(te.platform_commission),
        SUM(te.tutor_earnings),
        COUNT(te.id)
    FROM users u
    JOIN tutor_earnings te ON u.id = te.tutor_id
    WHERE u.user_type = 'tutor'
    AND te.payout_status = 'pending'
    AND DATE_TRUNC('month', te.created_at) = TO_DATE(month_year_param || '-01', 'YYYY-MM-DD')
    GROUP BY u.id, u.name, u.email
    HAVING SUM(te.tutor_earnings) > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_tutor_earnings_paid(
    tutor_uuid UUID,
    month_year_param VARCHAR(7),
    razorpay_payout_id VARCHAR(255)
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE tutor_earnings
    SET
        payout_status = 'paid',
        payout_date = CURRENT_DATE,
        razorpay_payout_id = mark_tutor_earnings_paid.razorpay_payout_id,
        updated_at = NOW()
    WHERE tutor_id = tutor_uuid
    AND payout_status = 'pending'
    AND DATE_TRUNC('month', created_at) = TO_DATE(month_year_param || '-01', 'YYYY-MM-DD');
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Course and embedding functions
CREATE OR REPLACE FUNCTION compute_and_store_embeddings(course_uuid UUID)
RETURNS TABLE (
    section_id UUID,
    section_title VARCHAR(255),
    embedding_count INTEGER
) AS $$
BEGIN
    RAISE EXCEPTION 'compute_and_store_embeddings is disabled. Use application service to compute real embeddings and insert into embeddings table.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_embeddings(
    query_embedding vector(1536),
    course_uuid UUID,
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    course_id UUID,
    section_id UUID,
    subtopic_id UUID,
    kind embedding_kind,
    content_hash TEXT,
    similarity FLOAT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.course_id,
        e.section_id,
        e.subtopic_id,
        e.kind,
        e.content_hash,
        1 - (e.embedding <=> query_embedding) as similarity,
        e.created_at
    FROM embeddings e
    WHERE e.course_id = course_uuid
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_course_content_for_embedding(course_uuid UUID)
RETURNS TABLE (
    section_id UUID,
    section_title VARCHAR(255),
    section_index INTEGER,
    subtopic_content TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cs.id,
        cs.title,
        cs.index,
        COALESCE(
            STRING_AGG(
                cs2.title || E'\n' || COALESCE(cs2.markdown_path, ''),
                E'\n---\n'
                ORDER BY cs2.index
            ),
            ''
        ) as subtopic_content
    FROM course_sections cs
    LEFT JOIN course_subtopics cs2 ON cs.id = cs2.section_id
    WHERE cs.course_id = course_uuid
    GROUP BY cs.id, cs.title, cs.index
    ORDER BY cs.index;
END;
$$ LANGUAGE plpgsql;

-- Quiz and course statistics functions
CREATE OR REPLACE FUNCTION get_quiz_stats(course_uuid UUID)
RETURNS TABLE (
    total_quizzes BIGINT,
    total_questions BIGINT,
    sections_with_quizzes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT q.id) as total_quizzes,
        COUNT(qq.id) as total_questions,
        COUNT(DISTINCT q.section_id) as sections_with_quizzes
    FROM quizzes q
    LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id
    WHERE q.course_id = course_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_flashcard_stats(course_uuid UUID)
RETURNS TABLE (
    total_flashcards BIGINT,
    sections_with_flashcards BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_flashcards,
        COUNT(DISTINCT section_id) as sections_with_flashcards
    FROM flashcards
    WHERE course_id = course_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_course_enrollment_stats(course_uuid UUID)
RETURNS TABLE (
    total_enrollments BIGINT,
    student_count BIGINT,
    tutor_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_enrollments,
        COUNT(*) FILTER (WHERE role = 'student') as student_count,
        COUNT(*) FILTER (WHERE role = 'tutor') as tutor_count
    FROM enrollments
    WHERE course_id = course_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION is_user_enrolled_in_course(
    user_uuid UUID,
    course_uuid UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM enrollments
        WHERE user_id = user_uuid
        AND course_id = course_uuid
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_courses(user_uuid UUID)
RETURNS TABLE (
    course_id UUID,
    course_title VARCHAR(255),
    role enrollment_role,
    enrolled_at TIMESTAMP WITH TIME ZONE,
    course_created_at TIMESTAMP WITH TIME ZONE,
    tutor_name VARCHAR(255),
    price_inr INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.title,
        e.role,
        e.created_at,
        c.created_at,
        u.name,
        c.price_inr
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    JOIN users u ON c.tutor_user_id = u.id
    WHERE e.user_id = user_uuid
    ORDER BY e.created_at DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_course_details(course_uuid UUID)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    tutor_user_id UUID,
    tutor_name VARCHAR(255),
    tutor_email VARCHAR(255),
    price_inr INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    section_count BIGINT,
    subtopic_count BIGINT,
    enrollment_count BIGINT,
    quiz_count BIGINT,
    flashcard_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.title,
        c.tutor_user_id,
        u.name,
        u.email,
        c.price_inr,
        c.created_at,
        COUNT(DISTINCT cs.id) as section_count,
        COUNT(DISTINCT cst.id) as subtopic_count,
        COUNT(DISTINCT e.id) as enrollment_count,
        COUNT(DISTINCT q.id) as quiz_count,
        COUNT(DISTINCT f.id) as flashcard_count
    FROM courses c
    JOIN users u ON c.tutor_user_id = u.id
    LEFT JOIN course_sections cs ON c.id = cs.course_id
    LEFT JOIN course_subtopics cst ON cs.id = cst.section_id
    LEFT JOIN enrollments e ON c.id = e.course_id
    LEFT JOIN quizzes q ON c.id = q.course_id
    LEFT JOIN flashcards f ON c.id = f.course_id
    WHERE c.id = course_uuid
    GROUP BY c.id, c.title, c.tutor_user_id, u.name, u.email, c.price_inr, c.created_at;
END;
$$ LANGUAGE plpgsql;

-- Course generation and progress functions
CREATE OR REPLACE FUNCTION get_course_generation_status(course_uuid UUID)
RETURNS TABLE (
    generation_id UUID,
    status VARCHAR(50),
    current_step VARCHAR(100),
    progress_percentage INTEGER,
    current_section_index INTEGER,
    current_subtopic_index INTEGER,
    total_sections INTEGER,
    total_subtopics INTEGER,
    estimated_time_remaining INTEGER,
    error_count INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cgp.id,
        cgp.status,
        cgp.current_step,
        cgp.progress_percentage,
        cgp.current_section_index,
        cgp.current_subtopic_index,
        cgp.total_sections,
        cgp.total_subtopics,
        cgp.estimated_time_remaining,
        jsonb_array_length(cgp.error_log) as error_count,
        cgp.started_at,
        cgp.completed_at
    FROM course_generation_progress cgp
    WHERE cgp.course_id = course_uuid
    ORDER BY cgp.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_student_course_progress(
    student_uuid UUID,
    course_uuid UUID
)
RETURNS TABLE (
    total_subtopics BIGINT,
    completed_subtopics BIGINT,
    total_watch_time INTEGER,
    completion_percentage DECIMAL(5,2),
    last_accessed TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(cs.id) as total_subtopics,
        COUNT(sp.id) FILTER (WHERE sp.is_completed = TRUE) as completed_subtopics,
        COALESCE(SUM(sp.watch_time_seconds), 0)::INTEGER as total_watch_time,
        CASE
            WHEN COUNT(cs.id) > 0 THEN
                (COUNT(sp.id) FILTER (WHERE sp.is_completed = TRUE)::DECIMAL / COUNT(cs.id) * 100)
            ELSE 0
        END as completion_percentage,
        MAX(sp.last_watched_at) as last_accessed
    FROM course_subtopics cs
    JOIN course_sections csec ON cs.section_id = csec.id
    LEFT JOIN student_progress sp ON cs.id = sp.subtopic_id AND sp.user_id = student_uuid
    WHERE csec.course_id = course_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_ai_buddy_chat_history(
    course_uuid UUID,
    student_uuid UUID,
    session_uuid VARCHAR(255),
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    message_id UUID,
    message TEXT,
    is_user_message BOOLEAN,
    response TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        abc.id,
        abc.message,
        abc.is_user_message,
        abc.response,
        abc.created_at
    FROM ai_buddy_chats abc
    WHERE abc.course_id = course_uuid
    AND abc.user_id = student_uuid
    AND abc.session_id = session_uuid
    ORDER BY abc.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_course_generation_progress(
    progress_uuid UUID,
    new_status VARCHAR(50) DEFAULT NULL,
    new_step VARCHAR(100) DEFAULT NULL,
    new_percentage INTEGER DEFAULT NULL,
    new_section_index INTEGER DEFAULT NULL,
    new_subtopic_index INTEGER DEFAULT NULL,
    new_time_remaining INTEGER DEFAULT NULL,
    error_to_add JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE course_generation_progress
    SET
        status = COALESCE(new_status, status),
        current_step = COALESCE(new_step, current_step),
        progress_percentage = COALESCE(new_percentage, progress_percentage),
        current_section_index = COALESCE(new_section_index, current_section_index),
        current_subtopic_index = COALESCE(new_subtopic_index, current_subtopic_index),
        estimated_time_remaining = COALESCE(new_time_remaining, estimated_time_remaining),
        error_log = CASE
            WHEN error_to_add IS NOT NULL THEN error_log || error_to_add
            ELSE error_log
        END,
        completed_at = CASE
            WHEN new_status = 'completed' THEN NOW()
            ELSE completed_at
        END,
        updated_at = NOW()
    WHERE id = progress_uuid;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_roadmaps()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM course_roadmaps
    WHERE status = 'draft'
    AND created_at < NOW() - INTERVAL '2 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_course_analytics(course_uuid UUID)
RETURNS TABLE (
    total_enrollments BIGINT,
    active_students BIGINT, -- students with activity in last 30 days
    completion_rate DECIMAL(5,2),
    average_watch_time INTEGER, -- in seconds
    quiz_attempts BIGINT,
    ai_buddy_interactions BIGINT,
    generation_status VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT e.user_id) as total_enrollments,
        COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.last_watched_at > NOW() - INTERVAL '30 days') as active_students,
        CASE
            WHEN COUNT(DISTINCT sp.user_id) > 0 THEN
                AVG(
                    CASE WHEN total_subs.total > 0 THEN
                        (COUNT(sp.id) FILTER (WHERE sp.is_completed = TRUE)::DECIMAL / total_subs.total * 100)
                    ELSE 0 END
                )
            ELSE 0
        END as completion_rate,
        COALESCE(AVG(sp.watch_time_seconds)::INTEGER, 0) as average_watch_time,
        COUNT(qa.id) as quiz_attempts,
        COUNT(abc.id) as ai_buddy_interactions,
        COALESCE(cgp.status, 'not_started') as generation_status
    FROM enrollments e
    LEFT JOIN student_progress sp ON e.course_id = sp.course_id AND e.user_id = sp.user_id
    LEFT JOIN quiz_attempts qa ON qa.quiz_id IN (
        SELECT q.id FROM quizzes q WHERE q.course_id = course_uuid
    )
    LEFT JOIN ai_buddy_chats abc ON abc.course_id = course_uuid
    LEFT JOIN course_generation_progress cgp ON cgp.course_id = course_uuid
    LEFT JOIN LATERAL (
        SELECT COUNT(cs.id) as total
        FROM course_subtopics cs
        JOIN course_sections csec ON cs.section_id = csec.id
        WHERE csec.course_id = course_uuid
    ) total_subs ON true
    WHERE e.course_id = course_uuid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manage_websocket_session(
    session_uuid VARCHAR(255),
    user_uuid UUID,
    conn_type VARCHAR(50),
    course_uuid UUID DEFAULT NULL,
    action VARCHAR(20) DEFAULT 'connect' -- connect, disconnect, ping
)
RETURNS BOOLEAN AS $$
BEGIN
    IF action = 'connect' THEN
        INSERT INTO websocket_sessions (session_id, user_id, connection_type, course_id)
        VALUES (session_uuid, user_uuid, conn_type, course_uuid)
        ON CONFLICT (session_id) DO UPDATE SET
            is_active = TRUE,
            last_ping = NOW(),
            disconnected_at = NULL;
    ELSIF action = 'disconnect' THEN
        UPDATE websocket_sessions
        SET is_active = FALSE, disconnected_at = NOW()
        WHERE session_id = session_uuid;
    ELSIF action = 'ping' THEN
        UPDATE websocket_sessions
        SET last_ping = NOW()
        WHERE session_id = session_uuid AND is_active = TRUE;
    END IF;

    RETURN FOUND OR action = 'connect';
END;
$$ LANGUAGE plpgsql;