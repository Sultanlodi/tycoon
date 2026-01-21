import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Session, User } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, username: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });

      if (error) throw error;

      // Create user profile
      if (data.user) {
        const { error: profileError } = await supabase.from('users').insert({
          id: data.user.id,
          username,
        });

        if (profileError) throw profileError;
      }

      setState((prev) => ({
        ...prev,
        session: data.session,
        user: data.user,
        loading: false,
      }));

      return { success: true };
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message,
        loading: false,
      }));
      return { success: false, error: error.message };
    }
  };

  const signIn = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setState((prev) => ({
        ...prev,
        session: data.session,
        user: data.user,
        loading: false,
      }));

      return { success: true };
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message,
        loading: false,
      }));
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setState({
        user: null,
        session: null,
        loading: false,
        error: null,
      });

      return { success: true };
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message,
        loading: false,
      }));
      return { success: false, error: error.message };
    }
  };

  const clearError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  return {
    ...state,
    signUp,
    signIn,
    signOut,
    clearError,
  };
};
