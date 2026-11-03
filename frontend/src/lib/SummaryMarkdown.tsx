import { Fragment, type ReactNode } from 'react'

/*
 * Small, dependency-free markdown renderer for LLM summaries.
 * Builds React elements only (no innerHTML), so model output can never inject markup.
 * Supports: headings, paragraphs, nested bullet/numbered lists, fenced code, blockquotes,
 * horizontal rules, and inline **bold**, *italic*, `code` and [links](https://…).
 */

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const FENCE = /^\s*```/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s*>/

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|((?<![\w*])\*[^*\s][^*\n]*?\*(?![\w*])|(?<![\w_])_[^_\s][^_\n]*?_(?![\w_]))|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/

export function InlineMarkdown({ text }: { text: string }) {
  return <>{renderInline(text)}</>
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let key = 0
  while (rest) {
    const match = INLINE.exec(rest)
    if (!match) { nodes.push(rest); break }
    if (match.index > 0) nodes.push(rest.slice(0, match.index))
    const token = match[0]
    const k = key++
    if (match[1]) nodes.push(<code key={k}>{token.slice(1, -1)}</code>)
    else if (match[2]) nodes.push(<strong key={k}>{renderInline(token.slice(2, -2))}</strong>)
    else if (match[3]) nodes.push(<em key={k}>{renderInline(token.slice(1, -1))}</em>)
    else {
      const link = /^\[([^\]]+)\]\((.+)\)$/.exec(token)
      nodes.push(link ? <a key={k} href={link[2]} target="_blank" rel="noopener noreferrer">{renderInline(link[1])}</a> : token)
    }
    rest = rest.slice(match.index + token.length)
  }
  return nodes
}

type ListNode = { ordered: boolean; items: { content: string; children: ListNode | null }[] }

function parseList(lines: string[], start: number, indent: number): [ListNode, number] {
  const first = ITEM.exec(lines[start])
  const list: ListNode = { ordered: !!first && /\d/.test(first[2]), items: [] }
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      // Loose lists put blank lines between items; keep going if another item follows.
      let j = i
      while (j < lines.length && !lines[j].trim()) j++
      const next = j < lines.length ? ITEM.exec(lines[j]) : null
      if (next && next[1].length >= indent) { i = j; continue }
      break
    }
    const m = ITEM.exec(line)
    if (m) {
      const ind = m[1].length
      if (ind < indent) break
      if (ind > indent && list.items.length) {
        const [child, next] = parseList(lines, i, ind)
        list.items[list.items.length - 1].children = child
        i = next
        continue
      }
      list.items.push({ content: m[3], children: null })
      i++
    } else if (/^\s+\S/.test(line) && list.items.length) {
      // Wrapped continuation of the previous item.
      list.items[list.items.length - 1].content += ` ${line.trim()}`
      i++
    } else break
  }
  return [list, i]
}

function renderList(list: ListNode, key: number): ReactNode {
  const items = list.items.map((item, i) => (
    <li key={i}>{renderInline(item.content)}{item.children && renderList(item.children, 0)}</li>
  ))
  return list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
}

const isBlockStart = (line: string) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line)

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    if (FENCE.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++])
      i++ // closing fence
      out.push(<pre key={key++}><code>{code.join('\n')}</code></pre>)
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      out.push(<h4 key={key++} className={`research-md-h research-md-h--${level}`}>{renderInline(heading[2])}</h4>)
      i++
      continue
    }

    if (RULE.test(line)) { out.push(<hr key={key++} />); i++; continue }

    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={key++}>{renderBlocks(quoted.join('\n'))}</blockquote>)
      continue
    }

    const item = ITEM.exec(line)
    if (item) {
      const [list, next] = parseList(lines, i, item[1].length)
      out.push(renderList(list, key++))
      i = next
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++].trim())
    out.push(<p key={key++}>{renderInline(para.join(' '))}</p>)
  }
  return out
}

export default function SummaryMarkdown({ text }: { text: string }) {
  return <div className="research-md"><Fragment>{renderBlocks(text)}</Fragment></div>
}