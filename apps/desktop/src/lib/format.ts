// Markdown minimo e seguro: escapa HTML primeiro, depois aplica negrito/italico/codigo/links.
export function renderMarkdown(src: string): string {
  const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return esc
    .replace(/`([^`\n]+)`/g, '<code class="bg-black/40 px-1 rounded">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a class="text-sky-400 underline" target="_blank" rel="noreferrer noopener" href="$1">$1</a>')
}
