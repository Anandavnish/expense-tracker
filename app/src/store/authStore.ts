// src/store/authStore.ts
import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  initializeAuth: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  error: null,

  initializeAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ session: null, user: null, isLoading: false, error: error.message });
        return;
      }
      set({ session: data.session, user: data.session?.user ?? null, isLoading: false });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
      });
    } catch (err: any) {
      set({ session: null, user: null, isLoading: false, error: err.message });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error };
      }

      set({ session: data.session, user: data.user, isLoading: false, error: null });
      return { error: null };
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return { error: err };
    }
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error };
      }

      set({ session: data.session, user: data.user, isLoading: false, error: null });
      return { error: null };
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return { error: err };
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    await supabase.auth.signOut();
    set({ session: null, user: null, isLoading: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
