<script setup lang="ts">
definePageMeta({ layout: 'painel' })
useHead({ title: 'Redefinir senha — Agenda Do Barbeiro' })

const email = ref('')
const mexendo = ref(false)
const erro = ref('')

const resultado = ref<{
  nome: string
  papel: string | null
  email: string
  senha: string
} | null>(null)

const PAPEL_LEGIVEL: Record<string, string> = {
  master: 'Master',
  dono: 'Dono de barbearia',
  barbeiro: 'Barbeiro',
}

async function redefinir() {
  erro.value = ''
  mexendo.value = true
  try {
    const resposta = await $fetch<{ pessoa: typeof resultado.value }>('/api/senha', {
      method: 'POST',
      body: { email: email.value },
    })
    resultado.value = resposta.pessoa
    email.value = ''
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erro.value = err.data?.statusMessage || err.statusMessage || 'Não foi possível redefinir.'
  }
  mexendo.value = false
}

/* Mensagem pronta para colar no WhatsApp */
const mensagemPronta = computed(() => {
  const r = resultado.value
  if (!r) return ''
  return (
    `Sua senha foi redefinida.\n` +
    `E-mail: ${r.email}\n` +
    `Senha nova: ${r.senha}\n` +
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
    if (e.key === 'Escape' && resultado.value) resultado.value = null
  }
  window.addEventListener('keydown', aoTeclar)
  onUnmounted(() => window.removeEventListener('keydown', aoTeclar))
})
</script>

<template>
  <div>
    <header class="topo">
      <p class="sobrancelha">Acesso</p>
      <h1 class="titulo">Redefinir senha</h1>
    </header>

    <section class="cartao">
      <p class="cartao__texto">
        Para quem esqueceu a senha: digite o e-mail da conta, gere a senha nova
        e repasse no WhatsApp. A senha antiga deixa de valer na hora, e a nova
        aparece <strong>uma única vez</strong>.
      </p>

      <p v-if="erro" class="erro-geral">{{ erro }}</p>

      <div class="linha-form">
        <label class="campo">
          <span>E-mail da conta</span>
          <input
            v-model="email"
            type="email"
            placeholder="pessoa@email.com"
            :disabled="mexendo"
            @keydown.enter="redefinir"
          />
        </label>
        <button class="btn btn--laranja" :disabled="mexendo || !email.trim()" @click="redefinir">
          {{ mexendo ? 'Gerando…' : 'Gerar senha nova' }}
        </button>
      </div>
    </section>

    <!-- ============ senha gerada ============ -->
    <Teleport to="body">
      <div v-if="resultado" class="cortina" @click.self="resultado = null">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Senha redefinida</p>
          <h2 class="janela__titulo">{{ resultado.nome }}</h2>
          <p class="janela__corpo">
            <template v-if="resultado.papel">
              {{ PAPEL_LEGIVEL[resultado.papel] ?? resultado.papel }}.
            </template>
            A senha abaixo aparece <strong>só agora</strong> — repasse antes de fechar.
          </p>

          <div class="credenciais">
            <p><span>E-mail</span>{{ resultado.email }}</p>
            <p><span>Senha</span><code>{{ resultado.senha }}</code></p>
          </div>

          <div class="janela__acoes">
            <button class="btn btn--simples" @click="copiar">
              {{ copiado ? 'Copiado ✓' : 'Copiar mensagem' }}
            </button>
            <button class="btn btn--laranja" @click="resultado = null">Fechar</button>
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
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--laranja { background: var(--laranja); color: #17100A; }
.btn--laranja:hover:not(:disabled) { background: var(--laranja-400); }

.btn--simples {
  background: transparent;
  border-color: var(--preto-600);
  color: var(--cinza);
}
.btn--simples:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- cartao ---------- */
.cartao {
  padding: 24px 26px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 12px;
  max-width: 560px;
}
.cartao__texto {
  margin: 0 0 20px;
  font-size: 14.5px;
  color: var(--cinza);
  line-height: 1.65;
}
.cartao__texto strong { color: var(--branco); }

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

.linha-form {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.campo { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.campo > span {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo input {
  width: 100%;
  padding: 11px 13px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  color: var(--branco);
  background: var(--preto);
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
}
.campo input:focus { outline: none; border-color: var(--dourado-600); }
.campo input::placeholder { color: #4A4A4A; }

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

@media (max-width: 700px) {
  .linha-form { flex-direction: column; align-items: stretch; }
}
</style>