// Script markup -> chunks of tokens.
//   *word* or *a phrase*  keyword (one token)
//   |                     force a new chunk (screen)
//   line break            new chunk
//   spaces                separate tokens
// Commas and periods are dropped from display; ? and ؟ are kept.

export interface Token {
  /** Index across the whole script; timing arrays are keyed by it. */
  index: number
  chunk: number
  text: string
  keyword: boolean
  arabic: boolean
}

export interface Chunk {
  index: number
  tokens: Token[]
  /** Lay out right-to-left: true when any token is Arabic. */
  rtl: boolean
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const STRIP = /[.,،;:!…]/g

export const isArabic = (s: string): boolean => ARABIC.test(s)

export function displayText(raw: string, uppercaseLatin: boolean): string {
  const s = raw.replace(STRIP, '').replace(/\s+/g, ' ').trim()
  return uppercaseLatin && !isArabic(s) ? s.toLocaleUpperCase('fr') : s
}

export function parseScript(script: string, uppercaseLatin = true): Chunk[] {
  const chunks: Chunk[] = []
  let current: Token[] = []
  let index = 0
  const flush = () => {
    if (current.length) {
      chunks.push({ index: chunks.length, tokens: current, rtl: current.some((t) => t.arabic) })
      current = []
    }
  }
  const push = (raw: string, keyword: boolean) => {
    const text = displayText(raw, uppercaseLatin)
    if (!text) return
    current.push({ index: index++, chunk: chunks.length, text, keyword, arabic: isArabic(text) })
  }
  // Tokenizer: *...* phrases, | breaks, newlines, words.
  const re = /\*([^*\n]+)\*|(\|)|(\r?\n)|([^\s*|]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(script))) {
    if (m[1] !== undefined) push(m[1], true)
    else if (m[2] || m[3]) flush()
    else if (m[4]) push(m[4], false)
  }
  flush()
  return chunks
}

/** Number of tokens in a script, cheaply. */
export const tokenCount = (chunks: Chunk[]): number => chunks.reduce((n, c) => n + c.tokens.length, 0)
