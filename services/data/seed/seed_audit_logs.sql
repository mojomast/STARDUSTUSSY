-- HarmonyFlow SyncBridge - Audit Logs Seed Data
-- Phase 1: Foundation (Week 1)

-- Create sample audit logs
DO $$
DECLARE
    demo_user_id UUID;
    test1_user_id UUID;
    test2_user_id UUID;
    actions TEXT[] := ARRAY['user.login', 'user.logout', 'snapshot.create', 'user.update', 'session.create'];
    resources TEXT[] := ARRAY['user', 'session', 'snapshot', 'profile'];
    severities TEXT[] := ARRAY['info', 'warning', 'debug'];
    i INTEGER;
BEGIN
    SELECT id INTO demo_user_id FROM users WHERE email = 'demo@harmonyflow.local';
    SELECT id INTO test1_user_id FROM users WHERE email = 'test1@harmonyflow.local';
    SELECT id INTO test2_user_id FROM users WHERE email = 'test2@harmonyflow.local';

    -- Demo user audit logs
    IF demo_user_id IS NOT NULL THEN
        FOR i IN 1..20 LOOP
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, severity, metadata, created_at)
            VALUES (
                demo_user_id,
                actions[1 + (random() * 4)::int],
                resources[1 + (random() * 3)::int],
                gen_random_uuid()::text,
                severities[1 + (random() * 2)::int],
                jsonb_build_object(
                    'ip_address', '192.168.1.' || (100 + (random() * 50)::int),
                    'user_agent', 'Mozilla/5.0',
                    'request_duration_ms', (random() * 500)::int
                ),
                NOW() - (random() * 30 || ' days')::INTERVAL
            );
        END LOOP;
    END IF;

    -- Test1 user audit logs
    IF test1_user_id IS NOT NULL THEN
        FOR i IN 1..15 LOOP
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, severity, metadata, created_at)
            VALUES (
                test1_user_id,
                actions[1 + (random() * 4)::int],
                resources[1 + (random() * 3)::int],
                gen_random_uuid()::text,
                'info',
                jsonb_build_object(
                    'ip_address', '10.0.0.' || (10 + (random() * 50)::int),
                    'user_agent', 'Mozilla/5.0'
                ),
                NOW() - (random() * 14 || ' days')::INTERVAL
            );
        END LOOP;
    END IF;

    -- Test2 user audit logs
    IF test2_user_id IS NOT NULL THEN
        FOR i IN 1..10 LOOP
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, severity, metadata, created_at)
            VALUES (
                test2_user_id,
                actions[1 + (random() * 4)::int],
                resources[1 + (random() * 3)::int],
                gen_random_uuid()::text,
                'info',
                jsonb_build_object(
                    'ip_address', '172.16.0.' || (10 + (random() * 50)::int)
                ),
                NOW() - (random() * 7 || ' days')::INTERVAL
            );
        END LOOP;
    END IF;

    -- System-level audit logs (no user)
    FOR i IN 1..5 LOOP
        INSERT INTO audit_logs (action, resource_type, resource_id, severity, metadata, created_at)
        VALUES (
            'system.backup',
            'database',
            'harmonyflow',
            'info',
            jsonb_build_object(
                'backup_size_bytes', (random() * 1000000000)::bigint,
                'backup_duration_seconds', (random() * 300)::int
            ),
            NOW() - (random() * 7 || ' days')::INTERVAL
        );
    END LOOP;
END $$;

-- Verify insert
SELECT 'Audit logs seeded: ' || COUNT(*)::text as status FROM audit_logs;
