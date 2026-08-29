<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'painel' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono } = useAcesso()

useHead({ title: () => (ehDono.value ? 'Caixa — Agenda Do Barbeiro' : 'Meus ganhos — Agenda Do Barbeiro') })

/* ------------------------------------------------------------
   Tipos locais
   ------------------------------------------------------------ */
type BarbeiroCaixa = {
  id: string
  nome: string
  foto_url: string | null
  comissao_pct: number | null
  meta_mes: number | null
}

type Concluido = {
  barbeiro_id: string
  servico_id: string
  preco_cobrado: number | null
  inicio: string
}

/* ------------------------------------------------------------
   O período: dia, mês ou ano, com uma âncora que as setas movem.
   ------------------------------------------------------------ */
type Modo = 'dia' | 'mes' | 'ano'
const modo = ref<Modo>('dia')
const ancora = ref(new Date(new Date().setHours(0, 0, 0, 0)))

function mudarPeriodo(delta: number) {
  const a = ancora.value
  if (modo.value === 'dia') ancora.value = new Date(a.getFullYear(), a.getMonth(), a.getDate() + delta)
  else if (modo.value === 'mes') ancora.value = new Date(a.getFullYear(), a.getMonth() + delta, 1)
  else ancora.value = new Date(a.getFullYear() + delta, 0, 1)
}

function trocarModo(m: Modo) {
  modo.value = m
  const hoje = new Date(new Date().setHours(0, 0, 0, 0))
  if (m === 'dia') ancora.value = hoje
  else if (m === 'mes') ancora.value = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  else ancora.value = new Date(hoje.getFullYear(), 0, 1)
}

const janela = computed(() => {
  const a = ancora.value
  if (modo.value === 'dia') {
    return { ini: a, fim: new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1) }
  }
  if (modo.value === 'mes') {
    return { ini: new Date(a.getFullYear(), a.getMonth(), 1), fim: new Date(a.getFullYear(), a.getMonth() + 1, 1) }
  }
  return { ini: new Date(a.getFullYear(), 0, 1), fim: new Date(a.getFullYear() + 1, 0, 1) }
})

const rotuloPeriodo = computed(() => {
  const a = ancora.value
  if (modo.value === 'dia') {
    const hoje = new Date(new Date().setHours(0, 0, 0, 0))
    const diff = Math.round((a.getTime() - hoje.getTime()) / 86400000)
    if (diff === 0) return 'Hoje'
    if (diff === -1) return 'Ontem'
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).format(a)
  }
  if (modo.value === 'mes') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(a)
  }
  return String(a.getFullYear())
})

const noFuturo = computed(() => janela.value.fim.getTime() > Date.now())

/* ------------------------------------------------------------
   Cargas
   ------------------------------------------------------------ */
const souBarbeiro = computed(() => contexto.value?.papel === 'barbeiro')

const { data: barbeiros, refresh: recarregarBarbeiros } = await useAsyncData<BarbeiroCaixa[]>(
  'caixa-barbeiros',
  async () => {
    let q = supabase
      .from('perfis')
      .select('id, nome, foto_url, comissao_pct, meta_mes')
      .eq('atende', true)
      .eq('status', 'ativo')
      .eq('barbearia_id', contexto.value?.barbearia_id ?? '')
      .order('nome', { ascending: true })
    if (souBarbeiro.value && contexto.value) q = q.eq('id', contexto.value.perfil_id)
    const { data } = await q
    return (data ?? []) as BarbeiroCaixa[]
  },
  { default: () => [] as BarbeiroCaixa[] }
)

const { data: nomesServicos } = await useAsyncData<Map<string, string>>(
  'caixa-servicos',
  async () => {
    const { data } = await supabase
      .from('servicos')
      .select('id, nome')
      .eq('barbearia_id', contexto.value?.barbearia_id ?? '')
    const m = new Map<string, string>()
    for (const s of data ?? []) m.set((s as { id: string }).id, (s as { nome: string }).nome)
    return m
  },
  { default: () => new Map<string, string>() }
)

const { data: concluidos } = await useAsyncData<Concluido[]>(
  'caixa-concluidos',
  async () => {
    let q = supabase
      .from('agendamentos')
      .select('barbeiro_id, servico_id, preco_cobrado, inicio')
      .eq('barbearia_id', contexto.value?.barbearia_id ?? '')
      .eq('status', 'concluido')
      .gte('inicio', janela.value.ini.toISOString())
      .lt('inicio', janela.value.fim.toISOString())
    if (souBarbeiro.value && contexto.value) q = q.eq('barbeiro_id', contexto.value.perfil_id)
    const { data } = await q
    return (data ?? []) as Concluido[]
  },
  { default: () => [] as Concluido[], watch: [modo, ancora] }
)

