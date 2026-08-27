<script setup lang="ts">
/**
 * A pagina publica de agendamento: agendadobarbeiro.com.br/inkabarbershop
 *
 * Quem abre aqui nao tem login e nao vai criar conta. Entao a tela pede
 * o minimo: servico, profissional, dia, horario, nome e WhatsApp.
 *
 * Nenhuma consulta ao banco sai daqui — tudo passa pelas rotas de
 * /api/publico, que conferem cada dado antes de gravar.
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
  }
  servicos: ServicoPublico[]
  atendentes: AtendentePublico[]
}

const { data: vitrine, error: erroVitrine } = await useFetch<Vitrine>('/api/publico/barbearia', {
  query: { slug },
})

useHead(() => ({
  title: vitrine.value
    ? `Agendar — ${vitrine.value.barbearia.nome}`
    : 'Agendar horário',
  meta: [
    {
      name: 'description',
      content: vitrine.value
        ? `Marque seu horário na ${vitrine.value.barbearia.nome} em poucos toques.`
        : '',
    },
  ],
}))

/* ------------------------------------------------------------
   Os quatro passos
   ------------------------------------------------------------ */
const passo = ref<1 | 2 | 3 | 4>(1)

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

function escolherServico(s: ServicoPublico) {
  servico.value = s
  hora.value = ''
  // Com um profissional so, nao faz sentido perguntar quem.
  if (vitrine.value?.atendentes.length === 1) {
    atendente.value = vitrine.value.atendentes[0]!
    passo.value = 3
  } else {
    passo.value = 2
  }
}

function escolherAtendente(a: AtendentePublico) {
  atendente.value = a
  hora.value = ''
  passo.value = 3
}

/* ------------------------------------------------------------
   Os proximos 21 dias, para o cliente escolher o dia
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
   Os horarios livres, calculados pelo servidor
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
   Os dados do cliente e a confirmacao
   ------------------------------------------------------------ */
const form = reactive({ nome: '', telefone: '', observacao: '' })
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
        },
      }
    )
    pronto.value = resposta
  } catch (e) {
    const m = (e as { statusMessage?: string; data?: { statusMessage?: string } })
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
  passo.value = 1
}

/* Texto do comprovante, para o cliente guardar */
const quandoPorExtenso = computed(() => {
  if (!pronto.value) return ''
  const d = new Date(pronto.value.inicio)
  const dataLonga = fmtLongo.format(d)
  const hh = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d)
  return `${dataLonga} às ${hh}`
})

const zapDaLoja = computed(() => {
  const t = vitrine.value?.barbearia.telefone?.replace(/\D/g, '')
  if (!t) return null
  return `https://wa.me/${t.startsWith('55') ? t : `55${t}`}`
})

function voltar() {
  erro.value = ''
  if (passo.value === 4) passo.value = 3
  else if (passo.value === 3) {
    passo.value = (vitrine.value?.atendentes.length ?? 0) > 1 ? 2 : 1
  } else if (passo.value === 2) passo.value = 1
}
</script>

