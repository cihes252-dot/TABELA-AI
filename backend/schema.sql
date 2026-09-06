CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'field' CHECK (role IN ('field','reviewer','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS signs (
  id text PRIMARY KEY,
  project text,
  sign_type text,
  shape_type text,
  shape_label text,
  ocr text,
  ocr_confidence numeric,
  ocr_validated boolean DEFAULT false,
  quality_score numeric,
  panel text,
  lettering text,
  material_mode text,
  address jsonb,
  orientation jsonb,
  gps jsonb,
  geom geography(Point,4326),
  visual_hash text,
  measurement_verified boolean DEFAULT false,
  measurement_source text,
  measurement_quality_score numeric,
  width_m numeric,
  height_m numeric,
  diameter_m numeric,
  area_m2 numeric,
  distance_m numeric,
  duplicate_score numeric,
  duplicate_override boolean DEFAULT false,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signs_geom_gix ON signs USING GIST (geom);
CREATE INDEX IF NOT EXISTS signs_project_idx ON signs(project);
CREATE INDEX IF NOT EXISTS signs_ocr_idx ON signs USING gin (to_tsvector('simple',coalesce(ocr,'')));
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id bigserial PRIMARY KEY,
  sign_id text,
  actor text,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_sign_idx ON audit_log(sign_id,created_at DESC);
