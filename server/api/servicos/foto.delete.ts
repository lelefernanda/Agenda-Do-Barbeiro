/**
 * DELETE /api/servicos/foto
 *
 * Remove a foto de um servico. Mesma checagem dupla do envio:
 * precisa ser dono, e o servico precisa ser da barbearia dele.
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

  if (!contexto?.acesso || contexto.papel !== 'dono') {
    throw createError({ statusCode: 403, statusMessage: 'Apenas o dono edita os serviços.' })
  }

  const { servico_id: servicoId } = await readBody<{ servico_id?: string }>(event)
  if (!servicoId) {
    throw createError({ statusCode: 400, statusMessage: 'Serviço não informado.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  const { data: servico } = await admin
    .from('servicos')
    .select('id, barbearia_id')
    .eq('id', servicoId)
    .maybeSingle()

  if (!servico || servico.barbearia_id !== contexto.barbearia_id) {
    throw createError({ statusCode: 404, statusMessage: 'Serviço não encontrado.' })
  }

  await admin.storage
    .from('servicos')
    .remove([`${contexto.barbearia_id}/${servicoId}.jpg`])

  const { error } = await admin
    .from('servicos')
    .update({ foto_url: null })
    .eq('id', servicoId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})