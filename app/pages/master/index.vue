<script setup lang="ts">
import type { Database, Barbearia } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Painel Master — Agenda Do Barbeiro' })

// O generico explicito garante o tipo mesmo quando a inferencia
// pela string de colunas nao funciona.
const supabase = useSupabaseClient<Database>()
const { contexto } = useAcesso()

// So as colunas que a tela realmente usa
type Linha = Pick<Barbearia, 'id' | 'nome' | 'slug' | 'status' | 'cidade' | 'criada_em'>

const { data: barbearias } = await useAsyncData<Linha[]>(
  'master-barbearias',
  async () => {
    const { data } = await supabase
      .from('barbearias')
      .select('id, nome, slug, status, cidade, criada_em')
      .order('criada_em', { ascending: false })
    return (data ?? []) as Linha[]
  },
  { default: () => [] as Linha[] }
)

const { data: pendentes } = await useAsyncData<number>(
  'master-pendentes',
  async () => {
    const { count } = await supabase
      .from('solicitacoes_barbeiro')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente')
    return count ?? 0
  },
  { default: () => 0 }
)

const ativas = computed(
  () => barbearias.value?.filter((b) => b.status === 'ativa').length ?? 0
)
const suspensas = computed(
  () => barbearias.value?.filter((b) => b.status === 'suspensa').length ?? 0
)

const { texto: saudacao } = useSaudacao(() => contexto.value?.nome)
</script>

<template>
  <div>
    <header class="cabecalho">
      <p class="sobrancelha">Painel master</p>
      <h1 class="titulo">{{ saudacao }}</h1>
    </header>

    <div class="numeros">
      <div class="cartao">
        <p class="cartao__rotulo">Barbearias ativas</p>
        <p class="cartao__valor">{{ ativas }}</p>
      </div>
      <div class="cartao">
        <p class="cartao__rotulo">Suspensas</p>
        <p class="cartao__valor cartao__valor--laranja">{{ suspensas }}</p>
      </div>
      <div class="cartao">
        <p class="cartao__rotulo">Solicitacoes pendentes</p>
        <p class="cartao__valor cartao__valor--dourado">{{ pendentes }}</p>
      </div>
    </div>

    <section>
      <h2 class="secao">Barbearias</h2>

      <p v-if="!barbearias || barbearias.length === 0" class="vazio">
        Nenhuma barbearia cadastrada ainda. Quando fechar a primeira venda,
        ela aparece aqui.
      </p>

      <ul v-else class="lista">
        <li v-for="b in barbearias" :key="b.id" class="linha">
          <div class="linha__dados">
            <p class="linha__nome">{{ b.nome }}</p>
            <p class="linha__slug">
              /{{ b.slug }}<span v-if="b.cidade"> · {{ b.cidade }}</span>
            </p>
          </div>
          <span class="selo" :class="`selo--${b.status}`">{{ b.status }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.cabecalho { margin-bottom: 30px; }
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
  font-size: 34px;
  letter-spacing: -0.02em;
  color: var(--branco);
}

.numeros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 40px;
}
.cartao {
  padding: 20px 22px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 10px;
}
.cartao__rotulo {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza-600);
}
.cartao__valor {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--branco);
  font-variant-numeric: tabular-nums;
}
.cartao__valor--dourado { color: var(--dourado); }
.cartao__valor--laranja { color: var(--laranja); }

.secao {
  margin: 0 0 16px;
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.015em;
  color: var(--branco);
}

.vazio {
  margin: 0;
  padding: 26px;
  background: var(--preto-800);
  border: 1px dashed var(--preto-600);
  border-radius: 10px;
  font-size: 14.5px;
  color: var(--cinza-600);
  line-height: 1.6;
}

.lista { list-style: none; margin: 0; padding: 0; }
.linha {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 10px;
  margin-bottom: 8px;
}
.linha__dados { min-width: 0; }
.linha__nome { margin: 0; font-size: 15.5px; font-weight: 600; color: var(--branco); }
.linha__slug { margin: 3px 0 0; font-size: 13px; color: var(--cinza-600); }

.selo {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 5px 11px;
  border-radius: 99px;
  border: 1px solid;
  white-space: nowrap;
}
.selo--ativa     { color: var(--verde);     border-color: var(--verde); }
.selo--suspensa  { color: var(--laranja);   border-color: var(--laranja); }
.selo--cancelada { color: var(--cinza-600); border-color: var(--cinza-600); }
</style>