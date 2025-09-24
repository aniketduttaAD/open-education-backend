-- User system enums
CREATE TYPE user_type AS ENUM ('student', 'tutor', 'admin');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');

-- Payment system enums
CREATE TYPE payment_purpose AS ENUM ('course', 'registration');
CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'failed');

-- Users table with unified structure
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    image VARCHAR(500),
    gender gender_type,
    bio TEXT,
    dob DATE,
    user_type user_type NOT NULL,
    tutor_details JSONB,
    student_details JSONB,
    onboarding_complete BOOLEAN DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table for Razorpay integration
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

-- Users table indexes
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_user_type ON users (user_type);
CREATE INDEX idx_users_created_at ON users (created_at DESC);
CREATE INDEX idx_users_onboarding_complete ON users (onboarding_complete);
CREATE INDEX idx_users_type_onboarding ON users (user_type, onboarding_complete);
CREATE INDEX idx_users_email_type ON users (email, user_type);
CREATE INDEX idx_users_tutor_details_gin ON users USING GIN (tutor_details);
CREATE INDEX idx_users_student_details_gin ON users USING GIN (student_details);

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

-- New enums for order system
CREATE TYPE IF NOT EXISTS order_status AS ENUM ('pending','payment_verified','captured','failed');
CREATE TYPE IF NOT EXISTS order_type AS ENUM ('tutor_registration','course_enrollment');
CREATE TYPE IF NOT EXISTS payout_status AS ENUM ('pending','processing','paid','failed');

-- Orders table (business orders)
CREATE TABLE IF NOT EXISTS orders (
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
CREATE TABLE IF NOT EXISTS order_payments (
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
CREATE TABLE IF NOT EXISTS tutor_earnings (
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
CREATE TABLE IF NOT EXISTS monthly_payouts (
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
CREATE TABLE IF NOT EXISTS webhook_events (
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

-- Indexes for new objects
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_course_id ON orders(course_id);
CREATE INDEX IF NOT EXISTS idx_orders_tutor_id ON orders(tutor_id);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_order_payments_order_payment ON order_payments(order_id, razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_razorpay_payment_id ON order_payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_captured ON order_payments(payment_captured);

CREATE INDEX IF NOT EXISTS idx_tutor_earnings_tutor_id ON tutor_earnings(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_earnings_order_id ON tutor_earnings(order_id);
CREATE INDEX IF NOT EXISTS idx_tutor_earnings_course_id ON tutor_earnings(course_id);
CREATE INDEX IF NOT EXISTS idx_tutor_earnings_payout_status ON tutor_earnings(payout_status);
CREATE INDEX IF NOT EXISTS idx_tutor_earnings_created_at ON tutor_earnings(created_at);

CREATE INDEX IF NOT EXISTS idx_monthly_payouts_tutor_id ON monthly_payouts(tutor_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payouts_month_year ON monthly_payouts(month_year);
CREATE INDEX IF NOT EXISTS idx_monthly_payouts_payout_status ON monthly_payouts(payout_status);
CREATE INDEX IF NOT EXISTS idx_monthly_payouts_created_at ON monthly_payouts(created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id ON webhook_events(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_webhook_events_payment_event ON webhook_events(payment_id, event_type);

-- Triggers for new tables
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

-- New order-based business functions
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

-- Tutor document sets: one row per tutor, JSONB array of docs
CREATE TABLE IF NOT EXISTS tutor_document_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    documents JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_document_sets_user_id ON tutor_document_sets (user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_document_sets_docs_gin ON tutor_document_sets USING GIN (documents);

DO $$ BEGIN
    CREATE TRIGGER update_tutor_document_sets_updated_at
    BEFORE UPDATE ON tutor_document_sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Files table for uploaded assets (verification docs stored here)
CREATE TABLE IF NOT EXISTS files (
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

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files (file_type);

DO $$ BEGIN
    CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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