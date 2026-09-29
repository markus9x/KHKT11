# MIND MATH — Không gian Toán học khoa học (desktop)

Workspace toán học tương tác kiểu GeoGebra: đại số, hình học phẳng quan hệ,
đồ thị 2D/3D, lượng giác, bảng, trang tính và trợ lý AI **Markus** — sản phẩm gốc
**Mind Math**, không dùng bất kỳ thương hiệu/logo bên ngoài nào.

## Chạy thử (không cần build)

Mở trực tiếp bằng trình duyệt desktop:

- `mind-math/index.html` — nhấp đúp hoặc kéo vào Chrome/Edge, **hoặc**
- chạy server tĩnh: `npx serve mind-math` rồi mở URL hiển thị.

Không cần build, không cần cài đặt. Trạng thái workspace lưu ở `localStorage`.
Duy nhất 1 CDN ngoài: KaTeX (công thức đẹp) — mất mạng vẫn chạy đầy đủ nhờ
fallback render nội bộ.

## Cấu trúc

| File | Vai trò |
|---|---|
| `mind-math/index.html` | Khung workspace: header (Dark/Light + undo/redo), rail icon, panel đại số (ô nhập + xem trước công thức + bàn phím), panel công cụ 2 tab 2D/3D, sân khấu 2D/3D, feature cards, panel trợ lý + panel phải, sóng đáy |
| `mind-math/styles.css` | Theme tím-indigo + `body[data-theme]`: Light = đồ thị nền trắng, Dark = nền đen; vuông góc kiểu GeoGebra, bo tròn chọn lọc; style cho theme-switch, mode-switch 2D/3D, view3d-bar, toolbar góc |
| `mind-math/app.js` | Parser (unicode, `!`, `logb`, `nroot`, `ans`, bất phương trình) + engine 2D (pan/zoom/trace, marching squares) + engine 3D (mặt, khối, Net/khai triển, giao mặt, đo 3D) + hình học phẳng quan hệ (slider, conic5, biến hình) + vẽ dần + lượng giác + Markus + bảng/trang tính + undo/redo |

## Tính năng chính (tiếng Việt)

