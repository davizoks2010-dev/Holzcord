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

export interface Server { id: string; name: string; invite_code: string }
export interface Channel { id: string; server_id: string; name: string; type: 'text' | 'voice' }
export interface Message {
  id: string; channel_id: string; author_id: string; content: string
  attachment_url: string | null; created_at: string; profiles?: { username: string } | null
}
