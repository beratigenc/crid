// Varsayılan master data. Uygulama ilk açılışta bu yapıyı veritabanına yazar;
// sonrasında tüm listeler Master Data ekranından yönetilir (kodlar uygulamaya sabit değildir).
// Statü ve rol ANAHTARLARI iş kurallarını taşıdığı için sabittir; etiketleri düzenlenebilir.

export const STATUS_KEYS = ['pool', 'eval', 'planned', 'progress', 'delayed', 'live', 'finconf', 'closed', 'cancelled'];
export const DEFAULT_STATUSES = [
  { key: 'pool', label: 'Havuz', tone: 'neutral' },
  { key: 'eval', label: 'Değerlendirme', tone: 'info' },
  { key: 'planned', label: 'Planlandı', tone: 'info' },
  { key: 'progress', label: 'Devam', tone: 'accent' },
  { key: 'delayed', label: 'Gecikmiş', tone: 'bad' },
  { key: 'live', label: 'Devreye Girdi', tone: 'good' },
  { key: 'finconf', label: 'Finansal Teyit', tone: 'good' },
  { key: 'closed', label: 'Kapandı', tone: 'done' },
  { key: 'cancelled', label: 'İptal', tone: 'muted' },
];

export const FIN_STATUSES = [
  { key: 'pending', label: 'Bekliyor', tone: 'warn' },
  { key: 'checked', label: 'Kontrol Edildi', tone: 'info' },
  { key: 'confirmed', label: 'Teyit Edildi', tone: 'good' },
  { key: 'revision', label: 'Revizyon', tone: 'bad' },
];

export const MATURITY = [
  { key: 'raw', label: 'Ham', tone: 'neutral' },
  { key: 'review', label: 'Ön İnceleme', tone: 'info' },
  { key: 'maturing', label: 'Olgunlaştırılıyor', tone: 'accent' },
  { key: 'converted', label: "CRID'e Dönüştürüldü", tone: 'good' },
  { key: 'rejected', label: 'Reddedildi', tone: 'muted' },
];

export const SUB_STATUSES = [
  { key: 'open', label: 'Açık', tone: 'neutral' },
  { key: 'progress', label: 'Devam', tone: 'accent' },
  { key: 'done', label: 'Tamam', tone: 'good' },
  { key: 'cancel', label: 'İptal', tone: 'muted' },
];

export const ROLES = [
  { key: 'creator', label: 'Fikir Oluşturucu', desc: 'Fikir havuzuna kayıt açar; öneri, açıklama ve ilk potansiyel bilgilerini girer.' },
  { key: 'crid', label: 'CRID Sorumlusu', desc: 'Ana fikri yönetir; araç, hedef, ekip, milestone ve alt detayları günceller.' },
  { key: 'catmgr', label: 'Kategori Yöneticisi', desc: 'Kendi kategorisindeki fikirleri değerlendirir ve portföyü takip eder.', categoryScoped: true },
  { key: 'finance', label: 'Finansal Kontrol', desc: 'Planlanan/gerçekleşen faydayı kontrol eder ve finansal teyit verir.' },
  { key: 'manager', label: 'Yönetici', desc: 'Tüm dashboard ve raporları görüntüler; gerekli onay/kararları verir.' },
  { key: 'it', label: 'IT / Sistem Yöneticisi', desc: 'Kullanıcı, rol, master data, entegrasyon ve sistem parametrelerini yönetir.' },
  { key: 'readonly', label: 'Salt Okuma', desc: 'Yetkili rapor ve dashboardları görüntüler; veri değiştiremez.' },
];

export const PERMISSIONS = [
  { key: 'pool.create', label: 'Fikir havuzuna kayıt açma', group: 'Fikir Havuzu' },
  { key: 'pool.edit', label: 'Havuz kayıtlarını düzenleme (tümü)', group: 'Fikir Havuzu' },
  { key: 'pool.editOwn', label: 'Kendi havuz kaydını düzenleme', group: 'Fikir Havuzu' },
  { key: 'pool.evaluate', label: 'Ön değerlendirme / ret', group: 'Fikir Havuzu' },
  { key: 'pool.convert', label: "CRID'e dönüştürme", group: 'Fikir Havuzu' },
  { key: 'crid.create', label: 'Doğrudan CRID açma', group: 'CRID' },
  { key: 'crid.edit', label: 'CRID ana bilgilerini düzenleme', group: 'CRID' },
  { key: 'crid.status', label: 'Statü değiştirme / kapanış / iptal', group: 'CRID' },
  { key: 'crid.editClosed', label: 'Kapalı kayıtta kritik alan değiştirme', group: 'CRID' },
  { key: 'sub.edit', label: 'Alt detay (Add/Delete) yönetimi', group: 'CRID' },
  { key: 'sub.unfreeze', label: 'Dondurulmuş Add/Delete listesini çözme', group: 'CRID' },
  { key: 'milestone.edit', label: 'Milestone tarihlerini girme', group: 'CRID' },
  { key: 'finance.confirm', label: 'Finansal kontrol ve teyit', group: 'Finans' },
  { key: 'plan.edit', label: 'Üretim planı girme', group: 'Plan & Bütçe' },
  { key: 'budget.edit', label: 'Bütçe hedefi tanımlama', group: 'Plan & Bütçe' },
  { key: 'export', label: 'Excel/CSV dışa aktarım', group: 'Raporlama' },
  { key: 'audit.view', label: 'Audit log görüntüleme', group: 'Raporlama' },
  { key: 'master.edit', label: 'Master data yönetimi', group: 'Sistem' },
  { key: 'users.edit', label: 'Kullanıcı ve rol yönetimi', group: 'Sistem' },
  { key: 'integration.edit', label: 'Entegrasyon / veri içe aktarma', group: 'Sistem' },
];

