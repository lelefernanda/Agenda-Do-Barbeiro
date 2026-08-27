/**
 * DELETE /api/barbearia/foto?tipo=logo
 *
 * Tira a logo ou a capa: apaga do storage e limpa a coluna.
 */

import {
  serverSupabaseUser,
  serverSupabaseClient,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database, Contexto } from '~/types/database.types'

function idDoUsuario(u: unknown): string | null {
  const o = u as { id?: string; sub?: string } | null
  return o?.id ?? o?.sub ?? null
}

export default defineEventHandler(async (event) => {
  const usuario = await serverSupabaseUser(event)
  if (!idDoUsuario(usuario)) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logado.' })
  }

  const cliente = await serverSupabaseClient<Database>(event)
  const { data: ctx } = await cliente.rpc('meu_contexto')
  const contexto = ctx as Contexto | null

  if (!contexto?.acesso || contexto.papel !== 'dono' || !contexto.barbearia_id) {
    throw createError({ statusCode: 403, statusMessage: 'Apenas o dono edita a barbearia.' })
  }

  const { tipo } = getQuery(event)
  if (tipo !== 'logo' && tipo !== 'capa') {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de imagem inválido.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  await admin.storage.from('barbearias').remove([`${contexto.barbearia_id}/${tipo}.jpg`])

  // Escrito assim, e nao com chave dinamica, porque o TypeScript
  // precisa saber QUAL coluna esta sendo alterada.
  const mudanca = tipo === 'logo' ? { logo_url: null } : { capa_url: null }

  const { error } = await admin
    .from('barbearias')
    .update(mudanca)
    .eq('id', contexto.barbearia_id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
