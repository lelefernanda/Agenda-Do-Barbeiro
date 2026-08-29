<script setup lang="ts">
/**
 * Clientes — quem já passou pela cadeira.
 *
 * O dono abre isto por dois motivos: achar alguém para chamar no
 * WhatsApp, ou descobrir quem sumiu. Por isso a busca fica no topo e
 * existe uma ordem chamada "sumidos" — cliente que não aparece há dois
 * meses é dinheiro parado, e essa é a tela que mostra isso.
 *
 * Nada aqui é apagado com o tempo. A lista de clientes é o patrimônio
 * da barbearia: quem sumiu há um ano e volta, o barbeiro quer achar a
 * anotação dele.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Clientes — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono } = useAcesso()

type ClienteLinha = {
  id: string
  nome: string
  telefone: string
  observacao: string | null
  foto_url: string | null
  criado_em: string
}

type ClienteCompleto = ClienteLinha & {
  vezes: number
  ultima: string | null
  ultimoBarbeiro: string | null
  diasSemVir: number | null
}

const busca = ref('')
const ordem = ref<'recentes' | 'frequentes' | 'sumidos' | 'nome'>('recentes')

/* Quantos cabem na tela antes de pedir mais. Trinta e o suficiente
   para encher a rolagem sem travar o celular do barbeiro. */
const PASSO = 30
const mostrando = ref(PASSO)

const { data: carga, pending, refresh } = await useAsyncData(
  'clientes-lista',
  async () => {
    const barbearia = contexto.value?.barbearia_id
    if (!barbearia) return { clientes: [] as ClienteCompleto[] }

    const [pessoas, atendimentos, equipe] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nome, telefone, observacao, foto_url, criado_em')
        .eq('barbearia_id', barbearia),
      supabase
        .from('agendamentos')
        .select('cliente_id, barbeiro_id, inicio')
        .eq('barbearia_id', barbearia)
        .eq('status', 'concluido')
        .order('inicio', { ascending: false }),
      supabase.from('perfis').select('id, nome'),
    ])

    const nomeDoBarbeiro = new Map(
      ((equipe.data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome])
    )

    /* Como os atendimentos vem do mais novo para o mais antigo, o
       PRIMEIRO que aparece de cada cliente ja e a ultima visita dele. */
    const historico = new Map<
      string,
      { vezes: number; ultima: string; barbeiro: string | null }
    >()

    for (const a of atendimentos.data ?? []) {
      const atual = historico.get(a.cliente_id)
      if (!atual) {
        historico.set(a.cliente_id, {
          vezes: 1,
          ultima: a.inicio,
          barbeiro: nomeDoBarbeiro.get(a.barbeiro_id) ?? null,
        })
      } else {
        atual.vezes += 1
      }
    }

    const agora = Date.now()

    const clientes: ClienteCompleto[] = ((pessoas.data ?? []) as ClienteLinha[]).map((c) => {
      const h = historico.get(c.id)
      return {
        ...c,
        vezes: h?.vezes ?? 0,
        ultima: h?.ultima ?? null,
        ultimoBarbeiro: h?.barbeiro ?? null,
        diasSemVir: h ? Math.floor((agora - new Date(h.ultima).getTime()) / 86400000) : null,
      }
    })

    return { clientes }
  },
  {
    default: () => ({ clientes: [] as ClienteCompleto[] }),
    watch: [contexto],
  }
)

/* ------------------------------------------------------------
   Busca e ordem
   ------------------------------------------------------------ */
function soDigitos(t: string): string {
  return t.replace(/\D/g, '')
}

const ORDENS = [
  { id: 'recentes', nome: 'Recentes' },
  { id: 'frequentes', nome: 'Mais vêm' },
  { id: 'sumidos', nome: 'Sumidos' },
  { id: 'nome', nome: 'A a Z' },
] as const

const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  const digitos = soDigitos(termo)

  let lista = carga.value.clientes

  if (termo) {
    lista = lista.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (!!digitos && soDigitos(c.telefone).includes(digitos))
    )
  }

  const copia = [...lista]

  if (ordem.value === 'recentes') {
    // Quem veio por último primeiro. Quem nunca veio vai para o fim.
    copia.sort((a, b) => (b.ultima ?? '').localeCompare(a.ultima ?? ''))
  } else if (ordem.value === 'frequentes') {
    copia.sort((a, b) => b.vezes - a.vezes || a.nome.localeCompare(b.nome))
  } else if (ordem.value === 'sumidos') {
    /* Sumido de verdade e quem JA VEIO e parou. Quem nunca veio nao e
       sumido, e um cadastro novo — nao entra nesta ordem. */
    copia.sort((a, b) => (b.diasSemVir ?? -1) - (a.diasSemVir ?? -1))
  } else {
    copia.sort((a, b) => a.nome.localeCompare(b.nome))
  }

  return copia
})

