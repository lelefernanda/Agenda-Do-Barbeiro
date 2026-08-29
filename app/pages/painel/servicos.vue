<script setup lang="ts">
import type { Database, Servico } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Serviços — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono } = useAcesso()
const { encolher, ehImagem } = useImagem()

type Linha = Pick<
  Servico,
  'id' | 'nome' | 'descricao' | 'duracao_min' | 'preco' | 'foto_url' | 'ativo' | 'ordem'
>

const { data: lista, refresh } = await useAsyncData<Linha[]>(
  'servicos',
  async () => {
    const { data } = await supabase
      .from('servicos')
      .select('id, nome, descricao, duracao_min, preco, foto_url, ativo, ordem')
      .eq('barbearia_id', contexto.value?.barbearia_id ?? '')
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true })
    return (data ?? []) as Linha[]
  },
  { default: () => [] as Linha[], watch: [contexto] }
)

const ativos = computed(() => lista.value.filter((s) => s.ativo).length)
const pausados = computed(() => lista.value.length - ativos.value)

/* ------------------------------------------------------------
   Formulario
   ------------------------------------------------------------ */
const editando = ref<Linha | null>(null)
const abrindo = ref(false)
const salvando = ref(false)
const erro = ref('')

const form = reactive({
  nome: '',
  descricao: '',
  duracao_min: 30,
  preco: 0,
  ativo: true,
})

const DURACOES = [15, 20, 30, 45, 60, 90]

/* ---------- foto do serviço ----------
   O arquivo fica guardado aqui e sobe depois que o serviço é salvo,
   porque a imagem precisa de um id de serviço para pertencer a alguém.
   Para quem usa, continua sendo um passo só. */
const fotoNova = ref<Blob | null>(null)
const fotoPreview = ref<string | null>(null)
const removerFotoAoSalvar = ref(false)
const entradaFoto = ref<HTMLInputElement | null>(null)

const fotoMostrada = computed(
  () => fotoPreview.value ?? (removerFotoAoSalvar.value ? null : editando.value?.foto_url ?? null)
)

function limparFoto() {
  if (fotoPreview.value) URL.revokeObjectURL(fotoPreview.value)
  fotoNova.value = null
  fotoPreview.value = null
  removerFotoAoSalvar.value = false
  if (entradaFoto.value) entradaFoto.value.value = ''
}

async function escolherFoto(evento: Event) {
  const arquivo = (evento.target as HTMLInputElement).files?.[0]
  if (!arquivo) return

  if (!ehImagem(arquivo)) {
    erro.value = 'Escolha um arquivo de imagem.'
    return
  }

  try {
    const menor = await encolher(arquivo, 640)
    if (fotoPreview.value) URL.revokeObjectURL(fotoPreview.value)
    fotoNova.value = menor
    fotoPreview.value = URL.createObjectURL(menor)
    removerFotoAoSalvar.value = false
    erro.value = ''
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não consegui preparar a imagem.'
  }
}

function tirarFoto() {
  if (fotoPreview.value) URL.revokeObjectURL(fotoPreview.value)
  fotoNova.value = null
  fotoPreview.value = null
  removerFotoAoSalvar.value = true
  if (entradaFoto.value) entradaFoto.value.value = ''
}

function novo() {
  editando.value = null
  Object.assign(form, { nome: '', descricao: '', duracao_min: 30, preco: 0, ativo: true })
  limparFoto()
  erro.value = ''
  abrindo.value = true
}

function editar(s: Linha) {
  editando.value = s
  Object.assign(form, {
    nome: s.nome,
    descricao: s.descricao ?? '',
    duracao_min: s.duracao_min,
    preco: Number(s.preco),
    ativo: s.ativo,
  })
  limparFoto()
  erro.value = ''
  abrindo.value = true
}

function fechar() {
  abrindo.value = false
  editando.value = null
  limparFoto()
}

