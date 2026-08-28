/**
 * POST /api/barbearia/nome
 *
 * Troca o nome da barbearia e, junto, o endereco da pagina publica.
 *
 * Corpo: { nome }
 *
 * O dono nao pensa em "slug": ele muda o nome e o endereco acompanha.
 * O endereco antigo vira apelido e continua funcionando para sempre —
 * o link que ele ja colou na bio do Instagram nao morre.
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

/** "Edi Barber Shop" -> "edibarbershop" */
function comoEndereco(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')          // so letra e numero
    .slice(0, 40)
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

  const { nome } = await readBody<{ nome?: string }>(event)
  const limpo = (nome ?? '').trim()

  if (limpo.length < 2 || limpo.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'O nome precisa ter entre 2 e 80 letras.' })
  }

  const base = comoEndereco(limpo)
  if (base.length < 3) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Esse nome não gera um endereço válido. Use pelo menos três letras.',
    })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  const { data: atual } = await admin
    .from('barbearias')
    .select('slug')
    .eq('id', contexto.barbearia_id)
    .single()

  const slugAntigo = atual?.slug ?? ''

  /* Endereco igual ao de antes: so o nome muda. */
  if (base === slugAntigo) {
    const { error } = await admin
      .from('barbearias')
      .update({ nome: limpo })
      .eq('id', contexto.barbearia_id)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { nome: limpo, slug: slugAntigo, mudou: false }
  }

  /* Procura um endereco livre. Se "edibarbershop" ja e de outra loja,
     tenta "edibarbershop-2", "edibarbershop-3"... como o Instagram. */
  let escolhido = base
  for (let n = 2; n <= 30; n++) {
    const [ocupadoPorLoja, ocupadoPorApelido] = await Promise.all([
      admin.from('barbearias').select('id').eq('slug', escolhido).neq('id', contexto.barbearia_id).maybeSingle(),
      admin.from('slugs_antigos').select('slug').eq('slug', escolhido).neq('barbearia_id', contexto.barbearia_id).maybeSingle(),
    ])
    if (!ocupadoPorLoja.data && !ocupadoPorApelido.data) break
    escolhido = `${base}-${n}`
  }

  /* O endereco antigo vira apelido antes da troca, para nenhum link
     colado por aí deixar de funcionar. */
  if (slugAntigo) {
    await admin
      .from('slugs_antigos')
      .upsert({ slug: slugAntigo, barbearia_id: contexto.barbearia_id }, { onConflict: 'slug' })
  }

  const { error } = await admin
    .from('barbearias')
    .update({ nome: limpo, slug: escolhido })
    .eq('id', contexto.barbearia_id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  /* Se o endereco novo era apelido desta mesma loja, some da lista. */
  await admin
    .from('slugs_antigos')
    .delete()
    .eq('slug', escolhido)
    .eq('barbearia_id', contexto.barbearia_id)

  return { nome: limpo, slug: escolhido, mudou: true, antigo: slugAntigo }
})
