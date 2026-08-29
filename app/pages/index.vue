<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

/* ------------------------------------------------------------
   TROQUE ESTES VALORES
   ------------------------------------------------------------ */
const WHATSAPP = 'https://wa.me/5519982659293?text=Oi!%20Quero%20conhecer%20o%20Agenda%20Do%20Barbeiro'
const SLUG_DEMO = '/barbearia-exemplo'   // tenant de demonstração

const PRECO_INSTALACAO   = '150'
const PRECO_MENSAL       = '100'
const PRECO_SEMESTRAL    = '500'
const PRECO_SEMESTRAL_MES = '83'
const ECONOMIA           = '100'

useHead({
  title: 'Agenda Do Barbeiro — agendamento online pra sua barbearia',
  meta: [
    {
      name: 'description',
      content:
        'Página de agendamento própria pra sua barbearia. O cliente escolhe o barbeiro, o serviço e o horário sozinho. Você abre o painel e vê o dia pronto.',
    },
    { name: 'theme-color', content: '#0A0B0D' },
  ],
})

/* ------------------------------------------------------------
   CONTEÚDO
   ------------------------------------------------------------ */
const agendaDemo = [
  { hora: '09:00', servico: 'Corte + barba',  barbeiro: 'Rafael', estado: 'ok' },
  { hora: '09:45', servico: 'Corte social',   barbeiro: 'Rafael', estado: 'ok' },
  { hora: '10:30', servico: 'Barba',          barbeiro: 'Diego',  estado: 'ok' },
  { hora: '11:15', servico: 'Livre',          barbeiro: '',       estado: 'livre' },
  { hora: '12:00', servico: 'Corte + barba',  barbeiro: 'Diego',  estado: 'novo' },
]

const dores = [
  {
    antes: 'Cliente manda mensagem no meio do corte',
    depois: 'Ele marca sozinho pelo link, a qualquer hora, sem te interromper.',
  },
  {
    antes: 'Agenda no caderno, rasurada',
    depois: 'Agenda do dia no celular, com nome, serviço e barbeiro de cada horário.',
  },
  {
    antes: 'Você não sabe quantos cortes fez no mês',
    depois: 'O painel conta os atendimentos por barbeiro e por serviço.',
  },
  {
    antes: 'Dois clientes marcados no mesmo horário',
    depois: 'Horário ocupado some da tela. Não dá pra marcar em cima.',
  },
]

const passos = [
  {
    n: '1',
    titulo: 'A gente conversa',
    texto:
      'Você me manda uma mensagem. Eu pergunto quais serviços a barbearia faz, quanto tempo leva cada um e quem são os barbeiros.',
  },
  {
    n: '2',
    titulo: 'Eu configuro tudo',
    texto:
      'Cadastro a barbearia, os serviços, os preços e a equipe. Você não preenche formulário nenhum. Recebe o acesso pronto no WhatsApp.',
  },
  {
    n: '3',
    titulo: 'Você divulga o link',
    texto:
      'Coloca o link na bio do Instagram e no status. O cliente abre, escolhe o barbeiro e marca. Você só confirma.',
  },
]

const recursos = [
  {
    titulo: 'Link próprio da barbearia',
    texto: 'agendadobarbeiro.com.br/suabarbearia — abre no navegador, sem app pra instalar.',
    destaque: true,
  },
  {
    titulo: 'O cliente escolhe o barbeiro',
    texto: 'Cada barbeiro tem a agenda dele. Quem tem cliente fiel não perde o cliente.',
  },
  {
    titulo: 'Só aparece horário livre',
    texto: 'O sistema calcula a duração do serviço e esconde o que já está ocupado.',
  },
  {
    titulo: 'Confirmação pelo WhatsApp',
    texto: 'O agendamento chega organizado, com nome, horário e serviço. Nada de conversa solta.',
  },
  {
    titulo: 'Avaliação por estrelas',
    texto: 'Depois do atendimento o cliente avalia o barbeiro. Só quem foi atendido pode avaliar.',
  },
  {
    titulo: 'Painel pra cada função',
    texto: 'O dono vê a barbearia inteira. Cada barbeiro vê só a agenda dele.',
  },
]

