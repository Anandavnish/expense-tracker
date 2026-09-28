-- Migration: 20260928000003_storage_app_releases.sql
-- Creates a dedicated public storage bucket 'app-releases' for hosting APK updates directly in Supabase

-- 1. Create the 'app-releases' bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-releases',
  'app-releases',
  true,
  104857600, -- 100 MB per file (universal multi-architecture APK size)
  ARRAY['application/vnd.android.package-archive', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 104857600;

-- 2. Allow public unauthenticated downloads of APK release files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Public Access to APK Releases'
  ) THEN
    CREATE POLICY "Public Access to APK Releases"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'app-releases');
  END IF;
END $$;
