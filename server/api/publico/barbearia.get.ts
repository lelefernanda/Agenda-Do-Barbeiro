/**
 * GET /api/publico/barbearia?slug=inkabarbershop
 *
 * A vitrine da barbearia para quem NAO tem login: nome, contato,
 * a lista de servicos ativos e quem atende.
 *
 * Roda no SERVIDOR de proposito. Se o navegador falasse direto com o
 * banco, qualquer pessoa poderia ler as tabelas inteiras — inclusive
 * nome e telefone dos clientes de todas as barbearias. Aqui o servidor
 * devolve exatamente o que a pagina precisa mostrar, e nada mais.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

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
    .select('id, nome, slug, status, telefone, endereco, cidade, instagram, logo_url, capa_url, capa_pos, sobre, cor')
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
  }
})