/* ------------------------------------------------------------
   As somas
   ------------------------------------------------------------ */
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function valorDe(c: Concluido): number {
  return Number(c.preco_cobrado ?? 0)
}

const total = computed(() => concluidos.value.reduce((s, c) => s + valorDe(c), 0))
const quantos = computed(() => concluidos.value.length)
const ticketMedio = computed(() => (quantos.value ? total.value / quantos.value : 0))

const porBarbeiro = computed(() => {
  const mapa = new Map<string, { produzido: number; atendimentos: number }>()
  for (const c of concluidos.value) {
    const atual = mapa.get(c.barbeiro_id) ?? { produzido: 0, atendimentos: 0 }
    atual.produzido += valorDe(c)
    atual.atendimentos += 1
    mapa.set(c.barbeiro_id, atual)
  }
  return barbeiros.value
    .map((b) => {
      const n = mapa.get(b.id) ?? { produzido: 0, atendimentos: 0 }
      const parteBarbeiro = b.comissao_pct !== null ? (n.produzido * Number(b.comissao_pct)) / 100 : null
      return {
        ...b,
        produzido: n.produzido,
        atendimentos: n.atendimentos,
        ticket: n.atendimentos ? n.produzido / n.atendimentos : 0,
        parteBarbeiro,
        parteCasa: parteBarbeiro !== null ? n.produzido - parteBarbeiro : null,
      }
    })
    .sort((a, b) => b.produzido - a.produzido)
})

const porServico = computed(() => {
  const mapa = new Map<string, { total: number; qtd: number }>()
  for (const c of concluidos.value) {
    const atual = mapa.get(c.servico_id) ?? { total: 0, qtd: 0 }
    atual.total += valorDe(c)
    atual.qtd += 1
    mapa.set(c.servico_id, atual)
  }
  return [...mapa.entries()]
    .map(([id, n]) => ({ id, nome: nomesServicos.value.get(id) ?? 'Serviço', ...n }))
    .sort((a, b) => b.total - a.total)
})

const maiorPorServico = computed(() => porServico.value[0]?.total ?? 0)

/* o barbeiro logado, quando for o caso */
const meu = computed(() => porBarbeiro.value[0] ?? null)

const metaPct = computed(() => {
  const b = meu.value
  if (!b || b.meta_mes === null || modo.value !== 'mes' || !Number(b.meta_mes)) return null
  return Math.min(100, Math.round((b.produzido / Number(b.meta_mes)) * 100))
})

/* ------------------------------------------------------------
   Dono configura a cadeira: comissão % e meta do mês
   ------------------------------------------------------------ */
const configurando = ref<BarbeiroCaixa | null>(null)
const salvandoConfig = ref(false)
const erroConfig = ref('')
const form = reactive({ comissao: '', meta: '' })

function abrirConfig(b: BarbeiroCaixa) {
  form.comissao = b.comissao_pct === null ? '' : String(b.comissao_pct)
  form.meta = b.meta_mes === null ? '' : String(b.meta_mes)
  erroConfig.value = ''
  configurando.value = b
}

async function salvarConfig() {
  const b = configurando.value
  if (!b) return

  const comissao = form.comissao.trim() === '' ? null : Number(form.comissao.replace(',', '.'))
  const meta = form.meta.trim() === '' ? null : Number(form.meta.replace(',', '.'))

  if (comissao !== null && (Number.isNaN(comissao) || comissao <= 0 || comissao > 100)) {
    erroConfig.value = 'A comissão precisa ser um número entre 1 e 100.'
    return
  }
  if (meta !== null && (Number.isNaN(meta) || meta < 0)) {
    erroConfig.value = 'A meta precisa ser um valor em reais.'
    return
  }

  salvandoConfig.value = true
  const { error } = await supabase
    .from('perfis')
    .update({ comissao_pct: comissao, meta_mes: meta })
    .eq('id', b.id)
  salvandoConfig.value = false

  if (error) {
    erroConfig.value = error.message
    return
  }

  configurando.value = null
  await recarregarBarbeiros()
}

