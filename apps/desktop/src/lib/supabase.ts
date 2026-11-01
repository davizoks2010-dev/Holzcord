import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'anon'
)

export interface Server { id: string; name: string; invite_code: string }
export interface Channel { id: string; server_id: string; name: string; type: 'text' | 'voice' }
export interface Message {
  id: string; channel_id: string; author_id: string; content: string
  attachment_url: string | null; created_at: string; profiles?: { username: string } | null
}
