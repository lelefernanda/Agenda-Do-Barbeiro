<script setup lang="ts">
/*
 * A fonte Archivo carrega aqui, e não no nuxt.config, de propósito:
 * useHead num layout vale só para as páginas que usam esse layout.
 * Home e login continuam com Playfair + Manrope, intocadas.
 */
useHead({
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&display=swap',
    },
  ],
})

const { contexto, sair, ehMaster, ehDono, trocarUnidade } = useAcesso()

/* As unidades que este dono administra. Com uma so, o nome da
   barbearia continua sendo texto simples: o seletor so aparece para
   quem tem de fato mais de uma loja. */
type Unidade = { id: string; nome: string; slug: string; cidade: string | null }

const supabaseUnidades = useSupabaseClient()
const listaAberta = ref(false)
const unidades = ref<Unidade[]>([])

onMounted(async () => {
  const { data } = await supabaseUnidades.rpc('minhas_barbearias')
  unidades.value = (data ?? []) as Unidade[]
})

async function escolherUnidade(id: string) {
  listaAberta.value = false
  if (id === contexto.value?.barbearia_id) return
  await trocarUnidade(id)
  await navigateTo('/painel')
}

/*
 * Ícones de traço, desenhados direto no código.
 * `d` são os caminhos, `c` são círculos [cx, cy, raio].
 * Todos herdam a cor do texto via currentColor.
 */
type Traco = { d: string; c?: [number, number, number][] }

const ICONES = {
  caixa: {
    d: 'M12 5.5v13 M15.4 8.3c-.8-1-2-1.5-3.3-1.5-1.8 0-3.2 1-3.2 2.4 0 3.2 6.6 1.9 6.6 5.1 0 1.5-1.5 2.5-3.4 2.5-1.4 0-2.7-.6-3.5-1.6',
  },
  agenda: {
    d: 'M7.5 3.5v3 M16.5 3.5v3 M6 5h12a2.5 2.5 0 0 1 2.5 2.5V18A2.5 2.5 0 0 1 18 20.5H6A2.5 2.5 0 0 1 3.5 18V7.5A2.5 2.5 0 0 1 6 5z M3.5 10h17',
  },
  tesoura: {
    d: 'M8 7.4 19.5 18.9 M8 16.6 19.5 5.1',
    c: [[6, 6, 2.4], [6, 18, 2.4]],
  },
  equipe: {
    d: 'M3.5 20.5c0-3.1 2.5-5.2 5.5-5.2s5.5 2.1 5.5 5.2 M15.8 5.9a3.2 3.2 0 0 1 0 6.2 M17.4 15.6c2.2.6 3.6 2.3 3.6 4.9',
    c: [[9, 8.2, 3.2]],
  },
  clientes: {
    d: 'M5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9A2.5 2.5 0 0 1 5.5 5z M14.5 10h3.5 M14.5 13.5h3.5 M6.5 14.6c.4-1.2 1.2-1.9 2.3-1.9s1.9.7 2.3 1.9',
    c: [[8.8, 9.8, 1.9]],
  },
  barbearia: {
    d: 'M4 9.5 5.5 4.5h13L20 9.5 M3.5 9.5h17 M4.8 9.5V19a1.5 1.5 0 0 0 1.5 1.5h11.4A1.5 1.5 0 0 0 19.2 19V9.5 M9.5 20.5v-5.5h5v5.5',
  },
  visao: {
    d: 'M4 4h6.5v6.5H4z M13.5 4H20v6.5h-6.5z M4 13.5h6.5V20H4z M13.5 13.5H20V20h-6.5z',
  },
  solicitacoes: {
    d: 'M6.2 5h11.6l2.7 7.6V18a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18v-5.4z M3.5 13.5h5.2l1.4 2.3h3.8l1.4-2.3h5.2',
  },
  horarios: {
    d: 'M12 7.8V12l2.8 1.9',
    c: [[12, 12, 8.3]],
  },
  avaliacoes: {
    d: 'M12 4.2l2.3 4.7 5.2.8-3.7 3.6.9 5.2L12 16l-4.7 2.5.9-5.2L4.5 9.7l5.2-.8z',
  },
  sair: {
    d: 'M15 8.2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2.2 M9.5 12h11 M17.3 8.8 20.5 12l-3.2 3.2',
  },
} satisfies Record<string, Traco>

/*
 * `emBreve: true` marca telas que ainda não existem. O item aparece
 * no menu apagado e sem link. Quando a tela for construída, é só
 * apagar a flag.
 */
type Item = {
  rota: string
  texto: string
  curto?: string
  icone: Traco
  emBreve?: boolean
}

