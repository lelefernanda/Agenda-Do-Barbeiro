<script setup lang="ts">
import type { Database, SolicitacaoBarbeiro } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Solicitações — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()

type Pedido = Pick<
  SolicitacaoBarbeiro,
  'id' | 'barbearia_id' | 'nome' | 'email' | 'telefone' | 'status' | 'observacao' | 'criada_em' | 'resolvida_em'
>

/* ------------------------------------------------------------
   As solicitações e o nome de cada barbearia, para mostrar
   de onde veio o pedido. O master enxerga tudo pela RLS.
   ------------------------------------------------------------ */
const { data: dados, refresh } = await useAsyncData(
  'solicitacoes',
  async () => {
    const [pedidos, barbearias] = await Promise.all([
      supabase
        .from('solicitacoes_barbeiro')
        .select('id, barbearia_id, nome, email, telefone, status, observacao, criada_em, resolvida_em')
        .order('criada_em', { ascending: false }),
      supabase.from('barbearias').select('id, nome'),
    ])
    return {
      pedidos: (pedidos.data ?? []) as Pedido[],
      barbearias: (barbearias.data ?? []) as { id: string; nome: string }[],
    }
  },
  { default: () => ({ pedidos: [], barbearias: [] }) }
)

const pendentes = computed(() => dados.value.pedidos.filter((p) => p.status === 'pendente'))
const resolvidas = computed(() => dados.value.pedidos.filter((p) => p.status !== 'pendente'))

const nomeBarbearia = computed(() => {
  const mapa = new Map<string, string>()
  for (const b of dados.value.barbearias) mapa.set(b.id, b.nome)
  return mapa
})

function emData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/* ------------------------------------------------------------
   Aprovar: a rota cria o usuário e devolve a senha,
   que só existe nessa resposta — igual à criação de barbearia.
   ------------------------------------------------------------ */
const mexendo = ref<string | null>(null)
const erro = ref('')

const aprovado = ref<{
  nome: string
  email: string
  senha: string
  telefone: string | null
  barbearia: string
} | null>(null)

async function aprovar(p: Pedido) {
  erro.value = ''
  mexendo.value = p.id
  try {
    const resposta = await $fetch<{ barbeiro: { nome: string; email: string; senha: string; telefone: string | null } }>(
      '/api/barbeiros',
      { method: 'POST', body: { solicitacao_id: p.id, acao: 'aprovar' } }
    )
    aprovado.value = {
      ...resposta.barbeiro,
      barbearia: nomeBarbearia.value.get(p.barbearia_id) ?? '',
    }
    await refresh()
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erro.value = err.data?.statusMessage || err.statusMessage || 'Não foi possível aprovar.'
  }
  mexendo.value = null
}

/* ------------------------------------------------------------
   Recusar: pede o motivo, que o dono vê na tela de equipe.
   ------------------------------------------------------------ */
const recusando = ref<Pedido | null>(null)
const motivoRecusa = ref('')

function pedirRecusa(p: Pedido) {
  erro.value = ''
  motivoRecusa.value = ''
  recusando.value = p
}

async function recusar() {
  const p = recusando.value
  if (!p) return

  mexendo.value = p.id
  try {
    await $fetch('/api/barbeiros', {
      method: 'POST',
      body: { solicitacao_id: p.id, acao: 'recusar', observacao: motivoRecusa.value.trim() },
    })
    recusando.value = null
    await refresh()
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erro.value = err.data?.statusMessage || err.statusMessage || 'Não foi possível recusar.'
    recusando.value = null
  }
  mexendo.value = null
}

/* Mensagem pronta para colar no WhatsApp do dono */
const mensagemPronta = computed(() => {
  const a = aprovado.value
  if (!a) return ''
  return (
    `Acesso do barbeiro ${a.nome} aprovado!\n` +
    `E-mail: ${a.email}\n` +
    `Senha: ${a.senha}\n` +
    `Entre em agendadobarbeiro.com.br e troque a senha no primeiro acesso.`
  )
})

const copiado = ref(false)

async function copiar() {
  await navigator.clipboard.writeText(mensagemPronta.value)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2000)
}

onMounted(() => {
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (recusando.value) recusando.value = null
    else if (aprovado.value) aprovado.value = null
  }
  window.addEventListener('keydown', aoTeclar)
  onUnmounted(() => window.removeEventListener('keydown', aoTeclar))
})
</script>

