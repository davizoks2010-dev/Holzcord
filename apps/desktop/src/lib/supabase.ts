import { createClient } from '@supabase/supabase-js'

// Configuracao: variavel de ambiente (build) ou salva no app na primeira execucao.
// A URL e a anon key sao publicas por design (a seguranca vem das regras RLS do banco).
const DEFAULT_URL = 'https://patfkmngjwpubpchkmbu.supabase.co'
function stored(k: string) { try { return localStorage.getItem(k) || undefined } catch { return undefined } }
export const sbUrl: string = import.meta.env.VITE_SUPABASE_URL || stored('holz.sb.url') || DEFAULT_URL
export const sbKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY || stored('holz.sb.key')
export function saveSupabaseConfig(url: string, key: string) {
  localStorage.setItem('holz.sb.url', url.trim()); localStorage.setItem('holz.sb.key', key.trim())
}

export const supabase = createClient(sbUrl, sbKey ?? 'missing-key')

export interface Server { id: string; name: string; invite_code: string; owner_id: string }
export interface Role { id: string; server_id: string; name: string; color: string; position: number; perms: string[] }
export interface Member { server_id: string; user_id: string; role_id: string | null; profiles: { username: string; avatar_url?: string | null } | null }
export interface Channel { id: string; server_id: string | null; name: string; type: 'text' | 'voice' | 'dm' }
export interface Profile { id: string; username: string; avatar_url: string | null; about: string | null; status: 'online' | 'idle' | 'dnd' | 'invisible' }
export interface Message {
  id: string; channel_id: string; author_id: string; content: string
  attachment_url: string | null; created_at: string; edited_at?: string | null; pinned?: boolean; reply_to?: string | null; profiles?: { username: string; avatar_url?: string | null } | null
}
