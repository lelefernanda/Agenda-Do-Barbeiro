/**
 * Prepara imagem antes de enviar.
 *
 * Foto tirada com celular chega com 3 a 6 MB. Sem encolher, cada visita
 * a pagina da barbearia baixaria isso so para mostrar uma miniatura.
 * Aqui vira um quadrado com uns 60 a 120 KB.
 *
 * Roda no navegador de proposito: economiza o envio inteiro, nao so o
 * armazenamento. Quem esta com internet ruim na barbearia agradece.
 */
export function useImagem() {
  /**
   * Corta no centro e reduz para um quadrado de `lado` pixels.
   * O corte central e o que melhor funciona para rosto e cabeca,
   * que e o caso tanto do avatar quanto da foto de corte.
   */
  function encolher(arquivo: File, lado = 512, qualidade = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader()
      leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'))
      leitor.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('Arquivo não parece uma imagem.'))
        img.onload = () => {
          const tela = document.createElement('canvas')
          tela.width = lado
          tela.height = lado
          const ctx = tela.getContext('2d')
          if (!ctx) return reject(new Error('Navegador não suporta.'))

          const corte = Math.min(img.width, img.height)
          const x = (img.width - corte) / 2
          const y = (img.height - corte) / 2
          ctx.drawImage(img, x, y, corte, corte, 0, 0, lado, lado)

          tela.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Falha ao converter.'))),
            'image/jpeg',
            qualidade
          )
        }
        img.src = leitor.result as string
      }
      leitor.readAsDataURL(arquivo)
    })
  }

  function ehImagem(arquivo: File) {
    return arquivo.type.startsWith('image/')
  }

  return { encolher, ehImagem }
}