const perguntas = [
  {
    q: 'Preciso instalar algum aplicativo?',
    a: 'Não. É um link. Abre no navegador do celular, do computador, de qualquer aparelho. Seu cliente também não instala nada.',
  },
  {
    q: 'E se eu quiser parar de usar?',
    a: 'No plano mensal você avisa e cancela, sem multa e sem contrato. O mensal para no mês seguinte. Se tiver pago os 6 meses adiantado, o acesso continua até o fim do período contratado.',
  },
  {
    q: 'Quem cadastra os barbeiros?',
    a: 'Você pede pelo painel e eu libero o acesso. Faço assim de propósito: nenhum acesso entra no sistema sem passar por mim, e se um barbeiro sair da equipe você bloqueia na hora, sozinho.',
  },
  {
    q: 'Por que tem taxa de instalação?',
    a: 'Porque a configuração é feita na mão, por mim. Cadastro sua barbearia, seus serviços com a duração de cada um, seus preços e sua equipe. Você recebe pronto, sem preencher formulário.',
  },
  {
    q: 'Meu cliente é mais velho, vai conseguir usar?',
    a: 'A tela de agendamento tem três passos: serviço, barbeiro, horário. Nome e telefone e pronto. Sem senha, sem cadastro longo.',
  },
  {
    q: 'Já uso WhatsApp pra marcar. Por que mudar?',
    a: 'O WhatsApp continua. A diferença é que o horário chega já marcado na sua agenda, em vez de você anotar no meio do corte e correr o risco de esquecer.',
  },
]

/* ------------------------------------------------------------
   Revelação no scroll
   ------------------------------------------------------------ */
const observer = ref(null)

onMounted(() => {
  const alvos = document.querySelectorAll('[data-revelar]')
  if (!('IntersectionObserver' in window)) {
    alvos.forEach((el) => el.classList.add('visivel'))
    return
  }
  observer.value = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visivel')
          observer.value.unobserve(e.target)
        }
      })
    },
    { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
  )
  alvos.forEach((el) => observer.value.observe(el))
})

onBeforeUnmount(() => observer.value?.disconnect())
</script>

