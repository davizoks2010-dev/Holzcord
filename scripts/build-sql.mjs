// Junta todas as migracoes em um unico SQL seguro para rodar quantas vezes precisar.
// Gera: supabase/holzcord-banco-completo.sql  e  apps/desktop/src/assets/schema.sql (usado pelo app).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const dir = new URL('../supabase/migrations/', import.meta.url)
const files = readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()
let out = `-- Holzcord: banco de dados completo (gerado automaticamente a partir de supabase/migrations).\n-- Pode ser executado varias vezes: cria o que falta e atualiza o resto. Cole tudo no SQL Editor do Supabase e clique em Run.\n\n`
for (const f of files) {
  const sql = readFileSync(new URL(f, dir), 'utf8')
  if (f.startsWith('0001_')) {
    // 0001 cria as tabelas base: so roda se o banco ainda estiver vazio
    out += `-- ===== ${f} (somente se o banco ainda nao foi criado)\ndo $holz_base$ begin\n  if to_regclass('public.profiles') is null then\n    execute $holz_sql$\n${sql}\n    $holz_sql$;\n  end if;\nend $holz_base$;\n\n`
  } else {
    out += `-- ===== ${f}\n${sql}\n\n`
  }
}
const root = new URL('../', import.meta.url)
writeFileSync(new URL('supabase/holzcord-banco-completo.sql', root), out)
mkdirSync(dirname(new URL('apps/desktop/src/assets/', root).pathname), { recursive: true })
writeFileSync(new URL('apps/desktop/src/assets/schema.sql', root), out)
console.log(`SQL completo gerado com ${files.length} migracoes (${(out.length / 1024).toFixed(0)} KB)`)
