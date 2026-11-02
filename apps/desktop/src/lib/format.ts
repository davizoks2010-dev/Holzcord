// Markdown minimo e seguro: escapa HTML primeiro, depois aplica negrito/italico/codigo/links/mencoes.
export function renderMarkdown(src: string): string {
  const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return esc
    .replace(/```([\s\S]+?)```/g, '<pre class="my-1 overflow-x-auto rounded-leafsm bg-black/40 p-2 font-mono text-xs">$1</pre>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-black/40 px-1 rounded">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/\|\|([^|\n]+)\|\|/g, '<span class="spoiler cursor-pointer rounded bg-holz-mute text-transparent hover:bg-transparent hover:text-inherit">$1</span>')
    .replace(/^&gt; ?(.+)$/gm, '<blockquote class="border-l-2 border-holz-line pl-2 text-holz-mute">$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<span class="block pl-3">• $1</span>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a class="text-holz-500 underline" target="_blank" rel="noreferrer noopener" href="$1">$1</a>')
    .replace(/(^|\s)@([\p{L}\p{N}_.-]{1,32})/gu, '$1<span class="rounded bg-holz-500/20 px-1 text-holz-500">@$2</span>')
}

/** A mensagem menciona este usuario (ou todos)? */
export function mentionsUser(content: string, username: string): boolean {
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return /(^|\s)@(everyone|todos)(?![\p{L}\p{N}])/iu.test(content) || new RegExp(`(^|\\s)@${esc}(?![\\p{L}\\p{N}_.-])`, 'iu').test(content)
}
