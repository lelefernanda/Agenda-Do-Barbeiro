/**
 * Saudacao pela hora do relogio de quem esta olhando.
 *
 * Por que nao calcular direto no template: o Nuxt monta a pagina duas
 * vezes — uma no servidor, outra no navegador. Se as duas caem em faixas
 * diferentes de horario (ou o servidor esta em outro fuso), o Vue acusa
 * divergencia e reclama no console.
 *
 * A solucao e comecar com um texto neutro, igual nos dois lados, e so
 * trocar pela saudacao certa depois que a pagina monta no navegador.
 */
export function useSaudacao(nome?: MaybeRefOrGetter<string | null | undefined>) {
  const saudacao = ref('Olá')

  function calcular() {
    const h = new Date().getHours()
    if (h >= 5 && h < 12) return 'Bom dia'
    if (h >= 12 && h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  onMounted(() => {
    saudacao.value = calcular()

    // vira o texto quando o relogio passa da faixa,
    // util para quem deixa o painel aberto o dia todo
    const relogio = setInterval(() => {
      const nova = calcular()
      if (nova !== saudacao.value) saudacao.value = nova
    }, 60_000)

    onUnmounted(() => clearInterval(relogio))
  })

  /** Primeiro nome, para nao ficar "Bom dia, Abraham Moises Linares" */
  const primeiroNome = computed(() => {
    const completo = toValue(nome) ?? ''
    return completo.trim().split(' ')[0] ?? ''
  })

  /** Pronto para usar: "Bom dia, Abraham" */
  const texto = computed(() =>
    primeiroNome.value ? `${saudacao.value}, ${primeiroNome.value}` : saudacao.value
  )

  return { saudacao, primeiroNome, texto }
}