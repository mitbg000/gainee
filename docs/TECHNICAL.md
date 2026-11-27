# Gainee – tóm tắt kỹ thuật

Ứng dụng web học tiếng Anh và luyện IELTS qua bài đọc thật: biến bài báo/sách thành bài học có từ vựng và bài tập,
sổ từ với ôn tập ngắt quãng, luyện đề IELTS như thi máy, chép chính tả từ video và đề nghe, Writing có AI chấm.
Nhiều người dùng, phân quyền, trả phí AI bằng credit (nạp qua SePay).

Quy mô hiện tại: ~350 file TypeScript (~31.000 dòng), 52 bảng MySQL, 44 trang, 107 API route, 16 migration.
Tài liệu cho AI viết code (tiếng Anh, viết từ giai đoạn đầu, một số mục đã cũ): `AGENTS.md`. Lộ trình: `docs/ROADMAP.md`.

---

## 1. Công nghệ

| Lớp | Dùng gì |
|---|---|
| Web | Next.js 15 (App Router, React 19, Server Components), Tailwind CSS v4 |
| Ngôn ngữ giao diện | next-intl, `messages/vi.json` + `messages/en.json` (mặc định tiếng Việt) |
| Database | MySQL 8 / MariaDB (utf8mb4), Drizzle ORM, migration trong `drizzle/` |
| Việc chạy nền | Worker Node riêng (PM2), hàng đợi job lưu trong bảng `jobs` (không cần Redis) |
| AI | Mọi API dạng OpenAI (DeepSeek, OpenAI, Gemini, xAI, tuỳ chỉnh) qua một client chung |
| Nhận dạng giọng nói | Whisper chạy tại máy (`@huggingface/transformers`, ONNX) trong tiến trình con, ưu tiên CPU thấp |
| Âm thanh | ffmpeg (cắt đoạn, đọc audio) |
| PDF / Word / ảnh | unpdf, mammoth, tesseract.js (OCR dự phòng), sharp (nén ảnh) |
| Ôn tập | ts-fsrs (thuật toán FSRS như Anki hiện đại) |
| Kiểm tra dữ liệu | zod ở mọi API |
| Đăng nhập | JWT HS256 (jose) trong cookie httpOnly, mật khẩu scrypt |
| Email | nodemailer qua SMTP do admin cấu hình |
| Thanh toán | SePay: VietQR + webhook |
| Chạy server | aaPanel + Nginx + PM2, Node 22 |

---

## 2. Cấu trúc thư mục

```
src/
  app/                 trang (App Router) và API (app/api/**/route.ts)
    admin/             trang quản trị (người dùng, nhóm, nạp, mã, giá, AI, dùng AI, bảo mật)
    api/               107 route JSON
    credits/ profile/ settings/   trang cá nhân
    ielts/ listen/ library/ lessons/ words/ review/ practice/ writing/ assistant/ dictionary/ …
    welcome/ login/ register/ forgot/ reset/   trang công khai
  components/          giao diện theo khu vực (ielts/, listen/, lesson/, admin/, settings/, …)
  db/                  schema.ts (mọi bảng), index.ts (kết nối), migrate.ts
  lib/                 nghiệp vụ phía server (không có giao diện)
    ai/                client AI, định tuyến model theo tác vụ, prompt
    documents/ lessons/ text/     nhập bài, chia phần, sinh bài học
    ielts/             đọc sách PDF thành đề, chấm điểm, band
    listen/            kho nghe: tách câu, Whisper, căn thời gian, cắt clip
    dictionary/        từ điển offline (StarDict)
    users.ts owner.ts actor.ts session.ts auth.ts   người dùng, quyền, dữ liệu riêng
    credits.ts coupons.ts payments.ts security.ts mail.ts passwordReset.ts
  worker/              index.ts (vòng lặp job), handlers.ts, speech.ts (Whisper)
  middleware.ts        chặn trang theo đăng nhập và vai trò
  i18n/ theme/         ngôn ngữ, giao diện sáng/tối và kiểu chữ
drizzle/               file migration SQL + snapshot
messages/              bản dịch vi/en
scripts/               deploy.sh, init-env.sh, _node.sh
deploy/                cấu hình Nginx mẫu cho aaPanel
docker-compose.dev.yml MySQL chạy trên máy để thử offline
```

---

## 3. Kiến trúc khi chạy

