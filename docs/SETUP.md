# Configuração (tudo gratuito)

1. **Supabase** (supabase.com, plano Free): crie um projeto. No *SQL Editor* execute `supabase/migrations/0001_init.sql`.
   Copie *Project URL* e *anon key* para `.env` (veja `.env.example`).
2. **LiveKit Cloud** (livekit.io, plano Build/Free): crie um projeto e copie URL, API Key e Secret.
3. **Edge Function** (CLI do Supabase):
   ```
   supabase link --project-ref SEU_REF
   supabase secrets set LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
   supabase functions deploy livekit-token
   ```
4. **Rodar em desenvolvimento**: `npm install && npm run dev`.
5. **Instalador Windows**: no Windows, `npm run dist` gera `apps/desktop/release/Holzcord Setup *.exe`.
   Ou crie uma tag `v0.1.0` no GitHub: o workflow *Release* gera e publica o instalador (adicione os secrets
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`). Instalações existentes se atualizam sozinhas.

## Limites dos planos gratuitos
Supabase: 500 MB de banco, 1 GB de arquivos, projeto pausa após inatividade. LiveKit: cota mensal de minutos WebRTC.
Para remover limites, hospede Supabase e LiveKit você mesmo (open source) e troque as variáveis.

## Atalhos para Windows
- `configurar-backend.bat`: publica a função de voz e grava os segredos do LiveKit no Supabase (depois de rodar o SQL).
- `iniciar.bat`: cria o `.env`, instala dependências e abre o app.

## Login sem senha (só com nome de usuário)
1. Supabase → **SQL Editor**: execute também `supabase/migrations/0002_login_sem_senha.sql`.
2. Supabase → **Authentication** → **Sign In / Providers** → ative **Allow anonymous sign-ins**.
3. Na primeira execução o app pede a chave anon/publishable do Supabase e a guarda localmente (a URL já vem preenchida).

## Instalador (.exe)
Crie uma tag `v*` (ex.: `v0.1.0`): o workflow *Release* compila no Windows e publica o instalador na aba **Releases** do GitHub. Nenhum secret é necessário.
