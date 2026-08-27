/**
 * POST /api/barbearia/foto
 *
 * Grava a logo ou a foto de capa da barbearia.
 *
 * Campos do formulario: tipo ('logo' | 'capa') e foto.
 *
 * O dono nao informa QUAL barbearia: ela vem do contexto dele. Assim
 * ninguem troca a foto da loja de outro so mudando um id no caminho.
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

const LIMITE_BYTES = 4 * 1024 * 1024
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

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

  const partes = await readMultipartFormData(event)
  const arquivo = partes?.find((p) => p.name === 'foto')
  const tipoFoto = partes?.find((p) => p.name === 'tipo')?.data?.toString()

  if (tipoFoto !== 'logo' && tipoFoto !== 'capa') {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de imagem inválido.' })
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

  const caminho = `${contexto.barbearia_id}/${tipoFoto}.jpg`

  const { error: erroUpload } = await admin.storage
    .from('barbearias')
    .upload(caminho, arquivo.data, { upsert: true, contentType: tipo })

  if (erroUpload) {
    throw createError({ statusCode: 500, statusMessage: erroUpload.message })
  }

  const { data } = admin.storage.from('barbearias').getPublicUrl(caminho)
  const url = `${data.publicUrl}?v=${Date.now()}`

  // Escrito assim, e nao com chave dinamica, porque o TypeScript
  // precisa saber QUAL coluna esta sendo alterada.
  const mudanca = tipoFoto === 'logo' ? { logo_url: url } : { capa_url: url }

  const { error: erroBanco } = await admin
    .from('barbearias')
    .update(mudanca)
    .eq('id', contexto.barbearia_id)

  if (erroBanco) {
    throw createError({ statusCode: 500, statusMessage: erroBanco.message })
  }

  return { url, tipo: tipoFoto }
})