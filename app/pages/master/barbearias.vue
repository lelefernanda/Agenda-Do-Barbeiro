<script setup lang="ts">
import type { Database, Barbearia, FormaPagamento } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Barbearias — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()

type Linha = Pick<
  Barbearia,
  'id' | 'nome' | 'slug' | 'status' | 'cidade' | 'telefone'
  | 'pagamento' | 'vence_em' | 'criada_em'
>

const { data: lista, refresh } = await useAsyncData<Linha[]>(
  'barbearias',
  async () => {
    const { data } = await supabase
      .from('barbearias')
      .select('id, nome, slug, status, cidade, telefone, pagamento, vence_em, criada_em')
      .order('criada_em', { ascending: false })
    return (data ?? []) as Linha[]
  },
  { default: () => [] as Linha[] }
)

/* ------------------------------------------------------------
   Formulario
   ------------------------------------------------------------ */
const abrirForm = ref(false)
const enviando = ref(false)
const erro = ref('')

const form = reactive({
  nome: '',
  slug: '',
  endereco: '',
  cidade: '',
  telefone: '',        // WhatsApp comercial: onde os clientes chegam
  pagamento: 'mensal' as FormaPagamento,
  dono_nome: '',
  dono_email: '',
  dono_telefone: '',   // WhatsApp pessoal do dono: por onde vai a senha
})

// resultado da criacao: unica vez que a senha aparece
const criado = ref<{
  nome: string
  email: string
  senha: string
  slug: string
  telefone: string | null
} | null>(null)
const copiado = ref(false)

