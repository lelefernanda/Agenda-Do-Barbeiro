<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ layout: 'painel' })
useHead({ title: 'Meu perfil — Agenda Do Barbeiro' })

const supabase = useSupabaseClient<Database>()
const usuario = useSupabaseUser()
const { contexto, carregar } = useAcesso()

/**
 * Id de quem esta logado.
 *
 * Com as chaves novas do Supabase, o identificador pode vir como "sub"
 * em vez de "id". O contexto do banco tambem tem o valor certo em
 * perfil_id, entao usamos ele como ultima garantia.
 */
const meuId = computed<string | null>(() => {
  const u = usuario.value as { id?: string; sub?: string } | null
  return u?.id ?? u?.sub ?? contexto.value?.perfil_id ?? null
})

const nome = ref(contexto.value?.nome ?? '')
const telefone = ref(contexto.value?.telefone ?? '')
const salvando = ref(false)
const enviandoFoto = ref(false)
const aviso = ref('')
const erro = ref('')
const entrada = ref<HTMLInputElement | null>(null)

const atende = ref(false)
const ehDonoAqui = computed(() => contexto.value?.papel === "dono")

watch(meuId, async (id) => {
  if (!id) return
  const { data } = await supabase.from("perfis").select("atende").eq("id", id).single()
  atende.value = Boolean((data as { atende?: boolean } | null)?.atende)
}, { immediate: true })

function camposDoPerfil() {
  const campos: Record<string, unknown> = {
    nome: nome.value.trim(),
    telefone: telefone.value.trim() || null,
  }
  if (ehDonoAqui.value) campos.atende = atende.value
  return campos
}

const iniciais = computed(() => {
  const n = contexto.value?.nome ?? ''
  return n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
})

const rotuloPapel = computed(() => {
  const p = contexto.value?.papel
  return p === 'master' ? 'Master' : p === 'dono' ? 'Dono' : 'Barbeiro'
})

/**
 * Encolhe a imagem antes de enviar.
 *
 * Foto tirada com celular chega com 3 a 6 MB. Sem encolher, cada
 * visita a pagina da barbearia baixaria isso so para mostrar um
 * circulo de 40 pixels. Aqui vira um quadrado de 512, cortado no
 * centro, com uns 60 KB.
 */
function encolher(arquivo: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Arquivo não parece uma imagem.'))
      img.onload = () => {
        const LADO = 512
        const tela = document.createElement('canvas')
        tela.width = LADO
        tela.height = LADO
        const ctx = tela.getContext('2d')
        if (!ctx) return reject(new Error('Navegador não suporta.'))

        // corte central: pega o maior quadrado possivel da foto
        const corte = Math.min(img.width, img.height)
        const x = (img.width - corte) / 2
        const y = (img.height - corte) / 2
        ctx.drawImage(img, x, y, corte, corte, 0, 0, LADO, LADO)

        tela.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Falha ao converter.'))),
          'image/jpeg',
          0.85
        )
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(arquivo)
  })
}

async function escolherFoto(evento: Event) {
  const arquivo = (evento.target as HTMLInputElement).files?.[0]
  if (!arquivo) return

  erro.value = ''
  aviso.value = ''

  if (!arquivo.type.startsWith('image/')) {
    erro.value = 'Escolha um arquivo de imagem.'
    return
  }

  enviandoFoto.value = true
  try {
    // O navegador so encolhe. Quem grava e o servidor, que monta o
    // caminho a partir de quem esta logado.
    const menor = await encolher(arquivo)
    const pacote = new FormData()
    pacote.append('foto', new File([menor], 'foto.jpg', { type: 'image/jpeg' }))

    await $fetch('/api/perfil/foto', { method: 'POST', body: pacote })

    await carregar(true)
    aviso.value = 'Foto atualizada.'
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { statusMessage?: string } }
    erro.value =
      err.statusMessage || err.data?.statusMessage || 'Não foi possível enviar a foto.'
  } finally {
    enviandoFoto.value = false
    if (entrada.value) entrada.value.value = ''
  }
}