export const DEFAULT_PERMISSION_MATRIX = {
  creator: ['pool.create', 'pool.editOwn'],
  crid: ['pool.create', 'pool.edit', 'pool.evaluate', 'pool.convert', 'crid.create', 'crid.edit', 'crid.status', 'sub.edit', 'milestone.edit', 'plan.edit', 'budget.edit', 'export', 'audit.view'],
  catmgr: ['pool.create', 'pool.edit', 'pool.evaluate', 'pool.convert', 'crid.edit', 'crid.status', 'sub.edit', 'milestone.edit', 'export', 'audit.view'],
  finance: ['finance.confirm', 'export', 'audit.view'],
  manager: ['pool.evaluate', 'pool.convert', 'crid.status', 'crid.editClosed', 'sub.unfreeze', 'export', 'audit.view'],
  it: PERMISSIONS.map((p) => p.key),
  readonly: [],
};

export const DEFAULT_SETTINGS = {
  cridPrefix: 'CRID',
  poolPrefix: 'FH',
  notifyDaysBefore: 14,
  poolIdleDays: 60,
  defaultRole: 'creator',
  realizedUsePlanFallback: true,
  autoFreezeOnSop: true,
  autoStatus: true,
  reportYear: new Date().getFullYear(),
};

export function defaultMaster() {
  return {
    baseCurrency: 'EUR',
    currencies: [
      { code: 'EUR', rate: 1, active: true },
      { code: 'USD', rate: 0.851, active: true },
      { code: 'TRY', rate: 0.0215, active: true },
    ],
    vehicles: [],
    categories: [
      { id: 'cat-arge', name: 'Ar-Ge', subs: ['Tasarım', 'Malzeme değişimi', 'Ürün optimizasyonu', 'Yeni teknoloji'], active: true },
      { id: 'cat-tz', name: 'Tedarik Zinciri', subs: ['Tedarikçi değişimi', 'Lokalizasyon', 'Satın alma fiyatı', 'Lojistik', 'Alternatif kaynak'], active: true },
      { id: 'cat-um', name: 'Üretim Mühendisliği', subs: ['Proses optimizasyonu', 'İşçilik', 'Çevrim süresi', 'Otomasyon', 'Aparat/fixture'], active: true },
      { id: 'cat-ud', name: 'Üretim Direktörlüğü', subs: ['Hat verimliliği', 'Kapasite', 'Üretim yöntemi', 'Kayıp azaltma', 'Operasyonel iyileştirme'], active: true },
    ],
    teams: [],
    agendas: [],
    scopes: [
      { id: 'scope-teknik', name: 'Teknik', active: true },
      { id: 'scope-ticari', name: 'Ticari', active: true },
    ],
    statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
    users: [],
    parts: [],
    permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSION_MATRIX)),
    settings: { ...DEFAULT_SETTINGS },
    sap: { endpoint: '', client: '', system: '', mode: 'manual', notes: '', lastImports: [] },
    history: [],
  };
}

/** Eksik alanları varsayılanlarla tamamlar (eski kayıtlarla uyumluluk). */
export function normalizeMaster(m) {
  const d = defaultMaster();
  const out = { ...d, ...(m || {}) };
  out.settings = { ...d.settings, ...((m && m.settings) || {}) };
  out.permissions = { ...d.permissions, ...((m && m.permissions) || {}) };
  out.sap = { ...d.sap, ...((m && m.sap) || {}) };
  // statü listesinde eksik anahtar kalmasın
  const st = Array.isArray(out.statuses) ? out.statuses : [];
  out.statuses = STATUS_KEYS.map((k) => st.find((s) => s.key === k) || DEFAULT_STATUSES.find((s) => s.key === k));
  for (const k of ['currencies', 'vehicles', 'categories', 'teams', 'agendas', 'scopes', 'users', 'parts', 'history']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  return out;
}
