<script setup lang="ts">
import type { Database, Servico, StatusAgendamento } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Agenda — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono } = useAcesso()
const { saudacao } = useSaudacao()

/* ------------------------------------------------------------
   Tipos locais
   ------------------------------------------------------------ */
type BarbeiroResumo = { id: string; nome: string; foto_url: string | null }
type ServicoResumo = Pick<Servico, 'id' | 'nome' | 'duracao_min' | 'preco'>
type ClienteResumo = { id: string; nome: string; telefone: string }

type AgendamentoLinha = {
  id: string
  cliente_id: string
  servico_id: string
  inicio: string
  fim: string
  status: StatusAgendamento
  observacao: string | null
}

/* ------------------------------------------------------------
   O dia que está na tela.
   Guardado como meia-noite local; as setas andam de um em um.
   ------------------------------------------------------------ */
const dia = ref(new Date(new Date().setHours(0, 0, 0, 0)))

function mudarDia(delta: number) {
  const d = dia.value
  dia.value = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta)
}

function irHoje() {
  dia.value = new Date(new Date().setHours(0, 0, 0, 0))
}

const ehHoje = computed(() => dia.value.getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime())

const tituloDia = computed(() => {
  const hoje = new Date(new Date().setHours(0, 0, 0, 0))
  const diff = Math.round((dia.value.getTime() - hoje.getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(dia.value)
})

const dataExtenso = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(dia.value)
)

/* ------------------------------------------------------------
   Barbeiros: dono escolhe no chip, barbeiro cai no próprio.
   ------------------------------------------------------------ */
const { data: barbeiros } = await useAsyncData<BarbeiroResumo[]>(
  'agenda-barbeiros',
  async () => {
    const { data } = await supabase
      .from('perfis')
      .select('id, nome, foto_url')
      .eq('papel', 'barbeiro')
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
    return (data ?? []) as BarbeiroResumo[]
  },
  { default: () => [] as BarbeiroResumo[] }
)

const selecionado = ref<string | null>(null)

watch(
  [contexto, barbeiros],
  () => {
    if (selecionado.value) return
    if (contexto.value?.papel === 'barbeiro') {
      selecionado.value = contexto.value.perfil_id
    } else if (ehDono.value && barbeiros.value.length) {
      selecionado.value = barbeiros.value[0]!.id
    }
  },
  { immediate: true }
)

/* ------------------------------------------------------------
   A carga do dia: jornada do dia da semana, bloqueios que
   encostam no dia, agendamentos do dia — e os nomes de
   clientes e serviços desses agendamentos.
   ------------------------------------------------------------ */
const OCUPAM: StatusAgendamento[] = ['pendente', 'confirmado', 'concluido']

const { data: carga, refresh } = await useAsyncData(
  'agenda-dia',
  async () => {
    const vazio = {
      jornadas: [] as { inicio: string; fim: string }[],
      bloqueios: [] as { id: string; inicio: string; fim: string; motivo: string | null }[],
      agendamentos: [] as AgendamentoLinha[],
      clientes: new Map<string, ClienteResumo>(),
      servicos: new Map<string, ServicoResumo>(),
    }
    if (!selecionado.value) return vazio

    const iniDia = dia.value
    const fimDia = new Date(iniDia.getFullYear(), iniDia.getMonth(), iniDia.getDate() + 1)

    const [j, b, a] = await Promise.all([
      supabase
        .from('jornadas')
        .select('inicio, fim')
        .eq('barbeiro_id', selecionado.value)
        .eq('dia_semana', iniDia.getDay()),
      supabase
        .from('bloqueios')
        .select('id, inicio, fim, motivo')
        .eq('barbeiro_id', selecionado.value)
        .lt('inicio', fimDia.toISOString())
        .gt('fim', iniDia.toISOString()),
      supabase
        .from('agendamentos')
        .select('id, cliente_id, servico_id, inicio, fim, status, observacao')
        .eq('barbeiro_id', selecionado.value)
        .gte('inicio', iniDia.toISOString())
        .lt('inicio', fimDia.toISOString())
        .order('inicio', { ascending: true }),
    ])

    const agendamentos = (a.data ?? []) as AgendamentoLinha[]

    // Nomes de clientes e serviços, buscados pelos ids que apareceram
    const idsClientes = [...new Set(agendamentos.map((x) => x.cliente_id))]
    const idsServicos = [...new Set(agendamentos.map((x) => x.servico_id))]

    const [c, s] = await Promise.all([
      idsClientes.length
        ? supabase.from('clientes').select('id, nome, telefone').in('id', idsClientes)
        : Promise.resolve({ data: [] }),
      idsServicos.length
        ? supabase.from('servicos').select('id, nome, duracao_min, preco').in('id', idsServicos)
        : Promise.resolve({ data: [] }),
    ])

    const clientes = new Map<string, ClienteResumo>()
    for (const x of (c.data ?? []) as ClienteResumo[]) clientes.set(x.id, x)
    const servicos = new Map<string, ServicoResumo>()
    for (const x of (s.data ?? []) as ServicoResumo[]) servicos.set(x.id, x)

    return {
      jornadas: (j.data ?? []) as { inicio: string; fim: string }[],
      bloqueios: (b.data ?? []) as { id: string; inicio: string; fim: string; motivo: string | null }[],
      agendamentos,
      clientes,
      servicos,
    }
  },
  {
    default: () => ({
      jornadas: [],
      bloqueios: [],
      agendamentos: [],
      clientes: new Map<string, ClienteResumo>(),
      servicos: new Map<string, ServicoResumo>(),
    }),
    watch: [selecionado, dia],
  }
)

const temExpediente = computed(() => carga.value.jornadas.length > 0)

const mostrarCancelados = ref(false)

const doDia = computed(() =>
  carga.value.agendamentos.filter((a) => a.status !== 'cancelado' || mostrarCancelados.value)
)

const canceladosDoDia = computed(
  () => carga.value.agendamentos.filter((a) => a.status === 'cancelado').length
)

/* ------------------------------------------------------------
   Formatação
   ------------------------------------------------------------ */
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function horaDe(iso: string) {
  return fmtHora.format(new Date(iso))
}

function precoDe(a: AgendamentoLinha): string {
  const cobrado = (a as unknown as Record<string, unknown>).preco_cobrado
  const doServico = carga.value.servicos.get(a.servico_id)?.preco ?? 0
  return dinheiro.format(Number(cobrado ?? doServico))
}

function emTempo(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function soDigitos(bruto: string): string {
  const d = (bruto || '').replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

const SELOS: Record<StatusAgendamento, string> = {
  pendente: 'A confirmar',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
}

/* ------------------------------------------------------------
   Menu ⋯ de cada atendimento
   ------------------------------------------------------------ */
const menuAberto = ref<string | null>(null)
const mexendo = ref<string | null>(null)

async function mudarStatus(a: AgendamentoLinha, status: StatusAgendamento) {
  menuAberto.value = null
  mexendo.value = a.id
  await supabase.from('agendamentos').update({ status }).eq('id', a.id)
  mexendo.value = null
  await refresh()
}

const confirmandoCancelamento = ref<AgendamentoLinha | null>(null)

function pedirCancelamento(a: AgendamentoLinha) {
  menuAberto.value = null
  confirmandoCancelamento.value = a
}

async function cancelar() {
  const a = confirmandoCancelamento.value
  if (!a) return
  confirmandoCancelamento.value = null
  await mudarStatus(a, 'cancelado')
}

function zapDo(a: AgendamentoLinha): string | null {
  const c = carga.value.clientes.get(a.cliente_id)
  if (!c?.telefone) return null
  return `https://wa.me/${soDigitos(c.telefone)}`
}

/* ------------------------------------------------------------
   Marcar horário — o coração da tela.

   Três passos: serviço → horário livre → cliente.
   Os horários livres nascem do cruzamento: jornada do dia,
   menos bloqueios, menos o que já está marcado.
   ------------------------------------------------------------ */
const marcando = ref(false)
const passo = ref<1 | 2 | 3>(1)
const salvandoMarcacao = ref(false)
const erroMarcacao = ref('')

const escolha = reactive({
  servico: null as ServicoResumo | null,
  minuto: null as number | null,
})

/* todos os serviços ativos, para o passo 1 */
const { data: cardapio } = await useAsyncData<ServicoResumo[]>(
  'agenda-servicos',
  async () => {
    const { data } = await supabase
      .from('servicos')
      .select('id, nome, duracao_min, preco')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
    return (data ?? []) as ServicoResumo[]
  },
  { default: () => [] as ServicoResumo[] }
)

function abrirMarcacao() {
  escolha.servico = null
  escolha.minuto = null
  limparCliente()
  erroMarcacao.value = ''
  passo.value = 1
  marcando.value = true
}

function fecharMarcacao() {
  marcando.value = false
}

function escolherServico(s: ServicoResumo) {
  escolha.servico = s
  escolha.minuto = null
  passo.value = 2
}

/* minutos do dia em que algo já ocupa a cadeira */
function minutosDe(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

const ocupados = computed(() => {
  const blocos: { ini: number; fim: number }[] = []
  for (const a of carga.value.agendamentos) {
    if (!OCUPAM.includes(a.status)) continue
    blocos.push({ ini: minutosDe(a.inicio), fim: minutosDe(a.fim) })
  }
  const iniDia = dia.value.getTime()
  const fimDia = iniDia + 86400000
  for (const b of carga.value.bloqueios) {
    const ini = Math.max(new Date(b.inicio).getTime(), iniDia)
    const fim = Math.min(new Date(b.fim).getTime(), fimDia)
    blocos.push({
      ini: Math.floor((ini - iniDia) / 60000),
      fim: Math.ceil((fim - iniDia) / 60000),
    })
  }
  return blocos
})

/* os horários livres para o serviço escolhido, de 15 em 15 */
const livres = computed<number[]>(() => {
  const s = escolha.servico
  if (!s) return []

  const resultado: number[] = []
  const agora = new Date()
  const minutoAgora =
    ehHoje.value ? agora.getHours() * 60 + agora.getMinutes() : -1

  for (const j of carga.value.jornadas) {
    const [hi, mi] = j.inicio.slice(0, 5).split(':').map(Number)
    const [hf, mf] = j.fim.slice(0, 5).split(':').map(Number)
    const faixaIni = (hi ?? 0) * 60 + (mi ?? 0)
    const faixaFim = (hf ?? 0) * 60 + (mf ?? 0)

    for (let t = faixaIni; t + s.duracao_min <= faixaFim; t += 15) {
      if (t <= minutoAgora) continue
      const livre = !ocupados.value.some((o) => t < o.fim && t + s.duracao_min > o.ini)
      if (livre) resultado.push(t)
    }
  }
  return resultado.sort((x, y) => x - y)
})

function rotuloMinuto(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function escolherMinuto(m: number) {
  escolha.minuto = m
  passo.value = 3
}

/* ---------- passo 3: o cliente ---------- */
const buscaCliente = ref('')
const achados = ref<ClienteResumo[]>([])
const clienteEscolhido = ref<ClienteResumo | null>(null)
const criandoNovo = ref(false)
const novoCliente = reactive({ nome: '', telefone: '' })

function limparCliente() {
  buscaCliente.value = ''
  achados.value = []
  clienteEscolhido.value = null
  criandoNovo.value = false
  Object.assign(novoCliente, { nome: '', telefone: '' })
}

let esperaBusca: ReturnType<typeof setTimeout> | null = null

watch(buscaCliente, (termo) => {
  if (clienteEscolhido.value && termo === clienteEscolhido.value.nome) return
  clienteEscolhido.value = null
  if (esperaBusca) clearTimeout(esperaBusca)
  const t = termo.trim()
  if (t.length < 2) {
    achados.value = []
    return
  }
  esperaBusca = setTimeout(async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, nome, telefone')
      .or(`nome.ilike.%${t}%,telefone.ilike.%${t.replace(/\D/g, '')}%`)
      .limit(6)
    achados.value = (data ?? []) as ClienteResumo[]
  }, 250)
})

function escolherCliente(c: ClienteResumo) {
  clienteEscolhido.value = c
  buscaCliente.value = c.nome
  achados.value = []
  criandoNovo.value = false
}

function abrirNovoCliente() {
  criandoNovo.value = true
  clienteEscolhido.value = null
  novoCliente.nome = buscaCliente.value.trim()
  novoCliente.telefone = ''
}

/* ---------- confirmar a marcação ---------- */
const podeConfirmar = computed(() => {
  if (!escolha.servico || escolha.minuto === null) return false
  if (clienteEscolhido.value) return true
  return criandoNovo.value && novoCliente.nome.trim().length >= 2 && novoCliente.telefone.replace(/\D/g, '').length >= 10
})

async function confirmarMarcacao() {
  const s = escolha.servico
  if (!s || escolha.minuto === null || !selecionado.value) return

  erroMarcacao.value = ''
  salvandoMarcacao.value = true

  // 1. Garante o cliente
  let clienteId = clienteEscolhido.value?.id ?? null
  if (!clienteId) {
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        barbearia_id: contexto.value?.barbearia_id ?? '',
        nome: novoCliente.nome.trim(),
        telefone: novoCliente.telefone.replace(/\D/g, ''),
      })
      .select('id')
      .single()
    if (error || !data) {
      salvandoMarcacao.value = false
      erroMarcacao.value = error?.message ?? 'Não foi possível salvar o cliente.'
      return
    }
    clienteId = data.id
  }

  // 2. Marca o horário
  const inicio = new Date(dia.value)
  inicio.setMinutes(escolha.minuto)
  const fim = new Date(inicio.getTime() + s.duracao_min * 60000)

  const { error } = await supabase.from('agendamentos').insert({
    barbearia_id: contexto.value?.barbearia_id ?? '',
    cliente_id: clienteId,
    barbeiro_id: selecionado.value,
    servico_id: s.id,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    status: 'confirmado',
    preco_cobrado: Number(s.preco),
  })

  salvandoMarcacao.value = false

  if (error) {
    erroMarcacao.value = error.message
    return
  }

  fecharMarcacao()
  await refresh()
}

/* ------------------------------------------------------------
   Primeiros passos (só até a fundação existir)
   ------------------------------------------------------------ */
const contagemServicos = ref<number | null>(null)
const contagemEquipe = ref<number | null>(null)

watch(
  ehDono,
  async (v) => {
    if (!v) return
    const [s, e] = await Promise.all([
      supabase.from('servicos').select('id', { count: 'exact', head: true }),
      supabase.from('perfis').select('id', { count: 'exact', head: true }).eq('papel', 'barbeiro'),
    ])
    contagemServicos.value = s.count ?? 0
    contagemEquipe.value = e.count ?? 0
  },
  { immediate: true }
)

const mostrarChecklist = computed(
  () =>
    ehDono.value &&
    contagemServicos.value !== null &&
    contagemEquipe.value !== null &&
    (contagemServicos.value === 0 || contagemEquipe.value === 0)
)

onMounted(() => {
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (confirmandoCancelamento.value) confirmandoCancelamento.value = null
    else if (marcando.value) fecharMarcacao()
    else if (menuAberto.value) menuAberto.value = null
  }
  window.addEventListener('keydown', aoTeclar)

  const aoTocarFora = () => { menuAberto.value = null }
  document.addEventListener('pointerdown', aoTocarFora)

  onUnmounted(() => {
    window.removeEventListener('keydown', aoTeclar)
    document.removeEventListener('pointerdown', aoTocarFora)
  })
})
</script>

<template>
  <div>
    <header class="topo">
      <div class="topo__textos">
        <h1 class="titulo">{{ saudacao }}, {{ contexto?.nome?.split(' ')[0] ?? '' }}</h1>
      </div>

      <button
        v-if="selecionado && temExpediente"
        class="btn btn--laranja"
        @click="abrirMarcacao"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Marcar horário
      </button>
    </header>

    <!-- ============ primeiros passos ============ -->
    <section v-if="mostrarChecklist" class="passos">
      <p class="passos__rotulo">Primeiros passos</p>

      <NuxtLink to="/painel/servicos" class="passo" :class="{ 'passo--feito': (contagemServicos ?? 0) > 0 }">
        <span class="passo__bola">{{ (contagemServicos ?? 0) > 0 ? '✓' : '1' }}</span>
        <span class="passo__texto">Cadastrar serviços</span>
      </NuxtLink>

      <NuxtLink to="/painel/equipe" class="passo" :class="{ 'passo--feito': (contagemEquipe ?? 0) > 0 }">
        <span class="passo__bola">{{ (contagemEquipe ?? 0) > 0 ? '✓' : '2' }}</span>
        <span class="passo__texto">Montar a equipe</span>
      </NuxtLink>

      <div class="passo passo--breve">
        <span class="passo__bola">3</span>
        <span class="passo__texto">Divulgar a página de agendamento</span>
        <span class="passo__selo">em breve</span>
      </div>
    </section>

    <!-- ============ navegação do dia ============ -->
    <div class="dia-nav">
      <button class="dia-nav__seta" aria-label="Dia anterior" @click="mudarDia(-1)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <div class="dia-nav__meio">
        <p class="dia-nav__titulo">{{ tituloDia }}</p>
        <p class="dia-nav__data">{{ dataExtenso }}</p>
      </div>
      <button class="dia-nav__seta" aria-label="Próximo dia" @click="mudarDia(1)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      <button v-if="!ehHoje" class="dia-nav__hoje" @click="irHoje">Hoje</button>
    </div>

    <!-- ============ seletor de barbeiro ============ -->
    <div v-if="ehDono && barbeiros.length > 1" class="quem">
      <button
        v-for="b in barbeiros"
        :key="b.id"
        class="quem__chip"
        :class="{ 'quem__chip--on': selecionado === b.id }"
        @click="selecionado = b.id"
      >
        <span class="quem__avatar">
          <img v-if="b.foto_url" :src="b.foto_url" :alt="''" />
          <template v-else>{{ (b.nome.trim()[0] ?? '?').toUpperCase() }}</template>
        </span>
        {{ b.nome }}
      </button>
    </div>

    <!-- ============ dono sem equipe ============ -->
    <section v-if="ehDono && !barbeiros.length" class="vazio">
      <p class="vazio__titulo">A agenda nasce da equipe</p>
      <p class="vazio__texto">
        Cada agenda pertence a um barbeiro. Cadastre o primeiro e os horários
        dele aparecem aqui.
      </p>
      <div class="vazio__acoes">
        <NuxtLink to="/painel/equipe" class="btn btn--laranja">Ir para a equipe</NuxtLink>
      </div>
    </section>

    <!-- ============ sem expediente nesse dia ============ -->
    <section v-else-if="selecionado && !temExpediente" class="vazio">
      <p class="vazio__titulo">Sem expediente {{ tituloDia === 'Hoje' ? 'hoje' : 'nesse dia' }}</p>
      <p class="vazio__texto">
        Pela jornada cadastrada, não há atendimento neste dia da semana.
        Para mudar, ajuste os horários.
      </p>
      <div v-if="ehDono" class="vazio__acoes">
        <NuxtLink to="/painel/horarios" class="btn btn--fantasma">Ver horários</NuxtLink>
      </div>
    </section>

    <!-- ============ dia livre ============ -->
    <section v-else-if="selecionado && doDia.length === 0" class="vazio">
      <span class="vazio__icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
      </span>
      <p class="vazio__titulo">Dia livre</p>
      <p class="vazio__texto">Nenhum horário marcado. A cadeira está esperando.</p>
      <div class="vazio__acoes">
        <button class="btn btn--laranja" @click="abrirMarcacao">Marcar o primeiro</button>
      </div>
      <button
        v-if="canceladosDoDia && !mostrarCancelados"
        class="ver-cancelados"
        @click="mostrarCancelados = true"
      >
        Mostrar {{ canceladosDoDia }} cancelado{{ canceladosDoDia === 1 ? '' : 's' }}
      </button>
    </section>

    <!-- ============ a agenda do dia ============ -->
    <template v-else-if="selecionado">
      <ul class="fila">
        <li
          v-for="a in doDia"
          :key="a.id"
          class="hora"
          :class="{
            'hora--apagada': a.status === 'cancelado' || a.status === 'faltou',
            'hora--feita': a.status === 'concluido',
            'hora--menu': menuAberto === a.id,
          }"
        >
          <div class="hora__coluna">
            <span class="hora__inicio">{{ horaDe(a.inicio) }}</span>
            <span class="hora__fim">{{ horaDe(a.fim) }}</span>
          </div>

          <div class="hora__info">
            <div class="hora__linha1">
              <span class="hora__cliente">{{ carga.clientes.get(a.cliente_id)?.nome ?? 'Cliente' }}</span>
              <span class="selo" :class="`selo--${a.status}`">{{ SELOS[a.status] }}</span>
            </div>
            <p class="hora__servico">
              {{ carga.servicos.get(a.servico_id)?.nome ?? 'Serviço' }}
              <span class="hora__ponto">·</span>
              <span class="hora__preco">{{ precoDe(a) }}</span>
            </p>
            <p v-if="a.observacao" class="hora__obs">{{ a.observacao }}</p>
          </div>

          <div class="acoes" @pointerdown.stop>
            <button
              class="mais"
              :class="{ 'mais--on': menuAberto === a.id }"
              aria-label="Ações do atendimento"
              :aria-expanded="menuAberto === a.id"
              @click="menuAberto = menuAberto === a.id ? null : a.id"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </button>

            <Transition name="menu">
              <div v-if="menuAberto === a.id" class="menu-acoes" role="menu">
                <a v-if="zapDo(a)" role="menuitem" :href="zapDo(a)!" target="_blank" rel="noopener">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" /></svg>
                  WhatsApp
                </a>
                <button
                  v-if="a.status === 'pendente' || a.status === 'confirmado'"
                  role="menuitem"
                  :disabled="mexendo === a.id"
                  @click="mudarStatus(a, 'concluido')"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
                  Concluído
                </button>
                <button
                  v-if="a.status === 'pendente' || a.status === 'confirmado'"
                  role="menuitem"
                  :disabled="mexendo === a.id"
                  @click="mudarStatus(a, 'faltou')"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M6.5 6.5l11 11" /></svg>
                  Faltou
                </button>
                <hr v-if="a.status === 'pendente' || a.status === 'confirmado'" />
                <button
                  v-if="a.status === 'pendente' || a.status === 'confirmado'"
                  role="menuitem"
                  class="perigo"
                  @click="pedirCancelamento(a)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  Cancelar
                </button>
              </div>
            </Transition>
          </div>
        </li>
      </ul>

      <button
        v-if="canceladosDoDia && !mostrarCancelados"
        class="ver-cancelados"
        @click="mostrarCancelados = true"
      >
        Mostrar {{ canceladosDoDia }} cancelado{{ canceladosDoDia === 1 ? '' : 's' }}
      </button>
    </template>

    <!-- ============ marcar horário ============ -->
    <Teleport to="body">
      <div v-if="marcando" class="cortina" @click.self="fecharMarcacao">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">
            Marcar horário — {{ tituloDia.toLowerCase() }}, {{ dataExtenso }}
          </p>

          <p v-if="erroMarcacao" class="janela__erro">{{ erroMarcacao }}</p>

          <!-- passo 1: serviço -->
          <div v-if="passo === 1">
            <p class="janela__pergunta">Qual serviço?</p>
            <div class="opcoes">
              <button
                v-for="s in cardapio"
                :key="s.id"
                class="opcao"
                @click="escolherServico(s)"
              >
                <span class="opcao__nome">{{ s.nome }}</span>
                <span class="opcao__meta">{{ emTempo(s.duracao_min) }} · {{ dinheiro.format(Number(s.preco)) }}</span>
              </button>
            </div>
            <p v-if="!cardapio.length" class="janela__corpo">
              Nenhum serviço ativo. Cadastre em Serviços primeiro.
            </p>
          </div>

          <!-- passo 2: horário -->
          <div v-else-if="passo === 2">
            <button class="voltar" @click="passo = 1">← {{ escolha.servico?.nome }}</button>
            <p class="janela__pergunta">Que horas?</p>
            <div v-if="livres.length" class="grade-horas">
              <button
                v-for="m in livres"
                :key="m"
                class="chip-hora"
                @click="escolherMinuto(m)"
              >{{ rotuloMinuto(m) }}</button>
            </div>
            <p v-else class="janela__corpo">
              Nenhum horário livre para {{ escolha.servico?.nome?.toLowerCase() }}
              {{ ehHoje ? 'no restante de hoje' : 'nesse dia' }}.
            </p>
          </div>

          <!-- passo 3: cliente -->
          <div v-else>
            <button class="voltar" @click="passo = 2">
              ← {{ escolha.servico?.nome }}, {{ rotuloMinuto(escolha.minuto ?? 0) }}
            </button>
            <p class="janela__pergunta">Pra quem?</p>

            <label class="campo">
              <span>Buscar cliente</span>
              <input
                v-model="buscaCliente"
                placeholder="Nome ou telefone"
                :disabled="salvandoMarcacao"
              />
            </label>

            <div v-if="achados.length" class="achados">
              <button
                v-for="c in achados"
                :key="c.id"
                class="achado"
                @click="escolherCliente(c)"
              >
                <span>{{ c.nome }}</span>
                <span class="achado__tel">{{ c.telefone }}</span>
              </button>
            </div>

            <p v-if="clienteEscolhido" class="cliente-ok">
              ✓ {{ clienteEscolhido.nome }}
            </p>

            <button
              v-if="!criandoNovo && !clienteEscolhido"
              class="novo-cliente"
              @click="abrirNovoCliente"
            >+ Cliente novo</button>

            <template v-if="criandoNovo">
              <label class="campo">
                <span>Nome</span>
                <input v-model="novoCliente.nome" placeholder="Carlos Souza" :disabled="salvandoMarcacao" />
              </label>
              <label class="campo">
                <span>WhatsApp</span>
                <input
                  v-model="novoCliente.telefone"
                  inputmode="tel"
                  placeholder="(19) 99999-9999"
                  :disabled="salvandoMarcacao"
                />
              </label>
            </template>

            <div class="janela__acoes">
              <button class="btn btn--fantasma" :disabled="salvandoMarcacao" @click="fecharMarcacao">
                Cancelar
              </button>
              <button
                class="btn btn--laranja"
                :disabled="!podeConfirmar || salvandoMarcacao"
                @click="confirmarMarcacao"
              >
                {{ salvandoMarcacao ? 'Marcando…' : 'Confirmar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============ confirmar cancelamento ============ -->
    <Teleport to="body">
      <div v-if="confirmandoCancelamento" class="cortina" @click.self="confirmandoCancelamento = null">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Cancelar horário</p>
          <p class="janela__corpo">
            {{ carga.clientes.get(confirmandoCancelamento.cliente_id)?.nome ?? 'O cliente' }},
            {{ horaDe(confirmandoCancelamento.inicio) }} —
            o horário volta a ficar livre na agenda.
          </p>
          <div class="janela__acoes">
            <button class="btn btn--fantasma" @click="confirmandoCancelamento = null">Voltar</button>
            <button class="btn btn--laranja" @click="cancelar">Cancelar horário</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.topo {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
.titulo { margin: 0; color: var(--branco); }

/* ---------- botoes ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: var(--raio);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  text-decoration: none;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease,
    transform 0.16s ease;
}
.btn svg { width: 16px; height: 16px; }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--laranja {
  background: var(--laranja);
  color: #17100A;
  box-shadow: 0 12px 26px -14px color-mix(in srgb, var(--laranja) 55%, transparent);
}
.btn--laranja:hover:not(:disabled) { transform: translateY(-1px); }
.btn--laranja:active:not(:disabled) { transform: translateY(0) scale(0.98); }

.btn--fantasma {
  background: transparent;
  border-color: var(--linha);
  color: var(--cinza);
}
.btn--fantasma:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- primeiros passos ---------- */
.passos {
  padding: 16px 18px;
  margin-bottom: 18px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
}
.passos__rotulo {
  margin: 0 0 12px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 120%;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.passo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  color: var(--branco);
  text-decoration: none;
  font-size: 14.5px;
  font-weight: 600;
}
.passo__bola {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 99px;
  border: 1px solid var(--dourado-linha);
  color: var(--dourado);
  font-size: 12.5px;
  font-weight: 750;
}
.passo--feito .passo__bola { background: var(--dourado-suave); }
.passo--feito .passo__texto { color: var(--cinza-600); text-decoration: line-through; }
.passo--breve { opacity: 0.5; pointer-events: none; }
.passo__selo {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

/* ---------- navegação do dia ---------- */
.dia-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.dia-nav__seta {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 12px;
  color: var(--cinza);
  transition: border-color 0.16s ease, color 0.16s ease;
}
.dia-nav__seta:hover { border-color: var(--dourado-linha); color: var(--dourado); }
.dia-nav__seta svg { width: 17px; height: 17px; }
.dia-nav__meio { min-width: 0; }
.dia-nav__titulo {
  margin: 0;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--branco);
  text-transform: capitalize;
}
.dia-nav__data { margin: 2px 0 0; font-size: 12.5px; color: var(--cinza-600); }
.dia-nav__hoje {
  margin-left: auto;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--dourado-linha);
  border-radius: 99px;
  color: var(--dourado);
  font-family: var(--fonte-corpo);
  font-size: 12.5px;
  font-weight: 700;
}

/* ---------- seletor de barbeiro ---------- */
.quem {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.quem__chip {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 15px 7px 8px;
  min-height: 44px;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 99px;
  color: var(--cinza);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 650;
  white-space: nowrap;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.quem__chip--on {
  border-color: var(--dourado-linha);
  color: var(--dourado);
  background: var(--dourado-suave);
}
.quem__avatar {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  font-size: 13px;
  font-weight: 750;
}
.quem__avatar img { width: 100%; height: 100%; object-fit: cover; }

/* ---------- vazios ---------- */
.vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(34px, 7vw, 50px) 28px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 20px;
  text-align: center;
}
.vazio__icone {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 15px;
  border-radius: 99px;
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  color: var(--dourado);
}
.vazio__icone svg { width: 24px; height: 24px; }
.vazio__titulo {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.vazio__texto {
  margin: 0 auto 22px;
  max-width: 50ch;
  font-size: var(--tam-apoio);
  color: var(--cinza-600);
  line-height: 1.65;
}
.vazio__acoes { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.vazio .ver-cancelados { margin-top: 18px; }

/* ---------- a fila do dia ---------- */
.fila { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.hora {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 12px 13px 16px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
  transition: border-color 0.2s ease;
}
.hora:hover { border-color: var(--linha); }
.hora--apagada { opacity: 0.5; }
.hora--feita { opacity: 0.75; }
.hora--menu { z-index: 20; }

.hora__coluna {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  min-width: 48px;
  padding-right: 14px;
  border-right: 1px solid var(--linha-suave);
}
.hora__inicio {
  font-size: 16.5px;
  font-weight: 750;
  color: var(--dourado);
  font-variant-numeric: tabular-nums;
}
.hora__fim {
  font-size: 11.5px;
  color: var(--cinza-600);
  font-variant-numeric: tabular-nums;
}

.hora__info { flex: 1; min-width: 0; }
.hora__linha1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hora__cliente {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--branco);
}
.hora__servico {
  margin: 4px 0 0;
  font-size: var(--tam-apoio);
  color: var(--cinza);
}
.hora__ponto { color: var(--cinza-600); margin: 0 4px; }
.hora__preco { color: var(--dourado); font-weight: 700; font-variant-numeric: tabular-nums; }
.hora__obs { margin: 4px 0 0; font-size: 12.5px; color: var(--cinza-600); }

.selo {
  padding: 3px 9px;
  font-size: 10px;
  font-weight: 700;
  font-stretch: 115%;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza-600);
  white-space: nowrap;
}
.selo--confirmado { border-color: var(--dourado-linha); color: var(--dourado); background: var(--dourado-suave); }
.selo--faltou, .selo--cancelado { border-color: rgba(237, 112, 20, 0.4); color: var(--laranja-400); }

.ver-cancelados {
  margin-top: 12px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 12.5px;
  font-weight: 650;
  text-decoration: underline;
}

/* ---------- menu ⋯ ---------- */
.acoes { position: relative; flex-shrink: 0; }
.mais {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 12px;
  color: var(--cinza);
  transition: border-color 0.16s ease, color 0.16s ease;
}
.mais svg { width: 16px; height: 16px; }
.mais:hover, .mais--on { border-color: var(--dourado-linha); color: var(--dourado); }

.menu-acoes {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  min-width: 186px;
  padding: 6px;
  background: rgba(28, 21, 15, 0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--linha);
  border-radius: 16px;
  box-shadow: 0 24px 50px -12px rgba(0, 0, 0, 0.85);
}
.menu-acoes button,
.menu-acoes a {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 11px;
  font-family: var(--fonte-corpo);
  font-size: 14px;
  font-weight: 600;
  color: var(--branco);
  text-align: left;
  text-decoration: none;
  transition: background 0.14s ease;
}
.menu-acoes button:hover:not(:disabled),
.menu-acoes a:hover { background: rgba(255, 255, 255, 0.06); }
.menu-acoes button:disabled { opacity: 0.45; }
.menu-acoes svg { width: 16px; height: 16px; color: var(--cinza); flex-shrink: 0; }
.menu-acoes .perigo { color: var(--laranja); }
.menu-acoes .perigo svg { color: var(--laranja); }
.menu-acoes hr { border: none; border-top: 1px solid var(--linha-suave); margin: 4px 8px; }

.menu-enter-active, .menu-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-4px) scale(0.98); }

/* ---------- janela ---------- */
.cortina {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 6, 4, 0.72);
  backdrop-filter: blur(4px);
  animation: aparecer 0.16s ease;
}
@keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }

