-- HarmonyFlow SyncBridge - Users Seed Data
-- Phase 1: Foundation (Week 1)

-- Test users for development
INSERT INTO users (email, password_hash, first_name, last_name, phone, date_of_birth, status, email_verified, timezone)
VALUES 
    ('demo@harmonyflow.local', crypt('demo123', gen_salt('bf')), 'Demo', 'User', '+1-555-0100', '1990-01-15', 'active', true, 'America/New_York'),
    ('test1@harmonyflow.local', crypt('test123', gen_salt('bf')), 'Test', 'User One', '+1-555-0101', '1985-03-20', 'active', true, 'America/Los_Angeles'),
    ('test2@harmonyflow.local', crypt('test123', gen_salt('bf')), 'Test', 'User Two', '+1-555-0102', '1992-07-08', 'active', true, 'America/Chicago'),
    ('inactive@harmonyflow.local', crypt('test123', gen_salt('bf')), 'Inactive', 'User', '+1-555-0103', '1988-11-30', 'inactive', false, 'UTC'),
    ('admin@harmonyflow.local', crypt('admin123', gen_salt('bf')), 'Admin', 'User', '+1-555-0199', '1980-05-10', 'active', true, 'UTC')
ON CONFLICT (email) DO NOTHING;

-- Verify insert
SELECT 'Users seeded: ' || COUNT(*)::text as status FROM users WHERE email LIKE '%@harmonyflow.local';
