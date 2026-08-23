/**
 * POST /api/perfil/foto
 *
 * Recebe a imagem ja reduzida pelo navegador e grava no armazenamento.
 *
 * Vai pelo servidor de proposito. Duas razoes:
 *
 * 1. Confiabilidade — o servidor usa a chave secreta e nao depende das
 *    politicas de RLS do storage, que sao a parte mais chata de acertar.
 *
 * 2. Seguranca — quem monta o caminho do arquivo e o servidor, a partir
 *    de quem esta logado. Se fosse o navegador, um barbeiro poderia
 *    trocar o caminho na mao e sobrescrever a foto do dono.
 */

import {
  serverSupabaseUser,
  serverSupabaseServiceRole,
} from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Pega o id de quem esta logado.
 *
 * Com as chaves novas do Supabase (formato sb_secret_), o servidor
 * devolve os dados do usuario no formato JWT, onde o identificador
 * se chama "sub" em vez de "id". Aceitar os dois evita quebrar
 * quando o projeto migra de um formato para o outro.
 */
function idDoUsuario(u: unknown): string | null {
  const o = u as { id?: string; sub?: string } | null
  return o?.id ?? o?.sub ?? null
}

const LIMITE_BYTES = 2 * 1024 * 1024 // 2 MB ja e folga: o navegador manda ~60 KB
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

export default defineEventHandler(async (event) => {
  const usuario = await serverSupabaseUser(event)
  const uid = idDoUsuario(usuario)
  if (!uid) {
    throw createError({ statusCode: 401, statusMessage: 'Você precisa estar logada.' })
  }

  const partes = await readMultipartFormData(event)
  const arquivo = partes?.find((p) => p.name === 'foto')

  if (!arquivo?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhuma imagem recebida.' })
  }
  if (arquivo.data.length > LIMITE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Imagem grande demais.' })
  }

  const tipo = arquivo.type ?? 'image/jpeg'
  if (!TIPOS.includes(tipo)) {
    throw createError({ statusCode: 415, statusMessage: 'Formato não aceito. Use JPG, PNG ou WEBP.' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  // O caminho vem de quem esta logado, nunca do que o navegador mandou
  const caminho = `${uid}/foto.jpg`

  const { error: erroUpload } = await admin.storage
    .from('avatares')
    .upload(caminho, arquivo.data, { upsert: true, contentType: tipo })

  if (erroUpload) {
    throw createError({ statusCode: 500, statusMessage: erroUpload.message })
  }

  const { data } = admin.storage.from('avatares').getPublicUrl(caminho)
  // o carimbo de tempo obriga o navegador a buscar a versao nova
  const url = `${data.publicUrl}?v=${Date.now()}`

  const { error: erroPerfil } = await admin
    .from('perfis')
    .update({ foto_url: url })
    .eq('id', uid)

  if (erroPerfil) {
    throw createError({ statusCode: 500, statusMessage: erroPerfil.message })
  }

  return { foto_url: url }
})