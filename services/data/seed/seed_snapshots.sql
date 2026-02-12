-- HarmonyFlow SyncBridge - Snapshots Seed Data
-- Phase 1: Foundation (Week 1)

-- Create sample wellness snapshots
DO $$
DECLARE
    demo_user_id UUID;
    test1_user_id UUID;
    base_date TIMESTAMPTZ;
    i INTEGER;
BEGIN
    SELECT id INTO demo_user_id FROM users WHERE email = 'demo@harmonyflow.local';
    SELECT id INTO test1_user_id FROM users WHERE email = 'test1@harmonyflow.local';

    -- Demo user snapshots - last 30 days
    IF demo_user_id IS NOT NULL THEN
        FOR i IN 0..29 LOOP
            base_date := NOW() - (i || ' days')::INTERVAL;
            
            -- Daily wellness snapshot
            INSERT INTO snapshots (user_id, snapshot_type, data, recorded_at, timezone)
            VALUES (
                demo_user_id,
                'daily',
                jsonb_build_object(
                    'mood_score', 6 + (random() * 4)::int,
                    'energy_level', 5 + (random() * 5)::int,
                    'stress_level', 1 + (random() * 5)::int,
                    'sleep_hours', 6 + (random() * 3)::numeric(3,1),
                    'water_intake_ml', 1500 + (random() * 1000)::int,
                    'steps', 5000 + (random() * 10000)::int,
                    'meditation_minutes', (random() * 30)::int
                ),
                base_date,
                'America/New_York'
            );

            -- Mood snapshot (every 3 days)
            IF i % 3 = 0 THEN
                INSERT INTO snapshots (user_id, snapshot_type, data, recorded_at, timezone)
                VALUES (
                    demo_user_id,
                    'mood',
                    jsonb_build_object(
                        'primary_emotion', (ARRAY['happy', 'calm', 'anxious', 'tired', 'excited'])[1 + (random() * 4)::int],
                        'intensity', 3 + (random() * 7)::int,
                        'notes', 'Daily mood check-in'
                    ),
                    base_date,
                    'America/New_York'
                );
            END IF;
        END LOOP;
    END IF;

    -- Test1 user snapshots - last 14 days
    IF test1_user_id IS NOT NULL THEN
        FOR i IN 0..13 LOOP
            base_date := NOW() - (i || ' days')::INTERVAL;
            
            INSERT INTO snapshots (user_id, snapshot_type, data, recorded_at, timezone)
            VALUES (
                test1_user_id,
                'daily',
                jsonb_build_object(
                    'mood_score', 5 + (random() * 5)::int,
                    'energy_level', 4 + (random() * 6)::int,
                    'stress_level', 2 + (random() * 4)::int,
                    'sleep_hours', 5 + (random() * 4)::numeric(3,1),
                    'water_intake_ml', 1000 + (random() * 1500)::int,
                    'steps', 3000 + (random() * 12000)::int,
                    'workout_minutes', (random() * 60)::int
                ),
                base_date,
                'America/Los_Angeles'
            );
        END LOOP;
    END IF;
END $$;

-- Verify insert
SELECT 'Snapshots seeded: ' || COUNT(*)::text as status FROM snapshots;
