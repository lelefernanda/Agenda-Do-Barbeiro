<script setup lang="ts">
/**
 * Minha barbearia — onde o dono monta a cara da própria loja.
 *
 * Tudo que se edita aqui aparece na página pública de agendamento,
 * que é o link que ele vai colar na bio do Instagram.
 *
 * Duas coisas acontecem sozinhas quando ele sobe a capa: a página
 * ganha a cor da foto, e ele pode arrastar a imagem para escolher que
 * parte dela aparece na faixa.
 */
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Minha barbearia — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const { contexto, ehDono, carregar } = useAcesso()
const { corDe } = useCorDaFoto()

const AZUL = '#3B82F6'

type Loja = {
  id: string
  nome: string
  slug: string
  telefone: string | null
  endereco: string | null
  cidade: string | null
  instagram: string | null
  logo_url: string | null
  capa_url: string | null
  capa_pos: number | null
  sobre: string | null
  cor: string | null
}

const { data: loja, refresh } = await useAsyncData<Loja | null>(
  'minha-barbearia',
  async () => {
    if (!contexto.value?.barbearia_id) return null
    const { data } = await supabase
      .from('barbearias')
      .select(
        'id, nome, slug, telefone, endereco, cidade, instagram, logo_url, capa_url, capa_pos, sobre, cor'
      )
      .eq('id', contexto.value.barbearia_id)
      .maybeSingle()
    return (data ?? null) as Loja | null
  },
  { default: () => null, watch: [contexto] }
)

/* ------------------------------------------------------------
   O formulário
   ------------------------------------------------------------ */
const form = reactive({
  nome: '',
  telefone: '',
  endereco: '',
  cidade: '',
  instagram: '',
  sobre: '',
})

/* A posição da capa e a cor moram fora do form porque mudam por
   arrasto e por upload, não por digitação. */
const posicao = ref(50)
const cor = ref(AZUL)

watch(
  loja,
  (l) => {
    if (!l) return
    form.nome = l.nome ?? ''
    form.telefone = l.telefone ?? ''
    form.endereco = l.endereco ?? ''
    form.cidade = l.cidade ?? ''
    form.instagram = (l.instagram ?? '').replace('@', '')
    form.sobre = l.sobre ?? ''
    posicao.value = l.capa_pos ?? 50
    cor.value = l.cor ?? AZUL
  },
  { immediate: true }
)

const salvando = ref(false)
const erro = ref('')
const aviso = ref('')

const sobrando = computed(() => 400 - form.sobre.length)

async function salvar() {
  if (!loja.value) return
  erro.value = ''
  aviso.value = ''

  if (form.nome.trim().length < 2) {
    erro.value = 'O nome da barbearia não pode ficar vazio.'
    return
  }

  salvando.value = true
  const { error } = await supabase
    .from('barbearias')
    .update({
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      endereco: form.endereco.trim() || null,
      cidade: form.cidade.trim() || null,
      instagram: form.instagram.trim().replace('@', '') || null,
      sobre: form.sobre.trim() || null,
      capa_pos: Math.round(posicao.value),
      cor: cor.value,
    })
    .eq('id', loja.value.id)
  salvando.value = false

  if (error) {
    erro.value = error.message
    return
  }

  aviso.value = 'Salvo.'
  setTimeout(() => (aviso.value = ''), 2500)
  await refresh()
  await carregar(true)
}

/* ------------------------------------------------------------
   Logo e capa
   ------------------------------------------------------------ */
const enviando = ref<'logo' | 'capa' | null>(null)
const erroFoto = ref('')
const entradaLogo = ref<HTMLInputElement | null>(null)
const entradaCapa = ref<HTMLInputElement | null>(null)

