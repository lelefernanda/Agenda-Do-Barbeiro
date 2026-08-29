<script setup lang="ts">
/**
 * A página pública: agendadobarbeiro.com.br/inkabarbershop
 *
 * Desenhada como perfil de rede social, porque é assim que o cliente
 * espera ver uma barbearia: capa, logo redonda, nome centralizado,
 * uma linha de ações e seções separadas por divisórias.
 *
 * A cor vem da foto de capa da barbearia. Cada loja parece dona da
 * própria página sem que nenhuma fique ilegível.
 */
definePageMeta({ layout: false })

const rota = useRoute()
const slug = computed(() => String(rota.params.slug ?? ''))

type ServicoPublico = {
  id: string
  nome: string
  descricao: string | null
  duracao_min: number
  preco: number
  foto_url: string | null
}

type AtendentePublico = {
  id: string
  nome: string
  foto_url: string | null
  bio: string | null
}

type Vitrine = {
  barbearia: {
    id: string
    nome: string
    slug: string
    telefone: string | null
    endereco: string | null
    cidade: string | null
    instagram: string | null
    facebook: string | null
    logo_url: string | null
    capa_url: string | null
    capa_pos: number | null
    sobre: string | null
    cor: string | null
    pagamentos: string[] | null
    comodidades: string[] | null
  }
  servicos: ServicoPublico[]
  atendentes: AtendentePublico[]
  outrasUnidades: { nome: string; slug: string; cidade: string | null; endereco: string | null }[]
  semana: { dia: number; abre: string; fecha: string }[]
  aberto: boolean
  dia_hoje: number
}

const { data: vitrine, error: erroVitrine } = await useFetch<Vitrine>('/api/publico/barbearia', {
  query: { slug },
})

const loja = computed(() => vitrine.value?.barbearia ?? null)
const serv = computed(() => vitrine.value?.servicos ?? [])
const equipe = computed(() => vitrine.value?.atendentes ?? [])
const cor = computed(() => loja.value?.cor || '#3B82F6')
const outras = computed(() => vitrine.value?.outrasUnidades ?? [])

/* Com poucas unidades, uma lista simples basta. Com muitas, o cliente
   pensa em cidade primeiro ("tem uma perto de mim?") — por isso, a
   partir de cinco, elas se agrupam por cidade, cada grupo com o
   endereco de cada loja para diferenciar as que ficam na mesma. */
const gruposCidade = computed(() => {
  const mapa = new Map<string, typeof outras.value>()
  for (const u of outras.value) {
    const chave = u.cidade || 'Outras unidades'
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave)!.push(u)
  }
  return [...mapa.entries()]
    .map(([cidade, unidades]) => ({ cidade, unidades }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade))
})

const agrupar = computed(() => outras.value.length >= 5)

const cidadeAberta = ref<string | null>(null)

function virarCidade(cidade: string) {
  cidadeAberta.value = cidadeAberta.value === cidade ? null : cidade
}

const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const NOMES_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
}

const NOMES_COMODIDADE: Record<string, string> = {
  wifi: 'Wi-Fi',
  estacionamento: 'Estacionamento',
  ar: 'Ar-condicionado',
  acessivel: 'Acessível',
  criancas: 'Atende crianças',
  kids: 'Espaço kids',
  cafe: 'Café e água',
  tv: 'TV',
}

const comodidades = computed(() =>
  (loja.value?.comodidades ?? []).map((c) => NOMES_COMODIDADE[c] ?? c)
)

const pagamentos = computed(() =>
  (loja.value?.pagamentos ?? []).map((p) => NOMES_PAGAMENTO[p] ?? p)
)

const aberto = computed(() => vitrine.value?.aberto ?? false)
const diaHoje = computed(() => vitrine.value?.dia_hoje ?? 0)

const semana = computed(() => {
  const bruta = vitrine.value?.semana ?? []
  if (!bruta.length) return []
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  return ordem.map((d) => {
    const achado = bruta.find((x) => x.dia === d)
    return {
      dia: d,
      nome: NOMES_DIA[d]!,
      faixa: achado ? `${achado.abre} — ${achado.fecha}` : 'Fechado',
      aberto: !!achado,
      hoje: d === diaHoje.value,
    }
  })
})

useHead(() => ({
  title: loja.value ? `${loja.value.nome} — agendar horário` : 'Agendar horário',
  meta: [
    {
      name: 'description',
      content: loja.value?.sobre || (loja.value ? `Marque seu horário na ${loja.value.nome}.` : ''),
    },
    { name: 'theme-color', content: '#0A0B0D' },
  ],
}))

const estiloDaLoja = computed(() => ({
  '--marca': cor.value,
  '--marca-suave': `${cor.value}1F`,
  '--marca-brilho': `${cor.value}B3`,
  /* Tons derivados: a cor da barbearia tinge o fundo, a grade, os
     cartoes e as bordas — nao so os botoes. */
  '--marca-grade': `${cor.value}14`,
  /* O cartao e preto solido com um veu da cor por cima: sem o preto
     por baixo, a transparencia deixava o texto boiando no fundo. */
  /* Preto neutro por baixo, nao o --preto-800 (que e azulado): laranja
     sobre azul dava roxo. Assim cada cor aparece como ela e. */
  '--marca-carta': `linear-gradient(${cor.value}14, ${cor.value}14), #0F1114`,
  '--marca-borda': `${cor.value}26`,
  '--marca-linha': `${cor.value}59`,
}))

/* ------------------------------------------------------------
   Os passos
   ------------------------------------------------------------ */
const passo = ref<0 | 1 | 2 | 3 | 4>(0)
const marcando = ref(false)

