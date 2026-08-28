/**
 * GET /api/publico/barbearia?slug=inkabarbershop
 *
 * A vitrine da barbearia para quem NAO tem login: nome, contato,
 * servicos ativos, quem atende e o horario de funcionamento.
 *
 * Roda no SERVIDOR de proposito. Se o navegador falasse direto com o
 * banco, qualquer pessoa poderia ler as tabelas inteiras — inclusive
 * nome e telefone dos clientes de todas as barbearias. Aqui o servidor
 * devolve exatamente o que a pagina precisa mostrar, e nada mais.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/** "09:00:00" -> minutos desde a meia-noite */
function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function emRotulo(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export default defineEventHandler(async (evento) => {
  const { slug } = getQuery(evento)

  if (typeof slug !== 'string' || !slug.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Slug ausente.' })
  }

  const admin = serverSupabaseServiceRole<Database>(evento)

  /* 1. A barbearia. So aparece se estiver ativa: suspensa ou
        cancelada some da internet, sem meio-termo. */
  const { data: barbearia, error: erroBarbearia } = await admin
    .from('barbearias')
    .select(
      'id, nome, slug, status, telefone, endereco, cidade, instagram, logo_url, capa_url, capa_pos, sobre, cor'
    )
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle()

  if (erroBarbearia) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar a barbearia.' })
  }
  if (!barbearia || barbearia.status !== 'ativa') {
    throw createError({ statusCode: 404, statusMessage: 'Barbearia não encontrada.' })
  }

  /* 2. Servicos e atendentes, em paralelo. */
  const [servicos, atendentes] = await Promise.all([
    admin
      .from('servicos')
      .select('id, nome, descricao, duracao_min, preco, foto_url')
      .eq('barbearia_id', barbearia.id)
      .eq('ativo', true)
      .order('ordem', { ascending: true }),
    admin
      .from('perfis')
      .select('id, nome, foto_url, bio')
      .eq('barbearia_id', barbearia.id)
      .eq('atende', true)
      .eq('status', 'ativo')
      .order('nome', { ascending: true }),
  ])

  const idsAtendentes = (atendentes.data ?? []).map((a) => a.id)

  /* 3. O horario de funcionamento da LOJA.

     Ninguem digita isso: sai das jornadas de quem atende. A loja abre
     quando o primeiro barbeiro comeca e fecha quando o ultimo termina.
     Se cada um tem um turno diferente, o intervalo cobre todos — que e
     exatamente o que o cliente quer saber ao perguntar "que horas
     abre?". */
  const semana: { dia: number; abre: string; fecha: string }[] = []

  if (idsAtendentes.length) {
    const { data: jornadas } = await admin
      .from('jornadas')
      .select('dia_semana, inicio, fim')
      .eq('barbearia_id', barbearia.id)
      .in('barbeiro_id', idsAtendentes)

    const porDia = new Map<number, { abre: number; fecha: number }>()

    for (const j of jornadas ?? []) {
      const ini = emMinutos(j.inicio)
      const fim = emMinutos(j.fim)
      const atual = porDia.get(j.dia_semana)
      if (!atual) {
        porDia.set(j.dia_semana, { abre: ini, fecha: fim })
      } else {
        porDia.set(j.dia_semana, {
          abre: Math.min(atual.abre, ini),
          fecha: Math.max(atual.fecha, fim),
        })
      }
    }

    for (const [dia, faixa] of porDia) {
      semana.push({ dia, abre: emRotulo(faixa.abre), fecha: emRotulo(faixa.fecha) })
    }
    semana.sort((a, b) => a.dia - b.dia)
  }

  /* 4. Esta aberto agora? Calculado no fuso de Sao Paulo, nao no do
        servidor (que roda em UTC). */
  const agoraSP = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  )
  const diaHoje = agoraSP.getDay()
  const minutoAgora = agoraSP.getHours() * 60 + agoraSP.getMinutes()
  const hoje = semana.find((d) => d.dia === diaHoje)

  const aberto =
    !!hoje && minutoAgora >= emMinutos(hoje.abre) && minutoAgora < emMinutos(hoje.fecha)

  return {
    barbearia: {
      id: barbearia.id,
      nome: barbearia.nome,
      slug: barbearia.slug,
      telefone: barbearia.telefone,
      endereco: barbearia.endereco,
      cidade: barbearia.cidade,
      instagram: barbearia.instagram,
      logo_url: barbearia.logo_url,
      capa_url: barbearia.capa_url,
      capa_pos: barbearia.capa_pos,
      sobre: barbearia.sobre,
      cor: barbearia.cor,
    },
    servicos: servicos.data ?? [],
    atendentes: atendentes.data ?? [],
    semana,
    aberto,
    dia_hoje: diaHoje,
  }
})