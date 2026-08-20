<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const usuario = useSupabaseUser()
const rota = useRoute()
const { carregar, rotaInicial, ultimaFalha } = useAcesso()

useHead({ title: 'Entrar — Agenda Do Barbeiro' })

const email = ref('')
const senha = ref('')
const enviando = ref(false)
const mostrarSenha = ref(false)
const erro = ref('')

// erro vindo do middleware (bloqueado, suspensa, etc.)
onMounted(() => {
  const codigo = rota.query.erro
  if (typeof codigo === 'string' && codigo) erro.value = mensagem(codigo)
})

// quem ja esta logado nao precisa ver esta tela
watchEffect(async () => {
  if (usuario.value && !rota.query.erro) {
    const ctx = await carregar()
    if (ctx?.acesso) await navigateTo(rotaInicial(ctx), { replace: true })
  }
})

async function entrar() {
  erro.value = ''

  if (!email.value.trim() || !senha.value) {
    erro.value = 'Preencha e-mail e senha.'
    return
  }

  enviando.value = true

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: senha.value,
  })

  if (error) {
    enviando.value = false
    erro.value = mensagem('credenciais')
    return
  }

  const ctx = await carregar(true)
  enviando.value = false

  if (!ctx) {
    await supabase.auth.signOut()
    erro.value = mensagem(ultimaFalha.value ?? 'sem_perfil')
    return
  }

  if (!ctx.acesso) {
    await supabase.auth.signOut()
    erro.value = mensagem(ctx.motivo)
    return
  }

  const voltar = rota.query.voltar
  const destino = typeof voltar === 'string' && voltar ? voltar : rotaInicial(ctx)
  await navigateTo(destino, { replace: true })
}
</script>

<template>
  <div class="tela">
    <div class="brilho" aria-hidden="true"></div>

    <main class="caixa">
      <NuxtLink to="/" class="marca">
        <span class="marca__brasao"><LogoBarba /></span>
        <span class="marca__texto">
          <span class="marca__linha1">Agenda</span>
          <span class="marca__linha2">do Barbeiro</span>
        </span>
      </NuxtLink>

      <h1 class="titulo">Entrar no painel</h1>
      <p class="sub">Use o e-mail e a senha que você recebeu no WhatsApp.</p>

      <div v-if="erro" class="alerta" role="alert">{{ erro }}</div>

      <div class="campo">
        <label for="email">E-mail</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          placeholder="voce@email.com"
          :disabled="enviando"
          @keyup.enter="entrar"
        />
      </div>

      <div class="campo">
        <label for="senha">Senha</label>
        <div class="senha">
          <input
            id="senha"
            v-model="senha"
            :type="mostrarSenha ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="enviando"
            @keyup.enter="entrar"
          />
          <button
            type="button"
            class="olho"
            :aria-label="mostrarSenha ? 'Esconder senha' : 'Mostrar senha'"
            :aria-pressed="mostrarSenha"
            @click="mostrarSenha = !mostrarSenha"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
              <line v-if="mostrarSenha" x1="4" y1="20" x2="20" y2="4" />
            </svg>
          </button>
        </div>
      </div>

      <button class="btn" :disabled="enviando" @click="entrar">
        {{ enviando ? 'Entrando…' : 'Entrar' }}
      </button>

      <p class="ajuda">
        Esqueceu a senha ou não consegue entrar?
        <a href="https://wa.me/5519982659293" target="_blank" rel="noopener">Chame no WhatsApp</a>
      </p>

      <NuxtLink to="/" class="voltar">← Voltar para o site</NuxtLink>
    </main>
  </div>
</template>

<style scoped>
.tela {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background: var(--preto);
  overflow: hidden;
}

.brilho {
  position: absolute;
  top: -260px;
  left: 50%;
  width: 820px;
  height: 560px;
  transform: translateX(-50%);
  background: radial-gradient(
    ellipse at center,
    rgba(212, 175, 55, 0.13) 0%,
    rgba(212, 175, 55, 0.04) 42%,
    transparent 70%
  );
  pointer-events: none;
}

.caixa {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: linear-gradient(170deg, var(--preto-800) 0%, var(--preto) 100%);
  border: 1px solid var(--preto-700);
  border-radius: 12px;
  padding: 38px 34px 30px;
  box-shadow: 0 40px 80px -40px rgba(0, 0, 0, 0.95);
}

.marca {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 30px;
}
.marca__brasao {
  display: block;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  color: var(--dourado);
}
.marca__texto { display: flex; flex-direction: column; line-height: 1; }
.marca__linha1 {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 21px;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.marca__linha2 {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--dourado);
  margin-top: 5px;
}

.titulo {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  color: var(--branco);
}
.sub {
  margin: 0 0 26px;
  font-size: 14.5px;
  color: var(--cinza-600);
  line-height: 1.5;
}

.alerta {
  margin-bottom: 20px;
  padding: 12px 14px;
  border-radius: var(--raio);
  border: 1px solid rgba(232, 135, 58, 0.4);
  background: rgba(232, 135, 58, 0.08);
  color: var(--laranja-400);
  font-size: 14px;
  line-height: 1.5;
}

.campo { margin-bottom: 16px; }
.campo label {
  display: block;
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo input {
  width: 100%;
  padding: 13px 14px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  color: var(--branco);
  background: var(--preto);
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
  transition: border-color 0.18s ease;
}
.campo input::placeholder { color: #4A4A4A; }
.campo input:focus {
  outline: none;
  border-color: var(--dourado-600);
}
.campo input:disabled { opacity: 0.5; }

/* campo de senha com o botao de olho por cima */
.senha { position: relative; }
.senha input { padding-right: 46px; }

.olho {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: var(--raio);
  color: var(--cinza-600);
  transition: color 0.18s ease;
}
.olho:hover { color: var(--dourado); }
.olho svg { width: 19px; height: 19px; }

.btn {
  width: 100%;
  margin-top: 8px;
  padding: 14px;
  border: 0;
  border-radius: var(--raio);
  background: var(--laranja);
  color: #17100A;
  font-family: var(--fonte-corpo);
  font-weight: 700;
  font-size: 15.5px;
  transition: background 0.18s ease, transform 0.18s ease;
}
.btn:hover:not(:disabled) {
  background: var(--laranja-400);
  transform: translateY(-1px);
}
.btn:disabled { opacity: 0.6; cursor: default; }

.ajuda {
  margin: 20px 0 0;
  font-size: 13px;
  color: var(--cinza-600);
  line-height: 1.6;
  text-align: center;
}
.ajuda a { color: var(--dourado); }
.ajuda a:hover { color: var(--dourado-400); }

.voltar {
  display: block;
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--preto-700);
  font-size: 13px;
  color: var(--cinza-600);
  text-align: center;
}
.voltar:hover { color: var(--branco); }
</style>