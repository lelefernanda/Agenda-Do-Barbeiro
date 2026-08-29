<script setup lang="ts">
import type { Database, Perfil, SolicitacaoBarbeiro } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Equipe — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono } = useAcesso()

type Barbeiro = Pick<Perfil, 'id' | 'nome' | 'telefone' | 'foto_url' | 'bio' | 'status'>
type Pedido = Pick<
  SolicitacaoBarbeiro,
  'id' | 'nome' | 'email' | 'telefone' | 'status' | 'observacao' | 'criada_em'
>
type Nota = { barbeiro_id: string; media: number; total: number }

/* ------------------------------------------------------------
   Tudo da tela numa carga só: quem está na equipe, as notas
   das avaliações e as solicitações (pendentes e recusadas).
   A RLS já limita cada consulta à barbearia de quem pergunta.
   ------------------------------------------------------------ */
const { data: dados, refresh } = await useAsyncData(
  'equipe',
  async () => {
    const [barbeiros, notas, pedidos] = await Promise.all([
      supabase
        .from('perfis')
        .select('id, nome, telefone, foto_url, bio, status')
        .eq('papel', 'barbeiro')
        .eq('barbearia_id', contexto.value?.barbearia_id ?? '')
        .order('nome', { ascending: true }),
      supabase.from('notas_barbeiro').select('barbeiro_id, media, total'),
      supabase
        .from('solicitacoes_barbeiro')
        .select('id, nome, email, telefone, status, observacao, criada_em')
        .order('criada_em', { ascending: false }),
    ])
    return {
      barbeiros: (barbeiros.data ?? []) as Barbeiro[],
      notas: (notas.data ?? []) as Nota[],
      pedidos: (pedidos.data ?? []) as Pedido[],
    }
  },
  { default: () => ({ barbeiros: [], notas: [], pedidos: [] }), watch: [contexto] }
)

const equipe = computed(() => dados.value.barbeiros)
const pendentes = computed(() => dados.value.pedidos.filter((p) => p.status === 'pendente'))
const recusadas = computed(() => dados.value.pedidos.filter((p) => p.status === 'recusada'))

const notaDe = computed(() => {
  const mapa = new Map<string, Nota>()
  for (const n of dados.value.notas) mapa.set(n.barbeiro_id, n)
  return mapa
})

const umDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function emData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
    new Date(iso)
  )
}

function inicial(nome: string) {
  return (nome.trim()[0] ?? '?').toUpperCase()
}

/* ------------------------------------------------------------
   Cadastrar barbeiro = abrir uma solicitação.
   O acesso só nasce quando o master aprova — aqui a gente
   só registra o pedido.
   ------------------------------------------------------------ */
const abrindo = ref(false)
const salvando = ref(false)
const erro = ref('')

const form = reactive({ nome: '', email: '', telefone: '' })

function novo() {
  Object.assign(form, { nome: '', email: '', telefone: '' })
  erro.value = ''
  abrindo.value = true
}

function fechar() {
  abrindo.value = false
}

async function enviar() {
  erro.value = ''

  const nome = form.nome.trim()
  const email = form.email.trim().toLowerCase()

  if (nome.length < 2) {
    erro.value = 'Informe o nome do barbeiro.'
    return
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    erro.value = 'E-mail inválido.'
    return
  }
  if (pendentes.value.some((p) => p.email.toLowerCase() === email)) {
    erro.value = 'Já existe uma solicitação aguardando aprovação para esse e-mail.'
    return
  }

  salvando.value = true
  const { error } = await supabase.from('solicitacoes_barbeiro').insert({
    barbearia_id: contexto.value?.barbearia_id ?? '',
    nome,
    email,
    telefone: form.telefone.trim() || null,
    status: 'pendente',
    pedida_por: contexto.value?.perfil_id ?? null,
  })
  salvando.value = false

  if (error) {
    erro.value = error.message
    return
  }

  fechar()
  await refresh()
}

