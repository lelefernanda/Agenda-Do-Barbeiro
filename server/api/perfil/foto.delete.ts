/**
 * DELETE /api/perfil/foto
 *
 * Remove a foto de quem esta logado. Mesmo motivo do envio:
 * o servidor decide de quem e o arquivo, nao o navegador.
 */

import {
  serverSupabaseUser,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Pega o id de quem esta logado.
 *
 * Com as chaves novas do Supabase (formato sb_secret_), o servidor
 * devolve os dados do usuario no formato JWT, onde o identificador
 * se chama "sub" em vez de "id". Aceitar os dois evita quebrar
 * quando o projeto migra de um formato para o outro.
 */
function idDoUsuario(u: unknown): string | null {
  const o = u as { id?: string; sub?: string } | null
  return o?.id ?? o?.sub ?? null
}


export default defineEventHandler(async (event) => {
  const usuario = await serverSupabaseUser(event)
  const uid = idDoUsuario(usuario)
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logada.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  await admin.storage.from('avatares').remove([`${uid}/foto.jpg`])

  const { error } = await admin
    .from('perfis')
    .update({ foto_url: null })
    .eq('id', uid)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})