<template>
  <div>
    <header class="topo">
      <div>
        <p class="sobrancelha">Solicitações</p>
        <h1 class="titulo">
          {{ pendentes.length || 'Nenhuma' }} pendente{{ pendentes.length === 1 ? '' : 's' }}
        </h1>
      </div>
    </header>

    <p v-if="erro" class="erro-geral">{{ erro }}</p>

    <!-- ============ pendentes ============ -->
    <section v-if="pendentes.length" class="bloco">
      <ul class="lista">
        <li v-for="p in pendentes" :key="p.id" class="cartao">
          <div class="cartao__info">
            <div class="cartao__linha1">
              <span class="cartao__nome">{{ p.nome }}</span>
              <span class="selo selo--ouro">{{ nomeBarbearia.get(p.barbearia_id) ?? 'Barbearia' }}</span>
            </div>
            <p class="cartao__meta">{{ p.email }}<template v-if="p.telefone"> · {{ p.telefone }}</template></p>
            <p class="cartao__desc">Pedido em {{ emData(p.criada_em) }}</p>
          </div>

          <div class="cartao__acoes">
            <button
              class="btn btn--pequeno btn--simples"
              :disabled="mexendo === p.id"
              @click="pedirRecusa(p)"
            >Recusar</button>
            <button
              class="btn btn--pequeno btn--laranja"
              :disabled="mexendo === p.id"
              @click="aprovar(p)"
            >{{ mexendo === p.id ? 'Aprovando…' : 'Aprovar' }}</button>
          </div>
        </li>
      </ul>
    </section>

    <section v-else class="vazio">
      <p class="vazio__titulo">Fila limpa</p>
      <p class="vazio__texto">
        Quando um dono cadastrar um barbeiro, o pedido aparece aqui
        para você aprovar ou recusar.
      </p>
    </section>

    <!-- ============ histórico ============ -->
    <section v-if="resolvidas.length" class="bloco">
      <p class="bloco__rotulo">Histórico</p>
      <ul class="lista">
        <li v-for="p in resolvidas" :key="p.id" class="cartao cartao--off">
          <div class="cartao__info">
            <div class="cartao__linha1">
              <span class="cartao__nome">{{ p.nome }}</span>
              <span class="selo" :class="{ 'selo--ouro': p.status === 'aprovada' }">
                {{ p.status === 'aprovada' ? 'Aprovada' : 'Recusada' }}
              </span>
            </div>
            <p class="cartao__meta">
              {{ p.email }} · {{ nomeBarbearia.get(p.barbearia_id) ?? 'Barbearia' }}
            </p>
            <p class="cartao__desc">
              <template v-if="p.resolvida_em">Resolvida em {{ emData(p.resolvida_em) }}</template>
              <template v-if="p.status === 'recusada' && p.observacao"> · Motivo: {{ p.observacao }}</template>
            </p>
          </div>
        </li>
      </ul>
    </section>

    <!-- ============ acesso criado ============ -->
    <Teleport to="body">
      <div v-if="aprovado" class="cortina" @click.self="aprovado = null">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Acesso criado</p>
          <h2 class="janela__titulo">{{ aprovado.nome }}</h2>
          <p class="janela__corpo">
            Barbeiro de <strong>{{ aprovado.barbearia }}</strong>. A senha abaixo
            aparece <strong>só agora</strong> — repasse ao dono antes de fechar.
          </p>

          <div class="credenciais">
            <p><span>E-mail</span>{{ aprovado.email }}</p>
            <p><span>Senha</span><code>{{ aprovado.senha }}</code></p>
          </div>

          <div class="janela__acoes">
            <button class="btn btn--simples" @click="copiar">
              {{ copiado ? 'Copiado ✓' : 'Copiar mensagem' }}
            </button>
            <button class="btn btn--laranja" @click="aprovado = null">Fechar</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============ recusar ============ -->
    <Teleport to="body">
      <div v-if="recusando" class="cortina" @click.self="recusando = null">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Recusar solicitação</p>
          <h2 class="janela__titulo">{{ recusando.nome }}</h2>
          <p class="janela__corpo">
            O motivo aparece para o dono na tela de equipe. Pode deixar em
            branco, mas explicar evita ligação perguntando por quê.
          </p>

          <label class="campo">
            <span>Motivo <em>(opcional)</em></span>
            <textarea
              v-model="motivoRecusa"
              rows="3"
              placeholder="E-mail já usado em outra conta"
            ></textarea>
          </label>

          <div class="janela__acoes">
            <button class="btn btn--simples" @click="recusando = null">Cancelar</button>
            <button
              class="btn btn--laranja"
              :disabled="mexendo === recusando.id"
              @click="recusar"
            >Recusar</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.topo { margin-bottom: 24px; }
