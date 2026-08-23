<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Painel — Agenda Do Barbeiro' })

const { contexto, ehDono } = useAcesso()
const { texto: saudacao } = useSaudacao(() => contexto?.value?.nome)
const supabase = useSupabaseClient<Database>()

/*
 * Data por extenso. Só no cliente (onMounted) pelo mesmo motivo
 * da saudação: o servidor e o celular podem estar em fusos
 * diferentes, e datas divergentes quebram a hidratação.
 */
const hoje = ref('')
onMounted(() => {
  hoje.value = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
})

/*
 * O passo "Cadastrar serviços" mostra "feito" quando existe pelo
 * menos um serviço. `head: true` pede só a contagem, sem trazer
 * linha nenhuma — e a RLS já limita à barbearia do dono.
 *
 * O watch com immediate cobre o caso do contexto ainda estar
 * carregando quando a página monta: quando ehDono virar true,
 * a contagem roda.
 */
const servicosOk = ref(false)
onMounted(() => {
  watch(
    ehDono,
    async (dono) => {
      if (!dono || servicosOk.value) return
      try {
        const { count } = await supabase
          .from('servicos')
          .select('id', { count: 'exact', head: true })
        servicosOk.value = (count ?? 0) > 0
      } catch {
        /* sem contagem, o passo só fica como pendente — nada quebra */
      }
    },
    { immediate: true },
  )
})
</script>

<template>
  <div>
    <header class="cabecalho">
      <p class="sobrancelha">{{ ehDono ? 'Painel do dono' : 'Minha agenda' }}</p>
      <h1 class="titulo">{{ saudacao }}</h1>
      <p v-if="hoje" class="data">{{ hoje }}</p>
    </header>

    <section class="vazio">
      <span class="vazio__icone" aria-hidden="true">
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M7.5 3.5v3 M16.5 3.5v3 M6 5h12a2.5 2.5 0 0 1 2.5 2.5V18A2.5 2.5 0 0 1 18 20.5H6A2.5 2.5 0 0 1 3.5 18V7.5A2.5 2.5 0 0 1 6 5z M3.5 10h17" />
        </svg>
      </span>

      <p class="vazio__titulo">Nenhum horário hoje</p>
      <p class="vazio__texto">
        Quando os clientes começarem a marcar, os agendamentos
        do dia aparecem aqui.
      </p>
    </section>

    <!-- Primeiros passos: só o dono vê, e só guia — não cobra -->
    <section v-if="ehDono" class="passos" aria-label="Primeiros passos">
      <NuxtLink to="/painel/servicos" class="passo passo--link">
        <span class="passo__num" :class="{ 'passo__num--ok': servicosOk }">
          {{ servicosOk ? '✓' : '1' }}
        </span>
        <span class="passo__texto">Cadastrar serviços</span>
        <span class="passo__estado" :class="{ 'passo__estado--ok': servicosOk }">
          {{ servicosOk ? 'Feito' : 'Começar' }}
        </span>
      </NuxtLink>

      <div class="passo passo--espera">
        <span class="passo__num">2</span>
        <span class="passo__texto">Montar a equipe</span>
        <span class="passo__estado">Em breve</span>
      </div>

      <div class="passo passo--espera">
        <span class="passo__num">3</span>
        <span class="passo__texto">Divulgar a página de agendamento</span>
        <span class="passo__estado">Em breve</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cabecalho {
  margin-bottom: 24px;
  animation: surgir 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.sobrancelha {
  margin: 0 0 8px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 122%;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dourado);
}
.titulo { margin: 0; color: var(--branco); }
.data {
  margin: 6px 0 0;
  font-size: var(--tam-apoio);
  color: var(--cinza-600);
}
/* "sábado, 23 de agosto" vira "Sábado, 23 de agosto" */
.data::first-letter { text-transform: uppercase; }

.vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(34px, 7vw, 50px) 24px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 20px;
  text-align: center;
  animation: surgir 0.5s 0.07s cubic-bezier(0.22, 1, 0.36, 1) both;
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
.vazio__icone svg { width: 24px; height: 24px; }
.vazio__titulo {
  margin: 0 0 7px;
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.vazio__texto {
  margin: 0 auto;
  max-width: 42ch;
  font-size: var(--tam-apoio);
  color: var(--cinza-600);
  line-height: 1.65;
}

.passos {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.passo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 16px;
  animation: surgir 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.passo:nth-child(1) { animation-delay: 0.12s; }
.passo:nth-child(2) { animation-delay: 0.17s; }
.passo:nth-child(3) { animation-delay: 0.22s; }

.passo--link { transition: border-color 0.16s ease, transform 0.16s ease; }
.passo--link:hover { border-color: var(--dourado-linha); }
.passo--link:active { transform: scale(0.99); }
.passo--espera { opacity: 0.55; }

.passo__num {
  width: 27px;
  height: 27px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 800;
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  color: var(--dourado);
}
.passo__num--ok {
  background: var(--dourado);
  border-color: var(--dourado);
  color: #14100B;
}
.passo__texto {
  flex: 1;
  min-width: 0;
  font-size: var(--tam-apoio);
  font-weight: 600;
  color: var(--branco);
}
.passo__estado {
  font-size: var(--tam-rotulo);
  font-weight: 700;
  font-stretch: 115%;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cinza-600);
}
.passo__estado--ok { color: var(--dourado); }

@keyframes surgir {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .cabecalho, .vazio, .passo { animation: none; }
  .passo--link { transition: none; }
}
</style>