async function removerFoto() {
  enviandoFoto.value = true
  erro.value = ''
  aviso.value = ''
  try {
    await $fetch('/api/perfil/foto', { method: 'DELETE' })
    await carregar(true)
    aviso.value = 'Foto removida.'
  } catch {
    erro.value = 'Não foi possível remover.'
  } finally {
    enviandoFoto.value = false
  }
}

async function salvar() {
  if (!meuId.value) return
  erro.value = ''
  aviso.value = ''

  if (nome.value.trim().length < 2) {
    erro.value = 'Informe seu nome.'
    return
  }

  salvando.value = true
  const { error } = await supabase
    .from('perfis')
    .update(camposDoPerfil())
    .eq('id', meuId.value)
  salvando.value = false

  if (error) {
    erro.value = error.message
    return
  }
  await carregar(true)
  aviso.value = 'Dados salvos.'
}
</script>

<template>
  <div>
    <header class="cabecalho">
      <p class="sobrancelha">Meu perfil</p>
      <h1 class="titulo">{{ contexto?.nome }}</h1>
    </header>

    <p v-if="aviso" class="recado recado--bom">{{ aviso }}</p>
    <p v-if="erro" class="recado recado--ruim">{{ erro }}</p>

    <!-- ---------- foto ---------- -->
    <section class="bloco">
      <p class="bloco__titulo">Foto</p>

      <div class="foto">
        <div class="foto__circulo">
          <img v-if="contexto?.foto_url" :src="contexto.foto_url" alt="" />
          <span v-else>{{ iniciais }}</span>
        </div>

        <div class="foto__acoes">
          <p class="foto__dica">
            Quadrada fica melhor. A imagem é cortada no centro e reduzida
            automaticamente, então pode mandar direto do celular.
          </p>
          <div class="foto__botoes">
            <button class="btn btn--ouro" :disabled="enviandoFoto" @click="entrada?.click()">
              {{ enviandoFoto ? 'Enviando…' : contexto?.foto_url ? 'Trocar foto' : 'Escolher foto' }}
            </button>
            <button
              v-if="contexto?.foto_url"
              class="btn btn--simples"
              :disabled="enviandoFoto"
              @click="removerFoto"
            >
              Remover
            </button>
          </div>
          <input
            ref="entrada"
            type="file"
            accept="image/*"
            hidden
            @change="escolherFoto"
          />
        </div>
      </div>
    </section>

    <!-- ---------- dados ---------- -->
    <section class="bloco">
      <p class="bloco__titulo">Dados</p>

      <div class="grade">
        <label class="campo">
          <span>Nome</span>
          <input v-model="nome" :disabled="salvando" />
        </label>

        <label class="campo">
          <span>WhatsApp</span>
          <input v-model="telefone" placeholder="(19) 99999-9999" :disabled="salvando" />
        </label>

        <div class="campo">
          <span>Função</span>
          <p class="fixo">{{ rotuloPapel }}</p>
        </div>

        <div v-if="contexto?.barbearia_nome" class="campo">
          <span>Barbearia</span>
          <p class="fixo">{{ contexto.barbearia_nome }}</p>
        </div>
      </div>

      <div v-if="ehDonoAqui" class="cadeira">
        <label class="chave">
          <input v-model="atende" type="checkbox" :disabled="salvando" />
          <span class="chave__trilho"><span class="chave__bola" /></span>
          <span class="chave__texto">
            <strong>Eu também atendo</strong>
            <small>Ligado, você aparece na agenda como atendente, com seus próprios horários — e o cliente pode marcar com você.</small>
          </span>
        </label>
      </div>

      <button class="btn btn--laranja" :disabled="salvando" @click="salvar">
        {{ salvando ? 'Salvando…' : 'Salvar' }}
      </button>

      <p class="nota">
        Função e barbearia não podem ser alteradas por aqui. Se algo estiver
        errado, fale com o suporte.
      </p>
    </section>
  </div>
</template>