.sobrancelha {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dourado);
}
.titulo {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--branco);
}

.erro-geral {
  margin: 0 0 16px;
  padding: 11px 14px;
  border: 1px solid rgba(237, 112, 20, 0.4);
  background: rgba(237, 112, 20, 0.08);
  border-radius: var(--raio);
  font-size: 13.5px;
  color: var(--laranja-400);
  line-height: 1.55;
}

/* ---------- botoes ---------- */
.btn {
  padding: 11px 19px;
  border: 1px solid transparent;
  border-radius: var(--raio);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 700;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.btn--pequeno { padding: 7px 13px; font-size: 13px; }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--laranja { background: var(--laranja); color: #17100A; }
.btn--laranja:hover:not(:disabled) { background: var(--laranja-400); }

.btn--simples {
  background: transparent;
  border-color: var(--preto-600);
  color: var(--cinza);
}
.btn--simples:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- blocos e lista ---------- */
.bloco { margin-bottom: 26px; }
.bloco__rotulo {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

.lista { list-style: none; margin: 0; padding: 0; }
.cartao {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  margin-bottom: 9px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 10px;
}
.cartao--off { opacity: 0.6; }

.cartao__info { flex: 1; min-width: 0; }
.cartao__linha1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cartao__nome {
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.cartao__meta {
  margin: 4px 0 0;
  font-size: 13.5px;
  color: var(--cinza);
  overflow-wrap: anywhere;
}
.cartao__desc { margin: 5px 0 0; font-size: 12.5px; color: var(--cinza-600); }

.selo {
  padding: 3px 9px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid var(--cinza-600);
  border-radius: 99px;
  color: var(--cinza-600);
  white-space: nowrap;
}
.selo--ouro {
  border-color: var(--dourado-600);
  color: var(--dourado);
  background: rgba(212, 175, 55, 0.08);
}

.cartao__acoes { display: flex; gap: 8px; flex-shrink: 0; }

/* ---------- vazio ---------- */
.vazio {
  padding: 38px 32px;
  margin-bottom: 26px;
  background: var(--preto-800);
  border: 1px dashed var(--preto-600);
  border-radius: 12px;
  text-align: center;
}
.vazio__titulo {
  margin: 0 0 10px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.vazio__texto {
  margin: 0 auto;
  max-width: 46ch;
  font-size: 14px;
  color: var(--cinza-600);
  line-height: 1.65;
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
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
  animation: aparecer 0.16s ease;
}
@keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }

.janela {
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 26px 28px;
  background: var(--preto-800);
  border: 1px solid var(--preto-600);
  border-radius: 12px;
  box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.9);
  animation: subir 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes subir {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.janela__rotulo {
  margin: 0 0 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.janela__titulo {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--branco);
}
.janela__corpo {
  margin: 0 0 16px;
  font-size: 14.5px;
  color: var(--cinza);
  line-height: 1.6;
}
.janela__corpo strong { color: var(--branco); }
.janela__acoes {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.credenciais {
  padding: 14px 16px;
  background: var(--preto);
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
}
.credenciais p {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0 0 8px;
  font-size: 14.5px;
  color: var(--branco);
  overflow-wrap: anywhere;
}
.credenciais p:last-child { margin-bottom: 0; }
.credenciais span {
  flex-shrink: 0;
  width: 52px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza-600);
}
.credenciais code {
  font-size: 16px;
  font-weight: 700;
  color: var(--dourado);
  letter-spacing: 0.02em;
}

/* ---------- campos ---------- */
.campo { display: flex; flex-direction: column; min-width: 0; }
.campo > span {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo > span em { font-style: normal; color: var(--cinza-600); font-weight: 500; }
.campo textarea {
  width: 100%;
  padding: 11px 13px;
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  color: var(--branco);
  background: var(--preto);
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
  resize: vertical;
}
.campo textarea:focus { outline: none; border-color: var(--dourado-600); }
.campo textarea::placeholder { color: #4A4A4A; }

@media (max-width: 700px) {
  .cartao { flex-wrap: wrap; }
  .cartao__acoes { width: 100%; }
  .cartao__acoes .btn { flex: 1; }
}
</style>