/**
 * POST /api/publico/avaliar
 *
 * A nota que o cliente da depois do corte.
 *
 * Nao existe login aqui, entao a rota nao acredita em nada do que
 * recebe: ela confere que o atendimento existe, que foi concluido,
 * que pertence aquele cliente (pela chave guardada no celular dele) e
 * que ainda nao foi avaliado. Sem isso, qualquer um poderia derrubar a
 * nota de um barbeiro que nunca atendeu.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

type Corpo = {
  agendamento_id?: string
  chave?: string
  estrelas?: number
  comentario?: string
}

export default defineEventHandler(async (evento) => {
  const corpo = await readBody<Corpo>(evento)

  const agendamentoId = (corpo.agendamento_id ?? '').trim()
  const chave = (corpo.chave ?? '').trim()
  const estrelas = Number(corpo.estrelas ?? 0)
  const comentario = (corpo.comentario ?? '').trim().slice(0, 500)

  if (!agendamentoId || !/^[a-z0-9-]{20,60}$/.test(chave)) {
    throw createError({ statusCode: 400, statusMessage: 'Dados inválidos.' })
  }
  if (!Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) {
    throw createError({ statusCode: 400, statusMessage: 'Escolha de 1 a 5 estrelas.' })
  }

  const admin = serverSupabaseServiceRole<Database>(evento)

  /* O atendimento precisa existir, estar concluido e ser DESTE cliente. */
  const { data: agendamento } = await admin
    .from('agendamentos')
    .select('id, status, cliente_id')
    .eq('id', agendamentoId)
    .maybeSingle()

  if (!agendamento) {
    throw createError({ statusCode: 404, statusMessage: 'Atendimento não encontrado.' })
  }
  if (agendamento.status !== 'concluido') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Só dá para avaliar depois do atendimento.',
    })
  }

  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('id', agendamento.cliente_id)
    .eq('chave', chave)
    .maybeSingle()

  if (!cliente) {
    throw createError({ statusCode: 403, statusMessage: 'Este atendimento não é seu.' })
  }

  /* Uma avaliacao por atendimento. */
  const { data: jaTem } = await admin
    .from('avaliacoes')
    .select('id')
    .eq('agendamento_id', agendamentoId)
    .maybeSingle()

  if (jaTem) {
    throw createError({ statusCode: 409, statusMessage: 'Você já avaliou este atendimento.' })
  }

  const { error } = await admin.from('avaliacoes').insert({
    agendamento_id: agendamentoId,
    estrelas,
    comentario: comentario || null,
  })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { ok: true }
})