const servico = ref<ServicoPublico | null>(null)
const atendente = ref<AtendentePublico | null>(null)
const dia = ref('')
const hora = ref('')

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function emTempo(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function subirAteOFluxo() {
  nextTick(() => {
    document.getElementById('marcar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function comecar() {
  marcando.value = true
  passo.value = 1
  subirAteOFluxo()
}

function escolherServico(s: ServicoPublico) {
  servico.value = s
  hora.value = ''
  marcando.value = true
  if (equipe.value.length === 1) {
    atendente.value = equipe.value[0]!
    passo.value = 3
  } else {
    passo.value = 2
  }
  subirAteOFluxo()
}

function escolherAtendente(a: AtendentePublico) {
  atendente.value = a
  hora.value = ''
  passo.value = 3
}

/* ------------------------------------------------------------
   Os próximos 21 dias
   ------------------------------------------------------------ */
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' })
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' })
const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' })
const fmtLongo = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Sao_Paulo',
})

function comoTexto(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

const proximosDias = computed(() => {
  const hoje = new Date()
  return Array.from({ length: 21 }, (_, i) => {
    const d = new Date(hoje.getTime() + i * 86400000)
    return {
      valor: comoTexto(d),
      semana: fmtDiaSemana.format(d).replace('.', ''),
      dia: fmtDiaMes.format(d),
      mes: fmtMes.format(d).replace('.', ''),
      hoje: i === 0,
    }
  })
})

watch(passo, (p) => {
  if (p === 3 && !dia.value) dia.value = proximosDias.value[0]!.valor
})

/* ------------------------------------------------------------
   Horários livres
   ------------------------------------------------------------ */
const { data: agenda, pending: buscandoHorarios } = await useFetch<{ livres: string[] }>(
  '/api/publico/horarios',
  {
    query: {
      barbeiro: computed(() => atendente.value?.id ?? ''),
      servico: computed(() => servico.value?.id ?? ''),
      dia,
    },
    immediate: false,
    watch: [atendente, servico, dia],
    default: () => ({ livres: [] }),
  }
)

const livres = computed(() => agenda.value?.livres ?? [])

function escolherHora(h: string) {
  hora.value = h
  passo.value = 4
}

/* ------------------------------------------------------------
   Dados do cliente e confirmação
   ------------------------------------------------------------ */
const form = reactive({ nome: '', telefone: '', observacao: '' })

/* ------------------------------------------------------------
   Quem já esteve aqui

   O celular do cliente guarda um código e os dados dele. Na volta, a
   página o reconhece e ele marca sem digitar nada de novo. Não é
   login: não tem senha, não sai deste aparelho, e não dá acesso a
   coisa nenhuma além de preencher os próprios campos.
   ------------------------------------------------------------ */
const minhaChave = ref('')
const minhaFoto = ref('')
const jaConhecido = ref(false)

onMounted(() => {
  try {
    let c = localStorage.getItem('cliente-chave')
    if (!c) {
      c = crypto.randomUUID()
      localStorage.setItem('cliente-chave', c)
    }
    minhaChave.value = c

    /* Guardado POR BARBEARIA. Sem isso, quem marcou numa loja via o
       proprio nome na pagina de outra. */
    const guardado = localStorage.getItem(`cliente-dados-${slug.value}`)
    if (guardado) {
      const d = JSON.parse(guardado) as { nome?: string; telefone?: string; foto?: string }
      if (d.nome) form.nome = d.nome
      if (d.telefone) form.telefone = d.telefone
      if (d.foto) minhaFoto.value = d.foto
      jaConhecido.value = !!d.nome
    }

    procurarPendente()
  } catch {
    // Navegador sem armazenamento: segue como visitante novo.
  }
})

function guardarMeusDados() {
  try {
    localStorage.setItem(
      `cliente-dados-${slug.value}`,
      JSON.stringify({ nome: form.nome, telefone: form.telefone, foto: minhaFoto.value })
    )
  } catch {
    // Sem armazenamento, o agendamento funciona igual — só não lembra.
  }
}

function esquecerMeusDados() {
  try {
    localStorage.removeItem(`cliente-dados-${slug.value}`)
  } catch { /* nada a fazer */ }
  form.nome = ''
  form.telefone = ''
  minhaFoto.value = ''
  jaConhecido.value = false
}

/* ---------- a foto ---------- */
const enviandoFoto = ref(false)
const erroFoto = ref('')
const entradaFoto = ref<HTMLInputElement | null>(null)

async function escolherFoto(e: Event) {
  const arquivo = (e.target as HTMLInputElement).files?.[0]
  if (!arquivo || !minhaChave.value) return

  erroFoto.value = ''
  enviandoFoto.value = true

  const corpo = new FormData()
  corpo.append('chave', minhaChave.value)
  corpo.append('foto', arquivo)

  try {
    const r = await $fetch<{ url: string }>('/api/publico/foto', { method: 'POST', body: corpo })
    minhaFoto.value = r.url
    guardarMeusDados()
  } catch (err) {
    const m = err as { statusMessage?: string; data?: { statusMessage?: string } }
    erroFoto.value = m.data?.statusMessage ?? m.statusMessage ?? 'Não foi possível enviar a foto.'
  } finally {
    enviandoFoto.value = false
    if (entradaFoto.value) entradaFoto.value.value = ''
  }
}

const minhaInicial = computed(() => (form.nome.trim()[0] ?? '?').toUpperCase())

/* ------------------------------------------------------------
   Avaliar o corte

   Quem foi atendido nos ultimos 30 dias e ainda nao deu nota ve a
   pergunta assim que abre a pagina. Sem login: o proprio celular ja
   diz quem e, pela chave guardada nele.
   ------------------------------------------------------------ */
type Pendente = { id: string; inicio: string; barbeiro: string | null; servico: string | null }

const avaliacaoPendente = ref<Pendente | null>(null)
const estrelas = ref(0)
const comentarioNota = ref('')
const enviandoNota = ref(false)
const erroNota = ref('')
const notaEnviada = ref(false)

async function procurarPendente() {
  if (!minhaChave.value) return
  try {
    const r = await $fetch<{ pendente: Pendente | null }>('/api/publico/pendente', {
      query: { slug: slug.value, chave: minhaChave.value },
    })
    avaliacaoPendente.value = r.pendente
  } catch {
    avaliacaoPendente.value = null
  }
}

async function enviarNota() {
  if (!avaliacaoPendente.value || !estrelas.value || enviandoNota.value) return
  enviandoNota.value = true
  erroNota.value = ''

  try {
    await $fetch('/api/publico/avaliar', {
      method: 'POST',
      body: {
        agendamento_id: avaliacaoPendente.value.id,
        chave: minhaChave.value,
        estrelas: estrelas.value,
        comentario: comentarioNota.value,
      },
    })
    notaEnviada.value = true
    setTimeout(() => {
      avaliacaoPendente.value = null
      notaEnviada.value = false
      estrelas.value = 0
      comentarioNota.value = ''
    }, 2500)
  } catch (e) {
    const m = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erroNota.value = m.data?.statusMessage ?? m.statusMessage ?? 'Não foi possível enviar.'
  } finally {
    enviandoNota.value = false
  }
}

const saudacaoDoDia = computed(() => {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date())
  )
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
})
const enviando = ref(false)
const erro = ref('')
const pronto = ref<{ barbeiro: string; servico: string; inicio: string } | null>(null)

const podeEnviar = computed(
  () =>
    form.nome.trim().length >= 2 &&
    form.telefone.replace(/\D/g, '').length >= 10 &&
    !!servico.value &&
    !!atendente.value &&
    !!dia.value &&
    !!hora.value
)

async function confirmar() {
  if (!podeEnviar.value || enviando.value) return
  erro.value = ''
  enviando.value = true

  try {
    const resposta = await $fetch<{ barbeiro: string; servico: string; inicio: string }>(
      '/api/publico/agendar',
      {
        method: 'POST',
        body: {
          slug: slug.value,
          barbeiro_id: atendente.value!.id,
          servico_id: servico.value!.id,
          dia: dia.value,
          hora: hora.value,
          nome: form.nome,
          telefone: form.telefone,
          observacao: form.observacao,
          chave: minhaChave.value,
          foto_url: minhaFoto.value,
        },
      }
    )
    guardarMeusDados()
    pronto.value = resposta
    nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  } catch (e) {
    const m = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erro.value =
      m.data?.statusMessage ?? m.statusMessage ?? 'Não foi possível marcar. Tente de novo.'
  } finally {
    enviando.value = false
  }
}

function recomecar() {
  pronto.value = null
  servico.value = null
  atendente.value = null
  hora.value = ''
  form.observacao = ''
  erro.value = ''
  marcando.value = false
  passo.value = 0
}

const quandoPorExtenso = computed(() => {
  if (!pronto.value) return ''
  const d = new Date(pronto.value.inicio)
  const hh = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d)
  return `${fmtLongo.format(d)} às ${hh}`
})

