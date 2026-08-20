<script setup lang="ts">
const { contexto, sair, ehMaster, ehDono } = useAcesso()

const menuAberto = ref(false)

interface Item { rota: string; texto: string }

const itens = computed<Item[]>(() => {
  if (ehMaster.value) {
    return [
      { rota: '/master',                texto: 'Visão geral' },
      { rota: '/master/barbearias',     texto: 'Barbearias' },
      { rota: '/master/solicitacoes',   texto: 'Solicitações' },
    ]
  }
  if (ehDono.value) {
    return [
      { rota: '/painel',              texto: 'Agenda' },
      { rota: '/painel/servicos',     texto: 'Serviços' },
      { rota: '/painel/equipe',       texto: 'Equipe' },
      { rota: '/painel/clientes',     texto: 'Clientes' },
      { rota: '/painel/barbearia',    texto: 'Minha barbearia' },
    ]
  }
  // barbeiro
  return [
    { rota: '/painel',            texto: 'Minha agenda' },
    { rota: '/painel/horarios',   texto: 'Meus horários' },
    { rota: '/painel/avaliacoes', texto: 'Avaliações' },
  ]
})

const rotuloPapel = computed(() => {
  if (ehMaster.value) return 'Master'
  if (ehDono.value) return 'Dono'
  return 'Barbeiro'
})

const iniciais = computed(() => {
  const n = contexto.value?.nome ?? ''
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
})
</script>

<template>
  <div class="shell">
    <!-- Barra lateral -->
    <aside class="lado" :class="{ 'lado--aberto': menuAberto }">
      <NuxtLink to="/" class="marca">
        <span class="marca__brasao"><LogoBarba /></span>
        <span class="marca__texto">
          <span class="marca__linha1">Agenda</span>
          <span class="marca__linha2">do Barbeiro</span>
        </span>
      </NuxtLink>

      <p v-if="contexto?.barbearia_nome" class="lado__barbearia">
        {{ contexto.barbearia_nome }}
      </p>

      <nav class="menu">
        <NuxtLink
          v-for="i in itens"
          :key="i.rota"
          :to="i.rota"
          class="menu__item"
          @click="menuAberto = false"
        >
          {{ i.texto }}
        </NuxtLink>
      </nav>

      <NuxtLink to="/perfil" class="usuario" @click="menuAberto = false">
        <span class="usuario__avatar">
          <img v-if="contexto?.foto_url" :src="contexto.foto_url" alt="" />
          <span v-else aria-hidden="true">{{ iniciais }}</span>
        </span>
        <div class="usuario__dados">
          <p class="usuario__nome">{{ contexto?.nome }}</p>
          <p class="usuario__papel">{{ rotuloPapel }}</p>
        </div>
      </NuxtLink>

      <button class="sair" @click="sair">Sair</button>
    </aside>

    <!-- Conteúdo -->
    <div class="corpo">
      <header class="topo">
        <button
          class="hamburguer"
          aria-label="Abrir menu"
          @click="menuAberto = !menuAberto"
        >
          <span></span><span></span><span></span>
        </button>
        <span class="topo__nome">{{ contexto?.barbearia_nome || 'Painel Master' }}</span>
      </header>

      <main class="conteudo">
        <slot />
      </main>
    </div>

    <div
      v-if="menuAberto"
      class="cortina"
      aria-hidden="true"
      @click="menuAberto = false"
    ></div>
  </div>
</template>

<style scoped>
/*
 * Painel usa uma fonte so, neutra.
 *
 * A Playfair fica na home e no login, onde a pessoa passa segundos.
 * Aqui ela passa horas, e a letra precisa sumir para a informacao
 * aparecer. Trocar a variavel aqui muda todas as telas do painel de
 * uma vez, porque variavel de CSS desce para os filhos.
 */
.shell {
  --fonte-display: var(--fonte-corpo);
  display: flex;
  min-height: 100vh;
  background: var(--preto);
}

/* titulos das paginas do painel, ja em Manrope */
.shell :deep(h1) { letter-spacing: -0.03em; font-size: 30px; }
.shell :deep(h2) { letter-spacing: -0.02em; }

/* ---------- Barra lateral ---------- */
.lado {
  display: flex;
  flex-direction: column;
  width: 280px;
  flex-shrink: 0;
  padding: 26px 20px;
  background: var(--preto-800);
  border-right: 1px solid var(--preto-700);
}

.marca { display: flex; align-items: center; gap: 11px; margin-bottom: 4px; }
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
  margin-top: 4px;
}

.lado__barbearia {
  margin: 18px 0 0;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dourado);
  background: rgba(212, 175, 55, 0.07);
  border: 1px solid var(--dourado-600);
  border-radius: var(--raio);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 24px;
}
.menu__item {
  padding: 12px 14px;
  border-radius: var(--raio);
  font-size: 15.5px;
  font-weight: 500;
  color: var(--cinza);
  transition: background 0.15s ease, color 0.15s ease;
}
.menu__item:hover { background: var(--preto-700); color: var(--branco); }
.menu__item.router-link-exact-active {
  background: var(--preto-700);
  color: var(--dourado);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--dourado);
}

.usuario {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: auto;
  padding: 14px 10px 12px;
  margin-left: -10px;
  margin-right: -10px;
  border-top: 1px solid var(--preto-700);
  border-radius: var(--raio);
  transition: background 0.16s ease;
}
.usuario:hover { background: var(--preto-700); }
.usuario__avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--dourado-600);
  color: var(--preto);
  font-size: 13px;
  font-weight: 700;
}
.usuario__avatar img { width: 100%; height: 100%; object-fit: cover; }
.usuario__dados { min-width: 0; }
.usuario__nome {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--branco);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.usuario__papel {
  margin: 1px 0 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

.sair {
  margin-top: 14px;
  padding: 9px;
  width: 100%;
  background: transparent;
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
  color: var(--cinza);
  font-family: var(--fonte-corpo);
  font-size: 13.5px;
  font-weight: 600;
  transition: border-color 0.18s ease, color 0.18s ease;
}
.sair:hover { border-color: var(--laranja); color: var(--laranja); }

/* ---------- Conteúdo ---------- */
.corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; }

.topo {
  display: none;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
  background: var(--preto-800);
  border-bottom: 1px solid var(--preto-700);
}
.topo__nome {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 17px;
  color: var(--branco);
}

.hamburguer {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 34px;
  height: 34px;
  padding: 0 6px;
  background: transparent;
  border: 1px solid var(--preto-600);
  border-radius: var(--raio);
}
.hamburguer span {
  display: block;
  height: 1.6px;
  background: var(--dourado);
}

.conteudo {
  flex: 1;
  width: 100%;
  max-width: 1120px;
  padding: 36px 40px;
}

.cortina {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 40;
}

/* ---------- Celular ---------- */
@media (max-width: 860px) {
  .topo { display: flex; }
  .cortina { display: block; }
  .lado {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    width: min(300px, 82vw);
    transform: translateX(-100%);
    transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .lado--aberto { transform: translateX(0); }
  .conteudo { padding: 24px 20px; max-width: none; }
}
</style>