<template>
  <div class="pagina">
    <!-- ======================= TOPO ======================= -->
    <header class="topo">
      <div class="topo__interno">
        <a href="#" class="marca" aria-label="Agenda do Barbeiro — início">
          <span class="marca__brasao"><LogoBarba /></span>
          <span class="marca__texto">
            <span class="marca__linha1">Agenda</span>
            <span class="marca__linha2">do Barbeiro</span>
          </span>
        </a>

        <nav class="nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#precos">Preço</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>

        <div class="topo__acoes">
          <NuxtLink to="/login" class="link-entrar">Entrar</NuxtLink>
          <a :href="WHATSAPP" target="_blank" rel="noopener" class="btn btn--laranja btn--sm">
            <span class="so-largo">Falar no</span> WhatsApp
          </a>
        </div>
      </div>
    </header>

    <main>
      <!-- ======================= HERÓI ======================= -->
      <section class="heroi">
        <div class="heroi__brilho" aria-hidden="true"></div>

        <div class="container heroi__grade">
          <div class="heroi__texto">
            <p class="sobrancelha animar" style="--atraso: 0.05s">
              Sistema de agendamento para barbearias
            </p>

            <h1 class="titulo-display heroi__titulo">
              <span class="animar" style="--atraso: 0.15s">Seu cliente marca sozinho.</span>
              <span class="animar heroi__enfase" style="--atraso: 0.3s">Você só corta.</span>
            </h1>

            <p class="heroi__sub animar" style="--atraso: 0.45s">
              Uma página de agendamento só da sua barbearia. O cliente escolhe o serviço,
              o barbeiro e o horário. Você abre o painel e vê o dia inteiro já montado.
            </p>

            <div class="heroi__botoes animar" style="--atraso: 0.55s">
              <a :href="WHATSAPP" target="_blank" rel="noopener" class="btn btn--laranja">
                Falar no WhatsApp
              </a>
              <NuxtLink :to="SLUG_DEMO" class="btn btn--fantasma">
                Ver uma barbearia de exemplo
              </NuxtLink>
            </div>

            <p class="heroi__nota animar" style="--atraso: 0.65s">
              Não tem cadastro online. A gente conversa, eu configuro sua barbearia
              e te entrego o acesso pronto.
            </p>
          </div>

          <!-- Cartão da agenda -->
          <div class="heroi__visual">
            <div class="agenda animar-cartao">
              <div class="agenda__topo">
                <div>
                  <p class="agenda__dia">Segunda-feira</p>
                  <p class="agenda__data">18 de agosto</p>
                </div>
                <span class="agenda__etiqueta">Barbearia do Zé</span>
              </div>

              <ul class="agenda__lista">
                <li
                  v-for="(item, i) in agendaDemo"
                  :key="item.hora"
                  class="slot"
                  :class="`slot--${item.estado}`"
                  :style="{ '--atraso': `${0.9 + i * 0.12}s` }"
                >
                  <span class="slot__hora">{{ item.hora }}</span>
                  <span class="slot__servico">{{ item.servico }}</span>
                  <span class="slot__barbeiro">{{ item.barbeiro }}</span>
                  <span class="slot__marca" aria-hidden="true"></span>
                </li>
              </ul>

              <div class="agenda__rodape">
                <span><strong>4</strong> agendamentos</span>
                <span class="agenda__ponto" aria-hidden="true">·</span>
                <span><strong>1</strong> horário livre</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="regua" role="presentation"></div>

      <!-- ======================= DORES ======================= -->
      <section class="secao">
        <div class="container">
          <header class="secao__cabecalho" data-revelar>
            <p class="sobrancelha">O que muda no dia a dia</p>
            <h2 class="titulo-display secao__titulo">
              Quatro coisas que param de acontecer
            </h2>
          </header>

          <ul class="dores">
            <li
              v-for="(d, i) in dores"
              :key="d.antes"
              class="dor"
              data-revelar
              :style="{ '--atraso': `${i * 0.08}s` }"
            >
              <p class="dor__antes">
                <span class="dor__risco">{{ d.antes }}</span>
              </p>
              <p class="dor__depois">{{ d.depois }}</p>
            </li>
          </ul>
        </div>
      </section>

      <div class="regua" role="presentation"></div>

      <!-- ======================= COMO FUNCIONA ======================= -->
      <section id="como-funciona" class="secao secao--escura">
        <div class="container">
          <header class="secao__cabecalho" data-revelar>
            <p class="sobrancelha">Como funciona</p>
            <h2 class="titulo-display secao__titulo">Três passos até sua agenda estar no ar</h2>
          </header>

          <ol class="passos">
            <li
              v-for="(p, i) in passos"
              :key="p.n"
              class="passo"
              data-revelar
              :style="{ '--atraso': `${i * 0.12}s` }"
            >
              <span class="passo__numero" aria-hidden="true">{{ p.n }}</span>
              <h3 class="passo__titulo">{{ p.titulo }}</h3>
              <p class="passo__texto">{{ p.texto }}</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- ======================= RECURSOS ======================= -->
      <section id="recursos" class="secao">
        <div class="container">
          <header class="secao__cabecalho" data-revelar>
            <p class="sobrancelha">Recursos</p>
            <h2 class="titulo-display secao__titulo">O que vem junto</h2>
          </header>

          <div class="recursos">
            <article
              v-for="(r, i) in recursos"
              :key="r.titulo"
              class="recurso"
              :class="{ 'recurso--destaque': r.destaque }"
              data-revelar
              :style="{ '--atraso': `${i * 0.06}s` }"
            >
              <h3 class="recurso__titulo">{{ r.titulo }}</h3>
              <p class="recurso__texto">{{ r.texto }}</p>
            </article>
          </div>
        </div>
      </section>

      <div class="regua" role="presentation"></div>

      <!-- ======================= REGIÃO ======================= -->
      <section class="secao secao--escura">
        <div class="container regiao" data-revelar>
          <span class="regiao__brasao"><LogoBarba /></span>
          <p class="sobrancelha">Circuito das Águas Paulistas</p>
          <h2 class="titulo-display regiao__titulo">
            Quem configura e dá suporte mora aqui
          </h2>
          <p class="regiao__texto">
            Pedreira, Amparo, Serra Negra, Jaguariúna. Se der problema, você fala comigo
            direto — não com um atendimento que não sabe onde fica a sua rua.
          </p>
        </div>
      </section>

      <!-- ======================= PREÇO ======================= -->
      <section id="precos" class="secao">
        <div class="container">
          <header class="secao__cabecalho" data-revelar>
            <p class="sobrancelha">Preço</p>
            <h2 class="titulo-display secao__titulo">Um plano só, sem pegadinha</h2>
          </header>

          <div class="plano" data-revelar>
            <div class="plano__cabecalho">
              <span class="plano__nome">Barbearia</span>
              <span class="plano__badge">Sem contrato</span>
            </div>

            <!-- Instalação -->
            <div class="instalacao">
              <div class="instalacao__texto">
                <p class="instalacao__rotulo">Instalação</p>
                <p class="instalacao__desc">
                  Uma vez só. Eu cadastro a barbearia, os serviços, os preços e a equipe.
                </p>
              </div>
              <p class="instalacao__valor">
                <span class="cifra">R$</span><span class="numero numero--medio">{{ PRECO_INSTALACAO }}</span>
              </p>
            </div>

            <p class="plano__divisor">Depois, escolha como pagar</p>

            <!-- Opções de pagamento -->
            <div class="opcoes">
              <div class="opcao">
                <p class="opcao__nome">Mensal</p>
                <p class="opcao__valor">
                  <span class="cifra">R$</span><span class="numero">{{ PRECO_MENSAL }}</span>
                  <span class="opcao__periodo">/mês</span>
                </p>
                <p class="opcao__detalhe">Cancela quando quiser, sem multa.</p>
              </div>

              <div class="opcao opcao--destaque">
                <span class="opcao__selo">Economiza R$ {{ ECONOMIA }}</span>
                <p class="opcao__nome">6 meses à vista</p>
                <p class="opcao__valor">
                  <span class="cifra">R$</span><span class="numero numero--dourado">{{ PRECO_SEMESTRAL }}</span>
                </p>
                <p class="opcao__detalhe">Sai por R$ {{ PRECO_SEMESTRAL_MES }} por mês.</p>
              </div>
            </div>

            <ul class="plano__itens">
              <li>Página de agendamento própria</li>
              <li>Painel do dono e painel de cada barbeiro</li>
              <li>Barbeiros e serviços sem limite</li>
              <li>Avaliação dos clientes por estrelas</li>
              <li>Configuração inicial feita por mim</li>
              <li>Suporte direto no WhatsApp</li>
            </ul>

            <a :href="WHATSAPP" target="_blank" rel="noopener" class="btn btn--laranja btn--bloco">
              Falar no WhatsApp
            </a>
            <p class="plano__nota">Sem fidelidade e sem multa. Você escolhe qual forma de pagamento prefere.</p>
          </div>
        </div>
      </section>

      <div class="regua" role="presentation"></div>

      <!-- ======================= DÚVIDAS ======================= -->
      <section id="duvidas" class="secao">
        <div class="container container--estreito">
          <header class="secao__cabecalho" data-revelar>
            <p class="sobrancelha">Dúvidas</p>
            <h2 class="titulo-display secao__titulo">Perguntas que sempre aparecem</h2>
          </header>

          <div class="faq">
            <details
              v-for="(p, i) in perguntas"
              :key="p.q"
              class="faq__item"
              data-revelar
              :style="{ '--atraso': `${i * 0.06}s` }"
            >
              <summary class="faq__pergunta">
                <span>{{ p.q }}</span>
                <span class="faq__sinal" aria-hidden="true"></span>
              </summary>
              <p class="faq__resposta">{{ p.a }}</p>
            </details>
          </div>
        </div>
      </section>

      <!-- ======================= CHAMADA FINAL ======================= -->
      <section class="chamada">
        <div class="container chamada__interno" data-revelar>
          <h2 class="titulo-display chamada__titulo">
            Sua agenda pode estar no ar essa semana
          </h2>
          <p class="chamada__texto">
            Me manda uma mensagem contando quantos barbeiros trabalham com você.
            O resto eu monto.
          </p>
          <a :href="WHATSAPP" target="_blank" rel="noopener" class="btn btn--laranja btn--grande">
            Falar no WhatsApp
          </a>
        </div>
      </section>
    </main>

    <!-- ======================= RODAPÉ ======================= -->
    <footer class="rodape">
      <div class="container rodape__interno">
        <div class="rodape__marca">
          <span class="rodape__brasao"><LogoBarba /></span>
          <span>Agenda do Barbeiro</span>
        </div>

        <nav class="rodape__nav" aria-label="Rodapé">
          <a href="#como-funciona">Como funciona</a>
          <a href="#precos">Preço</a>
          <a href="#duvidas">Dúvidas</a>
          <NuxtLink to="/login">Entrar</NuxtLink>
        </nav>

        <p class="rodape__copy">© {{ new Date().getFullYear() }} Agenda Do Barbeiro</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ============================================================
   FUNDAÇÃO
   ============================================================ */