const zapDaLoja = computed(() => {
  const t = loja.value?.telefone?.replace(/\D/g, '')
  if (!t) return null
  return `https://wa.me/${t.startsWith('55') ? t : `55${t}`}`
})

const instaDaLoja = computed(() => {
  const i = loja.value?.instagram?.replace('@', '')
  return i ? `https://instagram.com/${i}` : null
})

const facebookDaLoja = computed(() => {
  const f = loja.value?.facebook?.trim()
  if (!f) return null
  return f.startsWith('http') ? f : `https://facebook.com/${f}`
})

const iniciais = computed(() => {
  const n = loja.value?.nome ?? ''
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
})

/* A linha de categoria, como num perfil: "Barbearia · Pedreira" */
const categoria = computed(() => {
  const partes = ['Barbearia']
  if (loja.value?.cidade) partes.push(loja.value.cidade)
  return partes.join(' · ')
})

function voltar() {
  erro.value = ''
  if (passo.value === 4) passo.value = 3
  else if (passo.value === 3) {
    passo.value = equipe.value.length > 1 ? 2 : 1
  } else if (passo.value === 2) passo.value = 1
  else {
    marcando.value = false
    passo.value = 0
  }
}
</script>

<template>
  <div class="pagina" :style="estiloDaLoja">
    <div v-if="jaConhecido" class="barra-topo">
      <span class="barra-topo__foto">
        <img v-if="minhaFoto" :src="minhaFoto" alt="" />
        <template v-else>{{ minhaInicial }}</template>
      </span>
      <span class="barra-topo__nome">{{ saudacaoDoDia }}, {{ form.nome.split(' ')[0] }}</span>
    </div>

    <!-- ============ barbearia nao encontrada ============ -->
    <div v-if="erroVitrine" class="centro">
      <div class="aviso">
        <p class="aviso__titulo">Página não encontrada</p>
        <p class="aviso__texto">
          Este endereço não corresponde a nenhuma barbearia. Confira o link
          com quem te enviou.
        </p>
      </div>
    </div>

    <div v-else-if="loja" class="folha">
      <!-- ============ capa ============ -->
      <div class="capa" :class="{ 'capa--vazia': !loja.capa_url }">
        <img
          v-if="loja.capa_url"
          :src="loja.capa_url"
          alt=""
          class="capa__img"
          :style="{ objectPosition: `center ${loja.capa_pos ?? 50}%` }"
        />
      </div>

      <div class="corpo">
      <!-- ============ identidade ============ -->
      <header class="perfil">
        <div class="perfil__logo">
          <img v-if="loja.logo_url" :src="loja.logo_url" alt="" />
          <template v-else>{{ iniciais }}</template>
        </div>

        <h1 class="perfil__nome">{{ loja.nome }}</h1>
        <p class="perfil__categoria">{{ categoria }}</p>
        <p v-if="loja.endereco" class="perfil__endereco">{{ loja.endereco }}</p>
        <span v-if="semana.length" class="selo" :class="aberto ? 'selo--on' : 'selo--off'">
          <span class="selo__ponto" />
          {{ aberto ? 'Aberto agora' : 'Fechado agora' }}
        </span>

        <p v-if="loja.sobre" class="perfil__sobre">{{ loja.sobre }}</p>



        <div v-if="!pronto" class="acoes">
          <button class="acao acao--forte" @click="comecar">Marcar horário</button>
          <a v-if="zapDaLoja" :href="zapDaLoja" target="_blank" rel="noopener" class="acao acao--icone" aria-label="WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A10.4 10.4 0 0 0 12 0C6.3 0 1.6 4.7 1.6 10.4c0 1.9.5 3.7 1.4 5.2L1.5 21l5.5-1.4c1.5.8 3.2 1.3 5 1.3 5.7 0 10.4-4.7 10.4-10.4 0-2.8-1.1-5.4-3-7.3zM12 19.5c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.3.9.9-3.2-.2-.3a8.6 8.6 0 0 1-1.3-4.6c0-4.8 3.9-8.7 8.7-8.7 2.3 0 4.5.9 6.1 2.5a8.6 8.6 0 0 1 2.5 6.1c0 4.8-3.9 8.7-8.7 8.7zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1.1-.2.2-.3.2-.6.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.6-1.5-1.8-.2-.3 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.5c-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.8 4.5 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.1.1-1.2l-.5-.3z"/></svg>
            WhatsApp
          </a>
          <a v-if="instaDaLoja" :href="instaDaLoja" target="_blank" rel="noopener" class="acao acao--icone" aria-label="Instagram">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" /></svg>
            Instagram
          </a>
          <a v-if="facebookDaLoja" :href="facebookDaLoja" target="_blank" rel="noopener" class="acao acao--icone" aria-label="Facebook">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.1C22 6.5 17.5 2 12 2S2 6.5 2 12.1c0 5 3.7 9.2 8.4 9.9v-7H7.9v-2.9h2.5V9.9c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6v1.9h2.8l-.5 2.9h-2.3v7c4.8-.8 8.5-4.9 8.5-9.9z"/></svg>
            Facebook
          </a>
        </div>
      </header>

      <div class="lado">
      <!-- ============ comprovante ============ -->
      <section v-if="pronto" class="secao">
        <div class="feito">
          <span class="feito__marca" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
          </span>
          <p class="feito__titulo">Horário reservado</p>
          <p class="feito__quando">{{ quandoPorExtenso }}</p>

          <dl class="resumo">
            <div><dt>Serviço</dt><dd>{{ pronto.servico }}</dd></div>
            <div><dt>Com</dt><dd>{{ pronto.barbeiro }}</dd></div>
            <div><dt>Em nome de</dt><dd>{{ form.nome }}</dd></div>
          </dl>

          <p class="feito__aviso">
            A barbearia vai confirmar seu horário. Se precisar mudar alguma
            coisa, fale com eles.
          </p>

          <div class="feito__acoes">
            <a v-if="zapDaLoja" :href="zapDaLoja" target="_blank" rel="noopener" class="btn btn--cheio">
              Falar com a barbearia
            </a>
            <button class="btn btn--vazio" @click="recomecar">Marcar outro horário</button>
          </div>
        </div>
      </section>

      <!-- Quem foi atendido e ainda nao deu nota ve isto antes de tudo. -->
      <section v-if="avaliacaoPendente && !pronto" class="secao">
        <div class="avaliar">
          <template v-if="notaEnviada">
            <p class="avaliar__obrigado">Obrigado pela avaliação!</p>
          </template>

          <template v-else>
            <p class="avaliar__titulo">
              Como foi seu {{ avaliacaoPendente.servico?.toLowerCase() || 'atendimento' }}<template v-if="avaliacaoPendente.barbeiro"> com {{ avaliacaoPendente.barbeiro }}</template>?
            </p>

            <div class="estrelas">
              <button
                v-for="n in 5"
                :key="n"
                class="estrela"
                :class="{ 'estrela--on': n <= estrelas }"
                :aria-label="`${n} de 5`"
                @click="estrelas = n"
              >
                <svg viewBox="0 0 24 24" :fill="n <= estrelas ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 17.1 6.5 20.2l1.3-6.1L3.2 9.9l6.2-.7z" /></svg>
              </button>
            </div>

            <textarea
              v-if="estrelas"
              v-model="comentarioNota"
              rows="2"
              maxlength="500"
              placeholder="Quer contar algo? (opcional)"
              class="avaliar__texto"
              :disabled="enviandoNota"
            />

            <p v-if="erroNota" class="erro">{{ erroNota }}</p>

            <button
              v-if="estrelas"
              class="btn btn--cheio btn--largo"
              :disabled="enviandoNota"
              @click="enviarNota"
            >{{ enviandoNota ? 'Enviando…' : 'Enviar avaliação' }}</button>
          </template>
        </div>
      </section>

      <template v-else>
        <!-- ============ o fluxo ============ -->
        <section v-if="marcando" id="marcar" class="secao">
          <div class="trilha" aria-hidden="true">
            <span v-for="n in 4" :key="n" class="trilha__risco" :class="{ 'trilha__risco--on': passo >= n }" />
          </div>

          <button class="voltar" @click="voltar">← Voltar</button>

          <!-- passo 1: servico -->
          <template v-if="passo === 1">
            <h2 class="pergunta">O que você quer fazer?</h2>

            <p v-if="!serv.length" class="nada">
              Esta barbearia ainda não cadastrou os serviços.
            </p>

            <ul v-else class="opcoes">
              <li v-for="s in serv" :key="s.id">
                <button class="opcao" @click="escolherServico(s)">
                  <span v-if="s.foto_url" class="opcao__foto">
                    <img :src="s.foto_url" alt="" loading="lazy" />
                  </span>
                  <span class="opcao__meio">
                    <span class="opcao__nome">{{ s.nome }}</span>
                    <span v-if="s.descricao" class="opcao__desc">{{ s.descricao }}</span>
                    <span class="opcao__tempo">{{ emTempo(s.duracao_min) }}</span>
                  </span>
                  <span class="opcao__preco">{{ dinheiro.format(Number(s.preco)) }}</span>
                </button>
              </li>
            </ul>
          </template>

          <!-- passo 2: profissional -->
          <template v-else-if="passo === 2">
            <h2 class="pergunta">Com quem?</h2>
            <ul class="opcoes">
              <li v-for="a in equipe" :key="a.id">
                <button class="opcao" @click="escolherAtendente(a)">
                  <span class="opcao__avatar">
                    <img v-if="a.foto_url" :src="a.foto_url" alt="" loading="lazy" />
                    <template v-else>{{ (a.nome.trim()[0] ?? '?').toUpperCase() }}</template>
                  </span>
                  <span class="opcao__meio">
                    <span class="opcao__nome">{{ a.nome }}</span>
                    <span v-if="a.bio" class="opcao__desc">{{ a.bio }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </template>

          <!-- passo 3: dia e hora -->
          <template v-else-if="passo === 3">
            <h2 class="pergunta">Quando fica bom?</h2>

            <div class="dias">
              <button
                v-for="d in proximosDias"
                :key="d.valor"
                class="dia"
                :class="{ 'dia--on': dia === d.valor }"
                @click="dia = d.valor; hora = ''"
              >
                <span class="dia__semana">{{ d.hoje ? 'hoje' : d.semana }}</span>
                <span class="dia__num">{{ d.dia }}</span>
                <span class="dia__mes">{{ d.mes }}</span>
              </button>
            </div>

            <p v-if="buscandoHorarios" class="nada">Procurando horários…</p>

            <div v-else-if="livres.length" class="horas">
              <button v-for="h in livres" :key="h" class="hora" @click="escolherHora(h)">{{ h }}</button>
            </div>

            <p v-else class="nada">
              Nenhum horário livre neste dia. Tente outro — ou fale com a
              barbearia pelo WhatsApp.
            </p>
          </template>

          <!-- passo 4: dados -->
          <template v-else>
            <h2 class="pergunta">Quase lá</h2>

            <div class="conferir">
              <p class="conferir__linha">
                <strong>{{ servico?.nome }}</strong> · {{ dinheiro.format(Number(servico?.preco ?? 0)) }}
              </p>
              <p class="conferir__linha">Com {{ atendente?.nome }}</p>
              <p class="conferir__linha conferir__linha--forte">
                {{ proximosDias.find((d) => d.valor === dia)?.semana }},
                {{ proximosDias.find((d) => d.valor === dia)?.dia }}
                de {{ proximosDias.find((d) => d.valor === dia)?.mes }}
                às {{ hora }}
              </p>
            </div>

            <p v-if="erro" class="erro">{{ erro }}</p>

            <div class="minha-foto">
              <label class="minha-foto__circulo">
                <img v-if="minhaFoto" :src="minhaFoto" alt="" />
                <span v-else-if="form.nome" class="minha-foto__inicial">{{ minhaInicial }}</span>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
                <input ref="entradaFoto" type="file" accept="image/jpeg,image/png,image/webp" hidden :disabled="enviandoFoto" @change="escolherFoto" />
              </label>
              <div class="minha-foto__lado">
                <p v-if="jaConhecido" class="minha-foto__ola">Que bom te ver de novo!</p>
                <p class="minha-foto__dica">{{ enviandoFoto ? 'Enviando…' : minhaFoto ? 'Toque para trocar sua foto' : 'Toque para pôr sua foto (opcional)' }}</p>
                <button v-if="jaConhecido" class="minha-foto__nao" @click="esquecerMeusDados">Não sou eu</button>
              </div>
            </div>

            <p v-if="erroFoto" class="erro">{{ erroFoto }}</p>

            <label class="campo">
              <span>Seu nome</span>
              <input v-model="form.nome" placeholder="Como o barbeiro te chama" :disabled="enviando" />
            </label>

            <label class="campo">
              <span>WhatsApp</span>
              <input
                v-model="form.telefone"
                inputmode="tel"
                placeholder="(19) 99999-9999"
                :disabled="enviando"
              />
            </label>

            <label class="campo">
              <span>Alguma observação <em>(opcional)</em></span>
              <input
                v-model="form.observacao"
                placeholder="Ex.: máquina 2 nas laterais"
                :disabled="enviando"
              />
            </label>

            <button class="btn btn--cheio btn--largo" :disabled="!podeEnviar || enviando" @click="confirmar">
              {{ enviando ? 'Marcando…' : 'Confirmar horário' }}
            </button>

            <p class="miudo">
              Seus dados vão só para a barbearia, para ela te reconhecer e
              avisar se algo mudar.
            </p>
          </template>
        </section>

        <!-- ============ vitrine ============ -->
        <template v-else>
          <section v-if="serv.length" class="secao">
            <p class="secao__rotulo">Serviços</p>
            <ul class="grelha">
              <li v-for="s in serv" :key="s.id">
                <button class="carta" @click="escolherServico(s)">
                  <span class="carta__foto">
                    <img v-if="s.foto_url" :src="s.foto_url" alt="" loading="lazy" />
                    <span v-else class="carta__sem" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7.4 19.5 18.9M8 16.6 19.5 5.1" /><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /></svg>
                    </span>
                  </span>
                  <span class="carta__nome">{{ s.nome }}</span>
                  <span class="carta__pe">
                    <span class="carta__tempo">{{ emTempo(s.duracao_min) }}</span>
                    <span class="carta__preco">{{ dinheiro.format(Number(s.preco)) }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <section v-if="equipe.length" class="secao">
            <p class="secao__rotulo">Quem atende</p>
            <div class="equipe">
              <div v-for="a in equipe" :key="a.id" class="pessoa">
                <span class="pessoa__foto">
                  <img v-if="a.foto_url" :src="a.foto_url" alt="" loading="lazy" />
                  <template v-else>{{ (a.nome.trim()[0] ?? '?').toUpperCase() }}</template>
                </span>
                <span class="pessoa__nome">{{ a.nome }}</span>
              </div>
            </div>
          </section>

          <section v-if="semana.length" class="secao">
            <p class="secao__rotulo">Horário de atendimento</p>
            <ul class="horarios">
              <li
                v-for="d in semana"
                :key="d.dia"
                class="horario"
                :class="{ 'horario--hoje': d.hoje, 'horario--fechado': !d.aberto }"
              >
                <span class="horario__dia">
                  {{ d.nome }}
                  <span v-if="d.hoje" class="horario__selo">hoje</span>
                </span>
                <span class="horario__faixa">{{ d.faixa }}</span>
              </li>
            </ul>
          </section>

          <section v-if="comodidades.length" class="secao">
            <p class="secao__rotulo">O que temos aqui</p>
            <div class="pagamentos">
              <span v-for="c in comodidades" :key="c" class="pagamento">{{ c }}</span>
            </div>
          </section>

          <section v-if="pagamentos.length" class="secao">
            <p class="secao__rotulo">Formas de pagamento</p>
            <div class="pagamentos">
              <span v-for="p in pagamentos" :key="p" class="pagamento">{{ p }}</span>
            </div>
          </section>

          <section v-if="outras.length" class="secao">
            <p class="secao__rotulo">Também atendemos em</p>

            <!-- poucas unidades: lista simples -->
            <div v-if="!agrupar" class="irmas">
              <NuxtLink v-for="u in outras" :key="u.slug" :to="`/${u.slug}`" class="irma">
                <span class="irma__textos">
                  <span class="irma__cidade">{{ u.cidade || u.nome }}</span>
                  <span v-if="u.endereco" class="irma__endereco">{{ u.endereco }}</span>
                </span>
                <span class="irma__seta">→</span>
              </NuxtLink>
            </div>

            <!-- muitas unidades: agrupadas por cidade -->
            <div v-else class="irmas">
              <div v-for="g in gruposCidade" :key="g.cidade" class="grupo-cidade">
                <button class="grupo-cidade__topo" @click="virarCidade(g.cidade)">
                  <span class="grupo-cidade__nome">
                    {{ g.cidade }}
                    <span class="grupo-cidade__conta">{{ g.unidades.length }}</span>
                  </span>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                    class="grupo-cidade__seta" :class="{ 'grupo-cidade__seta--aberta': cidadeAberta === g.cidade }"
                  ><path d="M7 10l5 5 5-5" /></svg>
                </button>

                <div v-if="cidadeAberta === g.cidade" class="grupo-cidade__lista">
                  <NuxtLink v-for="u in g.unidades" :key="u.slug" :to="`/${u.slug}`" class="irma irma--filha">
                    <span class="irma__textos">
                      <span class="irma__cidade">{{ u.nome }}</span>
                      <span v-if="u.endereco" class="irma__endereco">{{ u.endereco }}</span>
                    </span>
                    <span class="irma__seta">→</span>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </section>

          <section v-if="loja.endereco || loja.cidade" class="secao">
            <p class="secao__rotulo">Onde fica</p>
            <a
              class="onde"
              :href="`https://maps.google.com/?q=${encodeURIComponent([loja.nome, loja.endereco, loja.cidade].filter(Boolean).join(', '))}`"
              target="_blank"
              rel="noopener"
            >
              <span class="onde__pino" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
              </span>
              <span class="onde__texto">
                <span class="onde__linha">{{ [loja.endereco, loja.cidade].filter(Boolean).join(' · ') }}</span>
                <span class="onde__dica">Abrir no mapa</span>
              </span>
            </a>
          </section>
        </template>
      </template>

      </div>
      </div>

      <footer class="rodape">
        <span>Agendamento por Agenda do Barbeiro</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.pagina {
  overflow-x: hidden;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--preto);
  /* A luz do fundo sai da cor da propria barbearia. Fica presa no
     lugar: rola o conteudo, o brilho continua onde estava. */
  position: relative;
  background-image:
    linear-gradient(var(--marca-grade) 1px, transparent 1px),
    linear-gradient(90deg, var(--marca-grade) 1px, transparent 1px);
  background-size: 28px 28px, 28px 28px;
  background-attachment: fixed;
}

/* O brilho e um elemento proprio, preso ao topo da PAGINA. Assim ele
   fica onde nasceu e sai da tela conforme o cliente rola — em vez de
   perseguir a janela, que era o efeito estranho de antes. */
.pagina::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 620px;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(100% 62% at 50% 0%, var(--marca-brilho), transparent 68%);
}

