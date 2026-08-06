import { useEffect, useMemo, useState } from 'react';
import { Download, Package, PackageMinus, PackagePlus, RefreshCw, Search } from 'lucide-react';
import StockEntryModal from '../components/modals/StockEntryModal';
import { FieldSessionExpiredError } from '../services/fieldOperationsApi';
import { createInventoryEntry, getInventory, type CreateInventoryEntry, type InventoryItem } from '../services/inventoryApi';

export default function Stock({ accessToken, onSessionExpired }: { accessToken: string; onSessionExpired: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try { setItems(await getInventory(accessToken)); }
    catch (loadError) {
      if (loadError instanceof FieldSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Stok listesi yüklenemedi.');
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void load(); }, [accessToken]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    return normalized ? items.filter((item) => item.name.toLocaleLowerCase('tr-TR').includes(normalized)) : items;
  }, [items, query]);

  const handleAddStock = async (input: CreateInventoryEntry) => {
    const saved = await createInventoryEntry(accessToken, input);
    setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setIsEntryModalOpen(false);
  };

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">ENVANTER & DEPO</p><h1>Stok Yönetimi</h1><p>Kullanılan biyosidal ürünleri, sarf malzemelerini ve ekipmanları yönetin.</p></div><div className="heading-actions"><button className="secondary-button"><PackageMinus size={17} />Stok çıkışı</button><button className="primary-button" onClick={() => setIsEntryModalOpen(true)}><PackagePlus size={19} />Stok girişi</button></div></div>
      {error && <div className="field-operation-error"><span>{error}</span><button onClick={() => void load()}><RefreshCw size={15} />Yenile</button></div>}
      <div className="stock-overview"><article className="surface stock-highlight"><div><span>Toplam Ürün Kalemi</span><strong>{items.length}</strong><small>Depoda kayıtlı aktif ürün çeşidi</small></div><div className="stock-orbit blue-orbit"><Package size={22} /></div></article><article className="surface stock-highlight"><div><span>Kritik Seviyedeki Ürünler</span><strong>{items.filter((item) => item.status === 'Kritik').length}</strong><small>Asgari stok seviyesindeki ürünler</small></div><div className="stock-orbit orange-orbit"><PackageMinus size={22} /></div></article><article className="surface stock-highlight"><div><span>Bu Ay Yapılan Çıkış</span><strong>0</strong><small>İş emirlerinde kullanılan malzeme miktarı</small></div><div className="stock-orbit green-orbit"><PackagePlus size={22} /></div></article></div>
      <section className="surface full-table-surface"><div className="section-heading"><div><p className="eyebrow">TÜM ENVANTER</p><h2>Depo durumu</h2></div><div className="heading-actions"><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün adı ara…" /></div><button className="secondary-button"><Download size={17} />Dışa Aktar</button></div></div><div className="table-wrap"><table><thead><tr><th>Ürün Bilgisi</th><th>Kategori</th><th>Mevcut Miktar</th><th>Minimum Eşik</th><th>Son Hareket</th><th>Durum</th></tr></thead><tbody>{isLoading ? <tr><td colSpan={6} className="stock-table-empty"><RefreshCw className="spin-icon" size={20} />Stok yükleniyor…</td></tr> : filteredItems.length > 0 ? filteredItems.map((item) => <tr key={item.id}><td><div className="stock-name"><span>{item.name.charAt(0)}</span><div><strong>{item.name}</strong><span>Lot: {item.lotNumber || '—'}</span></div></div></td><td>{item.category}</td><td><strong>{formatQuantity(item.quantity)} {item.unit}</strong></td><td>{formatQuantity(item.minimumQuantity)} {item.unit}</td><td>{formatDateTime(item.lastMovementAt)}</td><td><span className={`stock-status ${statusClass(item.status)}`}>{item.status}</span></td></tr>) : <tr><td colSpan={6} className="stock-table-empty">Depoda kayıtlı ürün bulunmuyor. “Stok girişi” ile ilk ürünü ekleyebilirsiniz.</td></tr>}</tbody></table></div></section>
      {isEntryModalOpen && <StockEntryModal onClose={() => setIsEntryModalOpen(false)} onSubmit={handleAddStock} />}
    </section>
  );
}

const statusClass = (status: InventoryItem['status']) => status === 'Kritik' ? 'stock-critical' : status === 'Düşük' ? 'stock-low' : 'stock-ok';
const formatQuantity = (quantity: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(quantity);
const formatDateTime = (value: string) => new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