<template>
  <div class="pagina">
    <!-- ============ barbearia nao encontrada ============ -->
    <div v-if="erroVitrine" class="centro">
      <div class="cartao cartao--aviso">
        <p class="aviso__titulo">Página não encontrada</p>
        <p class="aviso__texto">
          Este endereço não corresponde a nenhuma barbearia. Confira o link
          com quem te enviou.
        </p>
      </div>
    </div>

    <template v-else-if="vitrine">
      <!-- ============ topo ============ -->
      <header class="cabeca">
        <h1 class="cabeca__nome">{{ vitrine.barbearia.nome }}</h1>
        <p v-if="vitrine.barbearia.endereco || vitrine.barbearia.cidade" class="cabeca__onde">
          {{ [vitrine.barbearia.endereco, vitrine.barbearia.cidade].filter(Boolean).join(' · ') }}
        </p>
      </header>

      <!-- ============ comprovante ============ -->
      <section v-if="pronto" class="cartao cartao--feito">
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
      </section>

      <!-- ============ o fluxo ============ -->
      <template v-else>
        <!-- trilha dos passos -->
        <div class="trilha" aria-hidden="true">
          <span v-for="n in 4" :key="n" class="trilha__risco" :class="{ 'trilha__risco--on': passo >= n }" />
        </div>

        <button v-if="passo > 1" class="voltar" @click="voltar">← Voltar</button>

        <!-- passo 1: servico -->
        <section v-if="passo === 1">
          <h2 class="pergunta">O que você quer fazer?</h2>

          <p v-if="!vitrine.servicos.length" class="nada">
            Esta barbearia ainda não cadastrou os serviços.
          </p>

          <ul v-else class="opcoes">
            <li v-for="s in vitrine.servicos" :key="s.id">
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
        </section>

        <!-- passo 2: profissional -->
        <section v-else-if="passo === 2">
          <h2 class="pergunta">Com quem?</h2>
          <ul class="opcoes">
            <li v-for="a in vitrine.atendentes" :key="a.id">
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
        </section>

        <!-- passo 3: dia e hora -->
        <section v-else-if="passo === 3">
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
        </section>

        <!-- passo 4: dados -->
        <section v-else>
          <h2 class="pergunta">Quase lá</h2>

          <div class="conferir">
            <p class="conferir__linha"><strong>{{ servico?.nome }}</strong> · {{ dinheiro.format(Number(servico?.preco ?? 0)) }}</p>
            <p class="conferir__linha">Com {{ atendente?.nome }}</p>
            <p class="conferir__linha conferir__linha--forte">
              {{ proximosDias.find((d) => d.valor === dia)?.semana }},
              {{ proximosDias.find((d) => d.valor === dia)?.dia }}
              de {{ proximosDias.find((d) => d.valor === dia)?.mes }}
              às {{ hora }}
            </p>
          </div>

          <p v-if="erro" class="erro">{{ erro }}</p>

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
        </section>
      </template>

      <footer class="rodape">
        <a v-if="zapDaLoja" :href="zapDaLoja" target="_blank" rel="noopener">WhatsApp</a>
        <a
          v-if="vitrine.barbearia.instagram"
          :href="`https://instagram.com/${vitrine.barbearia.instagram.replace('@', '')}`"
          target="_blank"
          rel="noopener"
        >Instagram</a>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.pagina {
  min-height: 100vh;
  min-height: 100dvh;
  max-width: 560px;
  margin: 0 auto;
  padding: 26px 20px 56px;
}

.centro { display: flex; align-items: center; justify-content: center; min-height: 70vh; }

/* ---------- topo ---------- */
.cabeca { margin-bottom: 22px; }
.cabeca__nome {
  margin: 0;
  font-size: clamp(24px, 6vw, 30px);
  font-weight: 750;
  letter-spacing: -0.03em;
  color: var(--branco);
}
.cabeca__onde {
  margin: 6px 0 0;
  font-size: 13.5px;
  color: var(--cinza-600);
}

/* ---------- trilha ---------- */
.trilha { display: flex; gap: 5px; margin-bottom: 22px; }
.trilha__risco {
  flex: 1;
  height: 3px;
  background: var(--preto-700);
  border-radius: 99px;
  transition: background 0.25s ease;
}
.trilha__risco--on { background: var(--laranja); }

.voltar {
  margin: 0 0 14px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 600;
}
.voltar:hover { color: var(--branco); }

.pergunta {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--branco);
}

.nada {
  margin: 0;
  padding: 22px 20px;
  background: var(--preto-800);
  border: 1px dashed var(--preto-600);
  border-radius: 14px;
  font-size: 13.5px;
  color: var(--cinza-600);
  line-height: 1.6;
  text-align: center;
}

/* ---------- opcoes (servico e profissional) ---------- */
.opcoes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }

.opcao {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 13px 15px;
  background: var(--preto-800);
  border: 1px solid transparent;
  border-radius: 14px;
  font-family: var(--fonte-corpo);
  text-align: left;
  transition: border-color 0.16s ease, transform 0.16s ease;
}
.opcao:hover { border-color: var(--laranja); }
.opcao:active { transform: scale(0.99); }

.opcao__foto,
.opcao__avatar {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  overflow: hidden;
  background: var(--preto-700);
  color: var(--dourado);
  font-size: 17px;
  font-weight: 750;
}
.opcao__avatar { border-radius: 99px; }
.opcao__foto img,
.opcao__avatar img { width: 100%; height: 100%; object-fit: cover; }