async function enviarFoto(tipo: 'logo' | 'capa', e: Event) {
  const arquivo = (e.target as HTMLInputElement).files?.[0]
  if (!arquivo) return

  erroFoto.value = ''
  enviando.value = tipo

  /* A cor sai da capa antes do envio, aproveitando que a imagem já
     está aqui no navegador. Se a foto não tiver cor suficiente, a
     função devolve nulo e a barbearia fica no azul. */
  if (tipo === 'capa') {
    const detectada = await corDe(arquivo)
    if (detectada) cor.value = detectada
    posicao.value = 50
  }

  const corpo = new FormData()
  corpo.append('tipo', tipo)
  corpo.append('foto', arquivo)

  try {
    await $fetch('/api/barbearia/foto', { method: 'POST', body: corpo })
    if (tipo === 'capa' && loja.value) {
      await supabase
        .from('barbearias')
        .update({ cor: cor.value, capa_pos: 50 })
        .eq('id', loja.value.id)
    }
    await refresh()
  } catch (err) {
    const m = err as { statusMessage?: string; data?: { statusMessage?: string } }
    erroFoto.value = m.data?.statusMessage ?? m.statusMessage ?? 'Não foi possível enviar.'
  } finally {
    enviando.value = null
    if (entradaLogo.value) entradaLogo.value.value = ''
    if (entradaCapa.value) entradaCapa.value.value = ''
  }
}

async function tirarFoto(tipo: 'logo' | 'capa') {
  erroFoto.value = ''
  enviando.value = tipo
  try {
    await $fetch('/api/barbearia/foto', { method: 'DELETE', query: { tipo } })
    await refresh()
  } catch (err) {
    const m = err as { statusMessage?: string; data?: { statusMessage?: string } }
    erroFoto.value = m.data?.statusMessage ?? m.statusMessage ?? 'Não foi possível remover.'
  } finally {
    enviando.value = null
  }
}

/* ------------------------------------------------------------
   Arrastar a capa

   A foto é maior que a faixa que a mostra. Arrastar para cima e para
   baixo escolhe qual parte dela fica visível — é o mesmo princípio do
   background-position, só que com o dedo.
   ------------------------------------------------------------ */
const arrastando = ref(false)
const molduraCapa = ref<HTMLElement | null>(null)
let inicioY = 0
let inicioPos = 50

function comecarArrasto(e: PointerEvent) {
  if (!loja.value?.capa_url) return
  arrastando.value = true
  inicioY = e.clientY
  inicioPos = posicao.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function moverArrasto(e: PointerEvent) {
  if (!arrastando.value) return
  const altura = molduraCapa.value?.clientHeight ?? 150
  /* Percorrer a altura da moldura duas vezes cobre a foto inteira:
     dá controle fino sem precisar arrastar meio metro. */
  const delta = ((e.clientY - inicioY) / (altura * 2)) * 100
  posicao.value = Math.min(100, Math.max(0, inicioPos - delta))
}

function terminarArrasto() {
  arrastando.value = false
}

/* ------------------------------------------------------------
   O link público
   ------------------------------------------------------------ */
const endereco = computed(() => {
  if (!loja.value) return ''
  const base = import.meta.client ? window.location.origin : ''
  return `${base}/${loja.value.slug}`
})

const copiado = ref(false)

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(endereco.value)
    copiado.value = true
    setTimeout(() => (copiado.value = false), 2200)
  } catch {
    erro.value = 'Não foi possível copiar. Selecione o endereço e copie na mão.'
  }
}

const iniciais = computed(() => {
  const n = form.nome || loja.value?.nome || ''
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
})

const mudouCapa = computed(
  () => !!loja.value && (loja.value.capa_pos ?? 50) !== Math.round(posicao.value)
)
</script>