```
Trình duyệt ──HTTPS──▶ Cloudflare ──▶ Nginx (aaPanel) ──HTTP──▶ gainee-web (next start, 127.0.0.1:PORT)
                                                                   │  đọc/ghi
                                                                   ▼
                                       gainee-worker (dist/worker.js) ◀──▶ MySQL ◀── bảng jobs (hàng đợi)
                                         └─ dist/speech.js (Whisper, tiến trình con, nice 19)
File tải lên: UPLOAD_DIR (ảnh, PDF sách, audio, clip câu nghe)
```

- **Web** chỉ trả trang và API. Việc nặng (sinh bài học bằng AI, đọc sách IELTS, nghe bằng Whisper, cắt audio)
  được đưa vào bảng `jobs`; **worker** lấy ra làm lần lượt, ghi tiến độ, thử lại tối đa vài lần.
- **Middleware** (`src/middleware.ts`) chạy trước mọi request: kiểm tra chữ ký phiên, chặn trang/API theo vai trò,
  và gắn `x-user-id` / `x-user-role` / `x-user-sv` vào request (xoá giá trị client tự gửi). Không dùng rewrite
  (sau Nginx, Next.js tự coi mình là `https://localhost` và rewrite bị lỗi 500); trang chủ tự hiện landing khi
  chưa đăng nhập.
- **Ai đang làm việc?** `lib/actor.ts`: trong web lấy từ header do middleware gắn; trong worker lấy từ `job.userId`
  (bọc bằng AsyncLocalStorage). Mọi truy vấn dữ liệu riêng gọi `myId()` (`lib/owner.ts`).

---

## 4. Người dùng, quyền, dữ liệu riêng

- **Tài khoản** trong bảng `users`: email (hoặc tên đăng nhập với admin đầu tiên), mật khẩu scrypt, vai trò,
  công tắc tính năng riêng, số credit, khoá, `session_version` (đổi mật khẩu/khoá → mọi phiên cũ hết hiệu lực).
  Người dùng tự đổi/thêm email (xác nhận bằng mật khẩu) ở trang Hồ sơ.
- **Admin đầu tiên**: lần đăng nhập đầu bằng `APP_USERNAME` / `APP_PASSWORD_HASH` trong `.env` khi chưa có tài khoản
  nào; dữ liệu thời một người dùng được chuyển cho admin đó (`claimOrphans`).
- **Vai trò**: `student` (học viên), `editor` (biên tập: nhập sách IELTS, duyệt kho nghe), `admin` (toàn quyền,
  không bị trừ credit). Chặn ở middleware (`needs()`), kiểm tra lại trong route (`requireRole`).
- **Tính năng bật/tắt** (`lib/users.ts`, `FEATURES`): các tác vụ AI, ảnh AI, tự thêm bài đọc.
  Thứ tự ưu tiên: công tắc riêng của người dùng → nhóm (một nhóm bật là đủ) → mặc định theo vai trò.
- **Nhóm học viên** (`learner_groups`, `user_groups`): bật/tắt tính năng cho cả nhóm, chọn bài đọc cho nhóm xem.
- **Dữ liệu riêng** (có `user_id`): sổ từ, ôn tập, nhãn, bộ từ, bài viết, lượt làm bài, ghi chú, câu hỏi AI,
  mục tiêu, XP, chuỗi ngày, huy hiệu, chat, hồ sơ học, tiến độ bài học (`lesson_progress`), tiến độ câu nghe
  (`listen_progress`, `listen_positions`).
- **Dữ liệu chung**: sách IELTS, kho nghe, từ điển. **Bài đọc** thuộc người tạo, có chế độ hiển thị
  riêng tư / mọi học viên / nhóm được chọn (`docVisible`); chỉ chủ bài hoặc admin sửa được.
- **Quên mật khẩu**: link một lần, 30 phút, chỉ lưu hash của token; câu trả lời như nhau dù email có tồn tại hay không.

---

## 5. AI và credit

- **Một client** (`lib/ai/client.ts`) cho mọi nhà cung cấp dạng OpenAI: chọn nhà cung cấp + model theo từng tác vụ
  (`ai.routing`), có model dự phòng, chế độ JSON, trả lời dạng stream cho khung đọc và chat. API key lưu mã hoá
  AES-256-GCM (`ENCRYPTION_KEY`), trình duyệt chỉ thấy bản che.
- **Trước mỗi lượt gọi** (`gate` + `limit`): tài khoản còn mở, tính năng được bật, còn credit (trừ admin), chưa vượt
  giới hạn của admin (số lượt/phút, credit/24 giờ, số ký tự vào, số token trả lời).
- **Sau mỗi lượt**: ghi `ai_calls` (token, model, thời gian) và trừ credit theo **giá từng model trên 1 triệu token**
  vào/ra (`credits.config`); stream không có số token nên ước 4 ký tự ≈ 1 token. Việc chạy nền tính cho người đã
  bấm chạy.