.janela {
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 26px 28px;
  background: rgba(28, 21, 15, 0.97);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--linha);
  border-radius: 20px;
  box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.9);
  animation: subir 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes subir {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.janela__rotulo {
  margin: 0 0 18px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 120%;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.janela__pergunta {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.janela__corpo {
  margin: 0;
  font-size: 14px;
  color: var(--cinza);
  line-height: 1.6;
}
.janela__erro {
  margin: 0 0 16px;
  padding: 11px 14px;
  border: 1px solid rgba(237, 112, 20, 0.4);
  background: rgba(237, 112, 20, 0.08);
  border-radius: var(--raio);
  font-size: 13.5px;
  color: var(--laranja-400);
  line-height: 1.55;
}
.janela__acoes {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.voltar {
  margin: 0 0 14px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 13px;
  font-weight: 650;
}
.voltar:hover { color: var(--cinza); }

/* passo 1: serviços */
.opcoes { display: flex; flex-direction: column; gap: 8px; }
.opcao {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 15px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--linha);
  border-radius: 14px;
  font-family: var(--fonte-corpo);
  text-align: left;
  transition: border-color 0.16s ease;
}
.opcao:hover { border-color: var(--dourado-linha); }
.opcao__nome { font-size: 15px; font-weight: 650; color: var(--branco); }
.opcao__meta { font-size: 12.5px; color: var(--cinza-600); white-space: nowrap; }

/* passo 2: grade de horas */
.grade-horas { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-hora {
  padding: 10px 14px;
  min-width: 68px;
  min-height: 42px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--linha);
  border-radius: 12px;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.chip-hora:hover { border-color: var(--dourado); color: var(--dourado); }

/* passo 3: cliente */
.campo { display: flex; flex-direction: column; margin-bottom: 14px; min-width: 0; }
.campo > span {
  margin-bottom: 7px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 118%;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo input {
  width: 100%;
  padding: 12px 13px;
  min-height: 44px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  color: var(--branco);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  border-radius: var(--raio);
}
.campo input:focus { outline: none; border-color: var(--dourado-linha); }
.campo input::placeholder { color: #5C5248; }

.achados {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: -6px 0 14px;
}
.achado {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 13px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--linha);
  border-radius: 12px;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  transition: border-color 0.16s ease;
}
.achado:hover { border-color: var(--dourado-linha); }
.achado__tel { color: var(--cinza-600); font-weight: 500; font-variant-numeric: tabular-nums; }

.cliente-ok {
  margin: 0 0 14px;
  font-size: 14.5px;
  font-weight: 650;
  color: var(--dourado);
}

.novo-cliente {
  margin: 0 0 6px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--dourado);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 700;
  text-align: left;
}

@media (max-width: 700px) {
  .topo { flex-direction: column; align-items: stretch; gap: 14px; }
  .topo .btn--laranja { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .hora, .mais, .chip-hora, .opcao, .achado,
  .menu-enter-active, .menu-leave-active { transition: none; }
  .cortina, .janela { animation: none; }
}
</style>