onMounted(() => {
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && configurando.value) configurando.value = null
  }
  window.addEventListener('keydown', aoTeclar)
  onUnmounted(() => window.removeEventListener('keydown', aoTeclar))
})
</script>

<template>
  <div>
    <header class="topo">
      <div>
        <h1 class="titulo">{{ ehDono ? 'Caixa' : 'Meus ganhos' }}</h1>
        <p class="subtitulo">
          {{ ehDono ? 'O que a barbearia produziu, somando os atendimentos concluídos.' : 'O que você produziu, somando os atendimentos concluídos.' }}
        </p>
      </div>
    </header>

    <!-- ============ período ============ -->
    <div class="periodo">
      <div class="abas" role="tablist">
        <button
          v-for="m in (['dia', 'mes', 'ano'] as const)"
          :key="m"
          class="aba"
          :class="{ 'aba--on': modo === m }"
          role="tab"
          :aria-selected="modo === m"
          @click="trocarModo(m)"
        >{{ m === 'dia' ? 'Dia' : m === 'mes' ? 'Mês' : 'Ano' }}</button>
      </div>

      <div class="periodo-nav">
        <button class="periodo-nav__seta" aria-label="Período anterior" @click="mudarPeriodo(-1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <p class="periodo-nav__rotulo">{{ rotuloPeriodo }}</p>
        <button
          class="periodo-nav__seta"
          aria-label="Próximo período"
          :disabled="noFuturo"
          @click="mudarPeriodo(1)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>

    <!-- ============ o número grande ============ -->
    <section class="hero">
      <p class="hero__rotulo">{{ ehDono ? 'Produzido no período' : 'Você produziu' }}</p>
      <p class="hero__valor">{{ dinheiro.format(souBarbeiro ? (meu?.produzido ?? 0) : total) }}</p>
      <p class="hero__apoio">
        {{ souBarbeiro ? (meu?.atendimentos ?? 0) : quantos }} atendimento{{ (souBarbeiro ? (meu?.atendimentos ?? 0) : quantos) === 1 ? '' : 's' }}
        <template v-if="(souBarbeiro ? (meu?.atendimentos ?? 0) : quantos) > 0">
          · ticket médio {{ dinheiro.format(souBarbeiro ? (meu?.ticket ?? 0) : ticketMedio) }}
        </template>
      </p>

      <!-- a parte do barbeiro comissionado -->
      <div v-if="souBarbeiro && meu && meu.parteBarbeiro !== null" class="hero__parte">
        Sua parte ({{ meu.comissao_pct }}%):
        <strong>{{ dinheiro.format(meu.parteBarbeiro) }}</strong>
      </div>

      <!-- a meta do mês -->
      <div v-if="souBarbeiro && metaPct !== null && meu" class="meta">
        <div class="meta__linha">
          <span>Meta do mês</span>
          <span class="meta__pct">{{ metaPct }}%</span>
        </div>
        <div class="meta__trilho">
          <div class="meta__barra" :style="{ width: `${metaPct}%` }" />
        </div>
        <p class="meta__apoio">{{ dinheiro.format(meu.produzido) }} de {{ dinheiro.format(Number(meu.meta_mes)) }}</p>
      </div>
    </section>

    <!-- ============ nada no período ============ -->
    <section v-if="quantos === 0" class="vazio">
      <p class="vazio__titulo">Nada concluído {{ modo === 'dia' ? 'nesse dia' : modo === 'mes' ? 'nesse mês' : 'nesse ano' }}</p>
      <p class="vazio__texto">
        Aqui entram os atendimentos marcados como <strong>Concluído</strong> na agenda.
        Terminou o corte? Toca no ⋯ do horário e marca concluído — o valor entra na hora.
      </p>
    </section>

    <template v-else>
      <!-- ============ por barbeiro (dono) ============ -->
      <section v-if="ehDono" class="bloco">
        <p class="bloco__rotulo">Por barbeiro</p>
        <ul class="lista">
          <li v-for="b in porBarbeiro" :key="b.id" class="linha">
            <span class="linha__avatar">
              <img v-if="b.foto_url" :src="b.foto_url" alt="" />
              <template v-else>{{ (b.nome.trim()[0] ?? '?').toUpperCase() }}</template>
            </span>
            <div class="linha__info">
              <p class="linha__nome">{{ b.nome }}</p>
              <p class="linha__apoio">
                {{ b.atendimentos }} atendimento{{ b.atendimentos === 1 ? '' : 's' }}
                <template v-if="b.atendimentos"> · ticket {{ dinheiro.format(b.ticket) }}</template>
              </p>
              <p v-if="b.parteCasa !== null" class="linha__partes">
                Barbeiro ({{ b.comissao_pct }}%): {{ dinheiro.format(b.parteBarbeiro ?? 0) }}
                <span class="linha__ponto">·</span>
                Casa: {{ dinheiro.format(b.parteCasa) }}
              </p>
            </div>
            <div class="linha__fim">
              <p class="linha__valor">{{ dinheiro.format(b.produzido) }}</p>
              <button class="engrenagem" aria-label="Configurar a cadeira" @click="abrirConfig(b)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- ============ por serviço ============ -->
      <section class="bloco">
        <p class="bloco__rotulo">Por serviço</p>
        <ul class="lista">
          <li v-for="s in porServico" :key="s.id" class="servico">
            <div class="servico__cima">
              <p class="servico__nome">{{ s.nome }}</p>
              <p class="servico__valor">{{ dinheiro.format(s.total) }}</p>
            </div>
            <div class="servico__trilho">
              <div
                class="servico__barra"
                :style="{ width: `${maiorPorServico ? Math.max(4, Math.round((s.total / maiorPorServico) * 100)) : 0}%` }"
              />
            </div>
            <p class="servico__apoio">{{ s.qtd }} vez{{ s.qtd === 1 ? '' : 'es' }}</p>
          </li>
        </ul>
      </section>
    </template>

    <!-- ============ configurar a cadeira ============ -->
    <Teleport to="body">
      <div v-if="configurando" class="cortina" @click.self="configurando = null">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Como funciona a cadeira</p>
          <p class="janela__nome">{{ configurando.nome }}</p>
          <p class="janela__corpo">
            Os dois campos são opcionais. Deixe em branco o que não se aplica —
            barbeiro registrado, por exemplo, costuma ficar sem comissão.
          </p>

          <p v-if="erroConfig" class="janela__erro">{{ erroConfig }}</p>

          <label class="campo">
            <span>Comissão do barbeiro (%)</span>
            <input
              v-model="form.comissao"
              inputmode="decimal"
              placeholder="Ex.: 50 — ou deixe vazio"
              :disabled="salvandoConfig"
            />
          </label>

          <label class="campo">
            <span>Meta do mês (R$)</span>
            <input
              v-model="form.meta"
              inputmode="decimal"
              placeholder="Ex.: 4000 — ou deixe vazio"
              :disabled="salvandoConfig"
            />
          </label>

          <div class="janela__acoes">
            <button class="btn btn--fantasma" :disabled="salvandoConfig" @click="configurando = null">Cancelar</button>
            <button class="btn btn--laranja" :disabled="salvandoConfig" @click="salvarConfig">
              {{ salvandoConfig ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.topo { margin-bottom: 18px; }
.titulo { margin: 0 0 6px; color: var(--branco); }
.subtitulo { margin: 0; font-size: var(--tam-apoio); color: var(--cinza-600); line-height: 1.6; }

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
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.16s ease;
}
.btn:disabled { opacity: 0.45; cursor: default; }
.btn--laranja {
  background: var(--laranja);
  color: #FFFFFF;
  box-shadow: 0 12px 26px -14px color-mix(in srgb, var(--laranja) 55%, transparent);
}
.btn--laranja:hover:not(:disabled) { transform: translateY(-1px); }
.btn--fantasma { background: transparent; border-color: var(--linha); color: var(--cinza); }
.btn--fantasma:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- período ---------- */
.periodo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.abas {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 99px;
}
.aba {
  padding: 8px 18px;
  min-height: 38px;
  background: transparent;
  border: none;
  border-radius: 99px;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 700;
  transition: background 0.16s ease, color 0.16s ease;
}
.aba--on { background: var(--dourado-suave); color: var(--dourado); }

.periodo-nav { display: flex; align-items: center; gap: 12px; }
.periodo-nav__seta {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 12px;
  color: var(--cinza);
  transition: border-color 0.16s ease, color 0.16s ease;
}
.periodo-nav__seta:hover:not(:disabled) { border-color: var(--dourado-linha); color: var(--dourado); }
.periodo-nav__seta:disabled { opacity: 0.35; }
.periodo-nav__seta svg { width: 16px; height: 16px; }
.periodo-nav__rotulo {
  margin: 0;
  min-width: 120px;
  text-align: center;
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.015em;
  color: var(--branco);
  text-transform: capitalize;
}

/* ---------- o número grande ---------- */
.hero {
  padding: 26px 24px;
  margin-bottom: 14px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 20px;
}
.hero__rotulo {
  margin: 0 0 8px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.hero__valor {
  margin: 0;
  font-size: clamp(34px, 7vw, 46px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--branco);
  font-variant-numeric: tabular-nums;
}
.hero__apoio { margin: 6px 0 0; font-size: var(--tam-apoio); color: var(--cinza-600); }

.hero__parte {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--linha-suave);
  font-size: 15px;
  color: var(--cinza);
}
.hero__parte strong { color: var(--dourado); font-weight: 750; font-variant-numeric: tabular-nums; }

.meta { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--linha-suave); }
.meta__linha {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--cinza);
}
.meta__pct { color: var(--dourado); font-weight: 750; }
.meta__trilho {
  height: 8px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 99px;
  overflow: hidden;
}
.meta__barra {
  height: 100%;
  background: linear-gradient(90deg, var(--dourado), var(--laranja));
  border-radius: 99px;
  transition: width 0.4s ease;
}
.meta__apoio { margin: 7px 0 0; font-size: 12.5px; color: var(--cinza-600); }