.pagina {
  background: var(--preto);
  overflow-x: hidden;
}

.container {
  width: 100%;
  max-width: var(--largura-max);
  margin: 0 auto;
  padding: 0 24px;
}
.container--estreito { max-width: 780px; }

/* Playfair Display: caixa mista, nunca caixa alta */
.titulo-display {
  font-family: var(--fonte-display);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.015em;
  margin: 0;
}

.sobrancelha {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--dourado);
  margin: 0 0 18px;
}

/* ------------------------------------------------------------
   NÚMEROS — sempre em Manrope.
   A Playfair usa algarismos que descem abaixo da linha de base,
   o que deixa preço e horário desalinhados.
   ------------------------------------------------------------ */
.numero,
.cifra,
.slot__hora,
.passo__numero {
  font-family: var(--fonte-corpo);
  font-variant-numeric: tabular-nums lining-nums;
}
.numero {
  font-weight: 800;
  font-size: 46px;
  line-height: 1;
  letter-spacing: -0.045em;
  color: var(--branco);
}
.numero--medio  { font-size: 34px; }
.numero--dourado { color: var(--dourado); }
.cifra {
  font-size: 15px;
  font-weight: 700;
  color: var(--cinza);
  margin-right: 3px;
}

/* ---------- Botões ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 28px;
  border-radius: var(--raio);
  border: 1px solid transparent;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.005em;
  transition: transform 0.18s ease, background 0.18s ease,
              border-color 0.18s ease, box-shadow 0.18s ease;
}
.btn--sm { padding: 9px 18px; font-size: 13.5px; }
.btn--grande { padding: 17px 40px; font-size: 16.5px; }
.btn--bloco { width: 100%; }

.btn--laranja {
  background: var(--laranja);
  color: #FFFFFF;
  box-shadow: 0 8px 26px -12px rgba(59, 130, 246, 0.7);
}
.btn--laranja:hover {
  background: var(--laranja-400);
  transform: translateY(-2px);
  box-shadow: 0 14px 32px -12px rgba(59, 130, 246, 0.85);
}

.btn--fantasma {
  border-color: var(--preto-600);
  color: var(--branco);
  background: transparent;
}
.btn--fantasma:hover {
  border-color: var(--dourado-600);
  color: var(--dourado);
}

/* ============================================================
   TOPO
   ============================================================ */