.opcao__meio { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.opcao__nome { font-size: 15.5px; font-weight: 650; color: var(--branco); }
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
.opcao__tempo { font-size: 12px; color: var(--cinza-600); }
.opcao__preco {
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--dourado);
  font-variant-numeric: tabular-nums;
}

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
  width: 62px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  background: var(--preto-800);
  border: 1px solid transparent;
  border-radius: 13px;
  font-family: var(--fonte-corpo);
  transition: border-color 0.16s ease, background 0.16s ease;
}
.dia--on { border-color: var(--laranja); background: var(--dourado-suave); }
.dia__semana { font-size: 11px; color: var(--cinza-600); text-transform: lowercase; }
.dia__num { font-size: 18px; font-weight: 750; color: var(--branco); font-variant-numeric: tabular-nums; }
.dia__mes { font-size: 10.5px; color: var(--cinza-600); text-transform: lowercase; }

/* ---------- horas ---------- */
.horas { display: flex; flex-wrap: wrap; gap: 8px; }
.hora {
  padding: 11px 0;
  width: calc(25% - 6px);
  min-width: 72px;
  background: var(--preto-800);
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.hora:hover { border-color: var(--laranja); color: var(--laranja-400); }

/* ---------- conferir ---------- */
.conferir {
  padding: 14px 16px;
  margin-bottom: 20px;
  background: var(--preto-800);
  border-left: 3px solid var(--laranja);
  border-radius: 12px;
}
.conferir__linha { margin: 0; font-size: 13.5px; color: var(--cinza); }
.conferir__linha + .conferir__linha { margin-top: 4px; }
.conferir__linha strong { color: var(--branco); font-weight: 700; }
.conferir__linha--forte { color: var(--branco); font-weight: 650; font-size: 15px; margin-top: 8px !important; }

/* ---------- campos ---------- */
.campo { display: flex; flex-direction: column; margin-bottom: 14px; }
.campo > span {
  margin-bottom: 7px;
  font-size: 12px;
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
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 12px;
}
.campo input:focus { outline: none; border-color: var(--laranja); }
.campo input::placeholder { color: var(--cinza-600); }

.erro {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--laranja);
  background: var(--dourado-suave);
  border-radius: 12px;
  font-size: 13.5px;
  color: var(--laranja-400);
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
  transition: transform 0.16s ease, border-color 0.16s ease;
}
.btn--largo { width: 100%; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn--cheio { background: var(--laranja); color: #FFFFFF; }
.btn--cheio:active:not(:disabled) { transform: scale(0.99); }
.btn--vazio { background: transparent; border-color: var(--preto-600); color: var(--cinza); }
.btn--vazio:hover { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- cartoes ---------- */
.cartao {
  padding: 26px 24px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 18px;
}
.cartao--aviso { text-align: center; }
.aviso__titulo { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: var(--branco); }
.aviso__texto { margin: 0; font-size: 13.5px; color: var(--cinza-600); line-height: 1.6; }

.cartao--feito { text-align: center; }
.feito__marca {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  border-radius: 99px;
  background: var(--dourado-suave);
  color: var(--laranja);
}
.feito__marca svg { width: 26px; height: 26px; }
.feito__titulo { margin: 0 0 6px; font-size: 20px; font-weight: 750; color: var(--branco); }
.feito__quando {
  margin: 0 0 20px;
  font-size: 15px;
  color: var(--laranja-400);
  font-weight: 600;
  text-transform: capitalize;
}

.resumo {
  margin: 0 0 18px;
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  text-align: left;
}
.resumo > div { display: flex; justify-content: space-between; gap: 14px; }
.resumo > div + div { margin-top: 7px; }
.resumo dt { font-size: 13px; color: var(--cinza-600); }
.resumo dd { margin: 0; font-size: 13.5px; font-weight: 650; color: var(--branco); text-align: right; }

.feito__aviso {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--cinza-600);
  line-height: 1.6;
}
.feito__acoes { display: flex; flex-direction: column; gap: 9px; }

/* ---------- rodape ---------- */
.rodape {
  display: flex;
  justify-content: center;
  gap: 22px;
  margin-top: 34px;
  padding-top: 20px;
  border-top: 1px solid var(--preto-700);
  font-size: 13px;
  color: var(--cinza-600);
}
.rodape a:hover { color: var(--branco); }

@media (prefers-reduced-motion: reduce) {
  .btn, .opcao, .hora, .dia, .trilha__risco { transition: none; }
}
</style>