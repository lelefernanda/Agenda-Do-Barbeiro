/**
 * POST /api/publico/foto
 *
 * A foto que o cliente escolhe ao marcar um horario.
 *
 * Nao existe login aqui: quem envia e o proprio cliente, do celular
 * dele. Por isso a rota nao confia em nada que vem de fora — nem no
 * tamanho, nem no tipo, nem no destino do arquivo. O caminho e sempre
 * derivado da chave, nunca informado por quem envia.
 */
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

const LIMITE_BYTES = 3 * 1024 * 1024
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

export default defineEventHandler(async (event) => {
  const partes = await readMultipartFormData(event)
  const arquivo = partes?.find((p) => p.name === 'foto')
  const chave = partes?.find((p) => p.name === 'chave')?.data?.toString() ?? ''

  /* A chave e gerada pelo navegador do proprio cliente. Ela nao da
     acesso a nada — serve so para a foto encontrar o dono dela. */
  if (!/^[a-z0-9-]{20,60}$/.test(chave)) {
    throw createError({ statusCode: 400, statusMessage: 'Identificação inválida.' })
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

  const caminho = `${chave}.jpg`

  const { error: erroUpload } = await admin.storage
    .from('clientes')
    .upload(caminho, arquivo.data, { upsert: true, contentType: tipo })

  if (erroUpload) {
    throw createError({ statusCode: 500, statusMessage: erroUpload.message })
  }

  const { data } = admin.storage.from('clientes').getPublicUrl(caminho)

  return { url: `${data.publicUrl}?v=${Date.now()}` }
})
