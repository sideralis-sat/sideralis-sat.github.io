import katex from 'katex'
import { useMemo } from 'react'

/** Fórmula LaTeX renderizada con KaTeX */
export function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { throwOnError: false, displayMode: block, strict: false, output: 'html' }),
    [children, block],
  )
  return <span className={block ? 'tex tex-block' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Número para LaTeX con punto decimal: 6798.3 */
export const tn = (v: number, d = 2) => {
  const s = v.toFixed(d)
  return v < 0 ? s.replace('-', '-') : s
}