async function salvar() {
  erro.value = ''

  if (form.nome.trim().length < 2) {
    erro.value = 'Dê um nome ao serviço.'
    return
  }
  if (form.duracao_min < 5) {
    erro.value = 'A duração mínima é de 5 minutos.'
    return
  }
  if (form.preco < 0) {
    erro.value = 'O preço não pode ser negativo.'
    return
  }

  salvando.value = true

  const dados = {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() || null,
    duracao_min: Math.round(form.duracao_min),
    preco: Number(form.preco),
    ativo: form.ativo,
  }

  let idServico = editando.value?.id ?? null

  if (editando.value) {
    const { error } = await supabase.from('servicos').update(dados).eq('id', editando.value.id)
    if (error) {
      salvando.value = false
      erro.value = error.message
      return
    }
  } else {
    const { data, error } = await supabase
      .from('servicos')
      .insert({
        ...dados,
        barbearia_id: contexto.value?.barbearia_id ?? '',
        ordem: lista.value.length,
      })
      .select('id')
      .single()
    if (error || !data) {
      salvando.value = false
      erro.value = error?.message ?? 'Não foi possível criar o serviço.'
      return
    }
    idServico = data.id
  }

  // A foto vai depois, agora que existe um serviço dono dela
  try {
    if (fotoNova.value && idServico) {
      const pacote = new FormData()
      pacote.append('servico_id', idServico)
      pacote.append('foto', new File([fotoNova.value], 'foto.jpg', { type: 'image/jpeg' }))
      await $fetch('/api/servicos/foto', { method: 'POST', body: pacote })
    } else if (removerFotoAoSalvar.value && idServico) {
      await $fetch('/api/servicos/foto', {
        method: 'DELETE',
        body: { servico_id: idServico },
      })
    }
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { statusMessage?: string } }
    salvando.value = false
    erro.value =
      'O serviço foi salvo, mas a foto falhou: ' +
      (err.statusMessage || err.data?.statusMessage || 'tente de novo.')
    await refresh()
    return
  }

  salvando.value = false
  fechar()
  await refresh()
}

/* ------------------------------------------------------------
   Menu de ações (o botão ⋯ de cada cartão)
   ------------------------------------------------------------ */
const menuAberto = ref<string | null>(null)

function alternarMenu(s: Linha) {
  menuAberto.value = menuAberto.value === s.id ? null : s.id
}

function editarDoMenu(s: Linha) {
  menuAberto.value = null
  editar(s)
}

async function alternarDoMenu(s: Linha) {
  menuAberto.value = null
  await alternar(s)
}

function apagarDoMenu(s: Linha) {
  menuAberto.value = null
  pedirRemocao(s)
}

/* ------------------------------------------------------------
   Ativar, desativar, apagar
   ------------------------------------------------------------ */
const mexendo = ref<string | null>(null)
const confirmandoRemocao = ref<Linha | null>(null)
const avisoRemocao = ref('')

async function alternar(s: Linha) {
  mexendo.value = s.id
  await supabase.from('servicos').update({ ativo: !s.ativo }).eq('id', s.id)
  mexendo.value = null
  await refresh()
}

function pedirRemocao(s: Linha) {
  avisoRemocao.value = ''
  confirmandoRemocao.value = s
}

async function remover() {
  const s = confirmandoRemocao.value
  if (!s) return

  mexendo.value = s.id
  const { error } = await supabase.from('servicos').delete().eq('id', s.id)
  mexendo.value = null

  if (error) {
    // O banco recusa apagar servico com agendamento apontando para ele.
    // E de proposito: apagar quebraria o historico de atendimentos.
    avisoRemocao.value =
      'Este serviço já tem agendamentos no histórico e por isso não pode ser apagado. ' +
      'Desative para tirá-lo da página de agendamento sem perder o histórico.'
    return
  }

  confirmandoRemocao.value = null
  await refresh()
}

async function desativarEmVezDeApagar() {
  const s = confirmandoRemocao.value
  if (!s) return
  confirmandoRemocao.value = null
  if (s.ativo) await alternar(s)
}

/* ------------------------------------------------------------
   Ordem na pagina publica — agora arrastando pela alça.

   Enquanto o dedo arrasta, a lista mostrada é uma cópia
   (rascunhoOrdem) que vai sendo reordenada em tempo real.
   Ao soltar, cada serviço cuja posição mudou é gravado.
   A alça também aceita as setas do teclado, para acessibilidade
   e para quem está no desktop.
   ------------------------------------------------------------ */