.topo {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(10, 11, 13, 0.82);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--preto-700);
}
.topo__interno {
  max-width: var(--largura-max);
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 32px;
}

.marca { display: flex; align-items: center; gap: 12px; }

.marca__brasao {
  display: block;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  color: var(--dourado);
  transition: color 0.2s ease, transform 0.2s ease;
}
.marca:hover .marca__brasao {
  color: var(--dourado-400);
  transform: scale(1.04);
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

.nav {
  display: flex;
  gap: 28px;
  margin-left: auto;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--cinza);
}
.nav a { transition: color 0.18s ease; }
.nav a:hover { color: var(--branco); }

.topo__acoes { display: flex; align-items: center; gap: 18px; }

.link-entrar {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--cinza);
  transition: color 0.18s ease;
}
.link-entrar:hover { color: var(--dourado); }

/* ============================================================
   HERÓI
   ============================================================ */
.heroi {
  position: relative;
  padding: 92px 0 106px;
  overflow: hidden;
}

.heroi__brilho {
  position: absolute;
  top: -220px;
  left: 50%;
  width: 900px;
  height: 620px;
  transform: translateX(-58%);
  background: radial-gradient(
    ellipse at center,
    rgba(59, 130, 246, 0.30) 0%,
    rgba(59, 130, 246, 0.10) 40%,
    transparent 68%
  );
  pointer-events: none;
}

/* A grade fina do topo. Fica atras de tudo, e some conforme desce:
   perto do brilho ela aparece, no fim do bloco ja nao existe. */
.heroi::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image:
    linear-gradient(rgba(126, 176, 250, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(126, 176, 250, 0.08) 1px, transparent 1px);
  background-size: 28px 28px, 28px 28px;
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 45%, transparent 92%);
  mask-image: linear-gradient(180deg, #000 0%, #000 45%, transparent 92%);
  pointer-events: none;
}

.heroi__grade {
  position: relative;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 72px;
  align-items: center;
}

.heroi__titulo {
  font-size: clamp(38px, 5vw, 64px);
  margin: 0 0 26px;
}
.heroi__titulo span { display: block; }

.heroi__enfase {
  font-style: italic;
  font-weight: 600;
  background: linear-gradient(100deg, var(--dourado-400) 0%, var(--dourado) 45%, var(--dourado-600) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.heroi__sub {
  font-size: 17.5px;
  color: var(--cinza);
  max-width: 50ch;
  margin: 0 0 34px;
}

.heroi__botoes { display: flex; flex-wrap: wrap; gap: 14px; }

.heroi__nota {
  margin: 22px 0 0;
  font-size: 14px;
  color: var(--cinza-600);
  max-width: 44ch;
  padding-left: 14px;
  border-left: 2px solid var(--dourado-600);
}

/* ---------- Cartão da agenda ---------- */
.heroi__visual { perspective: 1400px; }

.agenda {
  background: linear-gradient(168deg, var(--preto-800) 0%, var(--preto) 100%);
  border: 1px solid var(--preto-700);
  border-radius: 10px;
  padding: 26px;
  box-shadow:
    0 40px 80px -40px rgba(0, 0, 0, 0.95),
    0 0 0 1px rgba(59, 130, 246, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.agenda__topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 18px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--preto-700);
}
.agenda__dia {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.015em;
  margin: 0;
  color: var(--branco);
}
.agenda__data {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--cinza-600);
}
.agenda__etiqueta {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dourado);
  border: 1px solid var(--dourado-600);
  border-radius: 99px;
  padding: 5px 11px;
  white-space: nowrap;
}