.folha { position: relative; z-index: 1; max-width: 480px; margin: 0 auto; padding-bottom: 40px; }

.centro { display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 24px; }

/* ---------- capa ---------- */
.capa {
  width: 100%;
  height: clamp(170px, 44vw, 250px);
  overflow: hidden;
  background: var(--marca-carta);
  background-color: #0F1114;
}
.capa--vazia { background: linear-gradient(140deg, var(--marca-suave), var(--preto-800)); }
.capa__img { width: 100%; height: 100%; object-fit: cover; }

/* ---------- perfil ---------- */
.perfil { padding: 0 20px 22px; text-align: center; }

.perfil__logo {
  width: 92px;
  height: 92px;
  margin: -34px auto 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 4px solid var(--preto);
  color: var(--marca);
  font-size: 29px;
  font-weight: 800;
  position: relative;
}
.perfil__logo img { width: 100%; height: 100%; object-fit: cover; }

.perfil__nome {
  margin: 0;
  font-size: clamp(21px, 5.5vw, 25px);
  font-weight: 780;
  letter-spacing: -0.025em;
  color: var(--branco);
  line-height: 1.15;
}
.perfil__categoria { margin: 6px 0 0; font-size: 13px; color: var(--cinza-600); }
.perfil__endereco { margin: 3px 0 0; font-size: 12.5px; color: var(--cinza-600); }
.perfil__sobre {
  margin: 12px auto 0;
  max-width: 40ch;
  font-size: 13.5px;
  color: var(--cinza);
  line-height: 1.6;
}

