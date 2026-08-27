/**
 * useAcesso — a regra central da hierarquia.
 *
 * O acesso nunca fica gravado em lugar nenhum. Ele e calculado toda vez:
 *
 *     acesso = usuario ativo  E  (é master  OU  barbearia ativa)
 *
 * Consequencia pratica: suspender uma barbearia derruba o dono, todos os
 * barbeiros e a pagina publica de uma vez, sem escrever "bloqueado" em
 * nenhum registro deles. Ao reativar, tudo volta exatamente como estava —
 * inclusive o barbeiro que o dono havia bloqueado por conta propria.
 */

import type { Contexto, PapelUsuario } from '~/types/database.types'

export type { Contexto, PapelUsuario }

const TEXTOS: Record<string, string> = {
  usuario_bloqueado:
    'Seu acesso foi bloqueado. Fale com o dono da barbearia.',
  barbearia_suspensa:
    'O acesso desta barbearia está suspenso. Fale com o suporte pelo WhatsApp.',
  barbearia_cancelada:
    'O contrato desta barbearia foi encerrado.',
  sem_barbearia:
    'Sua conta ainda não está ligada a uma barbearia. Fale com o suporte.',
  sem_perfil:
    'Sua conta existe, mas ainda não foi liberada. Fale com o suporte.',
  falha_banco:
    'Não foi possível falar com o servidor. Tente de novo em instantes.',
  credenciais:
    'E-mail ou senha incorretos.',
}

/**
 * Devolve o texto de um codigo de erro.
 * Sempre retorna string — nunca undefined — para poder ser atribuido
 * direto a um ref de texto sem o TypeScript reclamar.
 */
export function mensagem(codigo: string | null | undefined): string {
  if (!codigo) return 'Não foi possível entrar. Tente de novo.'
  return TEXTOS[codigo] ?? 'Não foi possível entrar. Tente de novo.'
}

export function useAcesso() {
  const supabase = useSupabaseClient()

  const contexto = useState<Contexto | null>('contexto', () => null)
  const carregando = useState<boolean>('contexto-carregando', () => false)
  // guarda o motivo real da ultima falha, para a tela de login diferenciar
  // "conta nao liberada" de "servidor fora do ar"
  const ultimaFalha = useState<string | null>('contexto-falha', () => null)

  /**
   * Busca o contexto no banco.
   *
   * Importante: nao checa useSupabaseUser() antes de consultar.
   * Logo apos o login, aquele objeto ainda nao atualizou, e checa-lo aqui
   * fazia a funcao desistir antes de perguntar ao banco. Quem responde se
   * ha sessao valida e o proprio banco: sem sessao, auth.uid() e nulo e a
   * funcao devolve vazio.
   */
  async function carregar(forcar = false): Promise<Contexto | null> {
    if (contexto.value && !forcar) return contexto.value

    carregando.value = true
    const { data, error } = await supabase.rpc('meu_contexto')
    carregando.value = false

    if (error) {
      // 401 nao e falha de servidor: e so nao haver sessao neste endereco.
      // Acontece ao abrir o app por outro IP ou em outro aparelho.
      const semSessao =
        (error as { code?: string }).code === '401' ||
        (error as { status?: number }).status === 401 ||
        /JWT|not authenticated|Unauthorized/i.test(error.message ?? '')

      if (import.meta.dev && semSessao === false) {
        console.error('[useAcesso] erro no banco:', error)
      }
      ultimaFalha.value = semSessao ? null : 'falha_banco'
      contexto.value = null
      return null
    }

    if (!data) {
      ultimaFalha.value = 'sem_perfil'
      contexto.value = null
      return null
    }

    ultimaFalha.value = null
    contexto.value = data as Contexto
    return contexto.value
  }

  function rotaInicial(ctx: Contexto | null = contexto.value): string {
    if (!ctx) return '/login'
    return ctx.papel === 'master' ? '/master' : '/painel'
  }

  async function sair() {
    await supabase.auth.signOut()
    contexto.value = null
    ultimaFalha.value = null
    await navigateTo('/login')
  }

  return {
    contexto,
    carregando,
    ultimaFalha,
    carregar,
    rotaInicial,
    sair,
    ehMaster: computed(() => contexto.value?.papel === 'master'),
    ehDono: computed(() => contexto.value?.papel === 'dono'),
    ehBarbeiro: computed(() => contexto.value?.papel === 'barbeiro'),
    temAcesso: computed(() => contexto.value?.acesso === true),
  }
}