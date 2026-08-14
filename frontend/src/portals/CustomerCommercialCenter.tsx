import { useState, type ReactNode } from 'react';
import { AlertTriangle, Banknote, Check, Download, FileSignature, FileText, ReceiptText, Share2, X } from 'lucide-react';
import { decideCustomerProposal, downloadCustomerCommercialPdf, shareCustomerCommercialPdf, type CustomerCommercialProposal, type CustomerCommercialSummary } from '../services/customerPortalApi';

type CommercialTab = 'proposals' | 'contracts' | 'payments';

export default function CustomerCommercialCenter({ data, token, onChanged }: { data: CustomerCommercialSummary; token: string; onChanged: (proposal: CustomerCommercialProposal) => void }) {
  const [tab, setTab] = useState<CommercialTab>('proposals');
  const [decision, setDecision] = useState<{ proposal: CustomerCommercialProposal; accepted: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return <section className="customer-commercial-center">
    <div className="customer-commercial-kpis">
      <CommercialKpi icon={<FileText />} label="Onay bekleyen teklif" value={String(data.pendingProposalCount)} />
      <CommercialKpi icon={<FileSignature />} label="Aktif sözleşme" value={String(data.contracts.filter((item) => item.status === 'Active').length)} />
      <CommercialKpi icon={<Banknote />} label="Açık bakiye" value={money(data.openBalance)} />
      <CommercialKpi icon={<AlertTriangle />} label="Geciken ödeme" value={String(data.overdueCount)} tone={data.overdueCount ? 'danger' : undefined} />
    </div>
    <nav className="customer-commercial-tabs">
      <button className={tab === 'proposals' ? 'active' : ''} onClick={() => setTab('proposals')}><FileText size={16} /> Teklifler</button>
      <button className={tab === 'contracts' ? 'active' : ''} onClick={() => setTab('contracts')}><FileSignature size={16} /> Sözleşmeler</button>
      <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}><ReceiptText size={16} /> Ödeme planı</button>
    </nav>
    {error && <div className="customer-commercial-error"><AlertTriangle size={16} />{error}</div>}
    {tab === 'proposals' && <div className="customer-commercial-grid">{data.proposals.map((item) => <article className="customer-commercial-card" key={item.id}>
      <header><span>{item.number}</span><em className={`commercial-customer-status ${item.status.toLowerCase()}`}>{proposalStatus(item.status)}</em></header>
      <h3>{item.title}</h3><p>{item.branchName}</p>
      <div className="customer-proposal-lines">{item.lines.map((line) => <div key={line.id}><span>{line.description}<small>{formatQuantity(line.quantity)} {line.unit}</small></span><strong>{money(line.lineTotal)}</strong></div>)}</div>
      <div className="customer-commercial-total"><span>KDV dahil toplam</span><strong>{money(item.totalAmount)}</strong></div>
      <small>Teklif tarihi: {date(item.issueDate)} · Geçerlilik: {date(item.validUntil)}</small>
      {item.decisionNote && <div className="customer-decision-note"><strong>Karar notu</strong><span>{item.decisionNote}</span></div>}
      <footer><button onClick={() => void downloadCustomerCommercialPdf(token, 'proposals', item.id, item.number).catch((cause) => setError(cause instanceof Error ? cause.message : 'PDF indirilemedi.'))} title="İndir"><Download size={15} /> PDF</button><button onClick={() => void shareCustomerCommercialPdf(token, 'proposals', item.id, item.number, item.title).catch((cause) => setError(cause instanceof Error ? cause.message : 'Paylaşılamadı.'))} title="Paylaş"><Share2 size={15} /> Paylaş</button>{item.canDecide && <><button className="reject" onClick={() => setDecision({ proposal: item, accepted: false })}><X size={15} /> Reddet</button><button className="accept" onClick={() => setDecision({ proposal: item, accepted: true })}><Check size={15} /> Onayla</button></>}</footer>
    </article>)}{data.proposals.length === 0 && <CommercialEmpty text="Henüz tarafınıza iletilmiş teklif bulunmuyor." />}</div>}
    {tab === 'contracts' && <div className="customer-commercial-grid">{data.contracts.map((item) => <article className="customer-commercial-card contract" key={item.id}>
      <header><span>{item.number}</span><em className="commercial-customer-status active">{item.status === 'Active' ? 'Aktif' : item.status}</em></header><h3>{item.title}</h3><p>{item.branchName}</p>
      <div className="customer-commercial-total"><span>Dönem bedeli</span><strong>{money(item.periodAmount)} / {frequency(item.billingFrequency)}</strong></div>
      <small>{date(item.startDate)} – {date(item.endDate)} · {item.installmentCount} ödeme dönemi</small>
      <div className="customer-contract-package"><span>{item.servicePlans.length} hizmet planı</span><span>{item.generatedWorkOrderCount} planlı iş</span><span>{item.freeEmergencyCallsPerYear} ücretsiz acil çağrı</span><span>{item.responseTimeHours} saat SLA</span></div>
      <div className="customer-contract-plans">{item.servicePlans.map((plan) => <div key={plan.id}><strong>{plan.branchName}</strong><small>{plan.serviceType} · {plan.recurrenceType === 'Weekly' ? `Haftada ${plan.visitsPerPeriod}` : plan.recurrenceType === 'Monthly' ? `Ayda ${plan.visitsPerPeriod}` : 'Manuel'} · {plan.preferredTime}</small></div>)}</div>
      {item.scope && <p className="customer-contract-scope">{item.scope}</p>}
      <footer><button onClick={() => void downloadCustomerCommercialPdf(token, 'contracts', item.id, item.number).catch((cause) => setError(cause instanceof Error ? cause.message : 'PDF indirilemedi.'))} title="İndir"><Download size={15} /> Sözleşme PDF</button><button onClick={() => void shareCustomerCommercialPdf(token, 'contracts', item.id, item.number, item.title).catch((cause) => setError(cause instanceof Error ? cause.message : 'Paylaşılamadı.'))} title="Paylaş"><Share2 size={15} /> Paylaş</button><span>Açık: {money(item.remainingBalance)}</span></footer>
    </article>)}{data.contracts.length === 0 && <CommercialEmpty text="Aktif veya geçmiş sözleşme bulunmuyor." />}</div>}

    {tab === 'payments' && <div className="customer-payment-table"><div className="customer-payment-head"><span>Plan / Sözleşme</span><span>Şube</span><span>Vade</span><span>Tutar</span><span>Ödenen</span><span>Bakiye</span><span>Durum</span></div>{data.receivables.map((item) => <article key={item.id}><span><strong>{item.number}</strong><small>{item.contractNumber}</small></span><span>{item.branchName}</span><span>{date(item.dueDate)}</span><strong>{money(item.amount)}</strong><span>{money(item.paidAmount)}</span><strong>{money(item.balance)}</strong><em className={`commercial-customer-status ${item.status.toLowerCase()}`}>{paymentStatus(item.status)}</em></article>)}{data.receivables.length === 0 && <CommercialEmpty text="Henüz oluşturulmuş ödeme planı bulunmuyor." />}<p className="customer-finance-disclaimer">Bu ekran operasyonel ödeme takibidir; resmi e-Fatura veya e-Arşiv belgesi yerine geçmez.</p></div>}
    {decision && <DecisionModal item={decision.proposal} accepted={decision.accepted} onClose={() => setDecision(null)} onSubmit={async (note) => { setError(null); try { const updated = await decideCustomerProposal(token, decision.proposal.id, decision.accepted, note); onChanged(updated); setDecision(null); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Karar kaydedilemedi.'); setDecision(null); } }} />}
  </section>;
}

function DecisionModal({ item, accepted, onClose, onSubmit }: { item: CustomerCommercialProposal; accepted: boolean; onClose: () => void; onSubmit: (note?: string) => Promise<void> }) { const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); return <div className="modal-layer"><div className="modal customer-commercial-decision"><div className="modal-header"><div><p className="eyebrow">DİJİTAL TEKLİF KARARI</p><h2>{accepted ? 'Teklifi onayla' : 'Teklifi reddet'}</h2><p>{item.number} · {item.title}</p></div><button className="icon-button" onClick={onClose}><X /></button></div><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onSubmit(note.trim() || undefined); } finally { setSaving(false); } }}><div className={`customer-decision-summary ${accepted ? 'accepted' : 'rejected'}`}>{accepted ? <Check /> : <AlertTriangle />}<div><strong>{accepted ? 'Teklif koşullarını kabul ediyorum.' : 'Teklifi reddediyorum.'}</strong><span>{accepted ? 'Firma sahibi onayınızdan sonra sözleşme ve ödeme planını oluşturabilir.' : 'Reddetme gerekçeniz firma sahibine iletilecektir.'}</span></div></div><label>{accepted ? 'Karar notu (isteğe bağlı)' : 'Reddetme gerekçesi'}<textarea value={note} onChange={(event) => setNote(event.target.value)} required={!accepted} maxLength={1000} rows={4} placeholder={accepted ? 'Varsa notunuzu yazın.' : 'Teklifin neden uygun olmadığını kısaca açıklayın.'} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className={accepted ? 'primary-button' : 'customer-reject-button'} disabled={saving || (!accepted && !note.trim())}>{saving ? 'Kaydediliyor…' : accepted ? 'Onayı Kaydet' : 'Reddi Gönder'}</button></div></form></div></div>; }
function CommercialKpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: string }) { return <article className={tone ?? ''}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>; }
function CommercialEmpty({ text }: { text: string }) { return <div className="customer-commercial-empty"><FileText /><strong>{text}</strong></div>; }
function money(value: number) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(value); }
function date(value: string) { return new Intl.DateTimeFormat('tr-TR').format(new Date(`${value}T12:00:00`)); }
function formatQuantity(value: number) { return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value); }
function frequency(value: string) { return ({ Weekly: 'hafta', Monthly: 'ay', Quarterly: '3 ay', SemiAnnual: '6 ay', Annual: 'yıl', Manual: 'dönem' } as Record<string, string>)[value] ?? value; }
function proposalStatus(value: string) { return ({ PendingApproval: 'Onayınız bekleniyor', Accepted: 'Onaylandı', Rejected: 'Reddedildi', Converted: 'Sözleşmeye dönüştü' } as Record<string, string>)[value] ?? value; }
function paymentStatus(value: string) { return ({ Planned: 'Planlandı', Partial: 'Kısmi ödendi', Paid: 'Ödendi', Overdue: 'Gecikmiş' } as Record<string, string>)[value] ?? value; }
