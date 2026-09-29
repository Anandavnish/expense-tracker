import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { useSettingsStore } from './settingsStore';
import { useFinanceStore } from './financeStore';
import { useMerchantRulesStore } from './merchantRulesStore';

WebBrowser.maybeCompleteAuthSession();

const GUEST_STORAGE_KEY = '@auth_is_guest_mode_v1';

export const GUEST_USER: User = {
  id: 'guest_local_user',
  app_metadata: { provider: 'guest' },
  user_metadata: { name: 'Guest Explorer', email: 'guest@local.device' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
  email: 'guest@local.device',
} as any;

export const GUEST_SESSION: Session = {
  access_token: 'guest_local_access_token',
  token_type: 'bearer',
  user: GUEST_USER,
  refresh_token: 'guest_local_refresh_token',
  expires_in: 999999999,
} as any;

interface AuthState {
  session: Session | null;
  user: User | null;
  isGuest: boolean;
  isLoading: boolean;
  error: string | null;

  initializeAuth: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInAsGuest: () => Promise<void>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const extractParams = (url: string) => {
  const params = new URLSearchParams();
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');

  if (queryIndex !== -1) {
    const end = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : url.length;
    const queryStr = url.substring(queryIndex + 1, end);
    new URLSearchParams(queryStr).forEach((val, key) => params.set(key, val));
  }
  if (hashIndex !== -1) {
    const hashStr = url.substring(hashIndex + 1);
    new URLSearchParams(hashStr).forEach((val, key) => params.set(key, val));
  }
  return params;
};

const handleAuthUrl = async (url: string) => {
  try {
    if (!url) return;
    const params = extractParams(url);

    const authError = params.get('error_description') || params.get('error');
    if (authError) {
      let decodedError = authError;
      try {
        decodedError = decodeURIComponent(authError);
      } catch {
        // ignore
      }
      if (decodedError.includes('Unable to exchange external code')) {
        decodedError =
          'Google Sign-In configuration error: Please check your Google OAuth Web Client ID and Secret in Supabase, and ensure https://yqopwzkvxdxmomvvlpor.supabase.co/auth/v1/callback is added to Authorized redirect URIs in Google Cloud.';
      }
      useAuthStore.setState({ isLoading: false, error: decodedError });
      return;
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');

    if (accessToken && refreshToken) {
      useAuthStore.setState({ isLoading: true });
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        useAuthStore.setState({ isLoading: false, error: error.message });
        return;
      }
      if (data.session) {
        const wasGuest = useAuthStore.getState().isGuest;
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        useAuthStore.setState({
          session: data.session,
          user: data.session.user,
          isGuest: false,
          isLoading: false,
          error: null,
        });
        if (data.session.user) {
          useSettingsStore.getState().fetchGeminiApiKey(data.session.user.id).catch(() => {});
          useMerchantRulesStore.getState().loadRules(data.session.user.id).catch(() => {});
          if (wasGuest) {
            useFinanceStore.getState().migrateLocalDataToCloud(data.session.user.id).catch(() => {});
          }
        }
      }
    } else if (code) {
      useAuthStore.setState({ isLoading: true });
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        useAuthStore.setState({ isLoading: false, error: error.message });
        return;
      }
      if (data.session) {
        const wasGuest = useAuthStore.getState().isGuest;
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        useAuthStore.setState({
          session: data.session,
          user: data.session.user,
          isGuest: false,
          isLoading: false,
          error: null,
        });
        if (data.session.user) {
          useSettingsStore.getState().fetchGeminiApiKey(data.session.user.id).catch(() => {});
          useMerchantRulesStore.getState().loadRules(data.session.user.id).catch(() => {});
          if (wasGuest) {
            useFinanceStore.getState().migrateLocalDataToCloud(data.session.user.id).catch(() => {});
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[authStore] Error handling auth deep link:', err);
    useAuthStore.setState({ isLoading: false, error: err?.message || 'Authentication failed' });
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isGuest: false,
  isLoading: true,
  error: null,

  initializeAuth: async () => {
    try {
      set({ isLoading: true, error: null });

      // 1. Check if user is in Guest Mode
      const storedGuest = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
      if (storedGuest === 'true') {
        set({
          session: GUEST_SESSION,
          user: GUEST_USER,
          isGuest: true,
          isLoading: false,
        });
        return;
      }

      // 2. Check Supabase session
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        set({ session: null, user: null, isGuest: false, isLoading: false, error: error.message });
        return;
      }
      set({ session: data.session, user: data.session?.user ?? null, isGuest: false, isLoading: false });
      if (data.session?.user) {
        useSettingsStore.getState().fetchGeminiApiKey(data.session.user.id).catch(() => {});
        useMerchantRulesStore.getState().loadRules(data.session.user.id).catch(() => {});
      }

      // 3. Listen for deep link OAuth returns
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleAuthUrl(initialUrl);
      }
      Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));

      // 4. Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        if (get().isGuest) return;
        set({ session, user: session?.user ?? null, isGuest: false });
        if (session?.user) {
          useSettingsStore.getState().fetchGeminiApiKey(session.user.id).catch(() => {});
          useMerchantRulesStore.getState().loadRules(session.user.id).catch(() => {});
        } else {
          useSettingsStore.getState().resetForSignOut();
          useMerchantRulesStore.getState().resetForSignOut();
        }
      });
    } catch (err: any) {
      set({ session: null, user: null, isGuest: false, isLoading: false, error: err.message });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const wasGuest = get().isGuest;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error };
      }

      await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      set({ session: data.session, user: data.user, isGuest: false, isLoading: false, error: null });

      if (wasGuest && data.user) {
        await useFinanceStore.getState().migrateLocalDataToCloud(data.user.id);
      }

      return { error: null };
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return { error: err };
    }
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const wasGuest = get().isGuest;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error };
      }

      await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      set({ session: data.session, user: data.user, isGuest: false, isLoading: false, error: null });

      if (wasGuest && data.user) {
        await useFinanceStore.getState().migrateLocalDataToCloud(data.user.id);
      }

      return { error: null };
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      return { error: err };
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const redirectUrl = makeRedirectUri({
        scheme: 'expensetracker',
        path: 'auth/callback',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error };
      }

      if (data?.url) {
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.location.href = data.url;
          }
        } else {
          const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
          if (authResult.type === 'success' && authResult.url) {
            await handleAuthUrl(authResult.url);
          } else {
            // Cancelled or dismissed
            set({ isLoading: false });
          }
        }
      } else {
        set({ isLoading: false });
      }

      return { error: null };
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'Google sign in failed' });
      return { error: err };
    }
  },

  signInAsGuest: async () => {
    try {
      set({ isLoading: true, error: null });
      useFinanceStore.getState().resetForSignOut();
      await AsyncStorage.setItem(GUEST_STORAGE_KEY, 'true');
      set({
        session: GUEST_SESSION,
        user: GUEST_USER,
        isGuest: true,
        isLoading: false,
        error: null,
      });
      // Load strictly cached guest finance data
      await useFinanceStore.getState().loadCachedData('guest');
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
    }
  },

  setPassword: async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update password' };
    }
  },

  deleteAccount: async () => {
    try {
      const isGuest = get().isGuest;
      const user = get().user;

      if (isGuest) {
        await useFinanceStore.getState().clearAllLocalData();
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
        set({ session: null, user: null, isGuest: false });
        return { success: true };
      }

      if (user?.id) {
        // Clear all user tables
        await Promise.allSettled([
          supabase.from('transactions').delete().eq('user_id', user.id),
          supabase.from('borrows').delete().eq('user_id', user.id),
          supabase.from('budgets').delete().eq('user_id', user.id),
          supabase.from('accounts').delete().eq('user_id', user.id),
          supabase.from('profiles').delete().eq('id', user.id),
          supabase.from('user_merchant_rules').delete().eq('user_id', user.id),
        ]);
        await useFinanceStore.getState().clearAllLocalData();
        useMerchantRulesStore.getState().resetForSignOut();
        await useSettingsStore.getState().removeGeminiApiKey(user.id);
        useSettingsStore.getState().resetForSignOut();
        await supabase.auth.signOut();
        set({ session: null, user: null, isGuest: false });
        return { success: true };
      }

      return { success: false, error: 'No active session found' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete account' };
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      const wasGuest = get().isGuest;
      if (wasGuest) {
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY);
      } else {
        await supabase.auth.signOut();
      }
      useFinanceStore.getState().resetForSignOut();
      useMerchantRulesStore.getState().resetForSignOut();
      useSettingsStore.getState().resetForSignOut();
    } finally {
      set({ session: null, user: null, isGuest: false, isLoading: false, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
