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
      .eq('atende', true)
      .eq('status', 'ativo')
      .or(`barbearia_id.eq.${contexto.value?.barbearia_id},id.eq.${contexto.value?.perfil_id}`)
      .order('nome', { ascending: true })
    return (data ?? []) as BarbeiroResumo[]
  },
  // Refaz a busca quando o contexto chega e quando o dono troca de
  // unidade. Sem isto, a lista era montada antes de existir barbearia.
  { default: () => [] as BarbeiroResumo[], watch: [contexto] }
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
        .eq('barbeiro_id', selecionado.value)
        .eq('barbearia_id', contexto.value?.barbearia_id ?? ''),
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

/* ------------------------------------------------------------
   A TRADUÇÃO.

   A tela fala a língua do dono: "abro tal hora, fecho tal hora,
   e paro pro almoço". O banco continua guardando faixas — sem
   almoço, uma; com almoço, duas. Estas funções fazem a ponte
   entre os dois mundos, e é por isso que a agenda continua
   calculando os horários livres exatamente como antes.
   ------------------------------------------------------------ */
function abreDe(n: number): string {
  return faixasDe(n)[0]?.inicio ?? '09:00'
}

function fechaDe(n: number): string {
  const f = faixasDe(n)
  return f[f.length - 1]?.fim ?? '19:00'
}

function temAlmoco(n: number): boolean {
  return faixasDe(n).length > 1
}

function almocoDe(n: number): { inicio: string; fim: string } {
  const f = faixasDe(n)
  if (f.length > 1) return { inicio: f[0]!.fim, fim: f[1]!.inicio }
  return { inicio: '12:00', fim: '13:00' }
}

function montarDia(
  n: number,
  abre: string,
  fecha: string,
  almoco: { inicio: string; fim: string } | null,
) {
  semana.value[n] = almoco
    ? [
        { inicio: abre, fim: almoco.inicio },
        { inicio: almoco.fim, fim: fecha },
      ]
    : [{ inicio: abre, fim: fecha }]
}

function aoMudarAbre(n: number, e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (!v) return
  montarDia(n, v, fechaDe(n), temAlmoco(n) ? almocoDe(n) : null)
}

function aoMudarFecha(n: number, e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (!v) return
  montarDia(n, abreDe(n), v, temAlmoco(n) ? almocoDe(n) : null)
}

function virarAlmoco(n: number) {
  montarDia(
    n,
    abreDe(n),
    fechaDe(n),
    temAlmoco(n) ? null : { inicio: '12:00', fim: '13:00' },
  )
}

function aoMudarAlmoco(n: number, campo: 'inicio' | 'fim', e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (!v) return
  const a = almocoDe(n)
  a[campo] = v
  montarDia(n, abreDe(n), fechaDe(n), a)
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
    const faixas = faixasDe(d.n)
    if (!faixas.length) continue

    if (fechaDe(d.n) <= abreDe(d.n)) {
      return `${d.nome}: o horário de fechar precisa ser depois do de abrir.`
    }

    if (temAlmoco(d.n)) {
      const a = almocoDe(d.n)
      if (a.fim <= a.inicio) {
        return `${d.nome}: o fim do almoço precisa ser depois do início.`
      }
      if (a.inicio <= abreDe(d.n) || a.fim >= fechaDe(d.n)) {
        return `${d.nome}: o almoço precisa ficar dentro do horário de atendimento.`
      }
    }
  }
  return ''
}

async function salvarSemana() {
  if (!selecionado.value) return
  erroSemana.value = validar()
  if (erroSemana.value) return

  const linhas: { barbeiro_id: string; barbearia_id: string; dia_semana: number; inicio: string; fim: string }[] = []
  for (const d of DIAS) {
    for (const f of faixasDe(d.n)) {
      linhas.push({
        barbeiro_id: selecionado.value,
        barbearia_id: contexto.value?.barbearia_id ?? '',
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
    .eq('barbearia_id', contexto.value?.barbearia_id ?? '')

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

          <!-- aberto: abre, fecha e almoco -->
          <template v-else>
            <template v-if="ehDono">
              <div class="faixa">
                <span class="faixa__rotulo">das</span>
                <input
                  type="time"
                  class="faixa__hora"
                  :value="abreDe(d.n)"
                  @change="aoMudarAbre(d.n, $event)"
                />
                <span class="faixa__rotulo">às</span>
                <input
                  type="time"
                  class="faixa__hora"
                  :value="fechaDe(d.n)"
                  @change="aoMudarFecha(d.n, $event)"
                />
              </div>

              <label class="almoco">
                <input
                  type="checkbox"
                  :checked="temAlmoco(d.n)"
                  @change="virarAlmoco(d.n)"
                />
                <span class="almoco__texto">Paro para o almoço</span>
              </label>

              <div v-if="temAlmoco(d.n)" class="faixa faixa--almoco">
                <input
                  type="time"
                  class="faixa__hora"
                  :value="almocoDe(d.n).inicio"
                  @change="aoMudarAlmoco(d.n, 'inicio', $event)"
                />
                <span class="faixa__rotulo">às</span>
                <input
                  type="time"
                  class="faixa__hora"
                  :value="almocoDe(d.n).fim"
                  @change="aoMudarAlmoco(d.n, 'fim', $event)"
                />
              </div>
            </template>

            <!-- o barbeiro so le -->
            <template v-else>
              <div class="faixa">
                <span class="faixa__leitura">{{ abreDe(d.n) }} — {{ fechaDe(d.n) }}</span>
              </div>
              <p v-if="temAlmoco(d.n)" class="dia__almoco-leitura">
                almoço {{ almocoDe(d.n).inicio }} — {{ almocoDe(d.n).fim }}
              </p>
            </template>
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
  color: #FFFFFF;
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
  background: rgba(16, 22, 42, 0.96);
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
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.08);
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
.dia__liga input { width: 18px; height: 18px; accent-color: var(--laranja); cursor: pointer; }
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

/* ---------- abre / fecha / almoco ---------- */
.faixa {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0 0 29px;
  flex-wrap: wrap;
}
.faixa__rotulo {
  font-size: 13.5px;
  color: var(--cinza-600);
  flex-shrink: 0;
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

.faixa__leitura {
  font-size: 14.5px;
  font-variant-numeric: tabular-nums;
  color: var(--cinza);
}

.almoco {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 14px 0 0 29px;
  cursor: pointer;
  width: fit-content;
}
.almoco input { width: 17px; height: 17px; accent-color: var(--laranja); cursor: pointer; }
.almoco__texto { font-size: 13.5px; color: var(--cinza); }

.faixa--almoco { margin-top: 10px; margin-left: 57px; }

.dia__almoco-leitura {
  margin: 6px 0 0 29px;
  font-size: 12.5px;
  color: var(--cinza-600);
  font-variant-numeric: tabular-nums;
}

.copiar-para {
  margin: 14px 0 0 29px;
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
  background: rgba(6, 8, 12, 0.74);
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
  background: rgba(16, 22, 42, 0.97);
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
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.janela__erro {
  margin: 0 0 16px;
  padding: 11px 14px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.08);
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
.campo input::placeholder { color: #5A6376; }

@media (max-width: 700px) {
  .barra-salvar { flex-direction: column; align-items: stretch; text-align: center; }
  .barra-salvar__acoes .btn { flex: 1; }
  .faixa--almoco { margin-left: 29px; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .chip, .quem__chip { transition: none; }
  .cortina, .janela { animation: none; }
}
</style>