/* ---------- vazio ---------- */
.vazio {
  padding: clamp(30px, 6vw, 44px) 28px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 20px;
  text-align: center;
}
.vazio__titulo { margin: 0 0 8px; font-size: 17px; font-weight: 750; letter-spacing: -0.02em; color: var(--branco); }
.vazio__texto { margin: 0 auto; max-width: 52ch; font-size: var(--tam-apoio); color: var(--cinza-600); line-height: 1.65; }
.vazio__texto strong { color: var(--dourado); font-weight: 700; }

/* ---------- blocos ---------- */
.bloco { margin-bottom: 16px; }
.bloco__rotulo {
  margin: 0 0 10px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

/* por barbeiro */
.linha {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 14px 14px 16px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
}
.linha__avatar {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 99px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  color: var(--dourado);
  font-size: 16px;
  font-weight: 750;
}
.linha__avatar img { width: 100%; height: 100%; object-fit: cover; }
.linha__info { flex: 1; min-width: 0; }
.linha__nome { margin: 0; font-size: 15.5px; font-weight: 650; letter-spacing: -0.015em; color: var(--branco); }
.linha__apoio { margin: 3px 0 0; font-size: 12.5px; color: var(--cinza-600); }
.linha__partes { margin: 5px 0 0; font-size: 12.5px; color: var(--cinza); }
.linha__ponto { color: var(--cinza-600); margin: 0 5px; }
.linha__fim { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.linha__valor {
  margin: 0;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--dourado);
  font-variant-numeric: tabular-nums;
}
.engrenagem {
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
.engrenagem svg { width: 16px; height: 16px; }
.engrenagem:hover { border-color: var(--dourado-linha); color: var(--dourado); }

/* por serviço */
.servico {
  padding: 14px 16px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
}
.servico__cima { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.servico__nome { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.015em; color: var(--branco); }
.servico__valor { margin: 0; font-size: 15px; font-weight: 750; color: var(--dourado); font-variant-numeric: tabular-nums; }
.servico__trilho {
  height: 6px;
  margin-top: 10px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 99px;
  overflow: hidden;
}
.servico__barra {
  height: 100%;
  background: linear-gradient(90deg, var(--dourado), var(--laranja));
  border-radius: 99px;
  transition: width 0.4s ease;
}
.servico__apoio { margin: 7px 0 0; font-size: 12px; color: var(--cinza-600); }

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
  max-width: 440px;
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
  margin: 0 0 6px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.janela__nome { margin: 0 0 10px; font-size: 18px; font-weight: 750; letter-spacing: -0.02em; color: var(--branco); }
.janela__corpo { margin: 0 0 18px; font-size: 13.5px; color: var(--cinza-600); line-height: 1.6; }
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
.janela__acoes { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }

.campo { display: flex; flex-direction: column; margin-bottom: 14px; }
.campo > span {
  margin-bottom: 7px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
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

@media (max-width: 700px) {
  .periodo { flex-direction: column; align-items: stretch; }
  .abas { justify-content: center; }
  .periodo-nav { justify-content: space-between; }
  .linha { flex-wrap: wrap; }
  .linha__fim { margin-left: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .aba, .engrenagem, .meta__barra, .servico__barra { transition: none; }
  .cortina, .janela { animation: none; }
}
</style>