/**
 * POST /api/servicos/foto
 *
 * Grava a foto de exemplo de um servico.
 *
 * Campos do formulario: servico_id e foto.
 *
 * Confere duas coisas antes de gravar: quem pediu e dono de barbearia,
 * e o servico pertence a barbearia dela. Sem a segunda checagem, um dono
 * poderia trocar a foto do servico de outra barbearia so mudando o id.
 */

import {
  serverSupabaseUser,
  serverSupabaseClient,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database, Contexto } from '~/types/database.types'

/**
 * Com as chaves novas do Supabase, o identificador vem como "sub"
 * em vez de "id". Aceitar os dois evita quebrar na migracao.
 */
function idDoUsuario(u: unknown): string | null {
  const o = u as { id?: string; sub?: string } | null
  return o?.id ?? o?.sub ?? null
}

const LIMITE_BYTES = 3 * 1024 * 1024
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

export default defineEventHandler(async (event) => {
  const usuario = await serverSupabaseUser(event)
  if (!idDoUsuario(usuario)) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logado.' })
  }

  const cliente = await serverSupabaseClient<Database>(event)
  const { data: ctx } = await cliente.rpc('meu_contexto')
  const contexto = ctx as Contexto | null

  if (!contexto?.acesso || contexto.papel !== 'dono') {
    throw createError({ statusCode: 403, statusMessage: 'Apenas o dono edita os serviços.' })
  }

  const partes = await readMultipartFormData(event)
  const arquivo = partes?.find((p) => p.name === 'foto')
  const servicoId = partes?.find((p) => p.name === 'servico_id')?.data?.toString()

  if (!servicoId) {
    throw createError({ statusCode: 400, statusMessage: 'Serviço não informado.' })
  }
  if (!arquivo?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhuma imagem recebida.' })
  }
  if (arquivo.data.length > LIMITE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Imagem grande demais.' })
  }

  const tipo = arquivo.type ?? 'image/jpeg'
  if (!TIPOS.includes(tipo)) {
    throw createError({ statusCode: 415, statusMessage: 'Use JPG, PNG ou WEBP.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  // O servico e mesmo desta barbearia?
  const { data: servico } = await admin
    .from('servicos')
    .select('id, barbearia_id')
    .eq('id', servicoId)
    .maybeSingle()

  if (!servico || servico.barbearia_id !== contexto.barbearia_id) {
    throw createError({ statusCode: 404, statusMessage: 'Serviço não encontrado.' })
  }

  const caminho = `${contexto.barbearia_id}/${servicoId}.jpg`

  const { error: erroUpload } = await admin.storage
    .from('servicos')
    .upload(caminho, arquivo.data, { upsert: true, contentType: tipo })

  if (erroUpload) {
    throw createError({ statusCode: 500, statusMessage: erroUpload.message })
  }

  const { data } = admin.storage.from('servicos').getPublicUrl(caminho)
  const url = `${data.publicUrl}?v=${Date.now()}`

  const { error: erroServico } = await admin
    .from('servicos')
    .update({ foto_url: url })
    .eq('id', servicoId)

  if (erroServico) {
    throw createError({ statusCode: 500, statusMessage: erroServico.message })
  }

  return { foto_url: url }
})