<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Horários — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono } = useAcesso()

type Faixa = { inicio: string; fim: string }
type BarbeiroResumo = { id: string; nome: string; foto_url: string | null }
type BloqueioLinha = { id: string; inicio: string; fim: string; motivo: string | null }

/* ------------------------------------------------------------
   Dias da semana.

   Convenção: dia_semana segue o padrão do Postgres e do
   JavaScript — 0 é domingo, 6 é sábado. A semana é exibida
   começando na segunda porque é assim que barbearia pensa.
   Se no seu SQL a convenção for outra, só ajustar os números aqui.
   ------------------------------------------------------------ */
const DIAS = [
  { n: 1, nome: 'Segunda', curto: 'seg' },
  { n: 2, nome: 'Terça', curto: 'ter' },
  { n: 3, nome: 'Quarta', curto: 'qua' },
  { n: 4, nome: 'Quinta', curto: 'qui' },
  { n: 5, nome: 'Sexta', curto: 'sex' },
  { n: 6, nome: 'Sábado', curto: 'sáb' },
  { n: 0, nome: 'Domingo', curto: 'dom' },
]

/* ------------------------------------------------------------
   De quem é o horário na tela.
   Dono escolhe o barbeiro; barbeiro vê o próprio, sem escolher.
   ------------------------------------------------------------ */
