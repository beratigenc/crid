// ÖRNEK VERİ — referans görsellerdeki (Sultan Comfort / Mega / Navigo) çalışmalardan türetilmiştir.
// Tüm kayıtlar `sample: true` ile işaretlidir ve Master Data > Sistem ekranından silinebilir.
import { defaultMaster } from './defaults.js';
import { formatNo, formatSubNo } from './rules.js';
import { freezeSub, cridYearFinancials } from './calc.js';

const SAMPLE_TS = '2026-01-05T09:00:00.000Z';

export function buildSeed() {
  const m = defaultMaster();
  m.vehicles = [
    { id: 'veh-sc', code: 'SC', name: 'Sultan Comfort', family: 'Sultan', version: 'Euro 6', cost: 66200, active: true },
    { id: 'veh-sm', code: 'SM', name: 'Sultan Mega', family: 'Sultan', version: 'Euro 6', cost: 72750, active: true },
    { id: 'veh-nv', code: 'NV', name: 'Navigo', family: 'Navigo', version: 'T', cost: 89000, active: true },
    { id: 'veh-tr', code: 'TR', name: 'Territo', family: 'Territo', version: 'U', cost: 160000, active: true },
    { id: 'veh-ul', code: 'UL', name: 'Ulyso', family: 'Ulyso', version: 'T', cost: 210000, active: true },
    { id: 'veh-kl', code: 'KL', name: 'Kent LF', family: 'Kent', version: 'LF 12m', cost: 280000, active: true },
  ];
  m.teams = [
    { id: 'team-trim', name: 'TZ-TRIM', categoryId: 'cat-tz', active: true },
    { id: 'team-pwt', name: 'TZ-PWT-ŞASİ', categoryId: 'cat-tz', active: true },
    { id: 'team-govde', name: 'ARGE-Gövde', categoryId: 'cat-arge', active: true },
    { id: 'team-elek', name: 'ARGE-Elektrik', categoryId: 'cat-arge', active: true },
    { id: 'team-montaj', name: 'ÜM-Montaj', categoryId: 'cat-um', active: true },
    { id: 'team-hat', name: 'ÜD-Hat Verimliliği', categoryId: 'cat-ud', active: true },
    { id: 'team-satin', name: 'Satın Alma', categoryId: 'cat-tz', active: true },
  ];
  m.agendas = [
    { id: 'ag-butce', name: '2026 Bütçe Hedefi', active: true },
    { id: 'ag-lokal', name: 'Lokalizasyon Programı', active: true },
    { id: 'ag-kur', name: 'Kur Riski Azaltma', active: true },
    { id: 'ag-model', name: 'Yeni Model Geçişi', active: true },
  ];
  m.users = [
    { id: 'usr-ayse', name: 'Ayşe Kaya', email: 'ayse.kaya@ornek.com', role: 'crid', teamId: '', categoryIds: [], active: true, sample: true },
    { id: 'usr-mehmet', name: 'Mehmet Yılmaz', email: 'mehmet.yilmaz@ornek.com', role: 'catmgr', teamId: 'team-govde', categoryIds: ['cat-arge'], active: true, sample: true },
    { id: 'usr-emre', name: 'Emre Koç', email: 'emre.koc@ornek.com', role: 'catmgr', teamId: 'team-satin', categoryIds: ['cat-tz'], active: true, sample: true },
    { id: 'usr-elif', name: 'Elif Şahin', email: 'elif.sahin@ornek.com', role: 'finance', teamId: '', categoryIds: [], active: true, sample: true },
    { id: 'usr-can', name: 'Can Demir', email: 'can.demir@ornek.com', role: 'manager', teamId: '', categoryIds: [], active: true, sample: true },
    { id: 'usr-zeynep', name: 'Zeynep Arslan', email: 'zeynep.arslan@ornek.com', role: 'it', teamId: '', categoryIds: [], active: true, sample: true },
    { id: 'usr-burak', name: 'Burak Öztürk', email: 'burak.ozturk@ornek.com', role: 'creator', teamId: 'team-trim', categoryIds: [], active: true, sample: true },
    { id: 'usr-selin', name: 'Selin Aydın', email: 'selin.aydin@ornek.com', role: 'readonly', teamId: '', categoryIds: [], active: true, sample: true },
  ];
  m.parts = [
    { partNo: '13C33-05203-AA', name: 'ÖN AKS KOMPLE', price: 2237.6, currency: 'EUR', supplier: 'Mevcut Tedarikçi' },
    { partNo: '25A00-05203-AA', name: 'KOMPLE ÖN AKS-HANDE', price: 1070.5, currency: 'USD', supplier: 'Hande' },
    { partNo: '27B00-72428-AA', name: 'TRİM KOMPLE-ORTA CAM DİKME', price: 330, currency: 'EUR', supplier: '' },
    { partNo: '27B01-72428-AA', name: 'TRİM KMP-DAR CAM DİK.İMDAT ÇEKİÇ DELİKLİ', price: 200, currency: 'EUR', supplier: '' },
    { partNo: '13C61-36581-AA', name: 'GERİ GÖRÜŞ KAMERASI', price: 195.5, currency: 'EUR', supplier: '' },
    { partNo: '12L51-36856-AA', name: 'KAMERA-BALIK GÖZÜ GERİ GÖRÜŞ', price: 90.5, currency: 'USD', supplier: '' },
  ];
  m.settings.reportYear = 2026;

  // -------- Üretim planı + bütçe --------
  const plans = [];
  const P = (year, vehicleId, planned, actual, targetPerUnit, monthlyTarget) => plans.push({
    id: `${year}_${vehicleId}`, year, vehicleId, planned, actual: actual || new Array(12).fill(null),
    targetPerUnit, monthlyTarget: monthlyTarget || new Array(12).fill(null), annualTargetOverride: null, source: 'Manuel', sample: true,
  });
  P(2026, 'veh-sc', [70, 80, 90, 95, 90, 85, 80, 75, 95, 100, 95, 88], [68, 82, 88, 97, 85, 86, 78, 70, 92, null, null, null], 4984, [2102, 2212, 2498, 2543, 3138, 4080, 4279, 4351, 4618, 4925, 4984, 4984]);
  P(2026, 'veh-sm', [8, 10, 10, 12, 10, 10, 8, 8, 12, 12, 10, 10], [8, 9, 10, 12, 9, 10, 8, 7, 12, null, null, null], 5500);
  P(2026, 'veh-nv', [30, 35, 35, 38, 35, 35, 30, 30, 38, 40, 38, 36], [29, 35, 36, 38, 33, 35, 31, 28, 37, null, null, null], 4600);
  P(2026, 'veh-tr', new Array(12).fill(25), null, 1500);
  P(2026, 'veh-ul', [12, 13, 12, 13, 12, 13, 12, 13, 12, 13, 12, 13], null, 2000);
  P(2026, 'veh-kl', [16, 17, 16, 17, 16, 17, 16, 17, 16, 17, 17, 18], null, 1800);
  P(2027, 'veh-sc', [75, 85, 95, 100, 95, 90, 85, 80, 100, 105, 100, 90], null, 3000);
  P(2027, 'veh-sm', [9, 10, 11, 12, 11, 10, 9, 9, 12, 12, 11, 10], null, 2500);
  P(2027, 'veh-nv', [32, 36, 37, 40, 37, 36, 32, 31, 40, 42, 40, 37], null, 2200);

  // -------- CRID'ler (referans görsel 3 — Sultan Comfort teknik indirimleri) --------
  const crids = [];
  const subs = [];
  const userBy = { crid: 'usr-ayse', arge: 'usr-mehmet', tz: 'usr-emre' };
  let seq = 0;
  const yseq = {};
  const C = (o) => {
    seq++;
    const y = o.year || 2026;
    yseq[y] = (yseq[y] || 0) + 1;
    const id = `crid-sample-${String(seq).padStart(3, '0')}`;
    const no = formatNo('CRID', y, yseq[y]);
    const cat = o.cat || 'cat-arge';
    const rec = {
      id, no, title: o.title, description: o.desc || '', categoryId: cat, subCategory: o.sub || '',
      teamId: o.team || (cat === 'cat-tz' ? 'team-satin' : cat === 'cat-um' ? 'team-montaj' : cat === 'cat-ud' ? 'team-hat' : 'team-govde'),
      agendaId: o.agenda || 'ag-butce', scopeId: o.scope || 'scope-teknik',
      baseVehicleIds: o.base || o.veh || ['veh-sc'], targetVehicleIds: o.veh || ['veh-sc'],
      responsibleId: o.resp || (cat === 'cat-tz' ? userBy.tz : cat === 'cat-arge' ? userBy.arge : userBy.crid),
      currency: o.cur || 'EUR', unitMode: o.unitMode || 'manual', unitBenefit: o.unit ?? '', probability: o.prob ?? (o.sopA ? 100 : 25),
      investment: o.inv ?? '', annualTargetOverride: '', realizedOverride: '', estimatedPotential: '', publicationNo: o.pub || '',
      ms: {
        releaseTarget: o.relT || '', releaseActual: o.relA || '', releaseNa: !!o.relNa,
        sampleTarget: o.smpT || '', sampleActual: o.smpA || '', sampleNa: !!o.smpNa,
        sopTarget: o.sopT || '', sopActual: o.sopA || '', sopNa: false, finTarget: o.finT || '',
      },
      fin: o.fin ? { status: 'confirmed', date: o.fin, by: 'usr-elif', confirmedAmount: o.finAmt ?? '', note: 'Örnek teyit' } : { status: o.finStatus || 'pending', date: '', by: '', confirmedAmount: '', note: '' },
      status: o.status || (o.fin ? 'finconf' : o.sopA ? 'live' : 'progress'),
      cancelReason: o.cancel || '', notes: o.notes || '', attachments: [],
      sourcePoolId: '', sourcePoolNo: '', sample: true,
      createdAt: o.created || SAMPLE_TS, createdBy: 'usr-ayse', updatedAt: o.created || SAMPLE_TS, updatedBy: 'usr-ayse',
      history: [{ at: o.created || SAMPLE_TS, by: 'usr-ayse', action: 'create', changes: [], note: 'Örnek veri olarak oluşturuldu' }],
    };
    crids.push(rec);
    return rec;
  };

  const c1 = C({ title: 'Han-de Ön Aks Firma Değişikliği', desc: 'Ön aks tedarikçisinin Hande ile değiştirilmesi.', cat: 'cat-tz', sub: 'Tedarikçi değişimi', team: 'team-pwt', unitMode: 'subs', relT: '2025-11-01', relA: '2025-11-01', smpT: '2025-11-01', smpA: '2025-11-01', sopT: '2026-01-01', sopA: '2026-01-02', finT: '2026-01-31', fin: '2026-01-23', status: 'closed', pub: '' });
  const c2 = C({ title: 'Cam dikmelerinin ABS ten Enjeksiyona dönüştürülmesi', cat: 'cat-arge', sub: 'Malzeme değişimi', unitMode: 'subs', relT: '2026-01-01', relA: '2026-01-05', smpT: '2026-01-01', smpA: '2026-01-05', sopT: '2026-01-01', sopA: '2026-01-05', fin: '2026-01-15' });
  const c3 = C({ title: 'Geri Görüş Kamera Değişikliği', cat: 'cat-arge', sub: 'Ürün optimizasyonu', team: 'team-elek', unitMode: 'subs', relT: '2025-12-01', relA: '2025-12-01', smpT: '2025-12-01', smpA: '2025-12-01', sopT: '2026-01-01', sopA: '2026-01-05', fin: '2026-01-23' });
  C({ title: 'Desen İptali', desc: 'Sultan Comfort folyo/etiket desenlerinin sadeleştirilmesi.', cat: 'cat-arge', sub: 'Tasarım', unit: 89, relT: '2026-01-01', relA: '2026-01-05', smpNa: true, sopT: '2026-01-01', sopA: '2026-01-05' });
  const c5 = C({ title: 'Arka kamera trimi RİM e dönüştürülmesi', cat: 'cat-arge', sub: 'Malzeme değişimi', unitMode: 'subs', relT: '2025-12-31', relA: '2025-12-31', smpT: '2025-12-31', smpA: '2025-12-31', sopT: '2026-02-01', sopA: '2026-02-02' });
  C({ title: 'Tavan Tahliye Kafa', cat: 'cat-arge', unit: 0, relT: '2026-06-01', sopT: '2026-10-01', status: 'cancelled', cancel: 'Teknik doğrulamada yeterli fayda bulunamadı.' });
  C({ title: 'Kapı Kilit Mekanizması Alternatifi', cat: 'cat-tz', unit: 0, relT: '2026-03-27', sopT: '2026-07-01', status: 'cancelled', cancel: 'Tedarikçi teklif vermedi.' });
  C({ title: 'Ön Klape SMC', cat: 'cat-arge', sub: 'Malzeme değişimi', unit: 50, relT: '2026-07-01', smpT: '2026-10-15', sopT: '2026-12-01', pub: '100000207801', prob: 50 });
  C({ title: 'Ön Tampon SMC', cat: 'cat-arge', sub: 'Malzeme değişimi', unit: 75, relT: '2026-06-01', smpT: '2026-10-20', sopT: '2026-12-01', pub: '100000208573', prob: 50 });
  C({ title: 'Arka Tampon SMC', cat: 'cat-arge', sub: 'Malzeme değişimi', unit: 50, relT: '2026-06-01', smpT: '2026-10-20', sopT: '2026-12-01', pub: '100000207596', prob: 50 });
  C({ title: 'Bütünleşik Hava Kanalı ve Şapkalık', desc: 'Ayrı şapkalık ve hava kanalı yerine yekpare tasarım.', cat: 'cat-arge', sub: 'Tasarım', unit: 100, relT: '2026-03-01', smpT: '2026-09-01', sopT: '2026-11-01', prob: 25 });
  C({ title: 'Cam Altı Piano Black', cat: 'cat-arge', sub: 'Tasarım', unit: 25, relT: '2026-05-01', relA: '2026-08-28', smpT: '2026-10-01', sopT: '2026-12-01', pub: '100000151591', prob: 75 });
  C({ title: 'Sis Farı Alternatifi', cat: 'cat-tz', unit: 0, relT: '2026-10-01', sopT: '2026-11-01', status: 'cancelled', cancel: 'Homologasyon riski.' });
  C({ title: 'Koma Alternatifleme (Hella→Koger)', cat: 'cat-tz', sub: 'Alternatif kaynak', team: 'team-elek', unit: 2, relT: '2026-06-01', relA: '2026-05-07', smpT: '2026-07-01', smpA: '2026-07-10', sopT: '2026-08-01', sopA: '2026-08-03' });
  C({ title: 'Amfi Firma Değişikliği (Actia→Yılka)', cat: 'cat-tz', sub: 'Tedarikçi değişimi', team: 'team-elek', unit: 0, relT: '2026-07-01', sopT: '2026-12-01', prob: 25 });
  C({ title: 'Sultan Kilit Millerinin Paslanmaz Dönmesi', cat: 'cat-arge', sub: 'Malzeme değişimi', unit: 1, relT: '2026-04-01', relA: '2026-04-01', smpT: '2026-04-01', smpA: '2026-04-01', sopT: '2026-04-01', sopA: '2026-04-01', fin: '2026-05-12' });
  C({ title: 'Makas Özel Pulu İptali', cat: 'cat-arge', sub: 'Ürün optimizasyonu', team: 'team-pwt', unit: 0.4, relT: '2026-04-06', relA: '2026-04-06', smpNa: true, sopT: '2026-05-01', sopA: '2026-05-04', pub: '100000204271' });
  C({ title: 'Elcik-Yan Pozisyon Lambalı Vida İptali', cat: 'cat-arge', sub: 'Ürün optimizasyonu', unit: 1, relT: '2026-06-01', relA: '2026-06-01', smpNa: true, sopT: '2026-06-01', sopA: '2026-06-08' });
  C({ title: 'Ford Lamba', cat: 'cat-tz', sub: 'Alternatif kaynak', team: 'team-elek', unit: 17, relT: '2026-01-01', relA: '2026-01-05', smpT: '2026-01-01', smpA: '2026-01-05', sopT: '2026-01-01', sopA: '2026-01-05', fin: '2026-02-10' });
  C({ title: 'Tavan Lambası Alternatifi', cat: 'cat-tz', unit: 0, relT: '2026-10-01', sopT: '2026-12-01', status: 'cancelled', cancel: 'Fikir Navigo projesine taşındı.' });
  C({ title: 'Otomatik Şanzıman Yağ Değişikliği', cat: 'cat-tz', sub: 'Satın alma fiyatı', team: 'team-pwt', unit: 108, relT: '2026-01-01', relA: '2026-01-06', smpNa: true, sopT: '2026-05-01', sopA: '2026-05-04', fin: '2026-06-15' });
  C({ title: 'Ön Piston Kapama İptali', cat: 'cat-arge', sub: 'Ürün optimizasyonu', unit: 7, relT: '2026-09-01', relA: '2026-07-30', smpT: '2026-09-15', smpA: '2026-09-20', sopT: '2026-10-01', sopA: '2026-10-05', pub: '100000209023' });
  C({ title: 'Han-de Ön Aks Hız Sensörü İptali', cat: 'cat-arge', sub: 'Ürün optimizasyonu', team: 'team-pwt', unit: 19, relT: '2026-07-01', relA: '2026-07-15', smpT: '2026-07-01', smpA: '2026-07-15', sopT: '2026-07-01', sopA: '2026-07-20', pub: '100000208345' });
  C({ title: 'İlk Yardım Çantası Ürün İptali', cat: 'cat-tz', sub: 'Satın alma fiyatı', team: 'team-trim', unit: 6, relT: '2026-07-01', relA: '2026-07-15', smpNa: true, sopT: '2026-07-01', sopA: '2026-07-15' });
  C({ title: 'Müşir-Fren Pedalı Adet Düşümü', cat: 'cat-arge', sub: 'Ürün optimizasyonu', unit: 3, relT: '2026-07-01', relA: '2026-07-15', smpNa: true, sopT: '2026-07-01', sopA: '2026-07-15' });
  C({ title: 'Yolcu Güvenlik Kartı-PVC Adet Düşümü', cat: 'cat-arge', sub: 'Tasarım', team: 'team-trim', unit: 10, relT: '2026-09-01', smpNa: true, sopT: '2026-10-01', pub: '100000208669', prob: 75 });
  C({ title: 'Telemetri Opsiyon Paketine Alınması', cat: 'cat-arge', sub: 'Ürün optimizasyonu', team: 'team-elek', unit: 80, relT: '2026-09-01', relA: '2026-09-01', smpNa: true, sopT: '2026-10-25', pub: '100000210514', prob: 75 });
  C({ title: 'Gergi Ayağı Radyatör Ucuzlatma', cat: 'cat-tz', sub: 'Satın alma fiyatı', team: 'team-pwt', unit: 2, relT: '2026-07-01', relA: '2026-07-15', smpNa: true, sopT: '2026-08-01', sopA: '2026-08-05' });
  C({ title: 'Hava Paylaştırıcı Tedarikçi Değişikliği (Rover→Anfaş)', cat: 'cat-tz', sub: 'Tedarikçi değişimi', team: 'team-pwt', unit: 5, agenda: 'ag-lokal', relT: '2026-07-01', relA: '2026-07-15', smpT: '2026-07-20', smpA: '2026-07-25', sopT: '2026-08-01', sopA: '2026-08-05' });
  C({ title: 'Hava Tahliye Musluğu Tedarikçi Değişikliği (Rover→Anfaş)', cat: 'cat-tz', sub: 'Tedarikçi değişimi', team: 'team-pwt', unit: 14, agenda: 'ag-lokal', relT: '2026-07-01', relA: '2026-07-15', smpT: '2026-07-20', smpA: '2026-07-25', sopT: '2026-08-01', sopA: '2026-08-05' });
  C({ title: 'Ara Kablo - Devir Anahtarı İptali', cat: 'cat-arge', sub: 'Ürün optimizasyonu', team: 'team-elek', unit: 12, relT: '2026-07-01', relA: '2026-07-15', smpNa: true, sopT: '2026-08-01', sopA: '2026-08-05' });
  C({ title: 'Hız Limit İptali', cat: 'cat-arge', sub: 'Ürün optimizasyonu', team: 'team-elek', unit: 8, relT: '2026-07-01', relA: '2026-07-15', smpNa: true, sopT: '2026-08-01', sopA: '2026-08-05' });

  // Ticari indirimler (referans görsel 2)
  C({ title: 'Koltuk Tedarikçisi Yıllık Fiyat Revizyonu', cat: 'cat-tz', sub: 'Satın alma fiyatı', scope: 'scope-ticari', team: 'team-satin', unit: 1450, veh: ['veh-sc', 'veh-sm'], relNa: true, smpNa: true, sopT: '2026-01-01', sopA: '2026-01-01', fin: '2026-02-05' });
  C({ title: 'Klima Sistemi Çerçeve Anlaşması', cat: 'cat-tz', sub: 'Satın alma fiyatı', scope: 'scope-ticari', team: 'team-satin', unit: 980, veh: ['veh-sc', 'veh-sm', 'veh-nv'], relNa: true, smpNa: true, sopT: '2026-03-01', sopA: '2026-03-01', fin: '2026-04-10' });
  C({ title: 'Lastik Tedarik İhalesi', cat: 'cat-tz', sub: 'Satın alma fiyatı', scope: 'scope-ticari', team: 'team-satin', unit: 350, veh: ['veh-sc', 'veh-sm', 'veh-nv'], relNa: true, smpNa: true, sopT: '2026-04-01', sopA: '2026-04-01' });
  C({ title: 'Elektrik Tesisatı Lokalizasyonu', cat: 'cat-tz', sub: 'Lokalizasyon', scope: 'scope-ticari', team: 'team-satin', agenda: 'ag-lokal', unit: 499, veh: ['veh-sc'], relT: '2026-09-01', relA: '2026-09-10', smpT: '2026-10-10', sopT: '2026-11-15', prob: 50 });
  // Üretim Mühendisliği / Direktörlüğü
  C({ title: 'Gövde Kaynak Hattında Fikstür Standardizasyonu', cat: 'cat-um', sub: 'Aparat/fixture', team: 'team-montaj', unit: 650, veh: ['veh-sc', 'veh-sm'], relNa: true, smpT: '2026-02-15', smpA: '2026-02-20', sopT: '2026-03-01', sopA: '2026-03-05', inv: 42000 });
  C({ title: 'Boyahane Çevrim Süresi İyileştirmesi', cat: 'cat-um', sub: 'Çevrim süresi', team: 'team-montaj', unit: 65, veh: ['veh-sc', 'veh-nv'], relNa: true, smpNa: true, sopT: '2026-11-01', prob: 25 });
  C({ title: 'Son Montaj Hat Dengeleme', cat: 'cat-ud', sub: 'Hat verimliliği', team: 'team-hat', unit: 120, veh: ['veh-nv'], relNa: true, smpNa: true, sopT: '2026-06-01', sopA: '2026-06-15', fin: '2026-07-20' });
  C({ title: 'Kalite Kontrol Kayıp Azaltma Programı', cat: 'cat-ud', sub: 'Kayıp azaltma', team: 'team-hat', unit: 90, veh: ['veh-sm', 'veh-nv'], relNa: true, smpNa: true, sopT: '2026-09-01', prob: 50 });
  // Navigo / Mega teknik
  C({ title: 'Navigo Ön Panel Tek Parça Kalıp', cat: 'cat-arge', sub: 'Tasarım', unit: 310, veh: ['veh-nv'], relT: '2026-03-01', relA: '2026-03-10', smpT: '2026-05-01', smpA: '2026-05-20', sopT: '2026-07-01', sopA: '2026-07-14' });
  C({ title: 'Navigo Tavan Paneli Kalınlık Optimizasyonu', cat: 'cat-arge', sub: 'Ürün optimizasyonu', unit: 180, veh: ['veh-nv'], relT: '2026-08-01', relA: '2026-08-20', smpT: '2026-10-01', sopT: '2026-11-01', prob: 75 });
  C({ title: 'Mega Yolcu Koltuğu Ray Değişikliği', cat: 'cat-arge', sub: 'Malzeme değişimi', unit: 240, veh: ['veh-sm'], relT: '2026-05-01', relA: '2026-05-05', smpT: '2026-07-01', smpA: '2026-07-01', sopT: '2026-09-01', sopA: '2026-09-07' });
  // 2027 portföyü (örn. "2027 Eylül ayında devreye girecek tüm CRID'ler")
  C({ title: 'Elektrikli Klima Kompresörü Geçişi', year: 2027, cat: 'cat-arge', sub: 'Yeni teknoloji', team: 'team-elek', agenda: 'ag-model', unit: 420, veh: ['veh-sc', 'veh-nv'], relT: '2027-03-01', smpT: '2027-06-01', sopT: '2027-09-01', prob: 25 });
  C({ title: 'Şasi Profil Lokalizasyonu', year: 2027, cat: 'cat-tz', sub: 'Lokalizasyon', team: 'team-pwt', agenda: 'ag-lokal', unit: 260, veh: ['veh-sc', 'veh-sm'], relT: '2027-02-01', smpT: '2027-05-01', sopT: '2027-09-01', prob: 50 });
  C({ title: 'Robotlu Yapıştırma Hücresi', year: 2027, cat: 'cat-um', sub: 'Otomasyon', team: 'team-montaj', unit: 150, veh: ['veh-nv'], relNa: true, smpT: '2027-04-01', sopT: '2027-06-01', prob: 25, inv: 180000 });

  // -------- Add/Delete listeleri (referans görsel 5 — Comfort Add-Delete) --------
  let subSeq = {};
  const S = (crid, o) => {
    subSeq[crid.id] = (subSeq[crid.id] || 0) + 1;
    const s = {
      id: `${crid.id}-s${subSeq[crid.id]}`, cridId: crid.id, seq: subSeq[crid.id], no: formatSubNo(crid.no, subSeq[crid.id]),
      partNo: o.addNo || o.delNo || '', partName: o.addName || o.delName || '', currentState: o.cur || '', proposedState: o.prop || '',
      del: { partNo: o.delNo || '', partName: o.delName || '', qty: o.delQty ?? 1, price: o.delPrice ?? '', currency: o.delCur || 'EUR', ratio: o.delRatio ?? 1 },
      add: { partNo: o.addNo || '', partName: o.addName || '', qty: o.addQty ?? 1, price: o.addPrice ?? '', currency: o.addCur || 'EUR', ratio: o.addRatio ?? 1 },
      impactMode: 'lines', manualImpact: '', manualCurrency: 'EUR', vehicleIds: [], volumeOverride: '',
      responsibleId: crid.responsibleId, status: o.status || 'done', frozen: null, sample: true,
      createdAt: SAMPLE_TS, createdBy: 'usr-ayse', updatedAt: SAMPLE_TS, updatedBy: 'usr-ayse', history: [],
    };
    const out = crid.ms.sopActual ? freezeSub(s, m, crid.ms.sopActual, 'usr-ayse') : s;
    subs.push(out);
  };
  S(c1, { delNo: '13C33-05203-AA', delName: 'ÖN AKS KOMPLE', delPrice: 2237.6, addNo: '25A00-05203-AA', addName: 'KOMPLE ÖN AKS-HANDE', addPrice: 1070.5, addCur: 'USD', cur: 'Mevcut ön aks tedarikçisi', prop: 'Hande ön aks' });
  S(c2, { delNo: '27B00-72428-AA', delName: 'TRİM KOMPLE-ORTA CAM DİKME', delQty: 4, delPrice: 330, delRatio: 0.02, addNo: '27B01-72428-AA', addName: 'TRİM KMP-DAR CAM DİK.İMDAT ÇEKİÇ DELİKLİ', addQty: 4, addPrice: 200, addRatio: 0.02, cur: 'ABS termoform', prop: 'Plastik enjeksiyon' });
  S(c2, { delNo: '27B00-72428-BA', delName: 'TRİM KOMPLE-ORTA CAM DİKME', delQty: 1, delPrice: 330, delRatio: 0.02, addNo: '27B01-72428-BA', addName: 'TRİM KOMPLE-ORTA CAM DİKME', addQty: 1, addPrice: 200, addRatio: 0.02, cur: 'ABS termoform', prop: 'Plastik enjeksiyon' });
  S(c3, { delNo: '13C61-36581-AA', delName: 'GERİ GÖRÜŞ KAMERASI', delPrice: 195.5, addNo: '12L51-36856-AA', addName: 'KAMERA-BALIK GÖZÜ GERİ GÖRÜŞ', addPrice: 90.5, addCur: 'USD' });
  S(c5, { delNo: '28C00-70265-AA', delName: 'KAMERA MUHAFAZA-ARKA', delPrice: 2375, delRatio: 0.02, addNo: '28C00-70265-BA', addName: 'KAMERA MUHAFAZA KOMPLE-ARKA', addPrice: 1240, addRatio: 0.02 });

  // -------- Fikir Havuzu (referans görsel 6) --------
  const ideas = [];
  let iSeq = 0;
  const I = (o) => {
    iSeq++;
    ideas.push({
      id: `idea-sample-${String(iSeq).padStart(3, '0')}`, no: formatNo('FH', 2026, iSeq), title: o.title, problem: o.problem || '', description: o.desc || '',
      categoryId: o.cat || 'cat-arge', subCategory: o.sub || '', potential: o.pot ?? '', potentialBasis: o.basis || 'unit', potentialCurrency: 'EUR', investment: o.inv ?? '',
      vehicleIds: o.veh || ['veh-sc'], teamId: o.team || 'team-trim', ownerId: o.owner || 'usr-burak', maturity: o.mat || 'raw', notes: o.notes || '',
      estSop: o.est || '2026-12', scopeId: 'scope-teknik', agendaId: 'ag-butce',
      evaluation: o.ev || { potential: '', feasibility: '', vehicleFit: '', agendaFit: '', note: '' }, attachments: [],
      convertedCridId: o.conv || '', sample: true,
      createdAt: o.created || '2026-03-02T08:00:00.000Z', createdBy: o.owner || 'usr-burak', updatedAt: o.updated || o.created || '2026-03-02T08:00:00.000Z', updatedBy: o.owner || 'usr-burak',
      history: [],
    });
  };
  I({ title: 'Ön Kapı Piston Kapama Değişikliği', problem: 'ABS malzeme maliyeti yüksek', desc: 'ABS malzeme yerine plastik enjeksiyona geçiş', pot: 5, team: 'team-trim', mat: 'maturing', ev: { potential: 2, feasibility: 4, vehicleFit: 5, agendaFit: 3, note: 'Kalıp yatırımı netleşmeli' }, updated: '2026-09-20T08:00:00.000Z' });
  I({ title: 'Motor Değişikliği', problem: 'Mevcut motor maliyeti ve Euro 6 uyum maliyeti', desc: 'F-Cummins 4.5 litre motor uygulaması', pot: 4000, team: 'team-pwt', cat: 'cat-arge', sub: 'Yeni teknoloji', mat: 'review', inv: 350000, ev: { potential: 5, feasibility: 2, vehicleFit: 4, agendaFit: 4, note: 'Homologasyon süresi kritik' }, updated: '2026-08-01T08:00:00.000Z' });
  I({ title: 'Adblue Hatları', problem: 'Mevcut marka fiyat artışı', desc: 'Errecinque markaya geçiş', pot: 48, team: 'team-pwt', cat: 'cat-tz', sub: 'Alternatif kaynak', mat: 'review', updated: '2026-04-10T08:00:00.000Z' });
  I({ title: 'Direksiyon Kutusu', problem: 'Tek kaynak bağımlılığı', desc: 'Hema yerine Quanxing marka', pot: 100, team: 'team-pwt', cat: 'cat-tz', sub: 'Tedarikçi değişimi', mat: 'raw', created: '2026-05-04T08:00:00.000Z' });
  I({ title: 'Kamera Kapama', desc: 'Sultan 2 arka kamera kapama UV ABS', pot: 0, team: 'team-trim', mat: 'rejected', notes: 'Fayda bulunamadı.' });
  I({ title: 'Sultan Ön Klape SMC', desc: 'Sultan ön klape yeni dizayn SMC', pot: 50, team: 'team-trim', mat: 'converted', conv: 'crid-sample-008' });
  I({ title: 'Sultan Cam Altı', desc: 'Sultan cam altı piano black', pot: 25, team: 'team-trim', mat: 'converted', conv: 'crid-sample-012' });
  I({ title: 'Bütün Hava Kanalı ve Şapkalık', desc: 'Ayrı şapkalık ve hava kanalı yerine yekpare tasarım', pot: 100, team: 'team-trim', mat: 'converted', conv: 'crid-sample-011' });
  I({ title: 'Perde', desc: 'Ucuz kumaş ve metraj değişimi', pot: 12, team: 'team-trim', cat: 'cat-tz', sub: 'Satın alma fiyatı', mat: 'raw', created: '2026-10-01T08:00:00.000Z' });
  I({ title: 'Ambalaj İadeli Kasa Sistemi', problem: 'Tek kullanımlık ambalaj maliyeti', desc: 'Tedarikçilerle iadeli plastik kasa döngüsü', pot: 85000, basis: 'annual', team: 'team-hat', cat: 'cat-ud', sub: 'Kayıp azaltma', veh: ['veh-sc', 'veh-sm', 'veh-nv'], mat: 'maturing', updated: '2026-09-28T08:00:00.000Z' });
  // teyitli kayıtlara hesaplanan gerçekleşen tutarı yaz (örnek finansal teyit)
  {
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const sbc = new Map();
    for (const x of subs) { if (!sbc.has(x.cridId)) sbc.set(x.cridId, []); sbc.get(x.cridId).push(x); }
    for (const c of crids) {
      if (c.fin.status !== 'confirmed' || c.fin.confirmedAmount !== '') continue;
      const f = cridYearFinancials(c, { master: m, plans: planMap, subsByCrid: sbc }, +c.ms.sopActual.slice(0, 4));
      c.fin.confirmedAmount = Math.round(f.realizedBase * 0.97);
    }
  }
  // dönüşmüş fikirlerin kaynak bağlantısı
  for (const i of ideas) if (i.convertedCridId) {
    const c = crids.find((x) => x.id === i.convertedCridId);
    if (c) { c.sourcePoolId = i.id; c.sourcePoolNo = i.no; }
  }

  const counters = { crid: { ...yseq }, pool: { 2026: ideas.length } };

  return { master: m, plans, crids, subs, ideas, counters };
}
