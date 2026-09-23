// src/services/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://yqopwzkvxdxmomvvlpor.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxb3B3emt2eGR4bW9tdnZscG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODkxMjcsImV4cCI6MjEwNTc2NTEyN30.2IXYJpudYU1mHsdetoC929OrrRD4Lqqp5ARTSkIcuEk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
