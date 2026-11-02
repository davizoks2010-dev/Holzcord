export default function Avatar({ name, url, size = 28 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.45 }
  return url
    ? <img src={url} alt={name} style={style} className="shrink-0 rounded-full object-cover" />
    : <span style={style} className="grid shrink-0 place-items-center rounded-full bg-holz-line font-display font-semibold text-holz-900">{name.slice(0, 1).toUpperCase()}</span>
}