const itens = computed<Item[]>(() => {
  if (ehMaster.value) {
    return [
      { rota: '/master', texto: 'Visão geral', curto: 'Início', icone: ICONES.visao },
      { rota: '/master/barbearias', texto: 'Barbearias', icone: ICONES.barbearia },
      { rota: '/master/solicitacoes', texto: 'Solicitações', icone: ICONES.solicitacoes },
      { rota: '/master/senha', texto: 'Senhas', icone: ICONES.sair },
    ]
  }
  if (ehDono.value) {
    return [
      { rota: '/painel', texto: 'Agenda', icone: ICONES.agenda },
      { rota: '/painel/servicos', texto: 'Serviços', icone: ICONES.tesoura },
      { rota: '/painel/equipe', texto: 'Equipe', icone: ICONES.equipe },
      { rota: '/painel/caixa', texto: 'Caixa', icone: ICONES.caixa },
      { rota: '/painel/horarios', texto: 'Horários', icone: ICONES.horarios },
      { rota: '/painel/clientes', texto: 'Clientes', icone: ICONES.clientes, emBreve: true },
      { rota: '/painel/barbearia', texto: 'Minha barbearia', curto: 'Barbearia', icone: ICONES.barbearia },
    ]
  }
  // barbeiro
  return [
    { rota: '/painel', texto: 'Minha agenda', curto: 'Agenda', icone: ICONES.agenda },
    { rota: '/painel/horarios', texto: 'Meus horários', curto: 'Horários', icone: ICONES.horarios },
    { rota: '/painel/caixa', texto: 'Meus ganhos', curto: 'Ganhos', icone: ICONES.caixa },
    { rota: '/painel/avaliacoes', texto: 'Avaliações', icone: ICONES.avaliacoes, emBreve: true },
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
    <!-- ===== Barra lateral — só no desktop ===== -->
    <aside class="lado">
      <NuxtLink to="/" class="marca">
        <span class="marca__brasao"><LogoBarba /></span>
        <span class="marca__texto">
          <span class="marca__linha1">Agenda</span>
          <span class="marca__linha2">do Barbeiro</span>
        </span>
      </NuxtLink>

      <div v-if="contexto?.barbearia_nome" class="unidade">
        <button
          v-if="unidades.length > 1"
          class="lado__barbearia barbearia--troca"
          @click.stop="listaAberta = !listaAberta"
        >
          <span class="barbearia__nome">{{ contexto.barbearia_nome }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
        </button>

        <p v-else class="lado__barbearia">{{ contexto.barbearia_nome }}</p>

        <div v-if="listaAberta" class="lista-unidades" @click.stop>
          <p class="lista-unidades__rotulo">Suas unidades</p>
          <button
            v-for="u in unidades"
            :key="u.id"
            class="unidade-item"
            :class="{ 'unidade-item--on': u.id === contexto?.barbearia_id }"
            @click="escolherUnidade(u.id)"
          >
            <span class="unidade-item__nome">{{ u.nome }}</span>
            <span v-if="u.cidade" class="unidade-item__cidade">{{ u.cidade }}</span>
          </button>
        </div>
      </div>

      <nav class="menu">
        <template v-for="i in itens" :key="i.rota">
          <NuxtLink v-if="!i.emBreve" :to="i.rota" class="menu__item">
            <svg
              class="menu__icone" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            >
              <circle v-for="(c, k) in i.icone.c" :key="k" :cx="c[0]" :cy="c[1]" :r="c[2]" />
              <path :d="i.icone.d" />
            </svg>
            {{ i.texto }}
          </NuxtLink>

          <span v-else class="menu__item menu__item--breve" aria-disabled="true">
            <svg
              class="menu__icone" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            >
              <circle v-for="(c, k) in i.icone.c" :key="k" :cx="c[0]" :cy="c[1]" :r="c[2]" />
              <path :d="i.icone.d" />
            </svg>
            {{ i.texto }}
            <span class="menu__tag">em breve</span>
          </span>
        </template>
      </nav>

      <NuxtLink to="/perfil" class="usuario">
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

    <!-- ===== Conteúdo ===== -->
    <div class="corpo">
      <!-- Topo — só no celular -->
      <header class="topo">
        <span class="topo__brasao"><LogoBarba /></span>
        <span class="topo__nome">{{ contexto?.barbearia_nome || 'Painel Master' }}</span>

        <NuxtLink to="/perfil" class="topo__avatar" aria-label="Meu perfil">
          <img v-if="contexto?.foto_url" :src="contexto.foto_url" alt="" />
          <span v-else aria-hidden="true">{{ iniciais }}</span>
        </NuxtLink>

        <button class="topo__sair" aria-label="Sair" @click="sair">
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <path :d="ICONES.sair.d" />
          </svg>
        </button>
      </header>

      <main class="conteudo">
        <slot />
      </main>
    </div>

    <!-- ===== Dock — só no celular ===== -->
    <nav class="dock" aria-label="Navegação principal">
      <template v-for="i in itens" :key="i.rota">
        <NuxtLink v-if="!i.emBreve" :to="i.rota" class="dock__item">
          <svg
            class="dock__icone" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <circle v-for="(c, k) in i.icone.c" :key="k" :cx="c[0]" :cy="c[1]" :r="c[2]" />
            <path :d="i.icone.d" />
          </svg>
          <span class="dock__rotulo">{{ i.curto || i.texto }}</span>
        </NuxtLink>

        <span v-else class="dock__item dock__item--breve" aria-disabled="true">
          <svg
            class="dock__icone" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <circle v-for="(c, k) in i.icone.c" :key="k" :cx="c[0]" :cy="c[1]" :r="c[2]" />
            <path :d="i.icone.d" />
          </svg>
          <span class="dock__rotulo">{{ i.curto || i.texto }}</span>
        </span>
      </template>
    </nav>
  </div>
</template>

<style scoped>
/* ---------- seletor de unidade ---------- */
.unidade { position: relative; }

.barbearia--troca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.barbearia--troca svg { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.7; }
.barbearia__nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lista-unidades {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 60;
  padding: 8px;
  background: rgba(16, 22, 42, 0.98);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--linha);
  border-radius: 14px;
  box-shadow: 0 24px 50px -12px rgba(0, 0, 0, 0.8);
}
.lista-unidades__rotulo {
  margin: 4px 8px 8px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza-600);
}

.unidade-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 9px 10px;
  background: transparent;
  border: none;
  border-radius: 10px;
  font-family: var(--fonte-corpo);
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease;
}
.unidade-item:hover { background: rgba(255, 255, 255, 0.05); }
.unidade-item--on { background: var(--dourado-suave); }
.unidade-item__nome { font-size: 14px; font-weight: 650; color: var(--branco); }
.unidade-item--on .unidade-item__nome { color: var(--dourado); }
.unidade-item__cidade { font-size: 11.5px; color: var(--cinza-600); }

.lista-enter-active, .lista-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.lista-enter-from, .lista-leave-to { opacity: 0; transform: translateY(-4px); }

/*
 * ============================================================
 *  LINGUAGEM VISUAL "COURO" — vale para todo o painel.
 *
 *  Tudo é definido como variável aqui no .shell e desce em
 *  cascata para as páginas. As variáveis antigas do main.css
 *  (--preto-800, --cinza etc.) são REMAPEADAS para tons
 *  quentes: assim as telas que ainda não foram redesenhadas
 *  (perfil, master, serviços) já entram no clima novo
 *  automaticamente, sem mexer nelas.
 * ============================================================
 */
.shell {
  /* fonte: Archivo em tudo dentro do painel */
  --fonte-corpo: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --fonte-display: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  /* escala fixa de 5 tamanhos — todo texto cai num destes */
  --tam-titulo: 28px;
  --tam-secao: 20px;
  --tam-corpo: 16px;
  --tam-apoio: 13px;
  --tam-rotulo: 11px;

  /* paleta couro */
  --couro-luz: #10162A;
  --couro: #0A0B0D;
  --couro-sombra: #07080A;
  --superficie: rgba(20, 26, 46, 0.62);
  --linha: rgba(255, 255, 255, 0.08);
  --linha-suave: rgba(255, 255, 255, 0.055);
  --dourado: #7EB0FA;
  --dourado-400: #A5C8FC;
  --dourado-600: #2563EB;
  --laranja: #3B82F6;
  --laranja-400: #7EB0FA;
  --dourado-suave: rgba(59, 130, 246, 0.14);
  --dourado-linha: rgba(59, 130, 246, 0.35);

  /* remapeamento das variáveis antigas para tons quentes */
  --branco: #F2F4F8;
  --cinza: #949AAB;
  --cinza-600: #6E7488;
  --preto-800: #141A2E;
  --preto-700: #1B2340;
  --preto-600: #2A3252;
  --raio: 14px;

  font-family: var(--fonte-corpo);
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  color: var(--branco);

  /* o fundo Couro: grão de filme + luz dourada no alto +
     vinheta nas bordas + degradê quente de couro e madeira */
  background-color: var(--couro);
  background-image:
    radial-gradient(90% 65% at 6% 0%, rgba(59, 130, 246, 0.20), transparent 58%);
  background-attachment: fixed;
}

/* títulos das páginas do painel, já na escala nova */
.shell :deep(h1) {
  font-size: var(--tam-titulo);
  font-weight: 800;
  letter-spacing: -0.035em;
}
.shell :deep(h2) {
  font-size: var(--tam-secao);
  font-weight: 700;
  letter-spacing: -0.02em;
}

/* ---------- Barra lateral (desktop) ---------- */
.lado {
  display: flex;
  flex-direction: column;
  width: 272px;
  flex-shrink: 0;
  padding: 26px 18px;
  background: rgba(12, 15, 24, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-right: 1px solid var(--linha-suave);
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
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
  font-weight: 800;
  font-size: 21px;
  letter-spacing: -0.03em;
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
  font-size: var(--tam-apoio);
  font-weight: 600;
  color: var(--dourado);
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  border-radius: var(--raio);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 24px;
}
.menu__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 13px;
  border-radius: var(--raio);
  font-size: 15px;
  font-weight: 500;
  color: var(--cinza);
  transition: background 0.15s ease, color 0.15s ease;
}
.menu__icone { width: 19px; height: 19px; flex-shrink: 0; opacity: 0.85; }
.menu__item:hover { background: rgba(255, 255, 255, 0.05); color: var(--branco); }
.menu__item.router-link-exact-active {
  background: var(--dourado-suave);
  color: var(--dourado);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--dourado);
}
.menu__item.router-link-exact-active .menu__icone { opacity: 1; }

