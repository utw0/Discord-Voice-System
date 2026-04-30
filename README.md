# Voice System

Discord tabanlı ses ve hesap yönetimi için hazırlanmış bir Next.js paneli. Proje; giriş ekranı, token hesabı yönetimi, ses kanalına bağlanma akışı ve DM temizleyici aracı ile birlikte gelir.

## Ne İşe Yarar

Bu uygulama, tek bir arayüz üzerinden Discord hesabı açma, hesapları düzenleme, sunucu/ses kanalı hedefi belirleme ve oturumu yönetme akışını toplar. Paketsiz kullanımda tek hesapla çalışır; paket aktif olduğunda admin limitine göre çoklu hesap desteği açılır.

## Özellikler

- Discord OAuth ile giriş
- Tek token modu ve paketli çoklu hesap modu
- Hesap listesi üzerinde doğrudan düzenleme
- Sese gir ve sesten çıkar ana aksiyonları
- Sunucu ve ses kanalı hedefleme
- DM temizleyici sayfası
- Yerel dosya tabanlı kayıt yapısı

## Kurulum

```bash
npm install
npm run dev
```

Geliştirme sunucusu varsayılan olarak `http://localhost:3000` adresinde açılır.

## Gerekli Ortam Değişkenleri

`.env.local` dosyasında aşağıdaki değerleri tanımlayın:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`

## Kullanım

1. Uygulamayı çalıştırın ve Discord ile giriş yapın.
2. Ana panelde gerekiyorsa token etiketi, kullanıcı adı ve gerçek bot tokeni ekleyin.
3. Sunucu adı ve ses kanalı bilgilerini girin.
4. `Sese Gir` ile seçili hedefe bağlanma akışını başlatın.
5. `Sesten Cikar` ile aktif hesapları pasif moda alın.
6. İsterseniz DM Temizleyici sayfasından ikinci aracı kullanın.


## Sayfalar

- Ana panel: `/`
- Admin paneli: `/admin`
- DM temizleyici: `/dm-cleaner`



## Üretim Derlemesi

```bash
npm run build
npm start
```