const listaEl = ref<HTMLElement | null>(null)
const rascunhoOrdem = ref<Linha[] | null>(null)
const idArrastando = ref<string | null>(null)
const salvandoOrdem = ref(false)

const exibicao = computed(() => rascunhoOrdem.value ?? lista.value)

function iniciarArrasto(e: PointerEvent, s: Linha) {
  if (!ehDono.value || salvandoOrdem.value) return
  idArrastando.value = s.id
  rascunhoOrdem.value = [...lista.value]
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function moverArrasto(e: PointerEvent) {
  const arr = rascunhoOrdem.value
  if (!arr || !idArrastando.value || !listaEl.value) return

  // Quantos cartões (fora o arrastado) estão acima do dedo?
  // Essa contagem é a posição onde o arrastado deve ficar.
  let para = 0
  const cartoes = listaEl.value.querySelectorAll<HTMLElement>('li[data-id]')
  cartoes.forEach((el) => {
    if (el.dataset.id === idArrastando.value) return
    const r = el.getBoundingClientRect()
    if (e.clientY > r.top + r.height / 2) para++
  })

  const de = arr.findIndex((x) => x.id === idArrastando.value)
  if (de === -1 || de === para) return
  const [item] = arr.splice(de, 1)
  arr.splice(para, 0, item!)
}

async function soltarArrasto() {
  const arr = rascunhoOrdem.value
  idArrastando.value = null
  if (arr) await persistirOrdem(arr)
}

async function moverTeclado(s: Linha, direcao: -1 | 1) {
  if (salvandoOrdem.value) return
  const arr = [...lista.value]
  const i = arr.findIndex((x) => x.id === s.id)
  const j = i + direcao
  if (i < 0 || j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  await persistirOrdem(arr)
}

async function persistirOrdem(nova: Linha[]) {
  rascunhoOrdem.value = nova

  // Grava só o que mudou de posição
  const gravacoes: PromiseLike<unknown>[] = []
  nova.forEach((s, i) => {
    if (s.ordem !== i) {
      gravacoes.push(supabase.from('servicos').update({ ordem: i }).eq('id', s.id))
    }
  })

  if (gravacoes.length) {
    salvandoOrdem.value = true
    await Promise.all(gravacoes)
    salvandoOrdem.value = false
  }

  await refresh()
  rascunhoOrdem.value = null
}

/* ------------------------------------------------------------
   Atalho: servicos comuns de barbearia
   ------------------------------------------------------------ */
const SUGESTOES = [
  { nome: 'Corte',          duracao_min: 30, preco: 35 },
  { nome: 'Corte + barba',  duracao_min: 45, preco: 55 },
  { nome: 'Barba',          duracao_min: 20, preco: 25 },
  { nome: 'Pezinho',        duracao_min: 15, preco: 15 },
]

const preenchendo = ref(false)

async function usarSugestoes() {
  preenchendo.value = true
  await supabase.from('servicos').insert(
    SUGESTOES.map((s, i) => ({
      ...s,
      barbearia_id: contexto.value?.barbearia_id ?? '',
      ativo: true,
      ordem: i,
    }))
  )
  preenchendo.value = false
  await refresh()
}

/* ------------------------------------------------------------
   Formatacao
   ------------------------------------------------------------ */
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function emReais(v: number | string) {
  return dinheiro.format(Number(v))
}

function emTempo(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

onMounted(() => {
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (confirmandoRemocao.value) confirmandoRemocao.value = null
    else if (abrindo.value) fechar()
    else if (menuAberto.value) menuAberto.value = null
  }
  window.addEventListener('keydown', aoTeclar)

  // Tocar em qualquer lugar fora do menu ⋯ fecha o menu.
  // Os cliques dentro dele interrompem o evento antes de chegar aqui.
  const aoTocarFora = () => { menuAberto.value = null }
  document.addEventListener('pointerdown', aoTocarFora)

  onUnmounted(() => {
    window.removeEventListener('keydown', aoTeclar)
    document.removeEventListener('pointerdown', aoTocarFora)
  })
})
</script>

<template>
  <div>
    <header class="topo">
      <div class="topo__textos">
        <div class="topo__linha">
          <h1 class="titulo">Serviços</h1>
          <span v-if="lista.length" class="pill">{{ ativos }} no ar</span>
          <span v-if="pausados" class="pill pill--neutra">
            {{ pausados }} pausado{{ pausados === 1 ? '' : 's' }}
          </span>
        </div>
        <p v-if="ehDono && lista.length" class="topo__sub">
          A ordem daqui é a ordem da página pública — arraste pela alça para mudar.
        </p>
      </div>

      <button v-if="ehDono && lista.length" class="btn btn--laranja" @click="novo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Novo serviço
      </button>
    </header>

    <!-- ============ nada cadastrado ============ -->
    <section v-if="lista.length === 0" class="vazio">
      <span class="vazio__icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" />
          <path d="M8 7.4 19.5 18.9 M8 16.6 19.5 5.1" />
        </svg>
      </span>
      <p class="vazio__titulo">Nenhum serviço cadastrado</p>
      <p class="vazio__texto">
        A duração de cada serviço é o que define quais horários aparecem livres
        para o cliente. Sem isso, a página de agendamento não tem o que mostrar.
      </p>

      <div v-if="ehDono" class="vazio__acoes">
        <button class="btn btn--laranja" @click="novo">Cadastrar o primeiro</button>
        <button class="btn btn--fantasma" :disabled="preenchendo" @click="usarSugestoes">
          {{ preenchendo ? 'Criando…' : 'Começar com os 4 mais comuns' }}
        </button>
      </div>

      <p v-if="ehDono" class="vazio__nota">
        Os quatro comuns são corte, corte + barba, barba e pezinho. Você ajusta
        preço e duração depois.
      </p>
    </section>

    <!-- ============ lista ============ -->
    <TransitionGroup v-else tag="ul" name="fila" class="lista" ref="listaEl">
      <li
        v-for="s in exibicao"
        :key="s.id"
        :data-id="s.id"
        class="cartao"
        :class="{
          'cartao--off': !s.ativo,
          'cartao--indo': idArrastando === s.id,
          'cartao--menu': menuAberto === s.id,
        }"
      >
        <button
          v-if="ehDono"
          class="pega"
          :aria-label="`Reordenar ${s.nome} — arraste ou use as setas do teclado`"
          :disabled="salvandoOrdem"
          @pointerdown.stop="iniciarArrasto($event, s)"
          @pointermove="moverArrasto"
          @pointerup="soltarArrasto"
          @pointercancel="soltarArrasto"
          @keydown.up.prevent="moverTeclado(s, -1)"
          @keydown.down.prevent="moverTeclado(s, 1)"
        >
          <svg viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="3" r="1.6" /><circle cx="10" cy="3" r="1.6" />
            <circle cx="4" cy="9" r="1.6" /><circle cx="10" cy="9" r="1.6" />
            <circle cx="4" cy="15" r="1.6" /><circle cx="10" cy="15" r="1.6" />
          </svg>
        </button>

        <div class="miniatura" :class="{ 'miniatura--vazia': !s.foto_url }">
          <img v-if="s.foto_url" :src="s.foto_url" :alt="`Exemplo de ${s.nome}`" />
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" />
            <path d="M8 7.4 19.5 18.9 M8 16.6 19.5 5.1" />
          </svg>
        </div>

        <div class="cartao__info">
          <div class="cartao__linha1">
            <span class="cartao__nome">{{ s.nome }}</span>
            <span v-if="!s.ativo" class="selo">Pausado</span>
          </div>
          <p class="cartao__meta">
            <span class="cartao__tempo">{{ emTempo(s.duracao_min) }}</span>
            <span class="cartao__ponto">·</span>
            <span class="cartao__preco">{{ emReais(s.preco) }}</span>
          </p>
          <p v-if="s.descricao" class="cartao__desc">{{ s.descricao }}</p>
        </div>

        <div v-if="ehDono" class="acoes" @pointerdown.stop>
          <button
            class="mais"
            :class="{ 'mais--on': menuAberto === s.id }"
            :aria-label="`Ações de ${s.nome}`"
            :aria-expanded="menuAberto === s.id"
            @click="alternarMenu(s)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>

          <Transition name="menu">
            <div v-if="menuAberto === s.id" class="menu-acoes" role="menu">
              <button role="menuitem" @click="editarDoMenu(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z M13.5 6.5l3 3" /></svg>
                Editar
              </button>
              <button role="menuitem" :disabled="mexendo === s.id" @click="alternarDoMenu(s)">
                <svg v-if="s.ativo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18 M10.6 5.3A9.8 9.8 0 0 1 12 5.2c6 0 9.5 6.8 9.5 6.8a17 17 0 0 1-2.4 3.2 M6.7 6.7C4 8.6 2.5 12 2.5 12S6 18.8 12 18.8a9 9 0 0 0 4.2-1" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.2 12 5.2 21.5 12 21.5 12 18 18.8 12 18.8 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></svg>
                {{ s.ativo ? 'Desativar' : 'Ativar' }}
              </button>
              <hr />
              <button role="menuitem" class="perigo" @click="apagarDoMenu(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.5h15 M9.5 6V4.5h5V6 M6.5 6.5l1 13h9l1-13 M10 10.5v5.5 M14 10.5v5.5" /></svg>
                Apagar
              </button>
            </div>
          </Transition>
        </div>
      </li>
    </TransitionGroup>

    <!-- ============ formulario ============ -->
    <Teleport to="body">
      <div v-if="abrindo" class="cortina" @click.self="fechar">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">{{ editando ? 'Editar serviço' : 'Novo serviço' }}</p>

          <p v-if="erro" class="janela__erro">{{ erro }}</p>

          <div class="campo">
            <span>Foto de exemplo <em>(opcional)</em></span>
            <div class="foto">
              <div class="foto__quadro" :class="{ 'foto__quadro--vazio': !fotoMostrada }">
                <img v-if="fotoMostrada" :src="fotoMostrada" alt="" />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" />
                  <path d="M8 7.4 19.5 18.9 M8 16.6 19.5 5.1" />
                </svg>
              </div>
              <div class="foto__lado">
                <p class="foto__dica">
                  Mostra ao cliente como fica o corte. É cortada em quadrado
                  e reduzida automaticamente.
                </p>
                <div class="foto__botoes">
                  <button
                    type="button"
                    class="btn btn--pequeno btn--ouro"
                    :disabled="salvando"
                    @click="entradaFoto?.click()"
                  >{{ fotoMostrada ? 'Trocar' : 'Escolher foto' }}</button>
                  <button
                    v-if="fotoMostrada"
                    type="button"
                    class="btn btn--pequeno btn--fantasma"
                    :disabled="salvando"
                    @click="tirarFoto"
                  >Remover</button>
                </div>
                <input
                  ref="entradaFoto"
                  type="file"
                  accept="image/*"
                  hidden
                  @change="escolherFoto"
                />
              </div>
            </div>
          </div>

          <label class="campo">
            <span>Nome</span>
            <input v-model="form.nome" placeholder="Corte + barba" :disabled="salvando" />
          </label>

          <label class="campo">
            <span>Descrição <em>(opcional)</em></span>
            <input
              v-model="form.descricao"
              placeholder="Máquina, tesoura e navalha"
              :disabled="salvando"
            />
          </label>

          <div class="dupla">
            <label class="campo">
              <span>Duração</span>
              <div class="medida">
                <input
                  v-model.number="form.duracao_min"
                  type="number"
                  min="5"
                  step="5"
                  :disabled="salvando"
                />
                <span class="medida__unidade">min</span>
              </div>
              <div class="chips">
                <button
                  v-for="d in DURACOES"
                  :key="d"
                  type="button"
                  class="chip"
                  :class="{ 'chip--on': form.duracao_min === d }"
                  @click="form.duracao_min = d"
                >{{ emTempo(d) }}</button>
              </div>
            </label>

            <label class="campo">
              <span>Preço</span>
              <div class="medida">
                <span class="medida__unidade medida__unidade--antes">R$</span>
                <input
                  v-model.number="form.preco"
                  type="number"
                  min="0"
                  step="1"
                  :disabled="salvando"
                />
              </div>
            </label>
          </div>

          <label class="marca-caixa">
            <input v-model="form.ativo" type="checkbox" :disabled="salvando" />
            <span>Aparece na página de agendamento</span>
          </label>

          <div class="janela__acoes">
            <button class="btn btn--fantasma" :disabled="salvando" @click="fechar">Cancelar</button>
            <button class="btn btn--laranja" :disabled="salvando" @click="salvar">
              {{ salvando ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============ confirmar remocao ============ -->
    <Teleport to="body">
      <div v-if="confirmandoRemocao" class="cortina" @click.self="confirmandoRemocao = null">
        <div class="janela" role="dialog" aria-modal="true">
          <p class="janela__rotulo">Apagar serviço</p>
          <h2 class="janela__titulo">{{ confirmandoRemocao.nome }}</h2>

          <p v-if="avisoRemocao" class="janela__erro">{{ avisoRemocao }}</p>
          <p v-else class="janela__corpo">
            Apagar remove o serviço para sempre. Se ele já foi usado em algum
            atendimento, o sistema vai recusar — nesse caso, desative.
          </p>

          <div class="janela__acoes">
            <button class="btn btn--fantasma" @click="confirmandoRemocao = null">Cancelar</button>
            <button
              v-if="avisoRemocao"
              class="btn btn--laranja"
              @click="desativarEmVezDeApagar"
            >Desativar</button>
            <button
              v-else
              class="btn btn--laranja"
              :disabled="mexendo === confirmandoRemocao.id"
              @click="remover"
            >Apagar</button>
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
    transform 0.16s ease, box-shadow 0.16s ease;
}
.btn svg { width: 16px; height: 16px; }
.btn--pequeno { padding: 8px 14px; min-height: 36px; font-size: 13px; }
.btn:disabled { opacity: 0.45; cursor: default; }

.btn--laranja {
  background: var(--laranja);
  color: #FFFFFF;
  box-shadow: 0 12px 26px -14px color-mix(in srgb, var(--laranja) 55%, transparent);
}
.btn--laranja:hover:not(:disabled) { transform: translateY(-1px); }
.btn--laranja:active:not(:disabled) { transform: translateY(0) scale(0.98); }

.btn--ouro {
  background: transparent;
  border-color: var(--dourado-linha);
  color: var(--dourado);
}
.btn--ouro:hover:not(:disabled) { background: var(--dourado-suave); }

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
.vazio__icone svg { width: 24px; height: 24px; }
.vazio__titulo {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--branco);
}
.vazio__texto {
  margin: 0 auto 22px;
  max-width: 50ch;
  font-size: var(--tam-apoio);
  color: var(--cinza-600);
  line-height: 1.65;
}
.vazio__acoes { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.vazio__nota {
  margin: 15px auto 0;
  max-width: 46ch;
  font-size: 12.5px;
  color: var(--cinza-600);
}

/* ---------- lista ---------- */
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

/* cartoes deslizam para o novo lugar quando a ordem muda */
.fila-move { transition: transform 0.18s ease; }

.cartao {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 12px 13px 8px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.cartao:hover { border-color: var(--linha); }
.cartao--off { opacity: 0.55; }
.cartao--menu { z-index: 20; }
.cartao--indo {
  border-color: var(--dourado-linha);
  box-shadow: 0 0 0 1px var(--dourado-linha), 0 18px 40px -18px rgba(0, 0, 0, 0.8);
  z-index: 10;
}

/* a alça de arrastar */
.pega {
  flex-shrink: 0;
  padding: 8px 5px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #57493C;
  cursor: grab;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.pega:active { cursor: grabbing; color: var(--dourado); }
.pega:focus-visible { outline: 2px solid var(--dourado-linha); }
.pega:disabled { opacity: 0.4; cursor: default; }
.pega svg { width: 14px; height: 18px; display: block; }

.miniatura {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  overflow: hidden;
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  color: var(--dourado);
}
.miniatura img { width: 100%; height: 100%; object-fit: cover; }
.miniatura--vazia {
  background: rgba(0, 0, 0, 0.25);
  border-color: var(--linha-suave);
  color: #57493C;
}
.miniatura svg { width: 20px; height: 20px; }

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
}
.cartao__tempo { color: var(--cinza); font-variant-numeric: tabular-nums; }
.cartao__ponto { color: var(--cinza-600); }
.cartao__preco {
  font-size: 14px;
  color: var(--dourado);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
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
}

/* ---------- menu de ações ---------- */
.acoes { position: relative; flex-shrink: 0; }
.mais {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 12px;
  color: var(--cinza);
  transition: border-color 0.16s ease, color 0.16s ease;
}
.mais svg { width: 16px; height: 16px; }
.mais:hover, .mais--on { border-color: var(--dourado-linha); color: var(--dourado); }

.menu-acoes {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  min-width: 176px;
  padding: 6px;
  background: rgba(28, 21, 15, 0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--linha);
  border-radius: 16px;
  box-shadow: 0 24px 50px -12px rgba(0, 0, 0, 0.85);
}
.menu-acoes button {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 11px;
  font-family: var(--fonte-corpo);
  font-size: 14px;
  font-weight: 600;
  color: var(--branco);
  text-align: left;
  transition: background 0.14s ease;
}
.menu-acoes button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.06); }
.menu-acoes button:disabled { opacity: 0.45; }
.menu-acoes button svg { width: 16px; height: 16px; color: var(--cinza); flex-shrink: 0; }
.menu-acoes button.perigo { color: var(--laranja); }
.menu-acoes button.perigo svg { color: var(--laranja); }
.menu-acoes hr { border: none; border-top: 1px solid var(--linha-suave); margin: 4px 8px; }

.menu-enter-active, .menu-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-4px) scale(0.98); }

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
  max-width: 480px;
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
  margin: 0 0 18px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.janela__titulo { margin: 0 0 14px; color: var(--branco); }
