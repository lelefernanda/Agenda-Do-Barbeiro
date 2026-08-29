/**
 * GET /api/publico/pendente?slug=...&chave=...
 *
 * O ultimo atendimento concluido deste cliente que ainda nao foi
 * avaliado. E o que faz a pergunta "como foi seu corte?" aparecer na
 * pagina — sem o cliente precisar procurar por ela.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (evento) => {
  const { slug, chave } = getQuery(evento)

  if (typeof slug !== 'string' || typeof chave !== 'string') return { pendente: null }
  if (!/^[a-z0-9-]{20,60}$/.test(chave)) return { pendente: null }

  const admin = serverSupabaseServiceRole<Database>(evento)

  const { data: barbearia } = await admin
    .from('barbearias')
    .select('id')
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle()

  if (!barbearia) return { pendente: null }

  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('barbearia_id', barbearia.id)
    .eq('chave', chave)
    .maybeSingle()

  if (!cliente) return { pendente: null }

  /* So os ultimos 30 dias: perguntar sobre um corte de meio ano atras
     nao ajuda ninguem. */
  const limite = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: atendimentos } = await admin
    .from('agendamentos')
    .select('id, inicio, barbeiro_id, servico_id')
    .eq('cliente_id', cliente.id)
    .eq('status', 'concluido')
    .gte('inicio', limite)
    .order('inicio', { ascending: false })
    .limit(5)

  if (!atendimentos?.length) return { pendente: null }

  const { data: avaliados } = await admin
    .from('avaliacoes')
    .select('agendamento_id')
    .in('agendamento_id', atendimentos.map((a) => a.id))

  const jaAvaliados = new Set((avaliados ?? []).map((a) => a.agendamento_id))
  const pendente = atendimentos.find((a) => !jaAvaliados.has(a.id))

  if (!pendente) return { pendente: null }

  const [barbeiro, servico] = await Promise.all([
    admin.from('perfis').select('nome').eq('id', pendente.barbeiro_id).maybeSingle(),
    admin.from('servicos').select('nome').eq('id', pendente.servico_id).maybeSingle(),
  ])

  return {
    pendente: {
      id: pendente.id,
      inicio: pendente.inicio,
      barbeiro: barbeiro.data?.nome ?? null,
      servico: servico.data?.nome ?? null,
    },
  }
})
