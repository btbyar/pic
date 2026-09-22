/** Зурагчны зураг, байхгүй бол нэрийн эхний үсэг — алтан цагирагтай */
export function Avatar({ url, name, size = 64 }: { url: string | null; name: string; size?: number }) {
  const ring = 'shrink-0 rounded-full ring-2 ring-night outline outline-1 outline-gold/50';
  if (url) {
    return <img src={url} alt="" width={size} height={size} className={`${ring} bg-night-3 object-cover`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={`${ring} flex items-center justify-center bg-night-3 font-display font-semibold italic text-gold`}
      style={{ width: size, height: size, fontSize: size / 2.2 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