const visiveis = computed(() => filtrados.value.slice(0, mostrando.value))
const temMais = computed(() => filtrados.value.length > mostrando.value)

watch([busca, ordem], () => {
  mostrando.value = PASSO
})

/* ------------------------------------------------------------
   Apresentação
   ------------------------------------------------------------ */
function inicial(nome: string): string {
  return (nome.trim()[0] ?? '?').toUpperCase()
}

function telefoneBonito(t: string): string {
  const d = soDigitos(t)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
})

function ultimaVez(c: ClienteCompleto): string {
  if (c.diasSemVir === null) return 'ainda não veio'
  if (c.diasSemVir === 0) return 'veio hoje'
  if (c.diasSemVir === 1) return 'ontem'
  if (c.diasSemVir < 30) return `há ${c.diasSemVir} dias`
  if (c.ultima) return fmtData.format(new Date(c.ultima)).replace('.', '')
  return '—'
}

/* Cliente que passou de 60 dias sem aparecer ganha um selo. E o sinal
   de que vale mandar uma mensagem antes que ele ache outra barbearia. */
function sumido(c: ClienteCompleto): boolean {
  return c.diasSemVir !== null && c.diasSemVir >= 60
}

function zap(c: ClienteCompleto): string {
  const d = soDigitos(c.telefone)
  const numero = d.startsWith('55') ? d : `55${d}`
  const nome = c.nome.split(' ')[0]
  return `https://wa.me/${numero}?text=${encodeURIComponent(`Olá, ${nome}!`)}`
}

/* ------------------------------------------------------------
   Observação do barbeiro
   ------------------------------------------------------------ */
const editando = ref<ClienteCompleto | null>(null)
const rascunho = ref('')
const salvando = ref(false)
const erro = ref('')

function abrirObservacao(c: ClienteCompleto) {
  editando.value = c
  rascunho.value = c.observacao ?? ''
  erro.value = ''
}

async function salvarObservacao() {
  if (!editando.value) return
  salvando.value = true
  erro.value = ''

  const { error } = await supabase
    .from('clientes')
    .update({ observacao: rascunho.value.trim() || null })
    .eq('id', editando.value.id)

  salvando.value = false

  if (error) {
    erro.value = error.message
    return
  }

  editando.value = null
  await refresh()
}
</script>