<style scoped>
.cadeira {
  margin: 4px 0 18px;
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--linha);
  border-radius: 16px;
}
.chave { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
.chave input { position: absolute; opacity: 0; width: 0; height: 0; }
.chave__trilho {
  position: relative;
  flex-shrink: 0;
  width: 46px;
  height: 26px;
  margin-top: 2px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid var(--linha);
  border-radius: 99px;
  transition: background 0.18s ease, border-color 0.18s ease;
}
.chave__bola {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: var(--cinza-600);
  border-radius: 99px;
  transition: transform 0.18s ease, background 0.18s ease;
}
.chave input:checked + .chave__trilho { background: var(--dourado-suave); border-color: var(--dourado-linha); }
.chave input:checked + .chave__trilho .chave__bola { transform: translateX(20px); background: var(--dourado); }
.chave input:focus-visible + .chave__trilho { outline: 2px solid var(--dourado); outline-offset: 2px; }
.chave__texto { display: flex; flex-direction: column; gap: 3px; }
.chave__texto strong { font-size: 15px; font-weight: 700; color: var(--branco); }
.chave__texto small { font-size: 12.5px; color: var(--cinza-600); line-height: 1.55; }
.cabecalho { margin-bottom: 26px; }
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
  font-size: 30px;
  letter-spacing: -0.025em;
  color: var(--branco);
}

.recado {
  margin: 0 0 18px;
  padding: 11px 14px;
  border-radius: var(--raio);
  font-size: 14px;
}
.recado--bom {
  color: var(--verde);
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.35);
}
.recado--ruim {
  color: var(--laranja-400);
  background: rgba(232, 135, 58, 0.08);
  border: 1px solid rgba(232, 135, 58, 0.4);
}

.bloco {
  margin-bottom: 18px;
  padding: 24px 26px;
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 12px;
}
.bloco__titulo {
  margin: 0 0 18px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dourado);
}

/* ---------- foto ---------- */
.foto { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.foto__circulo {
  width: 92px;
  height: 92px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  overflow: hidden;
  background: var(--dourado-600);
  border: 2px solid var(--dourado);
  color: var(--preto);
  font-size: 28px;
  font-weight: 800;
}
.foto__circulo img { width: 100%; height: 100%; object-fit: cover; }

.foto__acoes { flex: 1; min-width: 240px; }
.foto__dica {
  margin: 0 0 14px;
  font-size: 13.5px;
  color: var(--cinza-600);
  line-height: 1.55;
  max-width: 46ch;
}
.foto__botoes { display: flex; gap: 10px; flex-wrap: wrap; }

/* ---------- campos ---------- */
.grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.campo { display: flex; flex-direction: column; min-width: 0; }
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
  transition: border-color 0.18s ease;
}
.campo input:focus { outline: none; border-color: var(--dourado-600); }
.campo input:disabled { opacity: 0.5; }

.fixo {
  margin: 0;
  padding: 11px 13px;
  font-size: 15px;
  color: var(--cinza-600);
  background: var(--preto);
  border: 1px dashed var(--preto-600);
  border-radius: var(--raio);
}

.nota {
  margin: 14px 0 0;
  font-size: 12.5px;
  color: var(--cinza-600);
}

/* ---------- botoes ---------- */
.btn {
  padding: 11px 20px;
  border: 1px solid transparent;
  border-radius: var(--raio);
  font-family: var(--fonte-corpo);
  font-size: 14.5px;
  font-weight: 700;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.btn--laranja { background: var(--laranja); color: #17100A; }
.btn--laranja:hover:not(:disabled) { background: var(--laranja-400); }
.btn--ouro {
  background: transparent;
  border-color: var(--dourado-600);
  color: var(--dourado);
}
.btn--ouro:hover:not(:disabled) { background: rgba(212, 175, 55, 0.1); }
.btn--simples {
  background: transparent;
  border-color: var(--preto-600);
  color: var(--cinza);
}
.btn--simples:hover:not(:disabled) { border-color: var(--laranja); color: var(--laranja); }
</style>