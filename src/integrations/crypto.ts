import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * CRIPTOGRAFIA DE SEGREDO DE INTEGRACAO (secao 13)
 *
 * AES-256-GCM. GCM e escolhido por ser autenticado: se alguem alterar o texto
 * cifrado no banco, `decrypt` falha em vez de devolver lixo silenciosamente.
 *
 * A chave vive SOMENTE em INTEGRATION_ENCRYPTION_KEY (secret da Vercel /
 * .env.local). Nunca NEXT_PUBLIC_, nunca no banco, nunca em log.
 *
 * Formato guardado: "v1:<iv b64>:<authTag b64>:<ciphertext b64>". O prefixo de
 * versao existe para permitir rotacao de algoritmo depois sem adivinhar o que
 * cada linha antiga era.
 *
 * Gerar a chave:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const FORMAT_VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // tamanho recomendado para GCM
const KEY_BYTES = 32

export class IntegrationCryptoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'IntegrationCryptoError'
  }
}

/** Verdadeiro quando a chave existe e e utilizavel. Nao expoe a chave. */
export function isIntegrationCryptoConfigured(): boolean {
  try {
    readKey()
    return true
  } catch {
    return false
  }
}

function readKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new IntegrationCryptoError(
      'INTEGRATION_ENCRYPTION_KEY nao definida. Gere 32 bytes em base64 e configure como secret do servidor.',
    )
  }

  // Aceita base64 (recomendado) ou hex, para nao travar quem gerou de outro jeito.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')

  if (key.length !== KEY_BYTES) {
    throw new IntegrationCryptoError(
      `INTEGRATION_ENCRYPTION_KEY precisa ter ${KEY_BYTES} bytes (44 chars em base64). Recebido: ${key.length} bytes.`,
    )
  }
  return key
}

/**
 * Cifra um segredo para guardar em coluna `*_encrypted`.
 * Nunca passe por aqui algo que precise ser pesquisavel: GCM nao e deterministico.
 */
export function encryptIntegrationSecret(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext === '') {
    throw new IntegrationCryptoError('Nada a cifrar: valor vazio.')
  }

  const key = readKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Decifra. Falha quando a chave esta errada ou o conteudo foi adulterado -- e
 * esse e o comportamento desejado: token corrompido tem de virar erro de
 * conexao, nao requisicao com credencial invalida.
 */
export function decryptIntegrationSecret(stored: string): string {
  if (!stored) throw new IntegrationCryptoError('Nada a decifrar: valor vazio.')

  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new IntegrationCryptoError('Formato de segredo desconhecido.')
  }

  const [, ivB64, tagB64, dataB64] = parts
  const key = readKey()

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch (error) {
    throw new IntegrationCryptoError(
      'Nao foi possivel decifrar o segredo: chave trocada ou conteudo alterado.',
      { cause: error },
    )
  }
}

/**
 * Comparacao de string em tempo constante, para assinatura de webhook (secao 6).
 * `a === b` vaza informacao pelo tempo de comparacao e nao serve aqui.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}