const { data: barbeiros } = await useAsyncData<BarbeiroResumo[]>(
  'horarios-barbeiros',
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

// O contexto chega depois do primeiro render — o watch espera por ele
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
   Jornadas e bloqueios do barbeiro selecionado
   ------------------------------------------------------------ */
const { data: carga, refresh } = await useAsyncData(
  'horarios-carga',
  async () => {
    if (!selecionado.value) {
      return { jornadas: [] as { dia_semana: number; inicio: string; fim: string }[], bloqueios: [] as BloqueioLinha[] }
    }
    const [j, b] = await Promise.all([
      supabase
        .from('jornadas')
        .select('dia_semana, inicio, fim')
        .eq('barbeiro_id', selecionado.value),
      supabase
        .from('bloqueios')
        .select('id, inicio, fim, motivo')
        .eq('barbeiro_id', selecionado.value)
        .gte('fim', new Date().toISOString())
        .order('inicio', { ascending: true }),
    ])
    return {
      jornadas: (j.data ?? []) as { dia_semana: number; inicio: string; fim: string }[],
      bloqueios: (b.data ?? []) as BloqueioLinha[],
    }
  },
  {
    default: () => ({ jornadas: [], bloqueios: [] }),
    watch: [selecionado],
  }
)

/* ------------------------------------------------------------
   A semana editável.

   `semana` é uma cópia local: 7 listas de faixas, uma por dia.
   Editar mexe só na cópia; "Salvar" grava tudo de uma vez.
   `retrato` é a foto de como estava ao carregar — comparar os
   dois é o que acende a barra de alterações não salvas.
   ------------------------------------------------------------ */
const semana = ref<Faixa[][]>(Array.from({ length: 7 }, () => []))
const retrato = ref('')

function normalizada(s: Faixa[][]): string {
  return JSON.stringify(
    s.map((faixas) =>
      faixas
        .map((f) => ({ inicio: f.inicio.slice(0, 5), fim: f.fim.slice(0, 5) }))
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
    )
  )
}

function montarSemana() {
  const nova: Faixa[][] = Array.from({ length: 7 }, () => [])
  for (const j of carga.value.jornadas) {
    nova[j.dia_semana]?.push({ inicio: j.inicio.slice(0, 5), fim: j.fim.slice(0, 5) })
  }
  for (const faixas of nova) faixas.sort((a, b) => a.inicio.localeCompare(b.inicio))
  semana.value = nova
  retrato.value = normalizada(nova)
}

watch(carga, montarSemana, { immediate: true })

const sujo = computed(() => normalizada(semana.value) !== retrato.value)
const diasAtivos = computed(() => semana.value.filter((f) => f.length > 0).length)

function faixasDe(n: number): Faixa[] {
  return semana.value[n] ?? []
}

function ligarDia(n: number) {
  const faixas = faixasDe(n)
  if (faixas.length) semana.value[n] = []
  else semana.value[n] = [{ inicio: '09:00', fim: '19:00' }]
}

function novaFaixa(n: number) {
  faixasDe(n).push({ inicio: '13:00', fim: '19:00' })
}

function tirarFaixa(n: number, i: number) {
  faixasDe(n).splice(i, 1)
}

/* ------------------------------------------------------------
   Fechar um período dentro do expediente (almoço, folga da tarde).

   O dono digita a PAUSA — do jeito que ele pensa — e a faixa
   que a contém é dividida em duas sozinha:
   08–18 com pausa 12–13 vira 08–12 e 13–18.
   ------------------------------------------------------------ */
const pausando = ref<number | null>(null)
const pausa = reactive({ inicio: '12:00', fim: '13:00' })
const erroPausa = ref('')

function abrirPausa(n: number) {
  erroPausa.value = ''
  Object.assign(pausa, { inicio: '12:00', fim: '13:00' })
  pausando.value = pausando.value === n ? null : n
}

function aplicarPausa(n: number) {
  erroPausa.value = ''

  if (!pausa.inicio || !pausa.fim || pausa.fim <= pausa.inicio) {
    erroPausa.value = 'O fim da pausa precisa ser depois do início.'
    return
  }

  const faixas = faixasDe(n)
  const i = faixas.findIndex((f) => pausa.inicio >= f.inicio && pausa.fim <= f.fim)
  if (i === -1) {
    erroPausa.value = 'A pausa precisa caber dentro do horário de atendimento.'
    return
  }

  const f = faixas[i]!
  const pedacos: Faixa[] = []
  if (pausa.inicio > f.inicio) pedacos.push({ inicio: f.inicio, fim: pausa.inicio })
  if (pausa.fim < f.fim) pedacos.push({ inicio: pausa.fim, fim: f.fim })
  faixas.splice(i, 1, ...pedacos)

  pausando.value = null
}

/* copiar um dia para os outros */
const copiando = ref<number | null>(null)

function aplicarCopia(origem: number, destino: number | 'todos') {
  const faixas = faixasDe(origem).map((f) => ({ ...f }))
  if (destino === 'todos') {
    for (const d of DIAS) {
      if (d.n !== origem) semana.value[d.n] = faixas.map((f) => ({ ...f }))
    }
  } else {
    semana.value[destino] = faixas
  }
  copiando.value = null
}

/* ------------------------------------------------------------
   Salvar a semana: valida, apaga a jornada antiga do barbeiro
   e grava a nova. Simples e sem estado intermediário.
   ------------------------------------------------------------ */
const salvandoSemana = ref(false)
const erroSemana = ref('')

function validar(): string {
  for (const d of DIAS) {
    const faixas = [...faixasDe(d.n)].sort((a, b) => a.inicio.localeCompare(b.inicio))
    for (let i = 0; i < faixas.length; i++) {
      const f = faixas[i]!
      if (!f.inicio || !f.fim) return `${d.nome}: preencha início e fim.`
      if (f.fim <= f.inicio) return `${d.nome}: o fim precisa ser depois do início.`
      if (i > 0 && f.inicio < faixas[i - 1]!.fim) {
        return `${d.nome}: as faixas estão se sobrepondo.`
      }
    }
  }
  return ''
}

async function salvarSemana() {
  if (!selecionado.value) return
  erroSemana.value = validar()
  if (erroSemana.value) return

  const linhas: { barbeiro_id: string; dia_semana: number; inicio: string; fim: string }[] = []
  for (const d of DIAS) {
    for (const f of faixasDe(d.n)) {
      linhas.push({
        barbeiro_id: selecionado.value,
        dia_semana: d.n,
        inicio: f.inicio,
        fim: f.fim,
      })
    }
  }

  salvandoSemana.value = true

  const { error: erroLimpa } = await supabase
    .from('jornadas')
    .delete()
    .eq('barbeiro_id', selecionado.value)

  if (erroLimpa) {
    salvandoSemana.value = false
    erroSemana.value = erroLimpa.message
    return
  }

  if (linhas.length) {
    const { error: erroGrava } = await supabase.from('jornadas').insert(linhas)
    if (erroGrava) {
      salvandoSemana.value = false
      erroSemana.value = erroGrava.message
      await refresh()
      return
    }
  }

  salvandoSemana.value = false
  await refresh()
}

function descartar() {
  erroSemana.value = ''
  montarSemana()
}

/* ------------------------------------------------------------
   Bloqueios: folga, médico, feriado, férias
   ------------------------------------------------------------ */
const abrindoBloqueio = ref(false)
const salvandoBloqueio = ref(false)
const erroBloqueio = ref('')

const formBloqueio = reactive({ inicio: '', fim: '', motivo: '' })

function novoBloqueio() {
  Object.assign(formBloqueio, { inicio: '', fim: '', motivo: '' })
  erroBloqueio.value = ''
  abrindoBloqueio.value = true
}

async function salvarBloqueio() {
  erroBloqueio.value = ''

  if (!formBloqueio.inicio || !formBloqueio.fim) {
    erroBloqueio.value = 'Preencha início e fim.'
    return
  }
  const inicio = new Date(formBloqueio.inicio)
  const fim = new Date(formBloqueio.fim)
  if (fim <= inicio) {
    erroBloqueio.value = 'O fim precisa ser depois do início.'
    return
  }

  salvandoBloqueio.value = true
  const { error } = await supabase.from('bloqueios').insert({
    barbeiro_id: selecionado.value ?? '',
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    motivo: formBloqueio.motivo.trim() || null,
  })
  salvandoBloqueio.value = false

  if (error) {
    erroBloqueio.value = error.message
    return
  }

  abrindoBloqueio.value = false
  await refresh()
}

const removendoBloqueio = ref<string | null>(null)

async function removerBloqueio(id: string) {
  removendoBloqueio.value = id
  await supabase.from('bloqueios').delete().eq('id', id)
  removendoBloqueio.value = null
  await refresh()
}

/* ------------------------------------------------------------
   Formatação
   ------------------------------------------------------------ */
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

function emPeriodo(b: BloqueioLinha): string {
  const i = new Date(b.inicio)
  const f = new Date(b.fim)
  const mesmoDia = i.toDateString() === f.toDateString()
  if (mesmoDia) {
    return `${fmtDia.format(i)} · ${fmtHora.format(i)} — ${fmtHora.format(f)}`
  }
  return `${fmtDia.format(i)} ${fmtHora.format(i)} — ${fmtDia.format(f)} ${fmtHora.format(f)}`
}

function inicial(nome: string) {
  return (nome.trim()[0] ?? '?').toUpperCase()
}

onMounted(() => {
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (abrindoBloqueio.value) abrindoBloqueio.value = false
    else if (pausando.value !== null) pausando.value = null
    else if (copiando.value !== null) copiando.value = null
  }
  window.addEventListener('keydown', aoTeclar)
  onUnmounted(() => window.removeEventListener('keydown', aoTeclar))
})
</script>

