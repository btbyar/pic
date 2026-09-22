/** Хуудас ачаалах зуур: гарчиг ба кадрын тор бүдэг гэрлээр гүйнэ */
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-5 pt-32" aria-busy="true" aria-label="…">
      <div className="skeleton h-3 w-40 rounded" />
      <div className="skeleton h-20 w-3/4 rounded-2xl" />
      <div className="skeleton h-5 w-1/2 rounded" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton aspect-3/4 rounded-[18px]" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
    </main>
  );
}