- **Header:** wordmark Mind Math, badge Workspace, **☀ Light / 🌙 Dark**, undo/redo, Chia sẻ, Trình bày.
- **Dark / Light mode:** Light = CENTER STAGE nền **trắng**, Dark = nền **đen**; lưu vào localStorage, đổi cả Canvas + HUD + toolbar.
- **Trung tâm 2D/3D:** nút chuyển **2D | 3D** góc trái đồ thị; toolbar dọc **góc phải-dưới** (con trỏ, ±zoom, fullscreen, home, cài đặt); HUD tọa độ + tỉ lệ; trace f(x).
- **2D:** lưới, trục, nhãn, đường cong glow, điểm, `x=c`, ẩn `f(x,y)=0`, bất phương trình tô miền, đoạn/tia/véc-tơ, đa giác, cônic, góc, thanh trượt tham số.
- **3D (cảm hứng GeoGebra 3D open-source):** hệ trục Oxyz màu (x đỏ, y xanh lá, z xanh dương), lưới nền Oxy, mặt `z=f(x,y)` tô sáng Lambert + lưới mesh, điểm 3D có chân chiếu, đường cong 2D dựng trên mặt `y=0`, đường mức trên nền. Kéo để xoay orbit, lăn chuột zoom, Shift+kéo để di chuyển, nút Góc chuẩn / Top / Lưới / Xoay tự động, chỉnh chi tiết 3D trong Cài đặt.
- **Rail trái:** Đại số · Công cụ · Bảng · Trang tính · **Lượng giác** · **Markus AI** · Cài đặt.
- **Markus — trợ lý AI (điểm đột phá):** chat tiếng Việt ngay trong panel, thấy toàn bộ bối cảnh đồ thị (đối tượng, hàm đang chọn, góc α). Dán **bất kỳ API key nào** (Google, OpenAI, Grok, DeepSeek, OpenRouter…) là trả lời ngay — Google đi **Gemini native** (`generativelanguage.googleapis.com`, header `x-goog-api-key`, model mặc định `gemini-3.6-flash`), các hãng khác đi chuẩn **OpenAI** (`/chat/completions`, header Bearer, đổi máy chủ/endpoint/model trong ⚙, key `sk-`/`xai-` tự nhận máy chủ). Markus **tự vẽ lên đồ thị** qua khối ` ```mm ...``` ` (mỗi dòng 1 biểu thức). Mất mạng/key lỗi → **Markus offline** (engine toán nội bộ: phân tích nghiệm/cực trị + đánh dấu điểm, lượng giác, vẽ mẫu 3D, đố vui) nên demo KHKT không bao giờ chết. Key lưu ở `localStorage` — **xóa key trước khi public code**.
- **Đường tròn lượng giác (R=1):** điểm M(cos α, sin α), cung α, hình chiếu sin/cos, trục tan (x=1) / cot (y=1), tam giác vuông, dấu 4 phần tư, sóng mini **sin/cos** (chuyển được), nhập **độ + radian song song (live)**, góc đặc biệt 0°–315° + dạng chính xác (π/6, √2/2…), quay tự động, kéo trực tiếp trên vòng tròn, nút **Vẽ dần vòng tròn**, nút vẽ riêng sin(x) / cos(x) lên đồ thị chính.
- **Panel phải:** Hướng dẫn nhanh, Tính năng nổi bật, Gợi ý khám phá 2D (thu gọn/mở được).
- **Công cụ dựng hình:** nhóm **Hình 3D · 3D** (mặt cong, khối cơ bản, hình phẳng, điểm 3D — nhấp là vẽ + tự chuyển sang 3D) nằm trên nhóm Chỉnh sửa.
- **Ô nhập lệnh (panel Đại số):** gợi ý `2D: x^2-2… · 3D: z=x^2+y^2…`, nút `+` / `✕` / `⏎` bo tròn, **xem trước công thức live**, bàn phím 5 tab (123 / f(x) / ABC / #&¬ / 3D) + popup Hy Lạp.
- **Sóng đáy:** tắt được trong Cài đặt.

## Ví dụ nhập liệu

- 2D: `x^2 - 2`, `x^3 - 3*x`, `sin(x)`, `sqrt(4 - x^2)`, `0.5*x + 1`
- `(2,3)` — điểm · `x = 2` — đường đứng · `x^2 + y^2 = 9` — đường tròn
- 3D mặt cong: `z = x^2 + y^2` (paraboloid), `z = sin(sqrt(x^2+y^2))` (sóng tròn), `z = x*y/4` (yên ngựa), `(1,2,3)` — điểm 3D
- 3D khối cơ bản: `cube(3)` lập phương, `box(4,3,2)` hộp chữ nhật, `sphere(2)` hình cầu, `cyl(1.5,3)` hình trụ, `cone(1.8,3)` hình nón, `pyramid(3,3)` hình chóp tứ giác
- 3D hình phẳng (nền z=0): `square(3)` hình vuông, `rect(4,2.5)` hình chữ nhật, `disk(2)` hình tròn, `tri(3)` tam giác đều
- Nhân ẩn: `2x`, `2(x+1)` · Hằng: `pi`, `e` · `ans` (kết quả trước) · Hàm: `sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs exp ln log logb nroot` · Giai thừa `5!` · Bất phương trình: `x^2+y^2<9` (tô miền)

## Công cụ dựng hình (59 tool 2D + 45 tool 3D quan hệ)

- **2D (giữ nguyên):**
- **Cơ bản:** Di chuyển, Điểm mới, Thanh trượt, Giao điểm, Cực trị, Nghiệm, Hồi quy.
- **Điểm:** Điểm thuộc đối tượng, Dính/Hủy dính, Số phức, Danh sách.
- **Đường:** Đoạn thẳng, Đường thẳng, Tia, Véc-tơ, Đoạn cố định, Véc-tơ từ điểm.
- **Dựng hình:** Trung điểm, Vuông góc, Trung trực, Song song, Phân giác, Tiếp tuyến, Quỹ tích.
- **Đường tròn:** Tròn tâm+điểm, Compa, Bán nguyệt, Tròn qua 3 điểm, Cung, Cung 3 điểm, Quạt, Quạt 3 điểm.
- **Cônic:** Elíp, Parabôn, Hypebôn, Cônic 5 điểm.
- **Đa giác:** Đa giác, Đa giác đều, Đa giác véc-tơ, Đa giác có hướng (lưu CW/CCW).
- **Đo:** Góc, Góc cố định, Khoảng cách, Diện tích, Hệ số góc.
- **Biến hình:** ĐX qua đường, ĐX qua điểm, Tịnh tiến, Quay, Vị tự, ĐX điểm qua đường.
- **Chỉnh sửa:** Chọn, Kéo nền, Xóa, Hiện/ẩn, Tên, Chép kiểu. **Media:** Chữ, Ảnh.
- Mọi tool tạo object thật (undo/redo, save/load, kéo điểm gốc cập nhật qua `parents/def`).
- **Quỹ tích là đường lấy mẫu (sampled polyline, 60–240 điểm), không phải symbolic exact** — driver phải là điểm dính trên đoạn/tròn/cung.
- **3D Construction Engine (tab Công cụ → 3D, 45 tool, 9 nhóm):**
- **Cơ bản:** Di chuyển (orbit), Điểm 3D (snap + Alt+kéo nâng Z), Điểm thuộc 3D, Trung điểm 3D.
- **Đường:** Đoạn / Đường / Tia / Véc-tơ / Véc-tơ từ điểm / Song song / Vuông góc 3D, Đa giác 3D (Enter chốt).
- **Mặt phẳng:** qua 3 điểm (kèm phương trình ax+by+cz+d=0), song song, vuông góc — preview translucent.
- **Tròn & cầu:** tròn tâm+điểm / tâm+R / qua 3 điểm; cầu tâm+điểm / tâm+R — orientation thật (basisU/V).
- **Khối quan hệ:** lập phương, tứ diện đều, lăng trụ, chóp, trụ, nón, đùn — kéo điểm gốc là khối cập nhật.
- **Net / Khai triển:** mở/gập khối có animation + slider + nút ▶/⟲ (lập phương, chóp, lăng trụ, tứ diện).
- **Giao 2 mặt:** MP∩MP→đường, MP∩Cầu→tròn/điểm, Cầu∩Cầu→tròn/điểm, MP∩Khối→đa giác — object thật, tự cập nhật.
- **Đo 3D** (chung nhóm Giao & Đo): khoảng cách, góc, diện tích, thể tích — nhãn realtime trên sân khấu.
- **Mặt cong mẫu:** paraboloid, sóng tròn, yên ngựa vẽ 1 chạm.
- **Biến hình 3D:** tịnh tiến, ĐX qua mặt/điểm, quay quanh đường (animation 0→θ), vị tự.
- **Edit/View:** chọn, xóa, hiện/ẩn, tên, chép kiểu, camera chính diện (cinematic), Top/Trước/Phải/Iso, Focus, Demo WOW.
- Lệnh text 3D: `line3d / seg3d / ray3d / vec3d / plane3d / circle3d / sphere3d / poly3d / cube3 / tetra3 / cyl3 / cone3` (+ Markus offline hiểu "tạo hình chóp / mặt phẳng / mặt cầu / giao / khai triển").

## Ghi chú kỹ thuật

- Toàn bộ logic nằm trong 1 file `app.js` (IIFE duy nhất, `state` toàn cục) — cố ý giữ
  đơn giản để mở là chạy, không build. Đánh đổi: file lớn, chưa có test/CI.
- Vẽ lại toàn bộ mỗi frame (không cache hình học) — máy yếu nên giảm Chi tiết 3D.
- Key Gemini chỉ lưu ở `localStorage` trình duyệt — **xóa key trước khi public code**.
