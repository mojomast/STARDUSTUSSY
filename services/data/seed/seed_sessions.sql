-- HarmonyFlow SyncBridge - Sessions Seed Data
-- Phase 1: Foundation (Week 1)

-- Create test sessions for demo users
DO $$
DECLARE
    demo_user_id UUID;
    test1_user_id UUID;
BEGIN
    -- Get user IDs
    SELECT id INTO demo_user_id FROM users WHERE email = 'demo@harmonyflow.local';
    SELECT id INTO test1_user_id FROM users WHERE email = 'test1@harmonyflow.local';

    -- Create active session for demo user
    IF demo_user_id IS NOT NULL THEN
        INSERT INTO sessions (user_id, session_token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
        VALUES (
            demo_user_id,
            encode(digest('demo_session_token_' || gen_random_uuid()::text, 'sha256'), 'hex'),
            encode(digest('demo_refresh_token_' || gen_random_uuid()::text, 'sha256'), 'hex'),
            '192.168.1.100'::inet,
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            NOW() + INTERVAL '7 days'
        );
    END IF;

    -- Create active session for test1 user
    IF test1_user_id IS NOT NULL THEN
        INSERT INTO sessions (user_id, session_token_hash, refresh_token_hash, ip_address, user_agent, expires_at)
        VALUES (
            test1_user_id,
            encode(digest('test1_session_token_' || gen_random_uuid()::text, 'sha256'), 'hex'),
            encode(digest('test1_refresh_token_' || gen_random_uuid()::text, 'sha256'), 'hex'),
            '192.168.1.101'::inet,
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            NOW() + INTERVAL '7 days'
        );

        -- Create an expired session for test1 user
        INSERT INTO sessions (user_id, session_token_hash, ip_address, user_agent, expires_at)
        VALUES (
            test1_user_id,
            encode(digest('expired_session_token_' || gen_random_uuid()::text, 'sha256'), 'hex'),
            '192.168.1.102'::inet,
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
            NOW() - INTERVAL '1 day'
        );
    END IF;
END $$;

-- Verify insert
SELECT 'Sessions seeded: ' || COUNT(*)::text as status FROM sessions;
