<script setup lang="ts">
definePageMeta({ layout: 'painel' })
useHead({ title: 'Painel — Agenda Do Barbeiro' })

const { contexto, ehDono } = useAcesso()
const { texto: saudacao } = useSaudacao(() => contexto?.value?.nome)
</script>

<template>
  <div>
    <header class="cabecalho">
      <p class="sobrancelha">{{ ehDono ? 'Painel do dono' : 'Minha agenda' }}</p>
      <h1 class="titulo">{{ saudacao }}</h1>
    </header>

    <div class="vazio">
      <p class="vazio__titulo">Agenda ainda vazia</p>
      <p class="vazio__texto">
        Assim que os servicos e a equipe estiverem cadastrados, os
        agendamentos do dia aparecem aqui.
      </p>
    </div>
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
.vazio {
  padding: 40px 30px;
  background: var(--preto-800);
  border: 1px dashed var(--preto-600);
  border-radius: 10px;
  text-align: center;
}
.vazio__titulo {
  margin: 0 0 8px;
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 21px;
  color: var(--branco);
}
.vazio__texto {
  margin: 0 auto;
  max-width: 46ch;
  font-size: 14.5px;
  color: var(--cinza-600);
  line-height: 1.6;
}
</style>