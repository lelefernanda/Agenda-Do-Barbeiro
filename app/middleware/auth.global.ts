/**
 * Protecao das rotas.
 *
 * Trabalha por lista de permissao ao contrario: em vez de listar o que e
 * publico, lista o que e protegido. Isso importa porque a rota /[slug]
 * captura qualquer endereco na raiz — se a logica fosse "tudo protegido
 * menos X", cada barbearia nova precisaria ser liberada na mao.
 */

const PROTEGIDAS = ['/master', '/painel', '/perfil']

// Rotas que exigem login, mas servem a qualquer papel
const DE_TODOS = ['/perfil']

export default defineNuxtRouteMiddleware(async (to) => {
  const protegida = PROTEGIDAS.some(
    (r) => to.path === r || to.path.startsWith(r + '/')
  )
  if (!protegida) return

  const usuario = useSupabaseUser()

  // nao logado: manda pro login guardando pra onde queria ir
  if (!usuario.value) {
    return navigateTo(`/login?voltar=${encodeURIComponent(to.fullPath)}`)
  }

  const { carregar } = useAcesso()
  const ctx = await carregar()

  // logado no Supabase, mas sem perfil no sistema
  if (!ctx) {
    return navigateTo('/login?erro=sem_perfil')
  }

  // usuario bloqueado ou barbearia suspensa
  if (!ctx.acesso) {
    return navigateTo(`/login?erro=${ctx.motivo ?? 'usuario_bloqueado'}`)
  }

  // telas comuns a todos os papeis param aqui
  if (DE_TODOS.some((r) => to.path === r || to.path.startsWith(r + '/'))) return

  // cada papel no seu lugar
  const querMaster = to.path.startsWith('/master')

  if (querMaster && ctx.papel !== 'master') {
    return navigateTo('/painel')
  }
  if (!querMaster && ctx.papel === 'master') {
    return navigateTo('/master')
  }
})