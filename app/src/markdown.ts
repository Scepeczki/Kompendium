import { marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: false })

/**
 * Renderuje Markdown + LaTeX do bezpiecznego HTML.
 * Wzory ($...$ i $$...$$) są wycinane przed parsowaniem Markdownu,
 * renderowane KaTeX-em i wstawiane z powrotem na końcu.
 */
export function renderMarkdown(src: string): string {
  const math: string[] = []
  const stash = (html: string) => `%%MATH${math.push(html) - 1}%%`

  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    stash(katex.renderToString(tex, { displayMode: true, throwOnError: false })),
  )
  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex: string) =>
    stash(katex.renderToString(tex, { displayMode: false, throwOnError: false })),
  )

  let html = marked.parse(text) as string
  html = html.replace(/%%MATH(\d+)%%/g, (_, i: string) => math[Number(i)])
  return DOMPurify.sanitize(html)
}