.menu__item--breve { opacity: 0.42; cursor: default; }
.menu__tag {
  margin-left: auto;
  padding: 2px 7px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cinza-600);
  border: 1px solid var(--linha);
  border-radius: 99px;
}

.usuario {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-top: auto;
  padding: 14px 10px 12px;
  margin-left: -8px;
  margin-right: -8px;
  border-top: 1px solid var(--linha-suave);
  border-radius: var(--raio);
  transition: background 0.16s ease;
}
.usuario:hover { background: rgba(255, 255, 255, 0.05); }
.usuario__avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #14100B;
  font-size: 13px;
  font-weight: 800;
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
  padding: 10px;
  width: 100%;
  min-height: 40px;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: var(--raio);
  color: var(--cinza);
  font-family: var(--fonte-corpo);
  font-size: var(--tam-apoio);
  font-weight: 600;
  transition: border-color 0.18s ease, color 0.18s ease;
}
.sair:hover { border-color: var(--laranja); color: var(--laranja); }

/* ---------- Conteúdo ---------- */
.corpo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.conteudo {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 36px 40px 64px;
}

/* ---------- Topo (celular) ---------- */
.topo {
  display: none;
  align-items: center;
  gap: 11px;
  position: sticky;
  top: 0;
  z-index: 40;
  padding: calc(10px + env(safe-area-inset-top)) 18px 10px;
  background: rgba(10, 13, 20, 0.75);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  border-bottom: 1px solid var(--linha-suave);
}
.topo__brasao { width: 30px; height: 30px; flex-shrink: 0; color: var(--dourado); }
.topo__nome {
  flex: 1;
  min-width: 0;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--branco);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topo__avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: linear-gradient(135deg, #3B82F6, #1D4ED8);
  color: #14100B;
  font-size: 11.5px;
  font-weight: 800;
}
.topo__avatar img { width: 100%; height: 100%; object-fit: cover; }
.topo__sair {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 12px;
  color: var(--cinza);
  transition: border-color 0.18s ease, color 0.18s ease;
}
.topo__sair svg { width: 17px; height: 17px; }
.topo__sair:active { border-color: var(--laranja); color: var(--laranja); }