function paraSlug(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// o slug acompanha o nome enquanto nao for editado na mao
const slugManual = ref(false)
watch(
  () => form.nome,
  (n) => { if (!slugManual.value) form.slug = paraSlug(n) }
)
function editouSlug() {
  slugManual.value = true
  form.slug = paraSlug(form.slug)
}

const slugEmUso = computed(() =>
  lista.value.some((b) => b.slug === form.slug)
)

function limpar() {
  Object.assign(form, {
    nome: '', slug: '', endereco: '', cidade: '', telefone: '',
    pagamento: 'mensal' as FormaPagamento,
    dono_nome: '', dono_email: '', dono_telefone: '',
  })
  slugManual.value = false
  erro.value = ''
}

async function criar() {
  erro.value = ''
  enviando.value = true
  try {
    const r = await $fetch<{
      barbearia: Linha
      dono: { nome: string; email: string; senha: string; telefone: string | null }
    }>('/api/barbearias', { method: 'POST', body: { ...form } })

    criado.value = { ...r.dono, slug: r.barbearia.slug }
    abrirForm.value = false
    limpar()
    await refresh()
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erro.value = err.statusMessage || err.data?.statusMessage || 'Não foi possível criar.'
  } finally {
    enviando.value = false
  }
}

/* ------------------------------------------------------------
   Mensagem pronta pro WhatsApp
   ------------------------------------------------------------ */
const mensagemAcesso = computed(() => {
  const c = criado.value
  if (!c) return ''
  const base = import.meta.client ? window.location.origin : ''
  return [
    `Olá, ${c.nome}! Sua barbearia já está no ar 💈`,
    ``,
    `Página de agendamento dos seus clientes:`,
    `${base}/${c.slug}`,
    ``,
    `Seu painel: ${base}/login`,
    `E-mail: ${c.email}`,
    `Senha: ${c.senha}`,
    ``,
    `Troque a senha no primeiro acesso. Qualquer dúvida é só chamar.`,
  ].join('\n')
})

async function copiar() {
  await navigator.clipboard.writeText(mensagemAcesso.value)
  copiado.value = true
  setTimeout(() => (copiado.value = false), 2200)
}

// Abre a conversa com o dono ja com a mensagem escrita.
// Usa o WhatsApp PESSOAL dele — senha nao vai para o numero
// comercial, que a equipe inteira atende.
const linkWhatsApp = computed(() => {
  const t = criado.value?.telefone
  if (!t) return null
  return `https://wa.me/${t}?text=${encodeURIComponent(mensagemAcesso.value)}`
})

/* ------------------------------------------------------------
   Suspender e reativar
   ------------------------------------------------------------ */
const mexendo = ref<string | null>(null)

async function trocarStatus(b: Linha) {
  const novo = b.status === 'ativa' ? 'suspensa' : 'ativa'
  const aviso =
    novo === 'suspensa'
      ? `Suspender ${b.nome}?\n\nO dono e todos os barbeiros perdem o acesso na hora, e a página pública sai do ar. Nada é apagado — reativar devolve tudo como estava.`
      : `Reativar ${b.nome}?`
  if (!confirm(aviso)) return

  mexendo.value = b.id
  await supabase.from('barbearias').update({ status: novo }).eq('id', b.id)
  mexendo.value = null
  await refresh()
}

/** Dias que faltam para vencer. Negativo = ja venceu. */
function diasAte(iso: string | null): number | null {
  if (!iso) return null
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${iso}T00:00:00`)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

function dataBr(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
</script>

<template>
  <div>
    <header class="topo">
      <div>
        <p class="sobrancelha">Barbearias</p>
        <h1 class="titulo">{{ lista.length }} cadastrada{{ lista.length === 1 ? '' : 's' }}</h1>
      </div>
      <button class="btn btn--ouro" @click="abrirForm = !abrirForm">
        {{ abrirForm ? 'Cancelar' : '+ Nova barbearia' }}
      </button>
    </header>

    <!-- ============ dados de acesso, aparecem uma vez ============ -->
    <section v-if="criado" class="acesso">
      <div class="acesso__topo">
        <p class="acesso__titulo">Barbearia criada</p>
        <button class="acesso__fechar" aria-label="Fechar" @click="criado = null">×</button>
      </div>

      <p class="acesso__aviso">
        Esta senha não fica guardada em lugar nenhum. Copie agora e mande pro dono.
      </p>

      <dl class="dados">
        <div><dt>E-mail</dt><dd>{{ criado.email }}</dd></div>
        <div><dt>Senha</dt><dd class="dados__senha">{{ criado.senha }}</dd></div>
        <div><dt>Página</dt><dd>/{{ criado.slug }}</dd></div>
      </dl>

      <div class="acesso__acoes">
        <a
          v-if="linkWhatsApp"
          :href="linkWhatsApp"
          target="_blank"
          rel="noopener"
          class="btn btn--laranja btn--bloco"
        >
          Abrir WhatsApp do dono com a mensagem
        </a>
        <button class="btn btn--ouro btn--bloco" @click="copiar">
          {{ copiado ? 'Copiado ✓' : 'Copiar mensagem' }}
        </button>
      </div>
    </section>

    <!-- ============ formulario ============ -->
    <section v-if="abrirForm" class="form">
      <p v-if="erro" class="erro">{{ erro }}</p>

      <p class="form__grupo">Barbearia</p>
      <div class="grade">
        <label class="campo campo--largo">
          <span>Nome</span>
          <input v-model="form.nome" placeholder="Barbearia do Zé" :disabled="enviando" />
        </label>

        <label class="campo campo--largo">
          <span>Endereço da página</span>
          <div class="url">
            <span class="url__base">/</span>
            <input v-model="form.slug" placeholder="barbearia-do-ze" :disabled="enviando" @input="editouSlug" />
          </div>
          <small v-if="slugEmUso" class="dica dica--ruim">Este endereço já está em uso.</small>
          <small v-else-if="form.slug" class="dica">Os clientes vão acessar por /{{ form.slug }}</small>
        </label>

        <label class="campo campo--largo">
          <span>Endereço</span>
          <input v-model="form.endereco" placeholder="Rua das Flores, 123 — Centro" :disabled="enviando" />
        </label>

        <label class="campo">
          <span>Cidade</span>
          <input v-model="form.cidade" placeholder="Pedreira" :disabled="enviando" />
        </label>

        <label class="campo">
          <span>WhatsApp comercial</span>
          <input v-model="form.telefone" placeholder="(19) 3333-3333" :disabled="enviando" />
          <small class="dica">Aparece na página pública, para os clientes.</small>
        </label>

        <label class="campo">
          <span>Pagamento</span>
          <select v-model="form.pagamento" :disabled="enviando">
            <option value="mensal">Mensal</option>
            <option value="semestral">6 meses à vista</option>
          </select>
        </label>
      </div>

      <p class="form__grupo">Dono</p>
      <div class="grade">
        <label class="campo">
          <span>Nome</span>
          <input v-model="form.dono_nome" placeholder="José da Silva" :disabled="enviando" />
        </label>
        <label class="campo">
          <span>E-mail de acesso</span>
          <input v-model="form.dono_email" type="email" placeholder="jose@email.com" :disabled="enviando" />
        </label>

        <label class="campo">
          <span>WhatsApp pessoal</span>
          <input v-model="form.dono_telefone" placeholder="(19) 99999-9999" :disabled="enviando" />
          <small class="dica">Por onde você manda a senha e fala com ele.</small>
        </label>
      </div>

      <button class="btn btn--laranja" :disabled="enviando || slugEmUso" @click="criar">
        {{ enviando ? 'Criando…' : 'Criar barbearia e liberar acesso' }}
      </button>
    </section>

    <!-- ============ lista ============ -->
    <p v-if="lista.length === 0 && !abrirForm" class="vazio">
      Nenhuma barbearia ainda. Quando fechar a primeira venda, clique em
      <strong>Nova barbearia</strong> e o acesso do dono sai pronto.
    </p>

    <ul v-else-if="lista.length" class="lista">
      <li v-for="b in lista" :key="b.id" class="cartao" :class="{ 'cartao--off': b.status !== 'ativa' }">
        <div class="cartao__info">
          <div class="cartao__linha1">
            <span class="cartao__nome">{{ b.nome }}</span>
            <span class="selo" :class="`selo--${b.status}`">{{ b.status }}</span>
          </div>
          <p class="cartao__meta">
            <NuxtLink :to="`/${b.slug}`" class="cartao__link" target="_blank">/{{ b.slug }}</NuxtLink>
            <span v-if="b.cidade"> · {{ b.cidade }}</span>
            <span> · {{ b.pagamento === 'semestral' ? '6 meses' : 'mensal' }}</span>
            <span v-if="b.vence_em"> · vence {{ dataBr(b.vence_em) }}</span>
          </p>
          <p
            v-if="b.status === 'ativa' && diasAte(b.vence_em) !== null && diasAte(b.vence_em)! <= 7"
            class="alerta"
          >
            <template v-if="diasAte(b.vence_em)! < 0">Venceu há {{ -diasAte(b.vence_em)! }} dia(s)</template>
            <template v-else-if="diasAte(b.vence_em) === 0">Vence hoje</template>
            <template v-else>Vence em {{ diasAte(b.vence_em) }} dia(s)</template>
          </p>
        </div>

        <button
          class="btn btn--pequeno"
          :class="b.status === 'ativa' ? 'btn--perigo' : 'btn--ouro'"
          :disabled="mexendo === b.id"
          @click="trocarStatus(b)"
        >
          {{ mexendo === b.id ? '…' : b.status === 'ativa' ? 'Suspender' : 'Reativar' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.topo {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}
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
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 32px;
  letter-spacing: -0.02em;
  color: var(--branco);
}

/* ---------- botoes ---------- */
.btn {
  padding: 12px 20px;
  border: 1px solid transparent;
  border-radius: var(--raio);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 700;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.btn--pequeno { padding: 8px 15px; font-size: 13px; }
.btn--bloco { width: 100%; }
.btn:disabled { opacity: 0.5; cursor: default; }

.btn--laranja { background: var(--laranja); color: #17100A; }
.btn--laranja:hover:not(:disabled) { background: var(--laranja-400); }

.btn--ouro {
  background: transparent;
  border-color: var(--dourado-600);
  color: var(--dourado);
}
.btn--ouro:hover:not(:disabled) { background: rgba(212, 175, 55, 0.1); }

.btn--perigo {
  background: transparent;
  border-color: var(--preto-600);
  color: var(--cinza);
}
.btn--perigo:hover:not(:disabled) { border-color: var(--laranja); color: var(--laranja); }

/* ---------- dados de acesso ---------- */
.acesso {
  margin-bottom: 26px;
  padding: 24px 26px;
  background: linear-gradient(150deg, rgba(212, 175, 55, 0.09) 0%, transparent 60%), var(--preto-800);
  border: 1px solid var(--dourado-600);
  border-radius: 12px;
}
.acesso__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.acesso__titulo {
  margin: 0;
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 21px;
  color: var(--dourado);
}
.acesso__fechar {
  background: transparent;
  border: 0;
  color: var(--cinza-600);
  font-size: 24px;
  line-height: 1;
  padding: 0 4px;
}
.acesso__fechar:hover { color: var(--branco); }
.acesso__aviso {
  margin: 0 0 18px;
  font-size: 13.5px;
  color: var(--cinza);
}

.dados {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
  margin: 0 0 20px;
}
.dados div {
  padding: 12px 14px;
  background: var(--preto);
  border: 1px solid var(--preto-700);
  border-radius: var(--raio);
  min-width: 0;
}
.dados dt {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza-600);
  margin-bottom: 5px;
}
.dados dd {
  margin: 0;
  font-size: 14.5px;
  color: var(--branco);
  overflow-wrap: anywhere;
}
.dados__senha {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dourado) !important;
  letter-spacing: 0.02em;
}

/* ---------- formulario ---------- */
.form {
  margin-bottom: 26px;
  padding: 24px 26px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 12px;
}
.form__grupo {
  margin: 0 0 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.form__grupo:not(:first-of-type) {
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px solid var(--preto-700);
}

.grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
  margin-bottom: 22px;
}
.campo { display: flex; flex-direction: column; min-width: 0; }
.campo--largo { grid-column: span 2; }
.campo > span {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo input,
.campo select {
  width: 100%;
  padding: 11px 13px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  color: var(--branco);
  background: var(--preto);
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
  transition: border-color 0.18s ease;
}
.campo input::placeholder { color: #4A4A4A; }
.campo input:focus,
.campo select:focus { outline: none; border-color: var(--dourado-600); }

.url { display: flex; align-items: stretch; }
.url__base {
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 15px;
  color: var(--cinza-600);
  background: var(--preto);
  border: 1px solid var(--preto-600);
  border-right: 0;
  border-radius: var(--raio) 0 0 var(--raio);
}
.url input { border-radius: 0 var(--raio) var(--raio) 0; }

.dica { margin-top: 6px; font-size: 12.5px; color: var(--cinza-600); }
.dica--ruim { color: var(--laranja); }

.erro {
  margin: 0 0 18px;
  padding: 11px 14px;
  border: 1px solid rgba(232, 135, 58, 0.4);
  background: rgba(232, 135, 58, 0.08);
  border-radius: var(--raio);
  font-size: 14px;
  color: var(--laranja-400);
}

/* ---------- lista ---------- */
.vazio {
  margin: 0;
  padding: 30px 26px;
  background: var(--preto-800);
  border: 1px dashed var(--preto-600);
  border-radius: 10px;
  font-size: 14.5px;
  color: var(--cinza-600);
  line-height: 1.65;
}
.vazio strong { color: var(--dourado); font-weight: 700; }

.lista { list-style: none; margin: 0; padding: 0; }
.cartao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 22px;
  margin-bottom: 10px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 10px;
  transition: border-color 0.2s ease;
}
.cartao:hover { border-color: var(--preto-600); }
.cartao--off { opacity: 0.62; }

.cartao__info { min-width: 0; }
.cartao__linha1 { display: flex; align-items: center; gap: 11px; flex-wrap: wrap; }
.cartao__nome {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -0.015em;
  color: var(--branco);
}
.cartao__meta { margin: 5px 0 0; font-size: 13px; color: var(--cinza-600); }
.cartao__link { color: var(--dourado); }
.cartao__link:hover { text-decoration: underline; }

.selo {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 99px;
  border: 1px solid;
}
.acesso__acoes { display: grid; gap: 10px; }

.alerta {
  display: inline-block;
  margin: 8px 0 0;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--laranja-400);
  background: rgba(232, 135, 58, 0.1);
  border: 1px solid rgba(232, 135, 58, 0.35);
  border-radius: 99px;
}

.selo--ativa     { color: var(--verde);     border-color: var(--verde); }
.selo--suspensa  { color: var(--laranja);   border-color: var(--laranja); }
.selo--cancelada { color: var(--cinza-600); border-color: var(--cinza-600); }

@media (max-width: 700px) {
  .topo { flex-direction: column; align-items: stretch; }
  .campo--largo { grid-column: span 1; }
  .cartao { flex-direction: column; align-items: stretch; }
}
</style>