<template>
  <div>
    <header class="topo">
      <div class="topo__textos">
        <div class="topo__linha">
          <h1 class="titulo">Horários</h1>
          <span v-if="selecionado" class="pill">
            {{ diasAtivos }} dia{{ diasAtivos === 1 ? '' : 's' }} de atendimento
          </span>
        </div>
        <p class="topo__sub">
          {{ ehDono
            ? 'O expediente de cada barbeiro define os horários livres na página de agendamento.'
            : 'Estes são os seus horários. Quem os define é o dono da barbearia.' }}
        </p>
      </div>
    </header>

    <!-- ============ dono sem equipe ============ -->
    <section v-if="ehDono && !barbeiros.length" class="vazio">
      <p class="vazio__titulo">Antes dos horários, a equipe</p>
      <p class="vazio__texto">
        Os horários pertencem a cada barbeiro. Cadastre o primeiro na tela de
        equipe e volte aqui para montar o expediente dele.
      </p>
      <div class="vazio__acoes">
        <NuxtLink to="/painel/equipe" class="btn btn--laranja">Ir para a equipe</NuxtLink>
      </div>
    </section>

    <template v-else-if="selecionado">
      <!-- ============ seletor de barbeiro (só dono) ============ -->
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
            <template v-else>{{ inicial(b.nome) }}</template>
          </span>
          {{ b.nome }}
        </button>
      </div>

      <!-- ============ barra de alterações ============ -->
      <div v-if="sujo && ehDono" class="barra-salvar">
        <span>Alterações não salvas</span>
        <div class="barra-salvar__acoes">
          <button class="btn btn--pequeno btn--fantasma" :disabled="salvandoSemana" @click="descartar">
            Descartar
          </button>
          <button class="btn btn--pequeno btn--laranja" :disabled="salvandoSemana" @click="salvarSemana">
            {{ salvandoSemana ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </div>

      <p v-if="erroSemana" class="erro-geral">{{ erroSemana }}</p>

      <!-- ============ a semana ============ -->
      <ul class="semana">
        <li
          v-for="d in DIAS"
          :key="d.n"
          class="dia"
          :class="{ 'dia--fechado': !faixasDe(d.n).length }"
        >
          <div class="dia__cabeca">
            <label v-if="ehDono" class="dia__liga">
              <input
                type="checkbox"
                :checked="faixasDe(d.n).length > 0"
                @change="ligarDia(d.n)"
              />
              <span class="dia__nome">{{ d.nome }}</span>
            </label>
            <span v-else class="dia__nome">{{ d.nome }}</span>

            <button
              v-if="ehDono && faixasDe(d.n).length"
              class="dia__copiar"
              :aria-expanded="copiando === d.n"
              @click="copiando = copiando === d.n ? null : d.n"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" /></svg>
              copiar
            </button>
          </div>

          <!-- fechado -->
          <p v-if="!faixasDe(d.n).length" class="dia__fechado-texto">Fechado</p>

          <!-- faixas -->
          <template v-else>
            <div v-for="(f, i) in faixasDe(d.n)" :key="i" class="faixa">
              <template v-if="ehDono">
                <input v-model="f.inicio" type="time" class="faixa__hora" />
                <span class="faixa__ate">—</span>
                <input v-model="f.fim" type="time" class="faixa__hora" />
                <button
                  v-if="faixasDe(d.n).length > 1"
                  class="faixa__tirar"
                  aria-label="Remover faixa"
                  @click="tirarFaixa(d.n, i)"
                >×</button>
              </template>
              <span v-else class="faixa__leitura">{{ f.inicio }} — {{ f.fim }}</span>
            </div>

            <div v-if="ehDono" class="dia__acoes">
              <button class="dia__mais" @click="abrirPausa(d.n)">
                Fechar um período <span class="dia__mais-dica">(almoço, por exemplo)</span>
              </button>
              <button class="dia__mais dia__mais--suave" @click="novaFaixa(d.n)">+ outra faixa</button>
            </div>

            <div v-if="pausando === d.n" class="pausa">
              <p class="pausa__texto">Sem atendimento entre:</p>
              <div class="pausa__linha">
                <input v-model="pausa.inicio" type="time" class="faixa__hora" />
                <span class="faixa__ate">—</span>
                <input v-model="pausa.fim" type="time" class="faixa__hora" />
                <button class="btn btn--pequeno btn--ouro" @click="aplicarPausa(d.n)">Aplicar</button>
              </div>
              <p v-if="erroPausa" class="pausa__erro">{{ erroPausa }}</p>
            </div>
          </template>

          <!-- copiar para -->
          <div v-if="copiando === d.n" class="copiar-para">
            <span>Copiar {{ d.nome.toLowerCase() }} para:</span>
            <div class="copiar-para__chips">
              <button
                v-for="o in DIAS.filter((x) => x.n !== d.n)"
                :key="o.n"
                class="chip"
                @click="aplicarCopia(d.n, o.n)"
              >{{ o.curto }}</button>
              <button class="chip chip--on" @click="aplicarCopia(d.n, 'todos')">todos</button>
            </div>
          </div>
        </li>
      </ul>

      <!-- ============ bloqueios ============ -->
      <section class="bloco">
        <div class="bloco__cabeca">
          <p class="bloco__rotulo">Folgas e bloqueios</p>
          <button v-if="ehDono" class="btn btn--pequeno btn--ouro" @click="novoBloqueio">
            + Bloqueio
          </button>
        </div>

        <p v-if="!carga.bloqueios.length" class="bloco__nada">
          Nenhum bloqueio marcado. Bloqueio serve para folga, médico, feriado —
          o período some da página de agendamento sem mexer na semana.
        </p>

        <ul v-else class="lista">
          <li v-for="b in carga.bloqueios" :key="b.id" class="bloqueio">
            <div class="bloqueio__info">
              <p class="bloqueio__quando">{{ emPeriodo(b) }}</p>
              <p v-if="b.motivo" class="bloqueio__motivo">{{ b.motivo }}</p>
            </div>
            <button
              v-if="ehDono"
              class="btn btn--pequeno btn--fantasma"
              :disabled="removendoBloqueio === b.id"
              @click="removerBloqueio(b.id)"
            >Remover</button>
          </li>
        </ul>
      </section>
    </template>

    <!-- ============ novo bloqueio ============ -->
    <Teleport to="body">
      <div v-if="abrindoBloqueio" class="cortina" @click.self="abrindoBloqueio = false">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Novo bloqueio</p>

          <p v-if="erroBloqueio" class="janela__erro">{{ erroBloqueio }}</p>

          <label class="campo">
            <span>Início</span>
            <input v-model="formBloqueio.inicio" type="datetime-local" :disabled="salvandoBloqueio" />
          </label>

          <label class="campo">
            <span>Fim</span>
            <input v-model="formBloqueio.fim" type="datetime-local" :disabled="salvandoBloqueio" />
          </label>

          <label class="campo">
            <span>Motivo <em>(opcional)</em></span>
            <input
              v-model="formBloqueio.motivo"
              placeholder="Dentista, folga, feriado…"
              :disabled="salvandoBloqueio"
            />
          </label>

          <div class="janela__acoes">
            <button class="btn btn--fantasma" :disabled="salvandoBloqueio" @click="abrindoBloqueio = false">
              Cancelar
            </button>
            <button class="btn btn--laranja" :disabled="salvandoBloqueio" @click="salvarBloqueio">
              {{ salvandoBloqueio ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.topo { margin-bottom: 20px; }
.topo__textos { min-width: 0; }
.topo__linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.titulo { margin: 0; color: var(--branco); }
.topo__sub {
  margin: 7px 0 0;
  max-width: 58ch;
  font-size: var(--tam-apoio);
  color: var(--cinza-600);
  line-height: 1.5;
}

.pill {
  padding: 4px 11px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--dourado);
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  border-radius: 99px;
  white-space: nowrap;
}

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
.btn--pequeno { padding: 8px 14px; min-height: 36px; font-size: 13px; }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--laranja {
  background: var(--laranja);
  color: #17100A;
  box-shadow: 0 12px 26px -14px color-mix(in srgb, var(--laranja) 55%, transparent);
}
.btn--laranja:hover:not(:disabled) { transform: translateY(-1px); }

.btn--ouro {
  background: transparent;
  border-color: var(--dourado-linha);
  color: var(--dourado);
}
.btn--ouro:hover:not(:disabled) { background: var(--dourado-suave); }

.btn--fantasma {
  background: transparent;
  border-color: var(--linha);
  color: var(--cinza);
}
.btn--fantasma:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- vazio ---------- */
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
.vazio__acoes { display: flex; gap: 10px; justify-content: center; }

/* ---------- seletor de barbeiro ---------- */
.quem {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
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

/* ---------- barra de alterações ---------- */
.barra-salvar {
  position: sticky;
  top: 10px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
  background: rgba(28, 21, 15, 0.96);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--dourado-linha);
  border-radius: 16px;
  box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.8);
  font-size: 13.5px;
  font-weight: 650;
  color: var(--branco);
}
.barra-salvar__acoes { display: flex; gap: 8px; }

.erro-geral {
  margin: 0 0 14px;
  padding: 11px 14px;
  border: 1px solid rgba(237, 112, 20, 0.4);
  background: rgba(237, 112, 20, 0.08);
  border-radius: var(--raio);
  font-size: 13.5px;
  color: var(--laranja-400);
  line-height: 1.55;
}

/* ---------- semana ---------- */
.semana {
  list-style: none;
  margin: 0 0 26px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dia {
  padding: 14px 16px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
}
.dia--fechado { opacity: 0.6; }

.dia__cabeca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dia__liga {
  display: flex;
  align-items: center;
  gap: 11px;
  cursor: pointer;
  min-height: 28px;
}
.dia__liga input { width: 18px; height: 18px; accent-color: var(--dourado); }
.dia__nome {
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--branco);
}

.dia__copiar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 11.5px;
  font-weight: 650;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.dia__copiar:hover { border-color: var(--dourado-linha); color: var(--dourado); }
.dia__copiar svg { width: 13px; height: 13px; }

.dia__fechado-texto {
  margin: 8px 0 0 29px;
  font-size: 13px;
  color: var(--cinza-600);
}

.faixa {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 0 29px;
}
.faixa__hora {
  padding: 9px 11px;
  min-height: 42px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--branco);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  border-radius: 12px;
  color-scheme: dark;
}
.faixa__hora:focus { outline: none; border-color: var(--dourado-linha); }
.faixa__ate { color: var(--cinza-600); }
.faixa__tirar {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza-600);
  font-size: 17px;
  line-height: 1;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.faixa__tirar:hover { border-color: var(--laranja); color: var(--laranja); }

.faixa__leitura {
  font-size: 14.5px;
  font-variant-numeric: tabular-nums;
  color: var(--cinza);
}

.dia__acoes {
  display: flex;
  align-items: baseline;
  gap: 18px;
  flex-wrap: wrap;
  margin: 12px 0 0 29px;
}
.dia__mais {
  padding: 0;
  background: transparent;
  border: none;
  color: var(--dourado);
  font-family: var(--fonte-corpo);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
}
.dia__mais--suave { color: var(--cinza-600); }
.dia__mais--suave:hover { color: var(--cinza); }
.dia__mais-dica { color: var(--cinza-600); font-weight: 500; }

.pausa {
  margin: 12px 0 0 29px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--linha-suave);
  border-radius: 14px;
}
.pausa__texto {
  margin: 0 0 8px;
  font-size: 12.5px;
  color: var(--cinza-600);
}
.pausa__linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pausa__erro {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--laranja-400);
}

