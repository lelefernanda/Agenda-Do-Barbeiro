/**
 * POST /api/barbeiros
 *
 * Resolve uma solicitação de barbeiro: aprova (cria o acesso) ou recusa.
 *
 * Corpo: { solicitacao_id, acao: 'aprovar' | 'recusar', observacao? }
 *
 * Roda no SERVIDOR pelo mesmo motivo da rota de barbearias: criar
 * usuário exige a chave secreta, e ela nunca pode chegar ao navegador.
 * A recusa não precisaria, mas passa por aqui também para o fluxo
 * inteiro ter um caminho só.
 */

import {
  serverSupabaseUser,
  serverSupabaseClient,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database, Contexto } from '~/types/database.types'

type Corpo = {
  solicitacao_id?: string
  acao?: 'aprovar' | 'recusar'
  observacao?: string
}

/** Deixa só os dígitos e garante o 55 do Brasil na frente. */
function soDigitos(bruto: string): string | null {
  const d = (bruto || '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.startsWith('55') ? d : `55${d}`
}

/** Senha temporária fácil de ditar no telefone: "tuka-melo-4183" */
function senhaTemporaria(): string {
  const c = 'bcdfgjklmnprstvz'
  const v = 'aeiou'
  const silaba = () =>
    c[Math.floor(Math.random() * c.length)]! + v[Math.floor(Math.random() * v.length)]!
  const bloco = () => silaba() + silaba()
  const numero = String(Math.floor(1000 + Math.random() * 9000))
  return `${bloco()}-${bloco()}-${numero}`
}

export default defineEventHandler(async (event) => {
  // ---------- 1. só o master resolve solicitação ----------
  const usuario = await serverSupabaseUser(event)
  if (!usuario) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logada.' })
  }

  const cliente = await serverSupabaseClient<Database>(event)
  const { data: ctx } = await cliente.rpc('meu_contexto')
  const contexto = ctx as Contexto | null

  if (!contexto || contexto.papel !== 'master' || !contexto.acesso) {
    throw createError({ statusCode: 403, statusMessage: 'Apenas o master resolve solicitações.' })
  }

  // ---------- 2. conferir o que veio ----------
  const corpo = await readBody<Corpo>(event)
  const id = (corpo.solicitacao_id ?? '').trim()
  const acao = corpo.acao

  if (!id || (acao !== 'aprovar' && acao !== 'recusar')) {
    throw createError({ statusCode: 400, statusMessage: 'Pedido incompleto.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  const { data: solicitacao } = await admin
    .from('solicitacoes_barbeiro')
    .select('id, barbearia_id, nome, email, telefone, status')
    .eq('id', id)
    .maybeSingle()

  if (!solicitacao) {
    throw createError({ statusCode: 404, statusMessage: 'Solicitação não encontrada.' })
  }
  if (solicitacao.status !== 'pendente') {
    throw createError({ statusCode: 409, statusMessage: 'Esta solicitação já foi resolvida.' })
  }

  const agora = new Date().toISOString()

  // ---------- 3. recusar: só marcar e explicar ----------
  if (acao === 'recusar') {
    const { error } = await admin
      .from('solicitacoes_barbeiro')
      .update({
        status: 'recusada',
        observacao: (corpo.observacao ?? '').trim() || null,
        resolvida_em: agora,
      })
      .eq('id', id)

    if (error) throw createError({ statusCode: 400, statusMessage: error.message })
    return { recusada: true }
  }

  // ---------- 4. aprovar: criar o usuário do barbeiro ----------
  const email = solicitacao.email.trim().toLowerCase()
  const senha = senhaTemporaria()

  const { data: criado, error: erroUsuario } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: solicitacao.nome },
  })

  if (erroUsuario || !criado?.user) {
    const jaExiste = erroUsuario?.message?.toLowerCase().includes('already')
    throw createError({
      statusCode: 400,
      statusMessage: jaExiste
        ? 'Já existe uma conta com esse e-mail. Peça ao dono para conferir o endereço.'
        : erroUsuario?.message ?? 'Não foi possível criar o acesso do barbeiro.',
    })
  }

  // ---------- 5. ligar o barbeiro à barbearia ----------
  const { error: erroPerfil } = await admin.from('perfis').insert({
    id: criado.user.id,
    barbearia_id: solicitacao.barbearia_id,
    papel: 'barbeiro',
    nome: solicitacao.nome,
    telefone: soDigitos(solicitacao.telefone ?? ''),
    status: 'ativo',
  })

  if (erroPerfil) {
    // desfaz: melhor nada do que usuário solto sem perfil
    await admin.auth.admin.deleteUser(criado.user.id)
    throw createError({ statusCode: 400, statusMessage: erroPerfil.message })
  }

  // ---------- 6. marcar a solicitação como aprovada ----------
  const { error: erroMarca } = await admin
    .from('solicitacoes_barbeiro')
    .update({ status: 'aprovada', perfil_criado: criado.user.id, resolvida_em: agora })
    .eq('id', id)

  if (erroMarca) {
    // desfaz tudo, na ordem inversa
    await admin.from('perfis').delete().eq('id', criado.user.id)
    await admin.auth.admin.deleteUser(criado.user.id)
    throw createError({ statusCode: 400, statusMessage: erroMarca.message })
  }

  // A senha só aparece aqui, nesta única resposta.
  return {
    barbeiro: {
      nome: solicitacao.nome,
      email,
      senha,
      telefone: soDigitos(solicitacao.telefone ?? ''),
    },
  }
})