.agenda__lista { list-style: none; margin: 0; padding: 0; }

.slot {
  display: grid;
  grid-template-columns: 56px 1fr auto 8px;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid rgba(42, 50, 82, 0.7);
  opacity: 0;
  animation: entrar-slot 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--atraso);
}
.slot:last-child { border-bottom: 0; }

.slot__hora {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  color: var(--dourado);
}
.slot__servico { font-size: 14.5px; color: var(--branco); }
.slot__barbeiro { font-size: 13px; color: var(--cinza-600); }

.slot__marca {
  width: 7px;
  height: 7px;
  border-radius: 99px;
  background: var(--verde);
}

.slot--livre .slot__servico { color: var(--cinza-600); font-style: italic; }
.slot--livre .slot__hora { color: var(--cinza-600); }
.slot--livre .slot__marca { background: var(--preto-600); }

.slot--novo .slot__marca {
  background: var(--laranja);
  box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6);
  animation: pulsar 2s ease-out infinite;
  animation-delay: 1.8s;
}
.slot--novo .slot__servico { color: var(--laranja-400); font-weight: 600; }

@keyframes pulsar {
  0%   { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55); }
  70%  { box-shadow: 0 0 0 9px rgba(59, 130, 246, 0); }
  100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
}

.agenda__rodape {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--preto-700);
  font-size: 13px;
  color: var(--cinza-600);
}
.agenda__rodape strong { color: var(--branco); font-weight: 700; }
.agenda__ponto { color: var(--preto-600); }

/* ============================================================
   RÉGUA
   ============================================================ */
.regua {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--dourado-600) 18%,
    var(--dourado) 50%,
    var(--dourado-600) 82%,
    transparent 100%
  );
  opacity: 0.45;
}

/* ============================================================
   SEÇÕES
   ============================================================ */
.secao { padding: 92px 0; }
.secao--escura {
  background: linear-gradient(180deg, var(--preto) 0%, var(--preto-800) 50%, var(--preto) 100%);
}

.secao__cabecalho { margin-bottom: 54px; max-width: 640px; }
.secao__titulo { font-size: clamp(28px, 3.6vw, 42px); }

/* ---------- Dores ---------- */
.dores {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: var(--preto-700);
  border: 1px solid var(--preto-700);
  border-radius: 8px;
  overflow: hidden;
}
.dor {
  background: var(--preto);
  padding: 30px 28px;
  transition: background 0.25s ease;
}
.dor:hover { background: var(--preto-800); }

.dor__antes { margin: 0 0 12px; }
.dor__risco {
  font-size: 14.5px;
  color: var(--cinza-600);
  text-decoration: line-through;
  text-decoration-color: var(--laranja);
  text-decoration-thickness: 1.5px;
}
.dor__depois {
  margin: 0;
  font-size: 15.5px;
  color: var(--branco);
  line-height: 1.55;
}

/* ---------- Passos ---------- */
.passos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 42px;
}
.passo { position: relative; padding-top: 14px; }
.passo__numero {
  display: block;
  font-weight: 800;
  font-size: 68px;
  line-height: 1;
  letter-spacing: -0.05em;
  color: transparent;
  -webkit-text-stroke: 1.5px var(--dourado-600);
  margin-bottom: 12px;
}
.passo__titulo {
  font-family: var(--fonte-corpo);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
  margin: 0 0 10px;
  color: var(--branco);
}
.passo__texto {
  margin: 0;
  font-size: 15px;
  color: var(--cinza);
  line-height: 1.65;
}