onMounted(() => {
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && abrindo.value) fechar()
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
          <h1 class="titulo">Equipe</h1>
          <span v-if="equipe.length" class="pill">
            {{ equipe.length }} barbeiro{{ equipe.length === 1 ? '' : 's' }}
          </span>
          <span v-if="pendentes.length" class="pill pill--neutra">
            {{ pendentes.length }} aguardando
          </span>
        </div>
        <p v-if="ehDono && (equipe.length || pendentes.length)" class="topo__sub">
          Barbeiros novos passam pela aprovação do sistema antes de receber o acesso.
        </p>
      </div>

      <button
        v-if="ehDono && (equipe.length || pendentes.length)"
        class="btn btn--laranja"
        @click="novo"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Cadastrar barbeiro
      </button>
    </header>

    <!-- ============ ninguém ainda ============ -->
    <section v-if="!equipe.length && !pendentes.length" class="vazio">
      <span class="vazio__icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <path d="M16 8.5a2.8 2.8 0 1 1 2 4.8M17.5 14.6c2 .5 3 1.9 3 3.9" />
        </svg>
      </span>
      <p class="vazio__titulo">Nenhum barbeiro na equipe</p>
      <p class="vazio__texto">
        Cada barbeiro tem a própria agenda e os próprios horários. O cadastro
        abre uma solicitação, o sistema aprova, e a senha de acesso sai na hora
        para você passar ao barbeiro.
      </p>

      <div v-if="ehDono" class="vazio__acoes">
        <button class="btn btn--laranja" @click="novo">Cadastrar o primeiro</button>
      </div>
    </section>

    <template v-else>
      <!-- ============ aguardando aprovação ============ -->
      <section v-if="pendentes.length" class="bloco">
        <p class="bloco__rotulo">Aguardando aprovação</p>
        <ul class="lista">
          <li v-for="p in pendentes" :key="p.id" class="cartao cartao--espera">
            <div class="avatar avatar--vazio" aria-hidden="true">{{ inicial(p.nome) }}</div>
            <div class="cartao__info">
              <div class="cartao__linha1">
                <span class="cartao__nome">{{ p.nome }}</span>
                <span class="selo selo--ouro">Aguardando aprovação</span>
              </div>
              <p class="cartao__meta">{{ p.email }}</p>
              <p class="cartao__desc">Pedido enviado em {{ emData(p.criada_em) }}</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- ============ na equipe ============ -->
      <section v-if="equipe.length" class="bloco">
        <p v-if="pendentes.length || recusadas.length" class="bloco__rotulo">Na equipe</p>
        <ul class="lista">
          <li
            v-for="b in equipe"
            :key="b.id"
            class="cartao"
            :class="{ 'cartao--off': b.status !== 'ativo' }"
          >
            <div class="avatar" :class="{ 'avatar--vazio': !b.foto_url }">
              <img v-if="b.foto_url" :src="b.foto_url" :alt="`Foto de ${b.nome}`" />
              <span v-else aria-hidden="true">{{ inicial(b.nome) }}</span>
            </div>

            <div class="cartao__info">
              <div class="cartao__linha1">
                <span class="cartao__nome">{{ b.nome }}</span>
                <span v-if="b.status !== 'ativo'" class="selo">Suspenso</span>
              </div>
              <p class="cartao__meta">
                <template v-if="notaDe.get(b.id)">
                  <span class="estrela" aria-hidden="true">★</span>
                  <span class="cartao__nota">{{ umDecimal.format(notaDe.get(b.id)!.media) }}</span>
                  <span class="cartao__ponto">·</span>
                  <span>{{ notaDe.get(b.id)!.total }} avaliaç{{ notaDe.get(b.id)!.total === 1 ? 'ão' : 'ões' }}</span>
                </template>
                <span v-else class="cartao__sem-nota">Sem avaliações ainda</span>
              </p>
              <p v-if="b.bio" class="cartao__desc">{{ b.bio }}</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- ============ recusadas ============ -->
      <section v-if="recusadas.length" class="bloco">
        <p class="bloco__rotulo">Recusadas</p>
        <ul class="lista">
          <li v-for="p in recusadas" :key="p.id" class="cartao cartao--off">
            <div class="avatar avatar--vazio" aria-hidden="true">{{ inicial(p.nome) }}</div>
            <div class="cartao__info">
              <div class="cartao__linha1">
                <span class="cartao__nome">{{ p.nome }}</span>
                <span class="selo">Recusada</span>
              </div>
              <p class="cartao__meta">{{ p.email }}</p>
              <p v-if="p.observacao" class="cartao__desc">Motivo: {{ p.observacao }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- ============ formulario ============ -->
    <Teleport to="body">
      <div v-if="abrindo" class="cortina" @click.self="fechar">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Cadastrar barbeiro</p>

          <p v-if="erro" class="janela__erro">{{ erro }}</p>

          <p class="janela__corpo janela__corpo--intro">
            O cadastro abre uma solicitação para o sistema aprovar. Quando
            aprovada, a senha de acesso é gerada e você repassa ao barbeiro.
          </p>

          <label class="campo">
            <span>Nome</span>
            <input v-model="form.nome" placeholder="João da Navalha" :disabled="salvando" />
          </label>

          <label class="campo">
            <span>E-mail</span>
            <input
              v-model="form.email"
              type="email"
              placeholder="joao@email.com"
              :disabled="salvando"
            />
          </label>

          <label class="campo">
            <span>WhatsApp <em>(opcional)</em></span>
            <input
              v-model="form.telefone"
              inputmode="tel"
              placeholder="(19) 99999-9999"
              :disabled="salvando"
            />
          </label>

          <div class="janela__acoes">
            <button class="btn btn--fantasma" :disabled="salvando" @click="fechar">Cancelar</button>
            <button class="btn btn--laranja" :disabled="salvando" @click="enviar">
              {{ salvando ? 'Enviando…' : 'Enviar para aprovação' }}
            </button>
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
  margin-bottom: 22px;
}
.topo__textos { min-width: 0; }
.topo__linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.titulo { margin: 0; color: var(--branco); }
.topo__sub {
  margin: 7px 0 0;
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
.pill--neutra {
  color: var(--cinza-600);
  background: transparent;
  border-color: var(--linha);
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
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease,
    transform 0.16s ease;
}
.btn svg { width: 16px; height: 16px; }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--laranja {
  background: var(--laranja);
  color: #FFFFFF;
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
.vazio__icone svg { width: 26px; height: 26px; }
.vazio__titulo {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.vazio__texto {
  margin: 0 auto 22px;
  max-width: 52ch;
  font-size: var(--tam-apoio);
  color: var(--cinza-600);
  line-height: 1.65;
}
.vazio__acoes { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

/* ---------- blocos e lista ---------- */
.bloco { margin-bottom: 26px; }
.bloco__rotulo {
  margin: 0 0 10px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.cartao {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
  transition: border-color 0.2s ease;
}
.cartao:hover { border-color: var(--linha); }
.cartao--off { opacity: 0.55; }
.cartao--espera { border-style: dashed; border-color: var(--dourado-linha); }

.avatar {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  color: var(--dourado);
  font-size: 19px;
  font-weight: 750;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar--vazio {
  background: rgba(0, 0, 0, 0.25);
  border-color: var(--linha-suave);
  color: var(--cinza-600);
}

.cartao__info { flex: 1; min-width: 0; }
.cartao__linha1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cartao__nome {
  font-size: 16.5px;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--branco);
}
.cartao__meta {
  margin: 4px 0 0;
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: var(--tam-apoio);
  color: var(--cinza);
  overflow-wrap: anywhere;
}
.estrela { color: var(--dourado); }
.cartao__nota { color: var(--dourado); font-weight: 750; font-variant-numeric: tabular-nums; }
.cartao__ponto { color: var(--cinza-600); }
.cartao__sem-nota { color: var(--cinza-600); }
.cartao__desc {
  margin: 5px 0 0;
  font-size: 12.5px;
  color: var(--cinza-600);
  line-height: 1.5;
}

.selo {
  padding: 3px 9px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza-600);
  white-space: nowrap;
}
.selo--ouro {
  border-color: var(--dourado-linha);
  color: var(--dourado);
  background: var(--dourado-suave);
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
  margin: 0 0 16px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.janela__corpo {
  margin: 0;
  font-size: 14px;
  color: var(--cinza);
  line-height: 1.6;
}
.janela__corpo--intro { margin-bottom: 18px; color: var(--cinza-600); }
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
}
.campo input:focus { outline: none; border-color: var(--dourado-linha); }
.campo input::placeholder { color: #5C5248; }

@media (max-width: 700px) {
  .topo { flex-direction: column; align-items: stretch; }
  .topo .btn--laranja { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .cartao { transition: none; }
  .cortina, .janela { animation: none; }
}
</style>