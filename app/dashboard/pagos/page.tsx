import { redirect } from 'next/navigation';
import Link from 'next/link';
import { viewer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function statusLabel(status: string) {
  if (status === 'approved' || status === 'completed') return 'Pagado';
  if (status === 'rejected') return 'Rechazado';
  return 'Pendiente';
}

function statusClass(status: string) {
  return status === 'approved' || status === 'completed' ? 'badge' : 'badge dim';
}

export default async function PaymentsPage() {
  const { db, user, profile } = await viewer();
  if (!user) redirect('/login?next=/dashboard/pagos');

  const [{ data: transfers }, { data: payments }] = await Promise.all([
    db.from('bank_transfers')
      .select('id,course_id,amount,bank,reference,receipt_path,status,created_at,courses(title)')
      .eq('user_id', user.sub)
      .order('created_at', { ascending: false }),
    db.from('payments')
      .select('id,course_id,amount,provider,provider_order_id,status,created_at,courses(title)')
      .eq('user_id', user.sub)
      .order('created_at', { ascending: false }),
  ]);

  const receiptUrls = Object.fromEntries(await Promise.all((transfers || []).map(async (transfer) => {
    const { data } = await db.storage.from('receipts').createSignedUrl(transfer.receipt_path, 600);
    return [transfer.id, data?.signedUrl];
  })));

  return (
    <main className="shell layout">
      <aside className="sidebar">
        <Link href="/dashboard">← Volver al dashboard</Link>
        <a href="#pagos">Pagos</a>
      </aside>
      <div className="dashboard stack">
        <div className="page-head">
          <span className="eyebrow">Mi espacio</span>
          <h1>Pagos y comprobantes</h1>
          <p>Hola, {profile?.full_name || profile?.email}. Aquí puedes consultar el estado de cada pago.</p>
        </div>
        <section id="pagos" className="card">
          <h2>Historial de pagos</h2>
          {!transfers?.length && !payments?.length && <p>Aún no tienes pagos registrados.</p>}
          {!!transfers?.length && <div className="tablewrap"><table className="table"><thead><tr><th>Curso</th><th>Método</th><th>Monto</th><th>Estado</th><th>Comprobante</th></tr></thead><tbody>{transfers.map((transfer) => { const course = transfer.courses as unknown as { title: string } | null; return <tr key={transfer.id}><td>{course?.title || 'Curso'}</td><td>Transferencia<br /><span className="meta">{transfer.bank}<br />Ref. {transfer.reference}</span></td><td>RD$ {Number(transfer.amount).toLocaleString('es-DO')}</td><td><span className={statusClass(transfer.status)}>{statusLabel(transfer.status)}</span></td><td>{receiptUrls[transfer.id] ? <a href={receiptUrls[transfer.id]} target="_blank" rel="noreferrer">Ver comprobante ↗</a> : 'No disponible'}</td></tr>; })}</tbody></table></div>}
          {!!payments?.length && <div className="tablewrap" style={{ marginTop: 24 }}><table className="table"><thead><tr><th>Curso</th><th>Método</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{payments.map((payment) => { const course = payment.courses as unknown as { title: string } | null; return <tr key={payment.id}><td>{course?.title || 'Curso'}</td><td>{payment.provider === 'paypal' ? 'PayPal' : payment.provider}</td><td>USD {Number(payment.amount).toFixed(2)}</td><td><span className={statusClass(payment.status)}>{statusLabel(payment.status)}</span></td><td>{new Date(payment.created_at).toLocaleDateString('es-DO')}</td></tr>; })}</tbody></table></div>}
        </section>
      </div>
    </main>
  );
}
