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
      'id, nome, slug, status, telefone, endereco, cidade, instagram, facebook, logo_url, capa_url, capa_pos, sobre, cor, pagamentos, comodidades'
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
    // Quem atende nesta unidade: a equipe dela, mais os donos que
    // ligaram "eu tambem atendo" — o dono pode cortar em mais de uma
    // loja sem se cadastrar duas vezes.
    admin
      .from('perfis')
      .select('id, nome, foto_url, bio, barbearia_id')
      .eq('atende', true)
      .eq('status', 'ativo')
      .order('nome', { ascending: true }),
  ])

  /* Quem realmente atende NESTA unidade: quem pertence a ela, mais os
     donos que a administram e ligaram "eu tambem atendo". O dono corta
     em duas cidades sem precisar de dois cadastros. */
  const { data: vinculos } = await admin
    .from('donos_barbearias')
    .select('perfil_id')
    .eq('barbearia_id', barbearia.id)

  const idsDonos = new Set((vinculos ?? []).map((v) => v.perfil_id))

  const equipe = (atendentes.data ?? []).filter(
    (a) => a.barbearia_id === barbearia.id || idsDonos.has(a.id)
  )

  const idsAtendentes = equipe.map((a) => a.id)

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

  /* As outras lojas do mesmo dono. Quem abre a pagina de uma cidade
     descobre que existe atendimento na outra — hoje o cliente so
     saberia por acaso. */
  const { data: donosDaqui } = await admin
    .from('donos_barbearias')
    .select('perfil_id')
    .eq('barbearia_id', barbearia.id)

  let outrasUnidades: { nome: string; slug: string; cidade: string | null }[] = []

  if ((donosDaqui ?? []).length) {
    const { data: todas } = await admin
      .from('donos_barbearias')
      .select('barbearia_id')
      .in('perfil_id', (donosDaqui ?? []).map((d) => d.perfil_id))

    const ids = [...new Set((todas ?? []).map((t) => t.barbearia_id))]
      .filter((id) => id !== barbearia.id)

    if (ids.length) {
      const { data: irmas } = await admin
        .from('barbearias')
        .select('nome, slug, cidade, endereco, status')
        .in('id', ids)
        .eq('status', 'ativa')
        .order('cidade')
        .order('nome')

      outrasUnidades = (irmas ?? []).map((b) => ({
        nome: b.nome,
        slug: b.slug,
        cidade: b.cidade,
        endereco: b.endereco,
      }))
    }
  }

  return {
    outrasUnidades,
    barbearia: {
      id: barbearia.id,
      nome: barbearia.nome,
      slug: barbearia.slug,
      telefone: barbearia.telefone,
      endereco: barbearia.endereco,
      cidade: barbearia.cidade,
      instagram: barbearia.instagram,
      facebook: barbearia.facebook,
      logo_url: barbearia.logo_url,
      capa_url: barbearia.capa_url,
      capa_pos: barbearia.capa_pos,
      sobre: barbearia.sobre,
      cor: barbearia.cor,
      pagamentos: barbearia.pagamentos ?? [],
      comodidades: barbearia.comodidades ?? [],
    },
    servicos: servicos.data ?? [],
    atendentes: equipe,
    semana,
    aberto,
    dia_hoje: diaHoje,
  }
})