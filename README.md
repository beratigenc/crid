# CRID — Cost Reduction Ideas Database

Maliyet azaltma fikirleri, Add/Delete listeleri, üretim planı, bütçe, milestone ve finansal kontrol takibi için web uygulaması.

## Railway'e kurulum

1. Railway'de **New Project → Deploy from GitHub repo** ile bu repoyu seçin.
2. Servisin **Variables** sekmesine ekleyin:
   | Değişken | Değer |
   |---|---|
   | `ADMIN_PASSWORD` | Yönetici şifresi (en az 8 karakter). Kullanıcı adı: `admin` |
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |
   | `SEED_SAMPLE` | İlk açılışta örnek veri istemiyorsanız `false` |
   | `DEMO_PASSWORD` | (İsteğe bağlı) örnek kullanıcılara ortak deneme şifresi |
3. Servise **Volume** ekleyin, mount path: `/data`. Volume olmadan her yeniden dağıtımda veriler silinir.
4. **Settings → Networking → Generate Domain** ile `*.up.railway.app` adresini alın.
5. Adresi açın, `admin` / `ADMIN_PASSWORD` ile girin. Master Data → Kullanıcılar & roller ekranından kişileri ekleyip "Giriş hesapları" bölümünden kullanıcı adı/şifre tanımlayın.

Yönetici şifresini unutursanız: `ADMIN_PASSWORD`'a yeni şifreyi yazıp `ADMIN_RESET=true` ekleyin, yeniden başlatın, sonra `ADMIN_RESET`'i kaldırın.

## Kurumsal görünüm (logolar)

Master Data → **Kurumsal görünüm** ekranından IT yöneticisi kurum logolarını yükler; logolar giriş ekranında, sol menüde ve
tüm ekranların arka planında soluk filigran olarak görünür. Yoğunluk ve boyut aynı ekrandan ayarlanır. Repodaki `branding/`
klasörüne konan logolar varsayılan olarak kullanılır.

## Yerelde çalıştırma

```
ADMIN_PASSWORD=Sifre1234 npm start   # http://localhost:3000
```

Bağımlılık yoktur (Node.js 20+). Arayüz `dist/index.html` içinde derlenmiş hâlde gelir; kaynak `src/` altındadır (`npm run build:ui` esbuild + React gerektirir).

## Mimari

- `server/server.mjs` — bağımlılıksız HTTP sunucusu: giriş (scrypt + HttpOnly çerez), JSON dosyasına kalıcı depolama, sunucu tarafı rol yetkisi, Server-Sent Events ile canlı güncelleme, doküman eki yükleme.
- `src/logic` — hesap motoru ve iş kuralları (birim fayda, hacim bazlı fayda, milestone durumları, dondurma, statü kuralları, yetki matrisi).
- `src/ui` — React arayüzü (11 ekran).
- `test/` — birim testleri ve Playwright uçtan uca senaryoları.

SAP entegrasyonu: araç, parça/fiyat, üretim planı ve Add/Delete listeleri Excel/CSV şablonlarıyla içe aktarılır; canlı bağlantı entegrasyon fazındadır.
