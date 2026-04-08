-- Water-Flow: Per-station model architecture
-- Run via: npx tsx lib/db/migrate.ts

-- 1. Stations
CREATE TABLE IF NOT EXISTS stations (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  lat                DOUBLE PRECISION NOT NULL,
  lon                DOUBLE PRECISION NOT NULL,
  catchment_area_km2 DOUBLE PRECISION,
  regime             TEXT,
  municipality       TEXT,
  paddling_min       DOUBLE PRECISION,
  paddling_ideal     DOUBLE PRECISION,
  paddling_max       DOUBLE PRECISION,
  status             TEXT NOT NULL DEFAULT 'pending',
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Flow readings (time-series)
CREATE TABLE IF NOT EXISTS flow_readings (
  station_id   TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  flow_m3s     DOUBLE PRECISION NOT NULL,
  source       TEXT NOT NULL DEFAULT 'csv',
  quality      TEXT NOT NULL DEFAULT 'provisional',
  PRIMARY KEY (station_id, date)
);

CREATE INDEX IF NOT EXISTS idx_flow_station_date
  ON flow_readings(station_id, date DESC);

-- 3. Models (per-station, versioned)
CREATE TABLE IF NOT EXISTS models (
  id                    SERIAL PRIMARY KEY,
  station_id            TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  version               INTEGER NOT NULL DEFAULT 1,
  model_json            JSONB NOT NULL,
  nse_test              DOUBLE PRECISION,
  mape_test             DOUBLE PRECISION,
  num_trees             INTEGER,
  num_training_samples  INTEGER,
  is_active             BOOLEAN NOT NULL DEFAULT false,
  trained_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(station_id, version)
);

CREATE INDEX IF NOT EXISTS idx_models_active
  ON models(station_id) WHERE is_active = true;

-- 4. Training runs (tracks iterative holdout loop)
CREATE TABLE IF NOT EXISTS training_runs (
  id               SERIAL PRIMARY KEY,
  station_id       TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'running',
  holdout_start    DATE,
  holdout_end      DATE,
  total_iterations INTEGER DEFAULT 0,
  best_nse         DOUBLE PRECISION,
  best_mape        DOUBLE PRECISION,
  best_iteration   INTEGER,
  error_message    TEXT,
  iterations_log   JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_training_station
  ON training_runs(station_id, started_at DESC);

-- 5. Forecast cache (one per station, overwritten on refresh)
CREATE TABLE IF NOT EXISTS forecast_cache (
  station_id    TEXT PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
  forecast_json JSONB NOT NULL,
  hourly_json   JSONB,
  weather_json  JSONB,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Subscribers (email-based, no passwords)
CREATE TABLE IF NOT EXISTS subscribers (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email         TEXT NOT NULL UNIQUE,
  token         TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  confirmed     BOOLEAN NOT NULL DEFAULT false,
  confirmed_at  TIMESTAMPTZ,
  preferences   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(token);

-- 7. Subscriptions (subscriber × station)
CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscriber_id   TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  station_id      TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT true,
  preferences     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscriber_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_station ON subscriptions(station_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id);

-- 8. Alert state (prevents duplicate notifications)
CREATE TABLE IF NOT EXISTS alert_state (
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL,
  state           TEXT NOT NULL DEFAULT 'idle',
  context_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_triggered  TIMESTAMPTZ,
  last_evaluated  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, alert_type)
);

-- 9. Alert snapshots (previous evaluation for diff comparison)
CREATE TABLE IF NOT EXISTS alert_snapshots (
  station_id    TEXT PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL,
  evaluated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Notification log (delivery tracking)
CREATE TABLE IF NOT EXISTS notification_log (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscriber_id   TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  station_id      TEXT REFERENCES stations(id) ON DELETE SET NULL,
  alert_type      TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'normal',
  subject         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ,
  delivered       BOOLEAN,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_subscriber ON notification_log(subscriber_id, created_at DESC);

-- 11. Push device tokens (Capacitor native push notifications)
CREATE TABLE IF NOT EXISTS push_devices (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  station_ids TEXT[] NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_devices_token ON push_devices(token);
CREATE INDEX IF NOT EXISTS idx_push_devices_active ON push_devices(active) WHERE active = true;
