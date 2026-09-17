import type { MailMessage } from './mailer';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, paragraphs: string[], action: { label: string; url: string }, footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('');
  return `<!doctype html><html lang="mn"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:16px;padding:24px">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold">Pic</p>
<h1 style="margin:0 0 16px;font-size:18px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="margin:0;font-size:13px;color:#64748b">${escapeHtml(footer)}</p>
</div></div></body></html>`;
}

export function passwordResetEmail(to: string, url: string, ttlMinutes: number): MailMessage {
  const title = 'Нууц үг сэргээх';
  const paragraphs = [
    'Та Pic дээрх бүртгэлийнхээ нууц үгийг сэргээх хүсэлт гаргасан байна.',
    `Доорх холбоос ${ttlMinutes} минутын дотор, зөвхөн нэг удаа ажиллана.`,
  ];
  const footer = 'Хэрэв та энэ хүсэлтийг гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу — нууц үг өөрчлөгдөхгүй.';
  return {
    to,
    subject: 'Pic: нууц үг сэргээх',
    text: `${title}\n\n${paragraphs.join('\n')}\n\n${url}\n\n${footer}`,
    html: layout(title, paragraphs, { label: 'Шинэ нууц үг тохируулах', url }, footer),
  };
}

export function orderPaidEmail(
  to: string,
  order: { url: string; eventTitle: string; itemCount: number; totalLabel: string; downloadableUntil: string },
): MailMessage {
  const title = 'Төлбөр амжилттай — зургаа татаж авна уу';
  const paragraphs = [
    `${order.eventTitle}: ${order.itemCount} зураг, нийт ${order.totalLabel}.`,
    `Эх зургуудыг ${order.downloadableUntil} хүртэл доорх холбоосоор татаж авах боломжтой.`,
  ];
  const footer = 'Энэ холбоос нь таны захиалгын нууц түлхүүр — бусадтай бүү хуваалцаарай.';
  return {
    to,
    subject: `Pic: ${order.eventTitle} — зургууд бэлэн`,
    text: `${title}\n\n${paragraphs.join('\n')}\n\n${order.url}\n\n${footer}`,
    html: layout(title, paragraphs, { label: 'Зургаа татах', url: order.url }, footer),
  };
}
