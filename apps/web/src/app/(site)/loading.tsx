/** Хуудас ачаалах зуур хоосон дэлгэцийн оронд бүтцийн төсөөлөл */
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-5xl animate-pulse flex-col gap-5 px-4 py-8" aria-busy="true" aria-label="…">
      <div className="h-8 w-2/3 rounded-lg bg-stone-200" />
      <div className="h-4 w-1/2 rounded bg-stone-200" />
      <div className="h-24 rounded-2xl bg-stone-100" />
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[4/3] rounded-lg bg-stone-200" />
        ))}
      </div>
    </main>
  );
}
