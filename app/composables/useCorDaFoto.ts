/**
 * Tira a cor de uma foto — e a deixa usável.
 *
 * A cor crua de uma imagem quase nunca serve como cor de interface:
 * foto escura devolve um tom que some no fundo, foto clara devolve um
 * tom que apaga o texto branco por cima. Entao aqui a gente aproveita
 * so o MATIZ da foto (o quanto ela e laranja, azul, verde) e impoe a
 * saturacao e o brilho que a interface precisa.
 *
 * Resultado: a pagina fica com a temperatura da barbearia e continua
 * legivel em qualquer caso.
 */

/** Converte RGB para HSL. Devolve matiz em graus, o resto de 0 a 1. */
function paraHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60

  return [h, s, l]
}

/** Converte HSL de volta para hexadecimal. */
function paraHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const dois = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0')

  return `#${dois(r)}${dois(g)}${dois(b)}`.toUpperCase()
}

/**
 * Le o arquivo de imagem e devolve uma cor pronta para uso.
 * Se a foto for cinza demais para ter um matiz confiavel, devolve null
 * e quem chamou fica com a cor padrao.
 */
export function useCorDaFoto() {
  async function corDe(arquivo: File): Promise<string | null> {
    if (!import.meta.client) return null

    const url = URL.createObjectURL(arquivo)

    try {
      const img = await new Promise<HTMLImageElement>((ok, falhou) => {
        const i = new Image()
        i.onload = () => ok(i)
        i.onerror = () => falhou(new Error('imagem invalida'))
        i.src = url
      })

      /* Uma miniatura de 40x40 basta: a gente quer a tendencia da foto,
         nao o detalhe. E e instantaneo. */
      const lado = 40
      const tela = document.createElement('canvas')
      tela.width = lado
      tela.height = lado
      const pincel = tela.getContext('2d', { willReadFrequently: true })
      if (!pincel) return null

      pincel.drawImage(img, 0, 0, lado, lado)
      const pixels = pincel.getImageData(0, 0, lado, lado).data

      /* Media circular do matiz, ponderada pela saturacao.

         Matiz e um circulo: 350 graus e 10 graus sao quase a mesma cor,
         mas a media aritmetica deles daria 180 (o oposto!). Somar seno e
         cosseno resolve isso. E ponderar pela saturacao faz o pixel
         colorido pesar mais que o pixel cinza. */
      let somaSeno = 0
      let somaCosseno = 0
      let somaPeso = 0

      for (let i = 0; i < pixels.length; i += 4) {
        const alfa = pixels[i + 3]!
        if (alfa < 200) continue

        const [h, s, l] = paraHsl(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!)

        // Pixel quase preto, quase branco ou quase cinza nao tem matiz util
        if (l < 0.12 || l > 0.92 || s < 0.12) continue

        const rad = (h * Math.PI) / 180
        somaSeno += Math.sin(rad) * s
        somaCosseno += Math.cos(rad) * s
        somaPeso += s
      }

      // Foto sem cor suficiente: melhor manter o padrao do sistema
      if (somaPeso < 4) return null

      let matiz = (Math.atan2(somaSeno, somaCosseno) * 180) / Math.PI
      if (matiz < 0) matiz += 360

      /* Saturacao e brilho fixos: e o que garante contraste bom com
         texto branco por cima e com o fundo escuro por baixo. */
      return paraHex(matiz, 0.62, 0.55)
    } catch {
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return { corDe }
}