- **Nạp credit**: các gói hoặc tự nhập số tiền (từ mức tối thiểu), mã giảm giá; mã quà cộng credit ngay; credit tặng
  khi đăng ký.

---

## 6. Các khu vực chính

| Khu vực | Làm gì | File chính |
|---|---|---|
| Thư viện, bài học | Dán bài/tải PDF/Word → làm sạch → chia phần → AI sinh từ vựng, bài tập, câu hỏi kiểu IELTS (job `generate_document`) | `lib/documents/*`, `lib/lessons/generate.ts`, `components/lesson/*` |
| Khung đọc | Tra từ, highlight, ghi chú, hỏi AI về câu/từ, đo tốc độ đọc | `components/lesson/*`, `api/ai/ask` |
| Sổ từ, ôn tập | Lưu từ (kèm ảnh), ôn FSRS nhiều kiểu (nhận diện, nhớ lại, điền, nghe, ảnh), viết câu được AI chấm | `lib/review.ts`, `lib/words.ts`, `lib/learn.ts` |
| IELTS | Tải sách PDF + audio → đọc trang scan bằng Tesseract (AI chỉ đọc trang không rõ), tìm mốc Part (Moonshine, AI khi thiếu) → tách đề, nhóm câu, đáp án (job `ielts_import`) → biên tập viên duyệt (có "Tạo ô trả lời bằng AI") → học viên làm đề như thi máy, chấm band | `lib/ielts/import.ts`, `lib/ielts/score.ts`, `components/ielts/*` |
| Kho nghe (dictation) | Video YouTube (phụ đề) và phần nghe IELTS (Whisper khớp với transcript) → tách câu, căn thời gian → chép chính tả, ôn câu sai; clip cắt sẵn cho nhanh | `lib/listen/*`, `worker/speech.ts`, `components/listen/*` |
| Writing | Task 1/2, dịch câu; AI ra đề và chấm band theo tiêu chí | `lib/writing.ts` |
| Trợ lý AI | Chat về bài đang học | `api/ai/chat`, `components/AssistantChat.tsx` |
| Từ điển | Từ điển offline (StarDict) nhập bằng script | `lib/dictionary/*`, `scripts/import-dictionary.ts` |
| Tiến độ | Chuỗi ngày, XP, mục tiêu ngày/tuần, huy hiệu, biểu đồ | `lib/stats.ts`, `lib/goals.ts`, `lib/activity.ts` |

**Định dạng câu điền từ IELTS** (`lib/ielts/types.ts`): chỗ trống `[[7]]`; `# ` tiêu đề; `- ` gạch đầu dòng,
`  - ` gạch đầu dòng con; `- Nhãn: chữ` (hiện 2 cột); `Nhãn: chữ` cho form; bảng `| a | b |` mỗi hàng một dòng,
nhiều dòng trong một ô nối bằng `<br>`. Hiển thị bằng `parseTable` / `parseBullets` (`components/ielts/Questions.tsx`).

---

## 7. Thanh toán SePay

1. Học viên chọn mức nạp → tạo yêu cầu trong `topups` với mã **tiền tố + 8 ký tự ngẫu nhiên** (vd `GNK7Q2M9XA`).
2. Trang hiện VietQR (`vietqr.app/img`) có sẵn số tiền và mã, tự kiểm tra trạng thái mỗi 5 giây; người dùng huỷ được.
3. SePay gọi `POST /api/payments/sepay`; Gainee nhận nếu khớp **HMAC-SHA256** (chữ ký ≤ 5 phút) **hoặc API Key**,
   tìm mã trong nội dung chuyển khoản, chống trùng theo `id` của SePay (bảng `payments`), chuyển yêu cầu
   pending → done một lần và cộng credit. Luôn trả `{"success": true}` cho giao dịch đã xem; từ chối thì trả 401
   kèm lý do và ghi log `[sepay] webhook refused`.
4. Thiếu tiền, không có mã, hoặc trả cho yêu cầu người dùng đã huỷ → danh sách "cần xem" của admin.
   Yêu cầu chưa trả tự huỷ sau N giờ (mặc định 24); tiền tới muộn sau khi hết hạn vẫn được cộng.

Cấu hình trên SePay: webhook "có tiền vào" tới `https://<site>/api/payments/sepay`; Cấu trúc mã thanh toán:
tiền tố như trong Gainee, hậu tố "Số và chữ", dài 8.

---

## 8. Bảo mật

