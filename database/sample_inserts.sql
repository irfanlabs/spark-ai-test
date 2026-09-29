-- Example inserts (run after schema). Passwords must be bcrypt hashes from the API.

INSERT INTO businesses (name, slug) VALUES
  ('Northside Dental', 'northside-dental')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO chat_sessions (user_id, title, metadata)
SELECT id, 'Sample chat', '{"channel":"web"}'::jsonb
FROM users WHERE email = 'demo@example.com'
LIMIT 1;