/* ---------- linha de acoes ---------- */
.acoes { display: flex; gap: 7px; margin-top: 18px; }

.acao {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  min-height: 46px;
  border: 1px solid var(--preto-600);
  border-radius: 11px;
  background: transparent;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 650;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease;
}
.acao:hover { border-color: var(--marca-linha); }
.acao:active { transform: scale(0.98); }

.acao--icone { gap: 7px; }
.acao--icone svg { width: 19px; height: 19px; }

.acao--forte {
  flex: 1.9;
  background: var(--marca);
  border-color: transparent;
  color: #FFFFFF;
  font-weight: 700;
}

/* ---------- secoes ---------- */
.secao {
  padding: 20px;
  border-top: 1px solid var(--marca-borda);
  scroll-margin-top: 8px;
}
.secao__rotulo {
  margin: 0 0 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

/* ---------- fluxo ---------- */
.trilha { display: flex; gap: 5px; margin-bottom: 18px; }
.trilha__risco {
  flex: 1;
  height: 3px;
  background: var(--preto-700);
  border-radius: 99px;
  transition: background 0.25s ease;
}
.trilha__risco--on { background: var(--marca); }

.voltar {
  margin: 0 0 16px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}
.voltar:hover { color: var(--branco); }

.pergunta {
  margin: 0 0 16px;
  font-size: 19px;
  font-weight: 720;
  letter-spacing: -0.02em;
  color: var(--branco);
}

.nada {
  margin: 0;
  padding: 22px 20px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px dashed var(--preto-600);
  border-radius: 14px;
  font-size: 13.5px;
  color: var(--cinza-600);
  line-height: 1.6;
  text-align: center;
}

/* ---------- opcoes ---------- */
.opcoes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

.opcao {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 12px 14px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid transparent;
  border-radius: 13px;
  font-family: var(--fonte-corpo);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease;
}
.opcao:hover { border-color: var(--marca-linha); }
.opcao:active { transform: scale(0.99); }

.opcao__foto,
.opcao__avatar {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  overflow: hidden;
  background: var(--preto-700);
  color: var(--marca);
  font-size: 16px;
  font-weight: 750;
}
.opcao__avatar { border-radius: 99px; }
.opcao__foto img,
.opcao__avatar img { width: 100%; height: 100%; object-fit: cover; }

.opcao__meio { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.opcao__nome { font-size: 15px; font-weight: 650; color: var(--branco); }
.opcao__desc {
  font-size: 12.5px;
  color: var(--cinza-600);
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.opcao__tempo { font-size: 11.5px; color: var(--cinza-600); }
.opcao__preco {
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--marca);
  font-variant-numeric: tabular-nums;
}

/* ---------- equipe ---------- */
.equipe { display: flex; gap: 18px; flex-wrap: wrap; }
.pessoa { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 68px; }
.pessoa__foto {
  width: 58px;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid var(--marca-borda);
  color: var(--marca);
  font-size: 20px;
  font-weight: 750;
}
.pessoa__foto img { width: 100%; height: 100%; object-fit: cover; }
.pessoa__nome {
  font-size: 11.5px;
  color: var(--cinza);
  text-align: center;
  line-height: 1.3;
  word-break: break-word;
}

/* ---------- onde fica ---------- */
.onde {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 14px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid transparent;
  border-radius: 13px;
  text-decoration: none;
  transition: border-color 0.16s ease;
}
.onde:hover { border-color: var(--marca-linha); }
.onde__pino {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: var(--marca-suave);
  color: var(--marca);
}
.onde__pino svg { width: 19px; height: 19px; }
.onde__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.onde__linha { font-size: 14px; color: var(--branco); font-weight: 600; }
.onde__dica { font-size: 12px; color: var(--marca); }

/* ---------- dias ---------- */
.dias {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 18px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.dias::-webkit-scrollbar { display: none; }

.dia {
  flex-shrink: 0;
  width: 60px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid transparent;
  border-radius: 12px;
  font-family: var(--fonte-corpo);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}
.dia--on { border-color: var(--marca); background: var(--marca-suave); }
.dia__semana { font-size: 10.5px; color: var(--cinza-600); text-transform: lowercase; }
.dia__num { font-size: 17px; font-weight: 750; color: var(--branco); font-variant-numeric: tabular-nums; }
.dia__mes { font-size: 10px; color: var(--cinza-600); text-transform: lowercase; }

/* ---------- horas ---------- */
.horas { display: flex; flex-wrap: wrap; gap: 8px; }
.hora {
  padding: 11px 0;
  width: calc(25% - 6px);
  min-width: 70px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.hora:hover { border-color: var(--marca); color: var(--marca); }

/* ---------- conferir ---------- */
.conferir {
  padding: 14px 16px;
  margin-bottom: 18px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border-left: 3px solid var(--marca);
  border-radius: 12px;
}
.conferir__linha { margin: 0; font-size: 13.5px; color: var(--cinza); }
.conferir__linha + .conferir__linha { margin-top: 4px; }
.conferir__linha strong { color: var(--branco); font-weight: 700; }
.conferir__linha--forte { color: var(--branco); font-weight: 650; font-size: 15px; margin-top: 8px !important; }

/* ---------- saudacao de quem ja veio ---------- */
.saudacao-cliente {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 14px;
  background: var(--marca-suave);
  border: 1px solid var(--marca-linha);
  border-radius: 13px;
}
.saudacao-cliente__foto {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--marca-carta);
  background-color: #0F1114;
  color: var(--marca);
  font-size: 13px;
  font-weight: 750;
}
.saudacao-cliente__foto img { width: 100%; height: 100%; object-fit: cover; }
.saudacao-cliente__texto { font-size: 13.5px; font-weight: 600; color: var(--branco); }

/* ---------- quem esta vendo, fixo no topo ---------- */
.barra-topo {
  position: fixed;
  top: 14px;
  right: 26px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 6px;
  background: rgba(10, 11, 13, 0.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--marca-linha);
  border-radius: 99px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}
.barra-topo__foto {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--marca-carta);
  background-color: #0F1114;
  color: var(--marca);
  font-size: 12px;
  font-weight: 750;
}
.barra-topo__foto img { width: 100%; height: 100%; object-fit: cover; }
.barra-topo__nome { font-size: 13px; font-weight: 650; color: var(--branco); }

/* ---------- avaliar o corte ---------- */
.avaliar { text-align: center; }
.avaliar__titulo {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
  color: var(--branco);
  line-height: 1.35;
}
.avaliar__obrigado {
  margin: 0;
  padding: 12px 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--marca);
}

.estrelas { display: flex; justify-content: center; gap: 6px; margin-bottom: 14px; }
.estrela {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--preto-600);
  cursor: pointer;
  transition: color 0.14s ease, transform 0.14s ease;
}
.estrela svg { width: 32px; height: 32px; }
.estrela:hover { transform: scale(1.1); }
.estrela--on { color: #FBBF24; }

.avaliar__texto {
  width: 100%;
  padding: 11px 13px;
  margin-bottom: 12px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--marca-borda);
  border-radius: 12px;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  line-height: 1.5;
  resize: vertical;
}
.avaliar__texto:focus { outline: none; border-color: var(--marca); }
.avaliar__texto::placeholder { color: var(--cinza-600); }

