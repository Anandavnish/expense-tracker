-- Migration: 20260928000002_app_versions.sql
-- Table to record app releases and trigger in-app update prompts

CREATE TABLE IF NOT EXISTS public.app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,                  -- e.g. "1.0.1"
  version_code INTEGER NOT NULL,          -- e.g. 2
  title TEXT NOT NULL DEFAULT 'New Update Available',
  release_notes TEXT NOT NULL,            -- e.g. "Added OCR SMS text sharing and performance improvements."
  download_url TEXT NOT NULL,             -- URL to download the new APK (e.g. GitHub Releases or EAS download link)
  is_critical BOOLEAN DEFAULT FALSE,      -- If true, forces update before continuing
  min_version_code INTEGER DEFAULT 1,     -- If user's versionCode < min_version_code, force update
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Allow ANY authenticated user or anonymous client to read available app versions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'app_versions' 
      AND policyname = 'Allow public read access to app_versions'
  ) THEN
    CREATE POLICY "Allow public read access to app_versions"
      ON public.app_versions
      FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;

-- Insert initial record for 1.0.0
INSERT INTO public.app_versions (version, version_code, title, release_notes, download_url, is_critical, min_version_code)
VALUES (
  '1.0.0',
  1,
  'Expense Tracker v1.0.0',
  '• Material You 4-style MD3 Theme Engine
• Gemini BYOK Multimodal Receipt & Screenshot Scanner
• Android Share Sheet logging (Receipts & SMS banking alerts)
• Historical month-locking & budget carry-forward
• Bank & credit card balance tracking with calibration audit',
  'https://yqopwzkvxdxmomvvlpor.supabase.co/storage/v1/object/public/app-releases/expense-tracker-v1.0.0.apk',
  false,
  1
) ON CONFLICT DO NOTHING;
