# Book Shelf

[English](README.md) · **ภาษาไทย**

ห้องสมุดดิจิทัลส่วนตัวสำหรับ **ไลท์โนเวล มังงะ นิยาย อาร์ตบุ๊ก ฉบับพิเศษ และสินค้า (merchandise)**
เลือกดูหนังสือเป็นชั้นแยกตามแนวแบบ Netflix ค้นหาได้ทั้งแคตตาล็อก (พิมพ์ผิดก็ยังเจอ) และบันทึกว่าเล่มไหน **มีแล้ว (Owned)** เล่มไหน **อยากได้ (Want)**

สร้างใหม่จาก [Book Shelf](https://kyzz693.github.io/Bookshelf/) ต้นฉบับ โดยคงเอกลักษณ์เดิมไว้ ได้แก่ พื้นหลังสีกระดาษโทนอุ่น
สีหลักเขียวป่า และโลโก้ตัวอักษร DM Serif Display

| ส่วน | เทคโนโลยี |
| --- | --- |
| UI | React 19 + TypeScript, Tailwind CSS 4, Framer Motion, Lucide icons |
| Routing / ข้อมูล | React Router 7, TanStack Query 5 |
| Backend | Supabase: Postgres, Auth (อีเมล + Google), Storage, RLS |
| Build | Vite 8 (SPA แบบ static, deploy ได้บน GitHub Pages / Netlify / Vercel / Cloudflare Pages) |

---

## 1. เริ่มต้นใช้งาน

```bash
npm install
cp .env.example .env        # แล้วใส่ Supabase URL + publishable key ของคุณ
npm run dev                 # http://localhost:5173
```

ถ้ายังไม่ได้ตั้งค่า environment variables แอปจะแสดงหน้า "Connect your Supabase project" แทนที่จะพัง

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | เปิด dev server |
| `npm run build` | ตรวจ TypeScript + build สำหรับ production ลงใน `dist/` (สร้าง `dist/404.html` สำหรับ SPA routing ด้วย) |
| `npm run typecheck` | ตรวจ TypeScript อย่างเดียว |
| `npm run test:db` | รัน migration ทั้งหมด + seed บน PGlite (PostgreSQL จริงที่คอมไพล์เป็น WASM) แล้วตรวจ RLS, การค้นหา, คอลเลกชัน, ฟังก์ชันแอดมิน ตัวนำเข้าข้อมูล และ constraint (175 รายการ) |
| `npm run reconstruct:merch` | สร้างตัวอย่าง 3D จำลองของสินค้า (ดู [ตัวอย่างโมเดล 3D ของสินค้า](#ตัวอย่างโมเดล-3d-ของสินค้า)) |
| `npm run import:phoenixnext` | นำเข้าแคตตาล็อกจาก Phoenix Next (ดู [นำเข้าข้อมูลจาก Phoenix Next](#นำเข้าข้อมูลจาก-phoenix-next)) |

### Environment variables

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` (Dashboard → Project Settings → API) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | คีย์แบบ **publishable** (`sb_publishable_…`) ใช้ฝั่ง client ได้อย่างปลอดภัย |
| `VITE_BASE_PATH` | ปกติใช้ `/` ถ้า deploy ที่ `https://<user>.github.io/<repo>/` ให้ใช้ `/<repo>/` |

> **ห้าม** ใส่คีย์ `service_role` / secret key ในตัวแปร `VITE_` ใด ๆ เด็ดขาด เพราะ Vite จะฝังตัวแปร `VITE_` ลงใน bundle
> ที่ใครก็เปิดดูได้ แอปนี้ใช้แค่ publishable key เท่านั้น และข้อมูลทั้งหมดได้รับการป้องกันด้วย Row Level Security

---

## 2. ตั้งค่าฐานข้อมูล

โครงสร้างทั้งหมดอยู่ใน `supabase/migrations/` ให้รันไฟล์ตามลำดับชื่อไฟล์:

| ไฟล์ | เนื้อหา |
| --- | --- |
| `…0100_catalog_schema.sql` | `pg_trgm`, enum, ตาราง publishers, authors, illustrators, translators, genres, series, books, ตารางเชื่อมผู้สร้างผลงาน, merchandise, index (B-tree, trigram GIN, full-text GIN), trigger จัดรูปแบบข้อมูล + `updated_at` |
| `…0200_profiles_roles_collections.sql` | `profiles` (สร้างอัตโนมัติตอนสมัคร), `user_roles`, `is_admin()`, `is_username_available()`, `user_collections` |
| `…0300_rls_policies.sql` | RLS ทุกตาราง และสิทธิ์ (grants) |
| `…0400_views_and_functions.sql` | `series_overview`, `my_collection`, `search_catalog()`, `get_genre_shelves()`, `set_collection_status()`, `toggle_collection_status()`, `get_collection_stats()`, `admin_save_series()`, `admin_save_book()`, `admin_ensure_person()` |
| `…0500_storage.sql` | bucket `covers` และ `avatars` พร้อม policy |
| `…0600_reference_data.sql` | สำนักพิมพ์เริ่มต้น (Phoenix Next, Luckpim, Animag, …) และแนวหนังสือ |
| `20261125000100_merch_types.sql`, `…000200_special_editions_and_merch_preview.sql` | ประเภทสินค้าใหม่, `regular_book_id` / `bonus_items` ในตาราง books, ฟิลด์ตัวอย่าง 3D ในตาราง merchandise, bucket `models`, ซ่อนซีรีส์ที่มีแต่สินค้าออกจากชั้นหน้าแรก |
| `…0700_import_and_series_covers.sql` | คีย์ `source_ref` สำหรับนำเข้าข้อมูล, ปกซีรีส์อัตโนมัติ (จากเล่มปกติเล่มแรก), ฟังก์ชัน `import_catalog()` (เรียกได้เฉพาะ service_role) |
| `supabase/seed.sql` | *ไม่บังคับ* แคตตาล็อกตัวอย่าง: ซีรีส์ **สมมติ** 8 เรื่อง พร้อมเล่มปกติ ฉบับพิเศษ และสินค้า |

**วิธี A: Supabase CLI (แนะนำ)**

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --remote
```

ถ้าต้องการข้อมูลตัวอย่างด้วย ให้รัน `supabase/seed.sql` ใน SQL editor (ถ้าใช้ Supabase แบบ local คำสั่ง `supabase db reset` จะรันให้อัตโนมัติ)

**วิธี B: SQL editor** วางและรันไฟล์ migration ทีละไฟล์ตามลำดับ แล้วจะรัน `seed.sql` ต่อหรือไม่ก็ได้

ถ้าต้องการลบข้อมูลตัวอย่างภายหลัง:

```sql
delete from public.series where description like '[demo]%';
```

### ตั้งตัวเองเป็นผู้ดูแลระบบ (admin)

สิทธิ์ admin เก็บอยู่ใน `public.user_roles` ผู้ใช้ทั่วไปเขียนตารางนี้ไม่ได้ จึงไม่มีใครให้สิทธิ์ admin ตัวเองได้
ให้สมัครสมาชิกในแอปก่อน แล้วรันคำสั่งนี้ใน SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

รีโหลดแอปแล้วแท็บ **Admin** จะปรากฏขึ้น การป้องกันนี้ทำที่ฐานข้อมูลโดยตรง: ทุก policy สำหรับ `insert/update/delete`
ข้อมูลแคตตาล็อกจะตรวจ `is_admin()` เสมอ ดังนั้นสิ่งที่ปกป้องแคตตาล็อกไม่ใช่การซ่อนแท็บใน React

---

### นำเข้าข้อมูลจาก Phoenix Next

`scripts/import-phoenixnext.mjs` อ่านข้อมูลจาก GraphQL API สาธารณะของ Phoenix Next (เว็บร้านสร้างด้วย Magento) โดยไม่ scrape หน้าเว็บ ใช้ประมาณ 45 request ก็ได้แคตตาล็อกครบ ราว 4,500 รายการ

ข้อมูลที่ได้จากแต่ละสินค้า:

- ซีรีส์ เลขเล่ม และประเภทฉบับ (ปกติ, Special Set, Box Set, ฉบับ "แถมฟรี! Postcard")
- รูปปก ราคา ISBN และลิงก์หน้าสินค้า
- **เรื่องย่อหลังเล่ม** (ตัดประกาศร้านและลิงก์ออกแล้ว)
- แนวหนังสือ และผู้แต่ง / นักวาด / ผู้แปล / จำนวนหน้า ถ้าในรายละเอียดสินค้ามีระบุไว้

1. รัน migration ให้ครบก่อน (`npx supabase db push --remote`) ไฟล์ `0700` จะเพิ่มฟังก์ชันนำเข้าข้อมูล
2. สร้าง **secret key** ที่ Dashboard → Project Settings → API Keys → Secret keys แล้วใส่ในไฟล์ `.env.local` ซึ่ง git จะไม่เก็บ:
   ```
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
   ห้ามขึ้นต้นชื่อตัวแปรด้วย `VITE_` เด็ดขาด ถ้าสคริปต์เจอ secret key ในตัวแปร `VITE_` จะไม่ยอมทำงาน
3. ดูตัวอย่างก่อน คำสั่งนี้จะดาวน์โหลดแคตตาล็อกแล้วเขียนไฟล์ `scripts/.cache/phoenixnext-preview.json` โดยยังไม่แตะฐานข้อมูล:
   ```bash
   npm run import:phoenixnext -- --dry-run
   ```
4. นำเข้าจริง:
   ```bash
   npm run import:phoenixnext -- --offline
   ```
   `--offline` ใช้ไฟล์ที่ดาวน์โหลดไว้จากขั้นที่ 3 จึงไม่ต้องดึงจาก Phoenix Next ซ้ำ ตัวเลือกอื่น:
   - `--limit=20`: ลองนำเข้าแค่ไม่กี่ซีรีส์ก่อน
   - `--types=light_novel,manga`: นำเข้าเฉพาะประเภทที่เลือก
   - `--overwrite`: เขียนทับชื่อเรื่องและเลขเล่มด้วย

รันซ้ำได้อย่างปลอดภัย ระบบจับคู่ด้วยรหัสสินค้า (SKU) จึงไม่เกิดข้อมูลซ้ำ เล่มใหม่จะถูกเพิ่ม ส่วนราคา ปก และเรื่องย่อจะอัปเดตให้ แต่ชื่อเรื่อง ประเภทฉบับ แนว และรายชื่อผู้สร้างที่ admin แก้ไว้จะไม่ถูกเขียนทับ ยกเว้นใส่ `--overwrite`

**ปก:** หนังสือแต่ละเล่มแสดงปกของเล่มนั้นเอง ส่วนซีรีส์จะใช้ปกของเล่มปกติเล่มแรกโดยอัตโนมัติ (เล่ม 1 หรือเล่มที่เลขน้อยที่สุดที่มี) ฐานข้อมูลมี trigger อัปเดตให้เสมอ ถ้า admin อัปโหลดปกซีรีส์เอง ระบบจะคงปกนั้นไว้

> รูปปกลิงก์ไปที่เซิร์ฟเวอร์รูปของ Phoenix Next ไม่ได้คัดลอกมาเก็บ ชื่อเรื่อง ราคา และ ISBN เป็นข้อเท็จจริง แต่ภาพปกและเรื่องย่อเป็นลิขสิทธิ์ของสำนักพิมพ์
> จึงควรใช้เป็นเว็บส่วนตัว หรือขออนุญาต Phoenix Next ก่อนเปิดให้คนทั่วไปใช้ และรันการนำเข้าเป็นครั้งคราว (เช่น สัปดาห์ละครั้ง) ไม่ใช่ตลอดเวลา

**อัปเดตอัตโนมัติทุกสัปดาห์:** `.github/workflows/weekly-import.yml` จะนำเข้าข้อมูลทุกวันจันทร์ ตี 3 เวลาไทย แล้วสร้างโมเดล 3D ให้สินค้าที่เพิ่มเข้ามาใหม่ ต้องเพิ่ม **secret** ชื่อ `SUPABASE_SECRET_KEY` ใน repo ส่วน variable `VITE_SUPABASE_URL` ใช้ร่วมกับ workflow deploy ถ้าอยากสั่งรันทันที ไปที่ Actions → *Weekly catalog import* → **Run workflow** ทุกครั้งที่รัน ไฟล์ review จะเก็บไว้ให้ดาวน์โหลด 14 วัน ถ้า repo ไม่มีความเคลื่อนไหวนาน 60 วัน GitHub จะหยุดงานตั้งเวลาไว้ชั่วคราว ให้กดเปิดใหม่ในแท็บ Actions

### Merchandise, Artbook และ Special Edition

- **Merchandise** มีหน้าแกลเลอรีของตัวเองที่ `/merchandise` (อยู่ในเมนูหลัก) สินค้าแสดงเป็นรูปในกรอบ กรองได้ตามประเภท (Figure, Acrylic Stand, Keychain, Poster, Wall Scroll, Art Print, Character Goods, Collectible ฯลฯ) และตามซีรีส์ หน้าซีรีส์จะมีลิงก์ไปที่สินค้าของซีรีส์นั้นแทนการแสดงสินค้าในหน้า
- **Artbook** ยังเป็นหนังสือ (`books.item_type = 'artbook'`) แสดงในกรอบแบบภาพแขวนผนัง กดแล้วเข้าหน้ารายละเอียดได้ตามปกติ (แท็บ Information และ Description) แต่ไม่มีแอนิเมชันหนังสือเปิดอ่านหลังเล่มแบบเล่มในซีรีส์
- **Special Edition** ผูกกับเล่มปกติผ่าน `books.regular_book_id` ซึ่ง trigger จะจับคู่ให้อัตโนมัติจากซีรีส์และเลขเล่ม หน้าซีรีส์แสดงเฉพาะเล่มปกติ หน้าของแต่ละเล่มจะมีกล่องเด่น "Also available as a special edition" ส่วนหน้า Special Edition มีลิงก์กลับไปเล่มปกติ และแสดงรายการของแถม (`books.bonus_items`)

### ตัวอย่างโมเดล 3D ของสินค้า

เมื่อเปิดหน้าสินค้าที่มีตัวอย่าง 3D จะเห็นโมเดลที่หมุน ซูม รีเซ็ตมุมมอง และดูเต็มจอได้ three.js โหลดเฉพาะในหน้านี้ ถ้าไม่มีตัวอย่าง หน้าจะแสดงแกลเลอรีรูป (ซูมได้) พร้อมบอกเหตุผล

ตัวอย่าง 3D มาจาก 2 แหล่ง:

1. **ไฟล์โมเดล:** GLB / glTF ของทางการ หรือที่มีสิทธิ์ใช้งานถูกต้อง อัปโหลดได้ที่ **Admin → Merchandise → 3D preview** (เก็บใน bucket `models`)
2. **โมเดลจำลอง** ที่สร้างด้วย `npm run reconstruct:merch` script จะอ่านรูปสินค้าแต่ละชิ้น ตัดสินว่าสร้างจากรูปได้ไหม แล้วบันทึกค่าลงในแถวสินค้า (`model_params`, `reconstruction_status`, `reconstruction_notes`, `reference_urls`) จากนั้นเบราว์เซอร์จะสร้างโมเดลให้:
   - **Acrylic stand และ keychain:** ตัดลายออกจากรูป วางบนแผ่นอะคริลิกใสที่ขอบตามรูปทรงจริง พร้อมฐานหรือห่วงโลหะ
   - **เข็มกลัด:** หน้าโค้งพิมพ์ลาย ด้านหลังเป็นโลหะพร้อมเข็ม
   - **โปสเตอร์ โปสการ์ด ชิกิชิ โบรไมด์ แฟ้มใส และการ์ด:** แผ่นพิมพ์หรือบอร์ด
   - **Wall scroll:** ผ้าพร้อมแกน

   ทั้งหมดเป็นการจำลองโดยประมาณ ความหนา ขนาด และอุปกรณ์ใช้ค่าทั่วไป ไม่ได้วัดจากของจริง และหน้าเว็บจะระบุไว้ชัดว่าเป็นโมเดลจำลอง

ฟิกเกอร์ ตุ๊กตา เสื้อ กระเป๋า และสินค้าที่มีแต่รูปโปรโมท **จะไม่ถูกสร้าง** หน้าเหล่านี้แสดงแกลเลอรีรูปจนกว่าจะมีการอัปโหลดไฟล์ GLB

```bash
npm run reconstruct:merch -- --dry-run   # วิเคราะห์อย่างเดียว เขียนผลไว้ที่ scripts/.cache/merch-reconstruction-review.json
npm run reconstruct:merch                # บันทึกผล (ต้องมี SUPABASE_SECRET_KEY ใน .env.local)
```

script จะทำเฉพาะชิ้นที่ยังไม่มีผล ใช้ `--force` ถ้าต้องการทำใหม่ทั้งหมด หรือ `--only=<id>` สำหรับชิ้นเดียว และจะไม่เขียนทับไฟล์โมเดลที่อัปโหลดไว้

## 3. ระบบยืนยันตัวตน (Authentication)

### อีเมล + รหัสผ่าน

ใช้งานได้ทันที ใน **Authentication → Providers → Email** เลือกได้ว่าจะบังคับยืนยันอีเมลหรือไม่
ฟอร์มสมัครสมาชิกรองรับทั้งสองแบบ: ถ้าไม่บังคับยืนยันจะเข้าสู่ระบบให้ทันที ถ้าบังคับจะแสดงข้อความ "check your inbox"

### ตั้งค่า URL (จำเป็นสำหรับ OAuth, ลิงก์ในอีเมล และการรีเซ็ตรหัสผ่าน)

ไปที่ **Authentication → URL Configuration**:

- **Site URL**: URL ของเว็บจริง เช่น `https://<user>.github.io/<repo>/`
- **Redirect URLs**: เพิ่มทุก origin ที่ใช้:
  ```
  http://localhost:5173/**
  https://<user>.github.io/<repo>/**
  ```

แอปจะ redirect ไปที่ `<base>/auth/callback` (สำหรับ OAuth และการยืนยันอีเมล) และ `<base>/reset-password` (สำหรับรีเซ็ตรหัสผ่าน)
แอปใช้ flow แบบ **PKCE** ค่าที่ส่งกลับมาจึงอยู่ในรูป `?code=…` และใช้กับ routing แบบ path บน static host ได้

### Google OAuth

1. ใน [Google Cloud Console](https://console.cloud.google.com/) ไปที่ **APIs & Services**:
   - ตั้งค่า **OAuth consent screen** (เลือก External; scope `email`, `profile`, `openid`)
   - ไปที่ **Credentials → Create credentials → OAuth client ID → Web application**
   - ใน **Authorized JavaScript origins** เพิ่ม `http://localhost:5173` และ origin ของเว็บจริง
   - ใน **Authorized redirect URIs** เพิ่ม `https://<project-ref>.supabase.co/auth/v1/callback`
2. ใน Supabase ไปที่ **Authentication → Providers → Google** เปิดใช้งาน แล้ววาง **Client ID** และ **Client Secret**
3. ตรวจสอบว่าได้บันทึก Redirect URLs จากหัวข้อก่อนหน้าแล้ว

เมื่อผู้ใช้เข้าสู่ระบบด้วย Google ครั้งแรก trigger `on_auth_user_created` จะสร้างโปรไฟล์ให้ โดยตั้ง username จากชื่อ Google
หรืออีเมล ถ้าชื่อซ้ำจะเติมตัวต่อท้ายให้ไม่ซ้ำ และคัดลอกชื่อที่แสดงกับรูปโปรไฟล์จาก Google มาด้วย

### Session

- Supabase client เก็บ session ไว้ใน localStorage และต่ออายุ token อัตโนมัติ ผู้ใช้จึงอยู่ในระบบต่อเนื่อง
- ถ้า token ต่ออายุไม่ได้แล้ว (หรือ API ตอบว่า `JWT expired`) แอปจะออกจากระบบฝั่งเครื่องและแสดงข้อความ
  "Your session has expired"

---

## 4. Storage

Migration `0500` สร้าง bucket ทั้งสองให้แล้ว ไม่ต้องตั้งค่าเอง ถ้าต้องการตรวจสอบให้เปิด **Storage** ใน dashboard:

| Bucket | อ่านแบบสาธารณะ | ใครเขียนได้ | ขนาดสูงสุด |
| --- | --- | --- | --- |
| `covers` | ได้ | เฉพาะ admin (`is_admin()`) | 5 MB, jpeg/png/webp/avif/gif |
| `avatars` | ได้ | ผู้ใช้แต่ละคน เฉพาะใน `avatars/<user id ของตัวเอง>/` | 2 MB, jpeg/png/webp |

รูปภาพจะถูกย่อขนาดในเบราว์เซอร์ก่อนอัปโหลด (ปกกว้างไม่เกิน 900 px, รูปโปรไฟล์ 320 px, ไฟล์ WebP)
Storage จึงใช้พื้นที่น้อยและหน้าเว็บโหลดเร็ว

---

## 5. การ Deploy

ผลลัพธ์จากการ build เป็น SPA แบบ static คำสั่ง `npm run build` จะคัดลอก `index.html` เป็น `404.html` และไฟล์
`public/_redirects` รองรับ Netlify ลิงก์ตรงอย่าง `/series/123` จึงใช้ได้บนทุก host

### GitHub Pages

`.github/workflows/deploy.yml` จะ build และ deploy ทุกครั้งที่ push ขึ้น `main`

1. ไปที่ **Settings → Pages → Source** แล้วเลือก **GitHub Actions**
2. ไปที่ **Settings → Secrets and variables → Actions → Variables** แล้วเพิ่ม `VITE_SUPABASE_URL` และ
   `VITE_SUPABASE_PUBLISHABLE_KEY`
3. workflow จะตั้ง `VITE_BASE_PATH=/<repo>/` ให้อัตโนมัติ
4. เพิ่ม `https://<user>.github.io/<repo>/**` ใน Redirect URLs ของ Supabase และตั้ง Site URL

### Netlify / Vercel / Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- ตั้ง environment variables โดยใช้ `VITE_BASE_PATH=/`
- Vercel ต้องมีไฟล์ `vercel.json` สำหรับ rewrite: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`

---

## 6. หลักการทำงาน

### โครงสร้างข้อมูล

```
publishers ─┐
            ├─< series >─< series_genres >─ genres
            │      │
            │      ├─< books >─< book_authors >─ authors
            │      │      ├──< book_illustrators >─ illustrators
            │      │      └──< book_translators >─ translators
            │      └─< merchandise
            │
auth.users ─┬─ profiles (1:1, สร้างอัตโนมัติ)
            ├─< user_roles
            └─< user_collections ──> books | merchandise
```

`user_collections` ใช้รูปแบบ **exclusive arc** แทนการใช้ `item_id` แบบ polymorphic คือมี foreign key จริงสองคอลัมน์
(`book_id`, `merchandise_id`) และมี `CHECK (num_nonnulls(book_id, merchandise_id) = 1)` ผลที่ได้คือ:

- ทุกรายการชี้ไปยังหนังสือหรือสินค้าที่มีอยู่จริง
- เมื่อลบหนังสือหรือสินค้า รายการนั้นจะหายจากคอลเลกชันของผู้ใช้ทุกคน
- `UNIQUE (user_id, book_id)` และ `UNIQUE (user_id, merchandise_id)` ทำให้มีได้แค่หนึ่งแถวต่อหนึ่งรายการ
  รายการเดียวจึงเป็นทั้ง **Owned** และ **Want** พร้อมกันไม่ได้

ฉบับพิเศษคือแถวในตาราง `books` ที่ `edition_type` ไม่ใช่ `regular` (special, limited, exclusive, box set)

### การค้นหา (`search_catalog`)

- กลุ่มผลลัพธ์: ซีรีส์, หนังสือ, สินค้า, ผู้แต่ง, นักวาด, ผู้แปล, สำนักพิมพ์ ผลลัพธ์แต่ละแถวมี `kind_total`
  ให้ UI แสดงจำนวนและปุ่ม "Show more" ได้
- การจัดอันดับ: ตรงทุกตัว (1.0) > ขึ้นต้นตรง (0.9) > มีคำค้นอยู่ข้างใน (0.8) > ตรงแบบ full-text (0.75) > ความคล้ายแบบ trigram
  พิมพ์ผิดอย่าง `lanturn keeper` ก็ยังเจอ *The Lantern Keeper*
- หนังสือจะค้นเจอจากชื่อซีรีส์ ผู้แต่ง นักวาด ผู้แปล สำนักพิมพ์ และ ISBN ได้ด้วย
- กรองผู้สมัครเบื้องต้นด้วยเงื่อนไขที่ใช้ index ได้: trigram GIN (`LIKE` / `<%`) และ full-text GIN (`@@`)
- ตัวกรองต่างกลุ่มจะเชื่อมกันแบบ AND ตัวกรองในกลุ่มเดียวกันเชื่อมแบบ OR: สำนักพิมพ์, ประเภท (รวม Special Edition และ
  Merchandise), แนว, สถานะการจบ, Owned/Want, ผู้แต่ง, นักวาด และผู้แปล
- ฝั่ง client หน่วงการพิมพ์ (debounce 300 ms) และเก็บสถานะการค้นหาทั้งหมดไว้ใน URL จึงแชร์ผลลัพธ์ได้และรีเฟรชแล้วไม่หาย

### ชั้นหนังสือหน้าแรก (`get_genre_shelves`)

มีแถวแนวนอนหนึ่งแถวต่อหนึ่งแนว และแถว "Uncategorized" สำหรับซีรีส์ที่ไม่มีแนว ซีรีส์ที่อยู่หลายแนวจะแสดงในทุกแถวของแนวนั้น
แต่จะไม่ซ้ำในแถวเดียวกัน ภายในแถวจะเรียงตามการจัดกลุ่มที่เลือก (ผู้แต่ง ผู้แปล สำนักพิมพ์ หรือนักวาด) แล้วเรียงต่อด้วย
ผู้แต่ง → ผู้แปล → สำนักพิมพ์ → นักวาด → ชื่อเรื่อง โดยรายการที่ไม่มีค่าจะอยู่ท้ายสุด และมีเส้นแบ่งบอกจุดเริ่มของแต่ละกลุ่ม

### การแสดงผลระหว่างโหลด

- **Skeleton** มีขนาดเท่ากับ component จริงทุกตัว: ปก การ์ด ชั้นหนังสือ หน้ารายละเอียด โปรไฟล์ และรายการ
- **แถบความคืบหน้าด้านบน** (แบบ NProgress) แสดงระหว่างโหลด route แบบ lazy, การดึงข้อมูลครั้งแรกของหน้า และทุกการบันทึกหรืออัปโหลด
  แต่ไม่แสดงตอน refetch ข้อมูลที่ cache ไว้แล้วในเบื้องหลัง

---

## 7. โครงสร้างโปรเจกต์

```
src/
  api/            การเข้าถึงข้อมูล + React Query hooks (catalog, search, collection, profile, admin, storage)
  components/
    auth/         LoginBookAnimation (หนังสือลอย LOGIN / SIGN UP), AuthForms
    cards/        SeriesCard, BookCard
    detail/       ItemDetailLayout, OpenableBook (หนังสือที่เปิดอ่านเรื่องย่อหลังเล่มได้), SynopsisPanel, CollectionButtons
    layout/       AppLayout, Navbar, MobileNav, QuickSearch, UserMenu, Guards
    profile/      ProfileCard, ProfileEditor, CollectionGrid, CollectionStats
    search/       SearchBar, FilterPanel, Highlight
    admin/        AdminDashboard + แท็บต่าง ๆ (series, books, merchandise, publishers, genres, people)
    ui/           Button, Badge, Field, Modal, ConfirmationDialog, Skeleton, EmptyState, Toaster
    GenreSection, HorizontalBookCarousel, CoverImage, LoadingProgressBar
  contexts/       AuthContext (session, profile, สถานะ admin)
  lib/            supabase client, query client, store (toast, progress, auth modal), labels, utils
  pages/          component ของแต่ละ route (โหลดแบบ lazy)
supabase/
  migrations/     schema, RLS, ฟังก์ชัน, storage, ข้อมูลอ้างอิง
  seed.sql        แคตตาล็อกตัวอย่าง (ไม่บังคับ)
  tests/run.mjs   ชุดทดสอบฐานข้อมูล (npm run test:db)
scripts/
  import-phoenixnext.mjs   ตัวนำเข้าแคตตาล็อก Phoenix Next (npm run import:phoenixnext)
```
