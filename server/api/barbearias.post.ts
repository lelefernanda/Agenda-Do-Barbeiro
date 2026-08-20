/**
 * POST /api/barbearias
 *
 * Cria a barbearia e o usuario do dono, numa operacao so.
 *
 * Roda no SERVIDOR porque usa a chave secreta, que ignora todas as
 * politicas de RLS. Essa chave nunca pode chegar ao navegador: quem a
 * tiver le e apaga o banco inteiro. Ela vive no .env e so e lida aqui.
 */

import {
  serverSupabaseUser,
  serverSupabaseClient,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database, Contexto, FormaPagamento } from '~/types/database.types'

type Corpo = {
  nome?: string
  slug?: string
  cidade?: string
  endereco?: string
  telefone?: string
  pagamento?: FormaPagamento
  dono_nome?: string
  dono_email?: string
  dono_telefone?: string
}

/**
 * Deixa so os digitos e garante o 55 do Brasil na frente.
 *
 * Sao dois numeros diferentes e cada um tem um dono:
 *   telefone       = WhatsApp comercial da barbearia, onde os clientes chegam
 *   dono_telefone  = WhatsApp pessoal do dono, por onde vai a senha de acesso
 */
function soDigitos(bruto: string): string | null {
  const d = (bruto || '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.startsWith('55') ? d : `55${d}`
}


/** Senha temporaria facil de ditar no telefone: "tuka-melo-4183" */
function senhaTemporaria(): string {
  const c = 'bcdfgjklmnprstvz'
  const v = 'aeiou'
  const silaba = () =>
    c[Math.floor(Math.random() * c.length)]! + v[Math.floor(Math.random() * v.length)]!
  const bloco = () => silaba() + silaba()
  const numero = String(Math.floor(1000 + Math.random() * 9000))
  return `${bloco()}-${bloco()}-${numero}`
}

function limparSlug(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default defineEventHandler(async (event) => {
  // ---------- 1. so o master cria barbearia ----------
  const usuario = await serverSupabaseUser(event)
  if (!usuario) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logada.' })
  }

  const cliente = await serverSupabaseClient<Database>(event)
  const { data: ctx } = await cliente.rpc('meu_contexto')
  const contexto = ctx as Contexto | null

  if (!contexto || contexto.papel !== 'master' || !contexto.acesso) {
    throw createError({ statusCode: 403, statusMessage: 'Apenas o master pode criar barbearias.' })
  }

  // ---------- 2. conferir o que veio ----------
  const corpo = await readBody<Corpo>(event)

  const nome = (corpo.nome ?? '').trim()
  const slug = limparSlug(corpo.slug || nome)
  const donoNome = (corpo.dono_nome ?? '').trim()
  const donoEmail = (corpo.dono_email ?? '').trim().toLowerCase()
  const donoTelefone = soDigitos(corpo.dono_telefone ?? '')

  if (nome.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Informe o nome da barbearia.' })
  }
  if (slug.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'O endereço da página ficou inválido.' })
  }
  if (donoNome.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Informe o nome do dono.' })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(donoEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'E-mail do dono inválido.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  // slug reservada
  const { data: reservada } = await admin
    .from('slugs_reservados')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle()
  if (reservada) {
    throw createError({ statusCode: 409, statusMessage: `"${slug}" é um endereço reservado do sistema.` })
  }

  // slug ja usada
  const { data: usada } = await admin
    .from('barbearias')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (usada) {
    throw createError({ statusCode: 409, statusMessage: `Já existe uma barbearia em /${slug}.` })
  }

  // ---------- 3. criar a barbearia ----------
  // O vencimento e calculado, nao digitado: 30 dias no mensal,
  // 180 no semestral. Menos um campo para errar na hora da venda.
  const pagamento: FormaPagamento =
    corpo.pagamento === 'semestral' ? 'semestral' : 'mensal'
  const dias = pagamento === 'semestral' ? 180 : 30
  const vence = new Date()
  vence.setDate(vence.getDate() + dias)

  const { data: barbearia, error: erroBarbearia } = await admin
    .from('barbearias')
    .insert({
      nome,
      slug,
      cidade: (corpo.cidade ?? '').trim() || null,
      endereco: (corpo.endereco ?? '').trim() || null,
      telefone: soDigitos(corpo.telefone ?? ''),
      pagamento,
      vence_em: vence.toISOString().slice(0, 10),
      status: 'ativa',
    })
    .select('id, nome, slug, status, cidade, vence_em, criada_em')
    .single()

  if (erroBarbearia || !barbearia) {
    throw createError({
      statusCode: 400,
      statusMessage: erroBarbearia?.message ?? 'Não foi possível criar a barbearia.',
    })
  }

  // ---------- 4. criar o usuario do dono ----------
  const senha = senhaTemporaria()

  const { data: criado, error: erroUsuario } = await admin.auth.admin.createUser({
    email: donoEmail,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: donoNome },
  })

  if (erroUsuario || !criado?.user) {
    // desfaz a barbearia: melhor nada do que barbearia orfa sem dono
    await admin.from('barbearias').delete().eq('id', barbearia.id)
    const jaExiste = erroUsuario?.message?.toLowerCase().includes('already')
    throw createError({
      statusCode: 400,
      statusMessage: jaExiste
        ? 'Já existe uma conta com esse e-mail.'
        : erroUsuario?.message ?? 'Não foi possível criar o acesso do dono.',
    })
  }

  // ---------- 5. ligar o usuario a barbearia ----------
  const { error: erroPerfil } = await admin.from('perfis').insert({
    id: criado.user.id,
    barbearia_id: barbearia.id,
    papel: 'dono',
    nome: donoNome,
    telefone: donoTelefone,
    status: 'ativo',
  })

  if (erroPerfil) {
    // desfaz tudo, na ordem inversa
    await admin.auth.admin.deleteUser(criado.user.id)
    await admin.from('barbearias').delete().eq('id', barbearia.id)
    throw createError({ statusCode: 400, statusMessage: erroPerfil.message })
  }

  // A senha so aparece aqui, nesta unica resposta. Nao fica guardada
  // em lugar nenhum — o Supabase so armazena o hash dela.
  return {
    barbearia,
    dono: { nome: donoNome, email: donoEmail, senha, telefone: donoTelefone },
  }
})