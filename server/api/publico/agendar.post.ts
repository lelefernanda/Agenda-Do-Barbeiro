/**
 * POST /api/publico/agendar
 *
 * O cliente marcando o proprio horario, sem login.
 *
 * Corpo: { slug, barbeiro_id, servico_id, dia: '2026-08-27',
 *          hora: '14:30', nome, telefone, observacao? }
 *
 * Tudo e reconferido aqui: se a barbearia esta ativa, se o barbeiro
 * atende nela, se o servico e dela, se o horario cabe na jornada e se
 * ninguem pegou a vaga enquanto o cliente decidia. Nada do que vem do
 * navegador e aceito de olhos fechados — nem o preco, que e lido do
 * banco na hora de gravar.
 *
 * O agendamento entra como PENDENTE: quem confirma e a barbearia.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const OCUPAM = ['pendente', 'confirmado', 'concluido']

type Corpo = {
  slug?: string
  barbeiro_id?: string
  servico_id?: string
  dia?: string
  hora?: string
  nome?: string
  telefone?: string
  observacao?: string
  /** Codigo que o navegador do cliente guarda para ser reconhecido depois. */
  chave?: string
  /** Foto que ele escolheu ao marcar, ja enviada para o servidor. */
  foto_url?: string
}

/** Deixa so os digitos. Precisa de 10 ou 11 para ser telefone brasileiro. */
function soDigitos(bruto: string): string | null {
  const d = (bruto || '').replace(/\D/g, '')
  const limpo = d.startsWith('55') && d.length > 11 ? d.slice(2) : d
  if (limpo.length < 10 || limpo.length > 11) return null
  return limpo
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export default defineEventHandler(async (evento) => {
  const corpo = await readBody<Corpo>(evento)

  const slug = (corpo.slug ?? '').trim().toLowerCase()
  const barbeiroId = (corpo.barbeiro_id ?? '').trim()
  const chave = (corpo.chave ?? '').trim()
  const fotoUrl = (corpo.foto_url ?? '').trim()
  const servicoId = (corpo.servico_id ?? '').trim()
  const dia = (corpo.dia ?? '').trim()
  const hora = (corpo.hora ?? '').trim()
  const nome = (corpo.nome ?? '').trim()
  const observacao = (corpo.observacao ?? '').trim()
  const telefone = soDigitos(corpo.telefone ?? '')

  if (!slug || !barbeiroId || !servicoId) {
    throw createError({ statusCode: 400, statusMessage: 'Dados incompletos.' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) {
    throw createError({ statusCode: 400, statusMessage: 'Data ou hora inválida.' })
  }
  if (nome.length < 2 || nome.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Informe seu nome.' })
  }
  if (!telefone) {
    throw createError({ statusCode: 400, statusMessage: 'Informe um WhatsApp válido com DDD.' })
  }
  if (observacao.length > 300) {
    throw createError({ statusCode: 400, statusMessage: 'Observação muito longa.' })
  }

  const admin = serverSupabaseServiceRole<Database>(evento)

  /* 1. A barbearia precisa existir e estar ativa. */
  const { data: barbearia } = await admin
    .from('barbearias')
    .select('id, nome, status')
    .eq('slug', slug)
    .maybeSingle()

  if (!barbearia || barbearia.status !== 'ativa') {
    throw createError({ statusCode: 404, statusMessage: 'Barbearia não encontrada.' })
  }

  /* 2. O barbeiro precisa atender NESTA barbearia. Sem essa conferencia,
        alguem poderia marcar com o barbeiro de outra loja. */
  const { data: barbeiro } = await admin
    .from('perfis')
    .select('id, nome, barbearia_id, atende, status')
    .eq('id', barbeiroId)
    .maybeSingle()

  /* Atende aqui quem pertence a esta unidade — ou quem a administra e
     ligou "eu tambem atendo". O dono corta em mais de uma loja sem
     precisar de um cadastro em cada uma. */
  let ehDaCasa = barbeiro?.barbearia_id === barbearia.id

  if (barbeiro && !ehDaCasa) {
    const { data: vinculo } = await admin
      .from('donos_barbearias')
      .select('perfil_id')
      .eq('perfil_id', barbeiro.id)
      .eq('barbearia_id', barbearia.id)
      .maybeSingle()
    ehDaCasa = !!vinculo
  }

  if (!barbeiro || !ehDaCasa || !barbeiro.atende || barbeiro.status !== 'ativo') {
    throw createError({ statusCode: 400, statusMessage: 'Profissional indisponível.' })
  }

  /* 3. O servico tambem precisa ser desta barbearia. O preco vem daqui,
        nunca do navegador. */
  const { data: servico } = await admin
    .from('servicos')
    .select('id, nome, duracao_min, preco, barbearia_id, ativo')
    .eq('id', servicoId)
    .maybeSingle()

  if (!servico || servico.barbearia_id !== barbearia.id || !servico.ativo) {
    throw createError({ statusCode: 400, statusMessage: 'Serviço indisponível.' })
  }

  /* 4. As bordas do atendimento. */
  const iniDia = new Date(`${dia}T00:00:00-03:00`)
  const inicio = new Date(`${dia}T${hora}:00-03:00`)
  const fim = new Date(inicio.getTime() + servico.duracao_min * 60000)

  if (inicio.getTime() < Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Esse horário já passou.' })
  }

  /* 5. O horario tem que caber na jornada daquele dia da semana. */
  const [ano, mes, diaDoMes] = dia.split('-').map(Number)
  const diaSemana = new Date(Date.UTC(ano!, mes! - 1, diaDoMes!)).getUTCDay()

  const { data: jornadas } = await admin
    .from('jornadas')
    .select('inicio, fim')
    .eq('barbeiro_id', barbeiroId)
    .eq('dia_semana', diaSemana)

  const t = emMinutos(hora)
  const cabeNaJornada = (jornadas ?? []).some(
    (j) => t >= emMinutos(j.inicio) && t + servico.duracao_min <= emMinutos(j.fim)
  )

  if (!cabeNaJornada) {
    throw createError({ statusCode: 409, statusMessage: 'Esse horário não está mais disponível.' })
  }

  /* 6. Bloqueios (folga, medico, feriado). */
  const { data: bloqueios } = await admin
    .from('bloqueios')
    .select('inicio, fim')
    .eq('barbeiro_id', barbeiroId)
    .lt('inicio', fim.toISOString())
    .gt('fim', inicio.toISOString())

  if ((bloqueios ?? []).length) {
    throw createError({ statusCode: 409, statusMessage: 'Esse horário não está mais disponível.' })
  }

  /* 7. A conferencia mais importante: alguem pegou a vaga enquanto o
        cliente preenchia o nome? */
  const fimDia = new Date(iniDia.getTime() + 86400000)
  const { data: doDia } = await admin
    .from('agendamentos')
    .select('inicio, fim, status')
    .eq('barbeiro_id', barbeiroId)
    .gte('inicio', iniDia.toISOString())
    .lt('inicio', fimDia.toISOString())

  const chocou = (doDia ?? []).some((a) => {
    if (!OCUPAM.includes(a.status as string)) return false
    return inicio < new Date(a.fim) && fim > new Date(a.inicio)
  })

  if (chocou) {
    throw createError({ statusCode: 409, statusMessage: 'Esse horário acabou de ser preenchido.' })
  }

  /* 8. O cliente. Se ja existe pelo telefone, reaproveita — e assim que
        o barbeiro reconhece o fregues de sempre em vez de ver cadastros
        repetidos. */
  const { data: achado } = await admin
    .from('clientes')
    .select('id')
    .eq('barbearia_id', barbearia.id)
    .eq('telefone', telefone)
    .maybeSingle()

  let clienteId = achado?.id ?? null

  /* A chave e a foto vem do celular do proprio cliente: servem para a
     pagina reconhece-lo na proxima vez e para o barbeiro ver o rosto de
     quem vem na lista. */
  const chaveLimpa = /^[a-z0-9-]{20,60}$/.test(chave) ? chave : null
  const fotoLimpa = fotoUrl.startsWith('http') ? fotoUrl.slice(0, 500) : null

  if (clienteId) {
    const mudanca: Record<string, string> = { nome }
    if (chaveLimpa) mudanca.chave = chaveLimpa
    if (fotoLimpa) mudanca.foto_url = fotoLimpa
    await admin.from('clientes').update(mudanca).eq('id', clienteId)
  }

  if (!clienteId) {
    const { data: criado, error: erroCliente } = await admin
      .from('clientes')
      .insert({ barbearia_id: barbearia.id, nome, telefone, chave: chaveLimpa, foto_url: fotoLimpa })
      .select('id')
      .single()

    if (erroCliente || !criado) {
      throw createError({ statusCode: 500, statusMessage: 'Não foi possível salvar seus dados.' })
    }
    clienteId = criado.id
  }

  /* 9. O agendamento, sempre pendente. */
  const { error: erroAgenda } = await admin.from('agendamentos').insert({
    barbearia_id: barbearia.id,
    cliente_id: clienteId,
    barbeiro_id: barbeiroId,
    servico_id: servico.id,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    status: 'pendente',
    preco_cobrado: Number(servico.preco),
    observacao: observacao || null,
  })

  if (erroAgenda) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível marcar o horário.' })
  }

  return {
    ok: true,
    barbearia: barbearia.nome,
    barbeiro: barbeiro.nome,
    servico: servico.nome,
    inicio: inicio.toISOString(),
  }
})