/* ---------- Recursos ---------- */
.recursos {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.recurso {
  background: var(--preto-800);
  border: 1px solid var(--preto-700);
  border-radius: 8px;
  padding: 28px 26px;
  transition: border-color 0.25s ease, transform 0.25s ease;
}
.recurso:hover {
  border-color: var(--dourado-600);
  transform: translateY(-3px);
}
.recurso--destaque {
  grid-column: span 2;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.09) 0%, transparent 55%),
    var(--preto-800);
  border-color: var(--dourado-600);
}
.recurso__titulo {
  font-family: var(--fonte-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
  margin: 0 0 9px;
  color: var(--dourado);
}
.recurso__texto {
  margin: 0;
  font-size: 14.5px;
  color: var(--cinza);
  line-height: 1.6;
}

/* ---------- Região ---------- */
.regiao { max-width: 720px; text-align: center; margin-inline: auto; }
.regiao__brasao {
  display: block;
  width: 64px;
  height: 64px;
  margin: 0 auto 26px;
  color: var(--dourado-600);
  opacity: 0.9;
}
.regiao__titulo { font-size: clamp(27px, 3.3vw, 38px); margin-bottom: 18px; }
.regiao__texto { font-size: 16.5px; color: var(--cinza); margin: 0; line-height: 1.7; }

/* ============================================================
   PLANO
   ============================================================ */
.plano {
  max-width: 600px;
  margin: 0 auto;
  background: linear-gradient(170deg, var(--preto-800) 0%, var(--preto) 100%);
  border: 1px solid var(--dourado-600);
  border-radius: 12px;
  padding: 36px 34px;
  box-shadow: 0 30px 70px -40px rgba(59, 130, 246, 0.3);
}
.plano__cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 26px;
}
.plano__nome {
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 26px;
  letter-spacing: -0.015em;
  color: var(--branco);
}
.plano__badge {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--dourado);
  border: 1px solid var(--dourado-600);
  border-radius: 99px;
  padding: 5px 12px;
  white-space: nowrap;
}

/* ---------- Instalação ---------- */
.instalacao {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px;
  background: var(--preto);
  border: 1px solid var(--preto-700);
  border-radius: 8px;
}
.instalacao__rotulo {
  margin: 0 0 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dourado);
}
.instalacao__desc {
  margin: 0;
  font-size: 13.5px;
  color: var(--cinza-600);
  line-height: 1.5;
  max-width: 34ch;
}
.instalacao__valor {
  margin: 0;
  display: flex;
  align-items: baseline;
  white-space: nowrap;
}

.plano__divisor {
  margin: 26px 0 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--cinza-600);
  text-align: center;
}

/* ---------- Opções de pagamento ---------- */
.opcoes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-bottom: 30px;
}
.opcao {
  position: relative;
  background: var(--preto);
  border: 1px solid var(--preto-700);
  border-radius: 8px;
  padding: 22px 20px;
  transition: border-color 0.22s ease;
}
.opcao:hover { border-color: var(--preto-600); }

.opcao--destaque {
  border-color: var(--dourado-600);
  background: linear-gradient(150deg, rgba(59, 130, 246, 0.07) 0%, transparent 60%), var(--preto);
}
.opcao--destaque:hover { border-color: var(--dourado); }

.opcao__selo {
  position: absolute;
  top: -10px;
  right: 16px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #FFFFFF;
  background: var(--dourado);
  border-radius: 99px;
  padding: 4px 10px;
  white-space: nowrap;
}

.opcao__nome {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cinza);
}
.opcao__valor {
  margin: 0 0 8px;
  display: flex;
  align-items: baseline;
}
.opcao__periodo {
  font-size: 14px;
  font-weight: 600;
  color: var(--cinza-600);
  margin-left: 3px;
}
.opcao__detalhe {
  margin: 0;
  font-size: 13px;
  color: var(--cinza-600);
  line-height: 1.5;
}

.plano__itens { list-style: none; margin: 0 0 26px; padding: 0; }
.plano__itens li {
  position: relative;
  padding-left: 24px;
  margin-bottom: 12px;
  font-size: 14.5px;
  color: var(--cinza);
}
.plano__itens li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  width: 9px;
  height: 5px;
  border-left: 1.8px solid var(--dourado);
  border-bottom: 1.8px solid var(--dourado);
  transform: rotate(-45deg);
}

.plano__nota {
  margin: 14px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--cinza-600);
}

/* ---------- FAQ ---------- */
.faq { border-top: 1px solid var(--preto-700); }
.faq__item { border-bottom: 1px solid var(--preto-700); }

.faq__pergunta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 0;
  cursor: pointer;
  list-style: none;
  font-size: 16.5px;
  font-weight: 600;
  color: var(--branco);
  transition: color 0.2s ease;
}
.faq__pergunta::-webkit-details-marker { display: none; }
.faq__pergunta:hover { color: var(--dourado); }

.faq__sinal {
  position: relative;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}
.faq__sinal::before,
.faq__sinal::after {
  content: '';
  position: absolute;
  background: var(--dourado);
  transition: transform 0.25s ease;
}
.faq__sinal::before { top: 6px; left: 0; width: 14px; height: 1.6px; }
.faq__sinal::after  { left: 6px; top: 0; width: 1.6px; height: 14px; }
.faq__item[open] .faq__sinal::after { transform: scaleY(0); }