- Phiên: JWT ký HS256 (`SESSION_SECRET` ≥ 32 ký tự), cookie httpOnly, SameSite=Lax, Secure ở production.
- Mật khẩu scrypt; giới hạn thử sai theo IP và tổng (đăng nhập, quên mật khẩu, mã quà, đổi email).
- Bí mật lưu trong DB (API key AI, secret Turnstile, mật khẩu SMTP, khoá SePay) đều mã hoá AES-256-GCM, chỉ ghi không đọc.
- Captcha Cloudflare Turnstile cho đăng ký (bật ở Quản trị → Bảo mật); nhật ký đăng nhập; trang tự kiểm tra
  bảo mật (đỏ/vàng/xanh).
- Dữ liệu riêng lọc theo `user_id` ở mọi truy vấn; đã kiểm tra hai tài khoản trên MySQL thật (học viên không thấy
  dữ liệu của người khác).
- Link trong email dựng từ địa chỉ site admin đặt, không từ header của request.

---

## 9. Database

- Tất cả bảng ở `src/db/schema.ts`. Đổi schema → `npm run db:generate` → kiểm tra file SQL sinh ra (nhất là khi
  thêm cột NOT NULL/UNIQUE vào bảng đã có dữ liệu, sửa tay như `0015`) → commit.
- Migration: `0000_init` … `0009_listen_speech` (thời một người dùng), `0010_users_credits`, `0011_per_user`,
  `0012_coupons_security`, `0013_password_resets`, `0014_payments`, `0015_topup_codes`.
- Bảng `settings` (khoá → JSON) giữ cấu hình: `ai.routing`, `ai.images`, `credits.config`, `security.config`,
  `payments.sepay`, `dictionary.tudien`, `worker.heartbeat`, cùng `profile.<user>` và `chat:<user>:<id>`.

## 10. Job nền (`src/worker/handlers.ts`)

`generate_document` (sinh bài học), `ielts_import` (đọc sách), `ielts_fix_scripts`, `ielts_resplit_scripts`,
`ielts_check`, `listen_cut` (cắt phần nghe IELTS vào kho bằng Whisper), `ielts_transcribe` (tạo transcript từ audio),
`listen_clips` (cắt clip câu, dọn clip cũ). Worker ghi `worker.heartbeat` mỗi 30 giây.

## 11. Biến môi trường (`.env`)

`PORT`, `DEFAULT_LOCALE`, `TZ`, `DATABASE_URL`, `DATABASE_POOL_SIZE`, `APP_USERNAME`, `APP_PASSWORD_HASH`
(chỉ dùng cho admin đầu tiên), `SESSION_SECRET`, `ENCRYPTION_KEY`, `UPLOAD_DIR`; tuỳ chọn `COOKIE_SECURE=0`
(chạy http ở máy).

## 12. Lệnh thường dùng

| Việc | Lệnh |
|---|---|
| Chạy ở máy | `npm run dev` và `npm run dev:worker` |
| MySQL offline | `docker compose -f docker-compose.dev.yml up -d` (`DATABASE_URL=mysql://root:devroot@127.0.0.1:3307/gainee`) |
| Kiểm tra | `npx tsc --noEmit`, `npm run lint`, `npx next build` |
| Migration | `npm run build:scripts && npm run db:migrate` |
| Deploy trên server | `cd /www/wwwroot/gainee && bash scripts/deploy.sh` (lấy code → cài → build → migrate → PM2 reload → kiểm tra) |
| Log | `pm2 logs gainee-web`, `pm2 logs gainee-worker` |

## 13. Kiểm thử và hạn chế đã biết

- Chưa có bộ test tự động. Thay đổi được kiểm bằng typecheck, build, các script tự kiểm (assert) cho phần logic
  (giá credit, quyền, mã giảm giá, phân tích bảng/ghi chú IELTS, mã đơn), và chạy thật trên MySQL Docker + trình duyệt.
- `deploy.sh` luôn chạy `npm ci` (cài lại toàn bộ thư viện) nên deploy chậm; có thể chỉ cài khi `package-lock.json` đổi.
- Ước lượng token cho câu trả lời dạng stream (4 ký tự ≈ 1 token).
- Ảnh tải lên được phục vụ cho mọi người đã đăng nhập nếu biết đường dẫn (đường dẫn chứa UUID ngẫu nhiên).
- Sách IELTS nhập trước khi có quy tắc bảng/gạch đầu dòng mới nên sửa lại bằng nút "Tạo ô trả lời bằng AI".
- `AGENTS.md` viết từ thời một người dùng: phần Auth, dữ liệu và API đã cũ, xem tài liệu này cho hiện trạng.