.copiar-para {
  margin: 12px 0 0 29px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--linha-suave);
  border-radius: 14px;
  font-size: 12.5px;
  color: var(--cinza-600);
}
.copiar-para__chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }

.chip {
  padding: 6px 13px;
  min-height: 32px;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza);
  font-family: var(--fonte-corpo);
  font-size: 12.5px;
  font-weight: 650;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.chip:hover { border-color: var(--cinza-600); color: var(--branco); }
.chip--on {
  border-color: var(--dourado-linha);
  color: var(--dourado);
  background: var(--dourado-suave);
}

/* ---------- bloqueios ---------- */
.bloco { margin-bottom: 26px; }
.bloco__cabeca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.bloco__rotulo {
  margin: 0;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 120%;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--cinza-600);
}
.bloco__nada {
  margin: 0;
  padding: 18px 20px;
  background: var(--superficie);
  border: 1px dashed var(--linha);
  border-radius: 16px;
  font-size: 13px;
  color: var(--cinza-600);
  line-height: 1.6;
}

.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.bloqueio {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 16px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 16px;
}
.bloqueio__info { min-width: 0; }
.bloqueio__quando {
  margin: 0;
  font-size: 14.5px;
  font-weight: 650;
  color: var(--branco);
  font-variant-numeric: tabular-nums;
}
.bloqueio__motivo {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--cinza-600);
}

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
  max-width: 420px;
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

/* ---------- campos ---------- */
.campo { display: flex; flex-direction: column; margin-bottom: 16px; min-width: 0; }
.campo > span {
  margin-bottom: 7px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 118%;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo > span em { font-style: normal; color: var(--cinza-600); font-weight: 500; }
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
  color-scheme: dark;
}
.campo input:focus { outline: none; border-color: var(--dourado-linha); }
.campo input::placeholder { color: #5C5248; }

@media (max-width: 700px) {
  .barra-salvar { flex-direction: column; align-items: stretch; text-align: center; }
  .barra-salvar__acoes .btn { flex: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .chip, .quem__chip { transition: none; }
  .cortina, .janela { animation: none; }
}
</style>