.faq__resposta {
  margin: 0;
  padding: 0 0 24px;
  max-width: 62ch;
  font-size: 15px;
  color: var(--cinza);
  line-height: 1.7;
}

/* ---------- Chamada final ---------- */
.chamada {
  position: relative;
  padding: 100px 0;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.12) 0%, transparent 62%),
    var(--preto-800);
  border-top: 1px solid var(--preto-700);
}
.chamada__interno { text-align: center; }
.chamada__titulo {
  font-size: clamp(30px, 4vw, 48px);
  max-width: 18ch;
  margin: 0 auto 18px;
}
.chamada__texto {
  font-size: 16.5px;
  color: var(--cinza);
  max-width: 46ch;
  margin: 0 auto 34px;
}

/* ---------- Rodapé ---------- */
.rodape {
  border-top: 1px solid var(--preto-700);
  padding: 34px 0;
  background: var(--preto);
}
.rodape__interno {
  display: flex;
  align-items: center;
  gap: 28px;
  flex-wrap: wrap;
}
.rodape__marca {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--fonte-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.015em;
  color: var(--branco);
}
.rodape__brasao {
  display: block;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--dourado);
}
.rodape__nav {
  display: flex;
  gap: 22px;
  margin-left: auto;
  font-size: 14px;
  font-weight: 500;
  color: var(--cinza-600);
}
.rodape__nav a:hover { color: var(--dourado); }
.rodape__copy { margin: 0; font-size: 13px; color: var(--cinza-600); }

/* ============================================================
   ANIMAÇÕES
   ============================================================ */
.animar {
  opacity: 0;
  animation: subir 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--atraso, 0s);
}
@keyframes subir {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animar-cartao {
  opacity: 0;
  animation: entrar-cartao 1s cubic-bezier(0.22, 1, 0.36, 1) 0.45s forwards;
}
@keyframes entrar-cartao {
  from { opacity: 0; transform: translateY(26px) rotateY(-7deg) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) rotateY(0) scale(1); }
}

@keyframes entrar-slot {
  from { opacity: 0; transform: translateX(-14px); }
  to   { opacity: 1; transform: translateX(0); }
}

[data-revelar] {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1),
              transform 0.65s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--atraso, 0s);
}
[data-revelar].visivel { opacity: 1; transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  .animar,
  .animar-cartao,
  .slot { opacity: 1; animation: none; transform: none; }
  [data-revelar] { opacity: 1; transform: none; }
}

/* ============================================================
   RESPONSIVO
   ============================================================ */
@media (max-width: 980px) {
  .heroi__grade { grid-template-columns: 1fr; gap: 52px; }
  .heroi { padding: 64px 0 80px; }
  .passos { grid-template-columns: 1fr; gap: 34px; }
  .recursos { grid-template-columns: repeat(2, 1fr); }
  .recurso--destaque { grid-column: span 2; }
  .nav { display: none; }
}

@media (max-width: 640px) {
  .secao { padding: 66px 0; }
  .dores { grid-template-columns: 1fr; }
  .recursos { grid-template-columns: 1fr; }
  .recurso--destaque { grid-column: span 1; }
  .heroi__botoes .btn { width: 100%; }
  .plano { padding: 28px 22px; }
  .plano__cabecalho { flex-direction: column; align-items: flex-start; gap: 12px; }
  .instalacao { flex-direction: column; align-items: flex-start; gap: 14px; }
  .opcoes { grid-template-columns: 1fr; gap: 18px; }
  .opcao--destaque { margin-top: 6px; }
  .slot { grid-template-columns: 52px 1fr 8px; }
  .slot__barbeiro { display: none; }
  .marca__brasao { width: 36px; height: 36px; }
  .marca__linha1 { font-size: 19px; }
  .rodape__interno { flex-direction: column; align-items: flex-start; gap: 18px; }
  .rodape__nav { margin-left: 0; flex-wrap: wrap; }
  /* No celular o Entrar continua visivel: quem ja e cliente precisa
     dele. Quem encolhe e o botao do WhatsApp, que vira so o essencial. */
  .topo__acoes { gap: 12px; }
  .topo__acoes .link-entrar {
    padding: 8px 14px;
    border: 1px solid var(--preto-600);
    border-radius: 99px;
    color: var(--branco);
    font-weight: 600;
  }
  .topo__acoes .btn--sm { padding: 9px 15px; font-size: 13.5px; white-space: nowrap; }
  .so-largo { display: none; }
}
</style>