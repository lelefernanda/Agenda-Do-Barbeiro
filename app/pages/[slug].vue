<script setup lang="ts">
/**
 * A página pública: agendadobarbeiro.com.br/inkabarbershop
 *
 * É o cartão de visita da barbearia e o lugar onde o cliente marca
 * sozinho. Por isso a ordem: identidade em cima, botão de marcar logo
 * em seguida, e o resto abaixo. Quem já decidiu marca em dois toques;
 * quem está conhecendo desce e lê.
 *
 * A cor vem da barbearia — tirada da foto de capa dela. Cada loja
 * parece dona da própria página sem que nenhuma fique ilegível.
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
    logo_url: string | null
    capa_url: string | null
    capa_pos: number | null
    sobre: string | null
    cor: string | null
  }
  servicos: ServicoPublico[]
  atendentes: AtendentePublico[]
}

const { data: vitrine, error: erroVitrine } = await useFetch<Vitrine>('/api/publico/barbearia', {
  query: { slug },
})

const loja = computed(() => vitrine.value?.barbearia ?? null)
const serv = computed(() => vitrine.value?.servicos ?? [])
const equipe = computed(() => vitrine.value?.atendentes ?? [])
const cor = computed(() => loja.value?.cor || '#3B82F6')

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

/* A cor da barbearia entra como variável: daqui para baixo, tudo que
   é destaque na página usa ela. */
const estiloDaLoja = computed(() => ({
  '--marca': cor.value,
  '--marca-suave': `${cor.value}1F`,
  '--marca-linha': `${cor.value}59`,
}))

/* ------------------------------------------------------------
   Os quatro passos
   ------------------------------------------------------------ */
const passo = ref<0 | 1 | 2 | 3 | 4>(0)

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

const marcando = ref(false)

