import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * null when the env vars are not set. The app then runs on mock data so
 * frontend work never waits on backend (see plan.md section 4).
 */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

export const isMockMode = supabase === null

export const isLocalDemo = isMockMode && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