/* ---------- Dock (celular) ---------- */
.dock {
  display: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  background: rgba(9, 12, 18, 0.8);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-top: 1px solid var(--linha-suave);
}
.dock__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 2px 4px;
  min-height: 48px;
  border-radius: 12px;
  color: var(--cinza-600);
  transition: color 0.18s ease, transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}
.dock__item:active { transform: scale(0.92); }
.dock__icone { width: 22px; height: 22px; }
.dock__rotulo {
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* pontinho reservado em todos, aceso só no ativo — nada muda de lugar */
.dock__item::after {
  content: '';
  width: 4px;
  height: 4px;
  margin-top: 1px;
  border-radius: 99px;
  background: transparent;
}
.dock__item.router-link-exact-active { color: var(--dourado); }
.dock__item.router-link-exact-active .dock__icone {
  filter: drop-shadow(0 0 9px rgba(212, 175, 55, 0.55));
}
.dock__item.router-link-exact-active::after {
  background: var(--dourado);
  box-shadow: 0 0 8px rgba(212, 175, 55, 0.7);
}

.dock__item--breve { opacity: 0.3; }

/* ---------- Celular ---------- */
@media (max-width: 900px) {
  .lado { display: none; }
  .topo { display: flex; }
  .dock { display: grid; }
  .shell { --tam-titulo: 26px; }
  .conteudo {
    max-width: none;
    padding: 22px 18px calc(92px + env(safe-area-inset-bottom));
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock__item, .menu__item, .usuario, .sair, .topo__sair { transition: none; }
}
</style>