.janela__corpo {
  margin: 0;
  font-size: 14.5px;
  color: var(--cinza);
  line-height: 1.6;
}
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
.campo input[type='text'],
.campo input:not([type]),
.campo input[type='number'] {
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

/* foto no formulario */
.foto { display: flex; gap: 16px; align-items: flex-start; }
.foto__quadro {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  color: #57493C;
}
.foto__quadro img { width: 100%; height: 100%; object-fit: cover; }
.foto__quadro--vazio { border-style: dashed; }
.foto__quadro svg { width: 28px; height: 28px; }
.foto__lado { flex: 1; min-width: 0; }
.foto__dica {
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--cinza-600);
  line-height: 1.5;
}
.foto__botoes { display: flex; gap: 8px; flex-wrap: wrap; }

.dupla { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; }

.medida { display: flex; align-items: stretch; }
.medida__unidade {
  display: flex;
  align-items: center;
  padding: 0 11px;
  font-size: 14px;
  color: var(--cinza-600);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  border-left: 0;
  border-radius: 0 var(--raio) var(--raio) 0;
}
.medida__unidade--antes {
  border-left: 1px solid var(--linha);
  border-right: 0;
  border-radius: var(--raio) 0 0 var(--raio);
}
.medida input { border-radius: var(--raio) 0 0 var(--raio); }
.medida__unidade--antes + input { border-radius: 0 var(--raio) var(--raio) 0; }

.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.chip {
  padding: 6px 12px;
  min-height: 30px;
  background: transparent;
  border: 1px solid var(--linha);
  border-radius: 99px;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 12.5px;
  font-weight: 600;
}
.chip:hover { border-color: var(--cinza-600); color: var(--cinza); }
.chip--on {
  border-color: var(--dourado);
  color: var(--dourado);
  background: var(--dourado-suave);
}

.marca-caixa {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14.5px;
  color: var(--cinza);
  cursor: pointer;
}
.marca-caixa input { width: 17px; height: 17px; accent-color: var(--dourado); }

@media (max-width: 700px) {
  .topo { flex-direction: column; align-items: stretch; }
  .topo .btn--laranja { width: 100%; }
  .dupla { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .fila-move, .btn, .cartao, .mais, .menu-enter-active, .menu-leave-active { transition: none; }
  .cortina, .janela { animation: none; }
}
</style>