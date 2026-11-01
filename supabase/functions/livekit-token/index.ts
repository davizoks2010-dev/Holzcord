// Edge Function: emite token LiveKit apenas para membros do servidor do canal de voz.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401, headers: cors })

  const { channelId } = await req.json()
  // RLS: so retorna se o usuario for membro do servidor
  const { data: ch } = await supabase.from('channels').select('id,type').eq('id', channelId).maybeSingle()
  if (!ch || ch.type !== 'voice') return new Response('forbidden', { status: 403, headers: cors })
  const { data: prof } = await supabase.from('profiles').select('username').eq('id', user.id).single()

  const at = new AccessToken(Deno.env.get('LIVEKIT_API_KEY')!, Deno.env.get('LIVEKIT_API_SECRET')!, {
    identity: user.id, name: prof?.username ?? 'user', ttl: '2h'
  })
  at.addGrant({ room: channelId, roomJoin: true, canPublish: true, canSubscribe: true })
  return new Response(JSON.stringify({ token: await at.toJwt(), url: Deno.env.get('LIVEKIT_URL') }),
    { headers: { ...cors, 'Content-Type': 'application/json' } })
})
