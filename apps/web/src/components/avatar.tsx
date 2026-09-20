/** Зурагчны зураг, байхгүй бол нэрийн эхний үсэг */
export function Avatar({ url, name, size = 64 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface-3 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-soft"
      style={{ width: size, height: size, fontSize: size / 2.5 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
