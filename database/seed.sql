INSERT INTO businesses (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Spark Health Clinic', 'spark-health')
ON CONFLICT DO NOTHING;
