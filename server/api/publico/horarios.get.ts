/**
 * GET /api/publico/horarios?barbeiro=<id>&servico=<id>&dia=2026-08-27
 *
 * Os horarios livres de um barbeiro num dia, para um servico.
 *
 * O calculo e o mesmo da agenda do painel: pega a jornada do dia da
 * semana, tira os bloqueios, tira o que ja esta marcado, e devolve o
 * que sobrou de 15 em 15 minutos. Como quem calcula e o servidor, o
 * navegador nunca ve os agendamentos alheios — so recebe uma lista
 * de horarios livres.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/** Status que seguram a cadeira. Cancelado e faltou liberam o horario. */
const OCUPAM = ['pendente', 'confirmado', 'concluido']

/** "09:30" -> 570 minutos */
function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 570 -> "09:30" */
function emRotulo(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export default defineEventHandler(async (evento) => {
  const { barbeiro, servico, dia } = getQuery(evento)

  if (typeof barbeiro !== 'string' || typeof servico !== 'string' || typeof dia !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Parâmetros incompletos.' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw createError({ statusCode: 400, statusMessage: 'Data inválida.' })
  }

  const admin = serverSupabaseServiceRole<Database>(evento)

  /* A duracao do servico decide o tamanho do encaixe. */
  const { data: srv } = await admin
    .from('servicos')
    .select('duracao_min, ativo')
    .eq('id', servico)
    .maybeSingle()

  if (!srv || !srv.ativo) {
    throw createError({ statusCode: 404, statusMessage: 'Serviço não encontrado.' })
  }
  const duracao = srv.duracao_min

  /* As bordas do dia, no fuso de Sao Paulo. O -03:00 fixo evita que o
     fuso do servidor (que roda em UTC) empurre tudo tres horas. */
  const iniDia = new Date(`${dia}T00:00:00-03:00`)
  const fimDia = new Date(iniDia.getTime() + 86400000)

  /* O dia da semana vem da data escrita, nao do relogio do servidor:
     "2026-08-27" e quinta em qualquer maquina do mundo. */
  const [ano, mes, diaDoMes] = dia.split('-').map(Number)
  const diaSemana = new Date(Date.UTC(ano!, mes! - 1, diaDoMes!)).getUTCDay()

  const [jornadas, bloqueios, agendados] = await Promise.all([
    admin
      .from('jornadas')
      .select('inicio, fim')
      .eq('barbeiro_id', barbeiro)
      .eq('dia_semana', diaSemana),
    admin
      .from('bloqueios')
      .select('inicio, fim')
      .eq('barbeiro_id', barbeiro)
      .lt('inicio', fimDia.toISOString())
      .gt('fim', iniDia.toISOString()),
    admin
      .from('agendamentos')
      .select('inicio, fim, status')
      .eq('barbeiro_id', barbeiro)
      .gte('inicio', iniDia.toISOString())
      .lt('inicio', fimDia.toISOString()),
  ])

  /* Tudo que ocupa a cadeira, em minutos desde a meia-noite. */
  const ocupado: { ini: number; fim: number }[] = []

  for (const a of agendados.data ?? []) {
    if (!OCUPAM.includes(a.status as string)) continue
    ocupado.push({
      ini: Math.floor((new Date(a.inicio).getTime() - iniDia.getTime()) / 60000),
      fim: Math.ceil((new Date(a.fim).getTime() - iniDia.getTime()) / 60000),
    })
  }

  for (const b of bloqueios.data ?? []) {
    const i = Math.max(new Date(b.inicio).getTime(), iniDia.getTime())
    const f = Math.min(new Date(b.fim).getTime(), fimDia.getTime())
    ocupado.push({
      ini: Math.floor((i - iniDia.getTime()) / 60000),
      fim: Math.ceil((f - iniDia.getTime()) / 60000),
    })
  }

  /* Horario que ja passou nao vale. Meia hora de folga para o cliente
     nao marcar um corte que comeca em cinco minutos. */
  const agora = Date.now()
  const minutoAgora =
    agora >= iniDia.getTime() && agora < fimDia.getTime()
      ? Math.floor((agora - iniDia.getTime()) / 60000) + 30
      : -1

  const livres: string[] = []

  for (const j of jornadas.data ?? []) {
    const abre = emMinutos(j.inicio)
    const fecha = emMinutos(j.fim)
    for (let t = abre; t + duracao <= fecha; t += 15) {
      if (t <= minutoAgora) continue
      const cabe = !ocupado.some((o) => t < o.fim && t + duracao > o.ini)
      if (cabe) livres.push(emRotulo(t))
    }
  }

  livres.sort()

  return { dia, duracao, livres }
})