function comecar() {
  marcando.value = true
  passo.value = 1
  nextTick(() => {
    document.getElementById('marcar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function escolherServico(s: ServicoPublico) {
  servico.value = s
  hora.value = ''
  if (!marcando.value) marcando.value = true
  if (equipe.value.length === 1) {
    atendente.value = equipe.value[0]!
    passo.value = 3
  } else {
    passo.value = 2
  }
  nextTick(() => {
    document.getElementById('marcar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
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

const iniciais = computed(() => {
  const n = loja.value?.nome ?? ''
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
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

    <template v-else-if="loja">
      <!-- ============ capa ============ -->
      <div class="capa" :class="{ 'capa--vazia': !loja.capa_url }">
        <img
          v-if="loja.capa_url"
          :src="loja.capa_url"
          alt=""
          class="capa__img"
          :style="{ objectPosition: `center ${loja.capa_pos ?? 50}%` }"
        />
        <div class="capa__veu" />
      </div>

      <div class="miolo">
        <!-- ============ identidade ============ -->
        <header class="marca">
          <div class="marca__logo">
            <img v-if="loja.logo_url" :src="loja.logo_url" alt="" />
            <template v-else>{{ iniciais }}</template>
          </div>

          <h1 class="marca__nome">{{ loja.nome }}</h1>

          <p v-if="loja.endereco || loja.cidade" class="marca__onde">
            {{ [loja.endereco, loja.cidade].filter(Boolean).join(' · ') }}
          </p>

          <p v-if="loja.sobre" class="marca__sobre">{{ loja.sobre }}</p>
        </header>

        <!-- ============ comprovante ============ -->
        <section v-if="pronto" class="feito">
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

        <template v-else>
          <!-- ============ chamada ============ -->
          <button v-if="!marcando" class="btn btn--cheio btn--largo btn--alto" @click="comecar">
            Marcar horário
          </button>

          <!-- ============ o fluxo ============ -->
          <section v-else id="marcar" class="fluxo">
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

          <!-- ============ vitrine (fora do fluxo) ============ -->
          <template v-if="!marcando">
            <section v-if="serv.length" class="bloco">
              <p class="bloco__rotulo">Serviços</p>
              <ul class="opcoes">
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
            </section>

            <section v-if="equipe.length" class="bloco">
              <p class="bloco__rotulo">Quem atende</p>
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
          </template>
        </template>

        <footer class="rodape">
          <a v-if="zapDaLoja" :href="zapDaLoja" target="_blank" rel="noopener">WhatsApp</a>
          <a
            v-if="loja.instagram"
            :href="`https://instagram.com/${loja.instagram.replace('@', '')}`"
            target="_blank"
            rel="noopener"
          >Instagram</a>
        </footer>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pagina {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--preto);
  padding-bottom: 50px;
}

.centro { display: flex; align-items: center; justify-content: center; min-height: 70vh; padding: 24px; }

.miolo { max-width: 560px; margin: 0 auto; padding: 0 20px; }

/* ---------- capa ---------- */
.capa { position: relative; height: 190px; overflow: hidden; }
.capa--vazia { height: 108px; background: linear-gradient(160deg, var(--marca-suave), transparent 70%); }
.capa__img { width: 100%; height: 100%; object-fit: cover; }
.capa__veu {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10, 11, 13, 0.15) 0%, rgba(10, 11, 13, 0.55) 55%, var(--preto) 100%);
}

/* ---------- identidade ---------- */
.marca { margin-top: -34px; position: relative; }
.marca__logo {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border-radius: 17px;
  overflow: hidden;
  background: var(--preto-800);
  border: 3px solid var(--preto);
  color: var(--marca);
  font-size: 21px;
  font-weight: 800;
}
.marca__logo img { width: 100%; height: 100%; object-fit: cover; }

.marca__nome {
  margin: 0;
  font-size: clamp(24px, 6.5vw, 31px);
  font-weight: 780;
  letter-spacing: -0.03em;
  color: var(--branco);
  line-height: 1.1;
}
.marca__onde { margin: 7px 0 0; font-size: 13px; color: var(--cinza-600); }
.marca__sobre {
  margin: 13px 0 0;
  font-size: 14px;
  color: var(--cinza);
  line-height: 1.6;
  max-width: 46ch;
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
.btn--alto { margin-top: 22px; min-height: 54px; font-size: 16px; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn--cheio { background: var(--marca); color: #FFFFFF; }
.btn--cheio:active:not(:disabled) { transform: scale(0.99); }
.btn--vazio { background: transparent; border-color: var(--preto-600); color: var(--cinza); }
.btn--vazio:hover { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- fluxo ---------- */
.fluxo { margin-top: 24px; scroll-margin-top: 16px; }

.trilha { display: flex; gap: 5px; margin-bottom: 20px; }
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

/* ---------- blocos da vitrine ---------- */
.bloco { margin-top: 30px; }
.bloco__rotulo {
  margin: 0 0 11px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

/* ---------- opcoes ---------- */
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
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.16s ease;
}
.opcao:hover { border-color: var(--marca-linha); }
.opcao:active { transform: scale(0.99); }

.opcao__foto,
.opcao__avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  overflow: hidden;
  background: var(--preto-700);
  color: var(--marca);
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
  color: var(--marca);
  font-variant-numeric: tabular-nums;
}

/* ---------- equipe ---------- */
.equipe { display: flex; gap: 16px; flex-wrap: wrap; }
.pessoa { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 76px; }
.pessoa__foto {
  width: 62px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  color: var(--marca);
  font-size: 21px;
  font-weight: 750;
}
.pessoa__foto img { width: 100%; height: 100%; object-fit: cover; }
.pessoa__nome {
  font-size: 12px;
  color: var(--cinza);
  text-align: center;
  line-height: 1.3;
  word-break: break-word;
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
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}
.dia--on { border-color: var(--marca); background: var(--marca-suave); }
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
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.hora:hover { border-color: var(--marca); color: var(--marca); }

/* ---------- conferir ---------- */
.conferir {
  padding: 14px 16px;
  margin-bottom: 20px;
  background: var(--preto-800);
  border-left: 3px solid var(--marca);
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

/* ---------- comprovante ---------- */
.feito {
  margin-top: 24px;
  padding: 26px 24px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 18px;
  text-align: center;
}
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
  background: rgba(0, 0, 0, 0.25);
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
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 18px;
  text-align: center;
  max-width: 420px;
}
.aviso__titulo { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: var(--branco); }
.aviso__texto { margin: 0; font-size: 13.5px; color: var(--cinza-600); line-height: 1.6; }

/* ---------- rodape ---------- */
.rodape {
  display: flex;
  justify-content: center;
  gap: 22px;
  margin-top: 40px;
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