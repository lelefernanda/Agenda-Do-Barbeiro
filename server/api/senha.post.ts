/**
 * POST /api/senha
 *
 * Gera uma senha nova para um usuário existente, a partir do e-mail.
 *
 * É o caminho do "esqueci a senha" neste sistema: como não existe
 * cadastro público nem e-mail de recuperação, quem resolve é o master —
 * gera aqui e dita no WhatsApp, igual ao primeiro acesso.
 *
 * Roda no SERVIDOR porque trocar senha dos outros exige a chave
 * secreta, que nunca pode chegar ao navegador.
 */

import {
  serverSupabaseUser,
  serverSupabaseClient,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database, Contexto } from '~/types/database.types'

type Corpo = { email?: string }

/** Senha temporária fácil de ditar no telefone: "tuka-melo-4183" */
function senhaTemporaria(): string {
  const c = 'bcdfgjklmnprstvz'
  const v = 'aeiou'
  const silaba = () =>
    c[Math.floor(Math.random() * c.length)]! + v[Math.floor(Math.random() * v.length)]!
  const bloco = () => silaba() + silaba()
  const numero = String(Math.floor(1000 + Math.random() * 9000))
  return `${bloco()}-${bloco()}-${numero}`
}

export default defineEventHandler(async (event) => {
  // ---------- 1. só o master troca senha dos outros ----------
  const usuario = await serverSupabaseUser(event)
  if (!usuario) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logada.' })
  }

  const cliente = await serverSupabaseClient<Database>(event)
  const { data: ctx } = await cliente.rpc('meu_contexto')
  const contexto = ctx as Contexto | null

  if (!contexto || contexto.papel !== 'master' || !contexto.acesso) {
    throw createError({ statusCode: 403, statusMessage: 'Apenas o master redefine senhas.' })
  }

  // ---------- 2. conferir o que veio ----------
  const corpo = await readBody<Corpo>(event)
  const email = (corpo.email ?? '').trim().toLowerCase()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'E-mail inválido.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  // ---------- 3. achar o usuário pelo e-mail ----------
  // A API de admin não busca por e-mail direto, então a gente lista
  // e procura. Com o tamanho da base isso é instantâneo; se um dia
  // passar de mil usuários, aqui vira uma busca paginada.
  const { data: pagina, error: erroLista } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (erroLista) {
    throw createError({ statusCode: 400, statusMessage: erroLista.message })
  }

  const alvo = pagina.users.find((u) => (u.email ?? '').toLowerCase() === email)

  if (!alvo) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Nenhuma conta com esse e-mail. Confira a grafia com a pessoa.',
    })
  }

  // ---------- 4. quem é essa pessoa? (para mostrar na confirmação) ----------
  const { data: perfil } = await admin
    .from('perfis')
    .select('nome, papel, barbearia_id')
    .eq('id', alvo.id)
    .maybeSingle()

  // ---------- 5. gerar e gravar a senha nova ----------
  const senha = senhaTemporaria()

  const { error: erroTroca } = await admin.auth.admin.updateUserById(alvo.id, {
    password: senha,
  })

  if (erroTroca) {
    throw createError({ statusCode: 400, statusMessage: erroTroca.message })
  }

  // A senha antiga morreu agora. A nova só aparece nesta resposta.
  return {
    pessoa: {
      nome: perfil?.nome ?? alvo.email ?? '',
      papel: perfil?.papel ?? null,
      email,
      senha,
    },
  }
})