<template>
  <div>
    <header class="topo">
      <h1 class="titulo">Minha barbearia</h1>
      <p class="subtitulo">
        O que você monta aqui é o que o cliente vê na página de agendamento.
      </p>
    </header>

    <section v-if="!ehDono" class="vazio">
      <p class="vazio__titulo">Só o dono edita a barbearia</p>
      <p class="vazio__texto">Se algo estiver errado, fale com o dono ou com o suporte.</p>
    </section>

    <template v-else-if="loja">
      <!-- ============ o link ============ -->
      <section class="link">
        <p class="link__rotulo">O endereço da sua página</p>
        <div class="link__linha">
          <code class="link__url">{{ endereco }}</code>
          <button class="btn btn--pequeno btn--ouro" @click="copiarLink">
            {{ copiado ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <p class="link__dica">
          Cole na bio do Instagram e no seu WhatsApp. É por aí que o cliente marca sozinho.
        </p>
        <a :href="endereco" target="_blank" rel="noopener" class="link__ver">Ver como o cliente vê →</a>
      </section>

      <p v-if="erroFoto" class="erro">{{ erroFoto }}</p>

      <!-- ============ capa e logo ============ -->
      <section class="cartao">
        <p class="cartao__rotulo">Imagens</p>

        <div class="capa">
          <div
            ref="molduraCapa"
            class="capa__moldura"
            :class="{ 'capa__moldura--arrastando': arrastando }"
            @pointerdown="comecarArrasto"
            @pointermove="moverArrasto"
            @pointerup="terminarArrasto"
            @pointercancel="terminarArrasto"
          >
            <img
              v-if="loja.capa_url"
              :src="loja.capa_url"
              alt=""
              class="capa__img"
              :style="{ objectPosition: `center ${posicao}%` }"
              draggable="false"
            />
            <div v-else class="capa__vazia">
              <span>Foto de capa</span>
              <small>A faixa do topo da sua página. Use uma foto larga da barbearia.</small>
            </div>

            <span v-if="loja.capa_url" class="capa__dica">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" /></svg>
              arraste para enquadrar
            </span>
          </div>

          <div class="logo" :style="{ color: cor }">
            <img v-if="loja.logo_url" :src="loja.logo_url" alt="" />
            <template v-else>{{ iniciais }}</template>
          </div>
        </div>

        <div class="fotos-acoes">
          <div class="fotos-acoes__grupo">
            <label class="btn btn--pequeno btn--fantasma">
              {{ enviando === 'capa' ? 'Enviando…' : loja.capa_url ? 'Trocar capa' : 'Escolher capa' }}
              <input
                ref="entradaCapa"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                :disabled="enviando !== null"
                @change="enviarFoto('capa', $event)"
              />
            </label>
            <button
              v-if="loja.capa_url"
              class="tirar"
              :disabled="enviando !== null"
              @click="tirarFoto('capa')"
            >tirar</button>
          </div>

          <div class="fotos-acoes__grupo">
            <label class="btn btn--pequeno btn--fantasma">
              {{ enviando === 'logo' ? 'Enviando…' : loja.logo_url ? 'Trocar logo' : 'Escolher logo' }}
              <input
                ref="entradaLogo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                :disabled="enviando !== null"
                @change="enviarFoto('logo', $event)"
              />
            </label>
            <button
              v-if="loja.logo_url"
              class="tirar"
              :disabled="enviando !== null"
              @click="tirarFoto('logo')"
            >tirar</button>
          </div>
        </div>

        <p v-if="mudouCapa" class="capa__aviso">
          O enquadramento mudou. Clique em Salvar lá embaixo para valer.
        </p>
      </section>

      <!-- ============ cor ============ -->
      <section class="cartao">
        <p class="cartao__rotulo">Cor da sua página</p>

        <div class="cor">
          <span class="cor__bola" :style="{ background: cor }" />
          <div class="cor__texto">
            <p class="cor__titulo">{{ cor === AZUL ? 'Azul padrão' : 'Tirada da sua capa' }}</p>
            <p class="cor__apoio">
              {{ cor === AZUL
                ? 'Suba uma foto de capa e a página pega a cor dela sozinha.'
                : 'É a cor que o cliente vê nos botões e destaques da sua página.' }}
            </p>
          </div>
          <button v-if="cor !== AZUL" class="btn btn--pequeno btn--fantasma" @click="cor = AZUL">
            Usar azul
          </button>
        </div>
      </section>

      <!-- ============ dados ============ -->
      <section class="cartao">
        <p class="cartao__rotulo">Dados</p>

        <p v-if="erro" class="erro">{{ erro }}</p>

        <label class="campo">
          <span>Nome da barbearia</span>
          <input v-model="form.nome" :disabled="salvando" />
        </label>

        <label class="campo">
          <span>Apresentação <em>(aparece embaixo do nome)</em></span>
          <textarea
            v-model="form.sobre"
            rows="3"
            maxlength="400"
            placeholder="Corte clássico e barba na navalha. Aberto de terça a sábado, desde 2019."
            :disabled="salvando"
          />
          <small class="contador">{{ sobrando }} caracteres restantes</small>
        </label>

        <div class="grade">
          <label class="campo">
            <span>WhatsApp</span>
            <input v-model="form.telefone" placeholder="(19) 99999-9999" :disabled="salvando" />
          </label>

          <label class="campo">
            <span>Instagram</span>
            <input v-model="form.instagram" placeholder="inkabarbershop" :disabled="salvando" />
          </label>

          <label class="campo">
            <span>Endereço</span>
            <input v-model="form.endereco" placeholder="Rua das Flores, 120" :disabled="salvando" />
          </label>

          <label class="campo">
            <span>Cidade</span>
            <input v-model="form.cidade" placeholder="Pedreira" :disabled="salvando" />
          </label>
        </div>

        <div class="cartao__acoes">
          <span v-if="aviso" class="aviso">{{ aviso }}</span>
          <button class="btn btn--laranja" :disabled="salvando" @click="salvar">
            {{ salvando ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>

        <p class="nota">
          O endereço da sua página não pode ser alterado por aqui. Se precisar
          mudar, fale com o suporte.
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.topo { margin-bottom: 20px; }
.titulo { margin: 0 0 6px; color: var(--branco); }
.subtitulo { margin: 0; font-size: var(--tam-apoio); color: var(--cinza-600); line-height: 1.6; }

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
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.16s ease;
}
.btn--pequeno { padding: 8px 14px; min-height: 36px; font-size: 13px; }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn--laranja { background: var(--laranja); color: #FFFFFF; }
.btn--laranja:hover:not(:disabled) { transform: translateY(-1px); }
.btn--ouro { background: transparent; border-color: var(--dourado-linha); color: var(--dourado); }
.btn--ouro:hover:not(:disabled) { background: var(--dourado-suave); }
.btn--fantasma { background: transparent; border-color: var(--linha); color: var(--cinza); }
.btn--fantasma:hover:not(:disabled) { border-color: var(--cinza-600); color: var(--branco); }

/* ---------- o link ---------- */
.link {
  padding: 18px 20px;
  margin-bottom: 14px;
  background: var(--dourado-suave);
  border: 1px solid var(--dourado-linha);
  border-radius: 18px;
}
.link__rotulo {
  margin: 0 0 10px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.link__linha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.link__url {
  flex: 1;
  min-width: 0;
  padding: 10px 13px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13.5px;
  color: var(--branco);
  overflow-x: auto;
  white-space: nowrap;
}
.link__dica { margin: 10px 0 0; font-size: 12.5px; color: var(--cinza); line-height: 1.55; }
.link__ver {
  display: inline-block;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--dourado);
}

/* ---------- cartoes ---------- */
.cartao {
  padding: 20px;
  margin-bottom: 14px;
  background: var(--superficie);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--linha-suave);
  border-radius: 18px;
}
.cartao__rotulo {
  margin: 0 0 16px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}
.cartao__acoes {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 4px;
}

/* ---------- capa e logo ---------- */
.capa { position: relative; margin-bottom: 46px; }

.capa__moldura {
  position: relative;
  width: 100%;
  height: clamp(170px, 26vw, 240px);
  border-radius: 14px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.capa__moldura--arrastando { cursor: grabbing; }

.capa__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.capa__vazia {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  padding: 0 24px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px dashed var(--linha);
  border-radius: 14px;
  text-align: center;
}
.capa__vazia span { font-size: 14px; font-weight: 650; color: var(--cinza); }
.capa__vazia small { font-size: 12px; color: var(--cinza-600); line-height: 1.5; max-width: 40ch; }

.capa__dica {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  color: #FFFFFF;
  pointer-events: none;
}
.capa__dica svg { width: 12px; height: 12px; }

.capa__aviso {
  margin: 14px 0 0;
  font-size: 12.5px;
  color: var(--dourado);
}

.logo {
  position: absolute;
  left: 18px;
  bottom: -30px;
  width: 68px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  overflow: hidden;
  background: var(--preto-800);
  border: 3px solid var(--couro, #0A0B0D);
  font-size: 22px;
  font-weight: 800;
}
.logo img { width: 100%; height: 100%; object-fit: cover; }

.fotos-acoes { display: flex; gap: 20px; flex-wrap: wrap; }
.fotos-acoes__grupo { display: flex; align-items: center; gap: 10px; }
.tirar {
  padding: 0;
  background: transparent;
  border: none;
  color: var(--cinza-600);
  font-family: var(--fonte-corpo);
  font-size: 12.5px;
  text-decoration: underline;
  cursor: pointer;
}
.tirar:hover { color: var(--laranja-400); }

/* ---------- cor ---------- */
.cor { display: flex; align-items: center; gap: 14px; }
.cor__bola {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 99px;
  border: 1px solid var(--linha);
}
.cor__texto { flex: 1; min-width: 0; }
.cor__titulo { margin: 0; font-size: 14.5px; font-weight: 650; color: var(--branco); }
.cor__apoio { margin: 3px 0 0; font-size: 12.5px; color: var(--cinza-600); line-height: 1.5; }

/* ---------- campos ---------- */
.grade { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }

.campo { display: flex; flex-direction: column; margin-bottom: 16px; min-width: 0; }
.campo > span {
  margin-bottom: 7px;
  font-size: var(--tam-rotulo);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cinza);
}
.campo > span em {
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
  color: var(--cinza-600);
  font-weight: 500;
}
.campo input,
.campo textarea {
  width: 100%;
  padding: 12px 13px;
  min-height: 44px;
  font-family: var(--fonte-corpo);
  font-size: 15px;
  color: var(--branco);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--linha);
  border-radius: var(--raio);
  resize: vertical;
  line-height: 1.5;
}
.campo input:focus,
.campo textarea:focus { outline: none; border-color: var(--dourado-linha); }
.campo input::placeholder,
.campo textarea::placeholder { color: var(--cinza-600); }

.contador { margin-top: 6px; font-size: 11.5px; color: var(--cinza-600); }

.erro {
  margin: 0 0 16px;
  padding: 11px 14px;
  border: 1px solid var(--laranja);
  background: var(--dourado-suave);
  border-radius: var(--raio);
  font-size: 13.5px;
  color: var(--laranja-400);
  line-height: 1.55;
}
.aviso { font-size: 13.5px; font-weight: 650; color: var(--dourado); }

.nota {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--cinza-600);
  line-height: 1.55;
}

/* ---------- vazio ---------- */
.vazio {
  padding: 40px 28px;
  background: var(--superficie);
  border: 1px solid var(--linha-suave);
  border-radius: 20px;
  text-align: center;
}
.vazio__titulo { margin: 0 0 8px; font-size: 17px; font-weight: 750; color: var(--branco); }
.vazio__texto { margin: 0; font-size: var(--tam-apoio); color: var(--cinza-600); }

@media (max-width: 700px) {
  .grade { grid-template-columns: 1fr; }
  .cartao__acoes { flex-direction: column-reverse; align-items: stretch; }
  .cartao__acoes .btn { width: 100%; }
  .cor { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
}
</style>