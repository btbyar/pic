import { redirect } from 'next/navigation';

// Эвэнтийн нэгдсэн жагсаалт байхгүй (2026-09-18): эвэнтүүд зурагчны профайл дотор харагдана.
// Хуучин /events холбоосыг зурагчдын хуудас руу чиглүүлнэ.
export default function EventsPage() {
  redirect('/photographers');
}