<template>
  <div>
    <header class="topo">
      <h1 class="titulo">Clientes</h1>
      <p class="subtitulo">
        Quem já passou aqui. Toque no WhatsApp para chamar.
      </p>
    </header>

    <section v-if="!ehDono" class="vazio">
      <p class="vazio__titulo">Só o dono vê a lista de clientes</p>
      <p class="vazio__texto">Se precisar de algum contato, fale com ele.</p>
    </section>

    <template v-else>
      <div class="busca">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input v-model="busca" placeholder="Buscar por nome ou telefone" />
        <button v-if="busca" class="busca__limpar" aria-label="Limpar" @click="busca = ''">✕</button>
      </div>

      <div v-if="carga.clientes.length" class="ordens">
        <button
          v-for="o in ORDENS"
          :key="o.id"
          class="ordem"
          :class="{ 'ordem--on': ordem === o.id }"
          @click="ordem = o.id"
        >{{ o.nome }}</button>
      </div>

      <p v-if="pending" class="nada">Carregando…</p>

      <p v-else-if="!carga.clientes.length" class="nada">
        Ninguém por aqui ainda. Os clientes aparecem sozinhos conforme
        você marca horários ou eles marcam pela sua página.
      </p>

      <p v-else-if="!filtrados.length" class="nada">
        Nenhum cliente com esse nome ou telefone.
      </p>

      <template v-else>
        <p class="conta">
          {{ filtrados.length }}
          {{ filtrados.length === 1 ? 'cliente' : 'clientes' }}
        </p>

        <ul class="lista">
          <li v-for="c in visiveis" :key="c.id" class="pessoa">
            <span class="pessoa__inicial">
              <img v-if="c.foto_url" :src="c.foto_url" alt="" class="pessoa__foto" loading="lazy" />
              <template v-else>{{ inicial(c.nome) }}</template>
            </span>

            <div class="pessoa__meio">
              <p class="pessoa__nome">
                {{ c.nome }}
                <span v-if="sumido(c)" class="selo-sumido">sumido</span>
              </p>

              <p class="pessoa__linha">
                {{ telefoneBonito(c.telefone) }}
                <span class="pessoa__ponto">·</span>
                {{ c.vezes }}{{ c.vezes === 1 ? ' corte' : ' cortes' }}
                <span class="pessoa__ponto">·</span>
                {{ ultimaVez(c) }}
              </p>

              <p v-if="c.ultimoBarbeiro" class="pessoa__com">
                último corte com {{ c.ultimoBarbeiro }}
              </p>

              <p v-if="c.observacao" class="pessoa__nota">{{ c.observacao }}</p>
            </div>

            <div class="pessoa__acoes">
              <button
                class="icone"
                :aria-label="`Anotar sobre ${c.nome}`"
                @click="abrirObservacao(c)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </button>

              <a
                class="icone icone--zap"
                :href="zap(c)"
                target="_blank"
                rel="noopener"
                :aria-label="`WhatsApp de ${c.nome}`"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A10.4 10.4 0 0 0 12 0C6.3 0 1.6 4.7 1.6 10.4c0 1.9.5 3.7 1.4 5.2L1.5 21l5.5-1.4c1.5.8 3.2 1.3 5 1.3 5.7 0 10.4-4.7 10.4-10.4 0-2.8-1.1-5.4-3-7.3zM12 19.5c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.3.9.9-3.2-.2-.3a8.6 8.6 0 0 1-1.3-4.6c0-4.8 3.9-8.7 8.7-8.7 2.3 0 4.5.9 6.1 2.5a8.6 8.6 0 0 1 2.5 6.1c0 4.8-3.9 8.7-8.7 8.7zm4.8-6.5c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1.1-.2.2-.3.2-.6.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.6-1.5-1.8-.2-.3 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.5c-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.8 4.5 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.6-.6 1.8-1.3.2-.6.2-1.1.1-1.2l-.5-.3z"/></svg>
              </a>
            </div>
          </li>
        </ul>

        <button v-if="temMais" class="ver-mais" @click="mostrando += PASSO">
          Ver mais {{ Math.min(PASSO, filtrados.length - mostrando) }}
        </button>
      </template>
    </template>

    <!-- ============ anotar ============ -->
    <div v-if="editando" class="veu" @click.self="editando = null">
      <div class="caixa">
        <p class="caixa__titulo">{{ editando.nome }}</p>
        <p class="caixa__apoio">
          O que você precisa lembrar na hora do corte.
        </p>

        <p v-if="erro" class="erro">{{ erro }}</p>

        <textarea
          v-model="rascunho"
          rows="4"
          maxlength="300"
          placeholder="Ex.: máquina 2 nas laterais, risco do lado direito"
          :disabled="salvando"
        />

        <div class="caixa__acoes">
          <button class="btn btn--vazio" :disabled="salvando" @click="editando = null">
            Cancelar
          </button>
          <button class="btn btn--cheio" :disabled="salvando" @click="salvarObservacao">
            {{ salvando ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topo { margin-bottom: 18px; }
.titulo { margin: 0 0 6px; color: var(--branco); }
.subtitulo { margin: 0; font-size: var(--tam-apoio); color: var(--cinza-600); line-height: 1.6; }

/* ---------- busca ---------- */
.busca {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 14px;
  margin-bottom: 12px;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 14px;
}
.busca svg { width: 18px; height: 18px; flex-shrink: 0; color: var(--cinza-600); }
.busca input {
  flex: 1;
  min-width: 0;
  padding: 14px 0;
  background: transparent;
  border: none;
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 15px;
}
.busca input:focus { outline: none; }
.busca input::placeholder { color: var(--cinza-600); }
.busca__limpar {
  padding: 4px 6px;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-size: 14px;
  cursor: pointer;
}
.busca__limpar:hover { color: var(--branco); }

/* ---------- ordens ---------- */
.ordens {
  display: flex;
  gap: 7px;
  margin-bottom: 14px;
  overflow-x: auto;
  padding-bottom: 3px;
  scrollbar-width: none;
}
.ordens::-webkit-scrollbar { display: none; }

.ordem {
  flex-shrink: 0;
  padding: 8px 15px;
  min-height: 38px;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}
.ordem:hover { border-color: var(--cinza-600); color: var(--cinza); }
.ordem--on {
  border-color: var(--dourado-linha);
  background: var(--dourado-suave);
  color: var(--dourado);
}

.conta { margin: 0 0 10px; font-size: 12px; color: var(--cinza-600); }

/* ---------- lista ---------- */
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

.pessoa {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 15px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 15px;
}

.pessoa__inicial {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  background: var(--dourado-suave);
  color: var(--dourado);
  font-size: 16px;
  font-weight: 750;
}

.pessoa__inicial { overflow: hidden; }
.pessoa__foto { width: 100%; height: 100%; object-fit: cover; }

.pessoa__meio { flex: 1; min-width: 0; }
.pessoa__nome {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--branco);
}

.selo-sumido {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(251, 146, 60, 0.14);
  border: 1px solid rgba(251, 146, 60, 0.3);
  color: #FB923C;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.pessoa__linha {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--cinza-600);
  font-variant-numeric: tabular-nums;
}
.pessoa__ponto { margin: 0 5px; opacity: 0.5; }

.pessoa__com { margin: 2px 0 0; font-size: 11.5px; color: var(--cinza-600); opacity: 0.8; }

.pessoa__nota {
  margin: 6px 0 0;
  padding: 5px 9px;
  background: rgba(0, 0, 0, 0.25);
  border-left: 2px solid var(--dourado-linha);
  border-radius: 6px;
  font-size: 12px;
  color: var(--cinza);
  line-height: 1.45;
}

.pessoa__acoes { display: flex; gap: 6px; flex-shrink: 0; }

.icone {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 11px;
  color: var(--cinza-600);
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}
.icone svg { width: 17px; height: 17px; }
.icone:hover { border-color: var(--cinza-600); color: var(--branco); }
.icone--zap:hover { border-color: #4ADE80; color: #4ADE80; }

.ver-mais {
  width: 100%;
  margin-top: 12px;
  padding: 13px;
  min-height: 46px;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: var(--raio);
  color: var(--cinza);
  font-family: var(--fonte-corpo);
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.ver-mais:hover { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- vazio ---------- */
.nada {
  margin: 0;
  padding: 34px 24px;
  background: var(--superficie);
  border: 1px dashed var(--linha);
  border-radius: 18px;
  font-size: 13.5px;
  color: var(--cinza-600);
  line-height: 1.65;
  text-align: center;
}

.vazio {
  padding: 40px 28px;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 20px;
  text-align: center;
}
.vazio__titulo { margin: 0 0 8px; font-size: 17px; font-weight: 750; color: var(--branco); }
.vazio__texto { margin: 0; font-size: var(--tam-apoio); color: var(--cinza-600); }

/* ---------- anotar ---------- */
.veu {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.caixa {
  width: 100%;
  max-width: 420px;
  padding: 22px;
  background: var(--preto-800, #141A2E);
  border: 1px solid var(--linha);
  border-radius: 20px;
}
.caixa__titulo { margin: 0 0 5px; font-size: 17px; font-weight: 750; color: var(--branco); }
.caixa__apoio { margin: 0 0 16px; font-size: 13px; color: var(--cinza-600); line-height: 1.5; }

.caixa textarea {
  width: 100%;
  padding: 12px 13px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  border-radius: var(--raio);
  color: var(--branco);
  font-family: var(--fonte-corpo);
  font-size: 15px;
  line-height: 1.5;
  resize: vertical;
}
.caixa textarea:focus { outline: none; border-color: var(--dourado-linha); }
.caixa textarea::placeholder { color: var(--cinza-600); }

.caixa__acoes { display: flex; gap: 9px; margin-top: 16px; }

.btn {
  flex: 1;
  padding: 13px 18px;
  min-height: 46px;
  border: 1px solid transparent;
  border-radius: var(--raio);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
}
.btn:disabled { opacity: 0.45; cursor: default; }
.btn--cheio { background: var(--laranja); color: #FFFFFF; }
.btn--vazio { background: transparent; border-color: var(--linha); color: var(--cinza); }
.btn--vazio:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

.erro {
  margin: 0 0 12px;
  padding: 10px 13px;
  border: 1px solid var(--laranja);
  background: var(--dourado-suave);
  border-radius: var(--raio);
  font-size: 13px;
  color: var(--laranja-400);
}

@media (max-width: 560px) {
  .pessoa__linha { font-size: 12px; }
  .icone { width: 38px; height: 38px; }
}

@media (prefers-reduced-motion: reduce) {
  .icone, .btn, .ordem { transition: none; }
}
</style>