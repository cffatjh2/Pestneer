import { useMemo, useState } from 'react';
import { Activity, AlertCircle, Building2, Download, ExternalLink, Mail, MapPinned, MoreHorizontal, Phone, Plus, RefreshCw, Search, Store } from 'lucide-react';
import type { WorkOrder } from '../types';
import type { CustomerRecord } from '../services/workOrderApi';
import StatusBadge from '../components/common/StatusBadge';

type WorkOrdersProps = {
  workOrders: WorkOrder[];
  customers: CustomerRecord[];
  isLoading: boolean;
  loadError: string | null;
  onReload: () => void;
  onCreate: () => void;
  onManageCustomers: () => void;
  onOpenReport: () => void;
};

export default function WorkOrders({ workOrders, customers, isLoading, loadError, onReload, onCreate, onManageCustomers, onOpenReport }: WorkOrdersProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const totalBranches = customers.reduce((sum, customer) => sum + customer.branches.length, 0);
  const assignedBranches = new Set(workOrders.map((item) => item.branchId).filter(Boolean)).size;
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    return workOrders.filter((order) => {
      const matchesQuery = !normalized || `${order.id} ${order.client} ${order.branch} ${order.technician} ${order.service}`.toLocaleLowerCase('tr-TR').includes(normalized);
      return matchesQuery && (status === 'all' || order.status === status);
    });
  }, [workOrders, query, status]);

  return (
    <section className="page work-orders-page">
      <div className="page-heading">
        <div><p className="eyebrow">OPERASYON YÖNETİMİ</p><h1>İş emirleri</h1><p>Kurumsal müşterileri, şubelerini ve saha planlarını tek merkezden yönetin.</p></div>
        <div className="page-heading-actions"><button className="secondary-button" onClick={onManageCustomers}><Building2 size={18} /> Müşteri & Şube</button><button className="primary-button" onClick={onCreate}><Plus size={19} /> Yeni iş emri</button></div>
      </div>

      <div className="work-order-kpis">
        <article className="surface"><span><Building2 size={19} /></span><div><small>Kurumsal müşteri</small><strong>{customers.length}</strong><em>Çatı firma kaydı</em></div></article>
        <article className="surface"><span className="green"><Store size={19} /></span><div><small>Tanımlı şube</small><strong>{totalBranches}</strong><em>Bağımsız konum ve iletişim</em></div></article>
        <article className="surface"><span className="orange"><Activity size={19} /></span><div><small>Planlanan operasyon</small><strong>{workOrders.length}</strong><em>{assignedBranches} farklı lokasyon</em></div></article>
      </div>

      {customers.length > 0 && <section className="surface customer-portfolio-strip">
        <div className="section-heading"><div><p className="eyebrow">MÜŞTERİ PORTFÖYÜ</p><h2>Çok şubeli müşteriler</h2></div><button className="text-action" onClick={onManageCustomers}>Tümünü yönet</button></div>
        <div className="customer-mini-grid">{customers.slice(0, 4).map((customer) => <article key={customer.id}>
          <div className="customer-mini-top"><span><Building2 size={18} /></span><em>{customer.code}</em></div><strong>{customer.legalName}</strong><p><Store size={13} /> {customer.branches.length} aktif şube</p>
          <div>{customer.phoneNumber && <span><Phone size={12} />{customer.phoneNumber}</span>}{customer.email && <span><Mail size={12} />{customer.email}</span>}{customer.city && <span><MapPinned size={12} />{[customer.district, customer.city].filter(Boolean).join(' / ')}</span>}{customer.mapUrl && <a href={customer.mapUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Haritada aç</a>}</div>
        </article>)}</div>
      </section>}

      <section className="surface toolbar-surface"><div className="toolbar"><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İş emri, müşteri, şube veya personel ara" /></div><label className="toolbar-select"><Activity size={17} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tüm durumlar</option><option value="Planlandı">Planlandı</option><option value="Sahada">Sahada</option><option value="Tamamlandı">Tamamlandı</option></select></label></div></section>

      <section className="surface full-table-surface">
        <div className="section-heading"><div><p className="eyebrow">OPERASYON LİSTESİ</p><h2>{filteredOrders.length} iş emri</h2></div><button className="secondary-button"><Download size={17} /> Listeyi dışa aktar</button></div>
        {isLoading ? <div className="work-orders-state"><RefreshCw className="spin-icon" size={30} /><strong>İş emirleri yükleniyor</strong></div> : loadError ? <div className="work-orders-state error"><AlertCircle size={32} /><strong>İş emirleri alınamadı</strong><span>{loadError}</span><button className="secondary-button" onClick={onReload}><RefreshCw size={15} /> Tekrar Dene</button></div> : <div className="table-wrap"><table><thead><tr><th>İş emri</th><th>Müşteri / Şube</th><th>Hizmet</th><th>Saha personeli</th><th>Durum</th><th></th></tr></thead><tbody>
          {filteredOrders.length > 0 ? filteredOrders.map((workOrder) => <tr key={workOrder.recordId}><td><strong>{workOrder.id}</strong><span>{workOrder.date} · {workOrder.time}</span></td><td><strong>{workOrder.client}</strong><span>{workOrder.branch}</span><a className="table-address table-map-link" href={workOrder.branchMapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(workOrder.branchAddress)}`} target="_blank" rel="noreferrer"><MapPinned size={12} />{workOrder.branchAddress}<ExternalLink size={11} /></a></td><td>{workOrder.service}</td><td><div className="person-cell"><div className="avatar avatar-small avatar-green">{getInitials(workOrder.technician)}</div>{workOrder.technician}</div></td><td><StatusBadge value={workOrder.status} /></td><td><button className="row-action" aria-label="İş emri seçenekleri" onClick={onOpenReport}><MoreHorizontal size={19} /></button></td></tr>) : <tr><td colSpan={6} className="work-orders-empty"><Store size={28} /><strong>{customers.length === 0 ? 'Önce müşteri ve şubelerini tanımlayın' : 'Eşleşen iş emri bulunamadı'}</strong><span>{customers.length === 0 ? 'Çok şubeli müşterilerinizi toplu olarak ekleyebilirsiniz.' : 'Yeni bir plan oluşturabilir veya filtreleri değiştirebilirsiniz.'}</span><button className="secondary-button" onClick={customers.length === 0 ? onManageCustomers : onCreate}><Plus size={16} /> {customers.length === 0 ? 'Müşteri & Şube Ekle' : 'Yeni İş Emri'}</button></td></tr>}
        </tbody></table></div>}
      </section>
    </section>
  );
}

function getInitials(name: string) {
  if (name === 'Atama bekliyor') return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('tr-TR')).join('');
}