/* ---------- a foto do cliente ---------- */
.minha-foto { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.minha-foto__circulo {
  width: 66px;
  height: 66px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px dashed var(--preto-600);
  color: var(--cinza-600);
  cursor: pointer;
}
.minha-foto__circulo:hover { border-color: var(--marca); }
.minha-foto__circulo img { width: 100%; height: 100%; object-fit: cover; }
.minha-foto__circulo svg { width: 26px; height: 26px; }
.minha-foto__inicial { font-size: 24px; font-weight: 750; color: var(--marca); }
.minha-foto__lado { flex: 1; min-width: 0; }
.minha-foto__ola { margin: 0 0 3px; font-size: 14px; font-weight: 650; color: var(--marca); }
.minha-foto__dica { margin: 0; font-size: 12.5px; color: var(--cinza-600); line-height: 1.45; }
.minha-foto__nao {
  margin-top: 5px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
.minha-foto__nao:hover { color: var(--branco); }

/* ---------- campos ---------- */
.campo { display: flex; flex-direction: column; margin-bottom: 14px; }
.campo > span {
  margin-bottom: 7px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo > span em { font-style: normal; text-transform: none; letter-spacing: 0; color: var(--cinza-600); font-weight: 500; }
.campo input {
  width: 100%;
  padding: 13px 14px;
  min-height: 48px;
  font-family: var(--fonte-corpo);
  font-size: 16px;
  color: var(--branco);
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid var(--marca-borda);
  border-radius: 12px;
}
.campo input:focus { outline: none; border-color: var(--marca); }
.campo input::placeholder { color: var(--cinza-600); }

.erro {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--marca-linha);
  background: var(--marca-suave);
  border-radius: 12px;
  font-size: 13.5px;
  color: var(--branco);
  line-height: 1.55;
}

.miudo {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--cinza-600);
  line-height: 1.55;
  text-align: center;
}

/* ---------- botoes ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 22px;
  min-height: 50px;
  border: 1px solid transparent;
  border-radius: 12px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}
.btn--largo { width: 100%; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn--cheio { background: var(--marca); color: #FFFFFF; }
.btn--cheio:active:not(:disabled) { transform: scale(0.99); }
.btn--vazio { background: transparent; border-color: var(--preto-600); color: var(--cinza); }
.btn--vazio:hover { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- comprovante ---------- */
.feito { text-align: center; }
.feito__marca {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  border-radius: 99px;
  background: var(--marca-suave);
  color: var(--marca);
}
.feito__marca svg { width: 26px; height: 26px; }
.feito__titulo { margin: 0 0 6px; font-size: 20px; font-weight: 750; color: var(--branco); }
.feito__quando {
  margin: 0 0 20px;
  font-size: 15px;
  color: var(--marca);
  font-weight: 650;
  text-transform: capitalize;
}

.resumo {
  margin: 0 0 18px;
  padding: 14px 16px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border-radius: 12px;
  text-align: left;
}
.resumo > div { display: flex; justify-content: space-between; gap: 14px; }
.resumo > div + div { margin-top: 7px; }
.resumo dt { font-size: 13px; color: var(--cinza-600); }
.resumo dd { margin: 0; font-size: 13.5px; font-weight: 650; color: var(--branco); text-align: right; }

.feito__aviso { margin: 0 0 20px; font-size: 13px; color: var(--cinza-600); line-height: 1.6; }
.feito__acoes { display: flex; flex-direction: column; gap: 9px; }

/* ---------- aviso ---------- */
.aviso {
  padding: 26px 24px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid var(--marca-borda);
  border-radius: 18px;
  text-align: center;
  max-width: 420px;
}
.aviso__titulo { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: var(--branco); }
.aviso__texto { margin: 0; font-size: 13.5px; color: var(--cinza-600); line-height: 1.6; }

/* ---------- rodape ---------- */
.rodape {
  padding: 22px 20px 0;
  border-top: 1px solid var(--marca-borda);
  text-align: center;
  font-size: 11.5px;
  color: var(--cinza-600);
}

/* ---------- aberto agora ---------- */
.selo {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 6px 13px;
  border-radius: 99px;
  font-size: 12.5px;
  font-weight: 650;
  border: 1px solid transparent;
}
.selo__ponto { width: 7px; height: 7px; border-radius: 99px; background: currentColor; flex-shrink: 0; }
.selo--on { color: #4ADE80; background: rgba(74, 222, 128, 0.1); border-color: rgba(74, 222, 128, 0.32); }
.selo--off { color: var(--cinza-600); background: var(--marca-carta);
  background-color: #0F1114; border-color: var(--preto-600); }

/* ---------- unidades agrupadas por cidade ---------- */
.grupo-cidade {
  background: var(--marca-carta);
  background-color: #0F1114;
  border-radius: 13px;
  overflow: hidden;
}

.grupo-cidade__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 13px 15px;
  background: transparent;
  border: none;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  cursor: pointer;
}

.grupo-cidade__nome {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14.5px;
  font-weight: 650;
}

.grupo-cidade__conta {
  padding: 1px 8px;
  background: var(--marca-suave);
  color: var(--marca);
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
}

.grupo-cidade__seta {
  width: 16px;
  height: 16px;
  color: var(--cinza-600);
  transition: transform 0.16s ease;
}
.grupo-cidade__seta--aberta { transform: rotate(180deg); }

.grupo-cidade__lista {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px 8px;
}

.irma--filha { background: rgba(0, 0, 0, 0.22); }

/* ---------- outras unidades ---------- */
.irmas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}
.irma {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 15px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid transparent;
  border-radius: 13px;
  text-decoration: none;
  transition: border-color 0.16s ease;
}
.irma:hover { border-color: var(--marca-linha); }
.irma__textos { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.irma__cidade { font-size: 14.5px; font-weight: 650; color: var(--branco); }
.irma__endereco { font-size: 12px; color: var(--cinza-600); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.irma__seta { color: var(--marca); font-size: 15px; }

/* ---------- formas de pagamento ---------- */
.pagamentos { display: flex; gap: 8px; flex-wrap: wrap; }
.pagamento {
  padding: 8px 14px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid var(--marca-borda);
  border-radius: 99px;
  font-size: 13px;
  color: var(--cinza);
}

/* ---------- horario de atendimento ---------- */
.horarios { list-style: none; margin: 0; padding: 0; }
.horario {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 0;
  font-size: 13.5px;
  border-bottom: 1px solid var(--marca-borda);
}
.horario:last-child { border-bottom: none; }
.horario__dia { display: flex; align-items: center; gap: 8px; color: var(--cinza); }
.horario__faixa { color: var(--cinza); font-variant-numeric: tabular-nums; }
.horario--hoje .horario__dia,
.horario--hoje .horario__faixa { color: var(--branco); font-weight: 700; }
.horario--fechado .horario__faixa { color: var(--cinza-600); }
.horario__selo {
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--marca-suave);
  color: var(--marca);
  font-size: 10.5px;
  font-weight: 700;
}

/* ---------- servicos em grade ---------- */
/* Carrossel, nao grade: com tres ou com trinta servicos a secao ocupa
   sempre a mesma altura. O cliente arrasta para o lado, como em app de
   comida. E o corte na borda direita e proposital — e o que avisa que
   tem mais coisa ali. */
.grelha {
  list-style: none;
  margin: 0 -20px;
  padding: 0 20px 6px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.grelha::-webkit-scrollbar { display: none; }

.grelha > li {
  display: flex;
  flex: 0 0 150px;
  scroll-snap-align: start;
}

.carta {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 0 0 12px;
  background: var(--marca-carta);
  background-color: #0F1114;
  border: 1px solid transparent;
  border-radius: 14px;
  overflow: hidden;
  font-family: var(--fonte-corpo);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease;
}
.carta:hover { border-color: var(--marca-linha); }
.carta:active { transform: scale(0.99); }

.carta__foto {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  flex-shrink: 0;
  background: var(--preto-700);
  overflow: hidden;
}
.carta__foto img { width: 100%; height: 100%; object-fit: cover; }

.carta__sem {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--marca);
  opacity: 0.45;
}
.carta__sem svg { width: 30px; height: 30px; }

.carta__nome {
  flex: 1;
  margin: 11px 12px 0;
  font-size: 14.5px;
  font-weight: 650;
  color: var(--branco);
  line-height: 1.3;
}

.carta__pe {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 5px 12px 0;
}
.carta__tempo { font-size: 11.5px; color: var(--cinza-600); }
.carta__preco {
  font-size: 14px;
  font-weight: 700;
  color: var(--marca);
  font-variant-numeric: tabular-nums;
}

/* ------------------------------------------------------------
   No computador o perfil ganha ar: a capa atravessa a tela e o
   conteudo se divide em duas colunas — identidade fixa a esquerda,
   servicos e agendamento a direita. E o mesmo arranjo do Facebook.
   ------------------------------------------------------------ */
@media (min-width: 900px) {
  .capa {
    height: clamp(240px, 26vw, 340px);
  }

  .folha {
    max-width: 1000px;
    padding-bottom: 60px;
  }

  .corpo {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 32px;
    align-items: start;
    padding: 0 28px;
  }

  .perfil {
    text-align: left;
    padding: 0;
    margin-top: -60px;
    position: sticky;
    top: 24px;
  }

  .perfil__logo {
    margin: 0 0 16px;
    width: 116px;
    height: 116px;
    font-size: 36px;
  }

  .perfil__nome { font-size: 27px; }
  .perfil__sobre { margin-left: 0; margin-right: 0; }

  .acoes { flex-direction: column; }
  .acao, .acao--forte { flex: none; width: 100%; }

  .lado {
    margin-top: 24px;
    border: 1px solid var(--marca-borda);
    border-radius: 18px;
    overflow: hidden;
  }

  .secao { border-top: 1px solid var(--marca-borda); }
  .secao:first-child { border-top: none; }

  .horas .hora { width: calc(16.66% - 7px); }
  /* No computador ha espaco: a grade volta, sem corte e sem arrasto. */
  .grelha {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin: 0;
    padding: 0;
    overflow: visible;
  }
  .grelha > li { flex: none; }
}

@media (max-width: 520px) {
  /* Numa tela estreita, tres nomes nao cabem: fica so o simbolo, que
     todo mundo reconhece. */
  .acao--icone { font-size: 0; gap: 0; flex: 0 0 52px; padding: 12px 0; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .opcao, .hora, .dia, .acao, .trilha__risco { transition: none; }
}
</style>