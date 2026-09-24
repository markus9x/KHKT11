# MIND MATH — Không gian Toán học khoa học (desktop)

Giao diện premium thay thế cho ứng dụng web hiện tại, lấy cảm hứng bố cục từ ảnh tham chiếu
(header + rail trái + bảng đại số + mặt phẳng tọa độ trung tâm), nhưng là sản phẩm gốc
**Mind Math** — không dùng bất kỳ thương hiệu/logo bên ngoài nào.

## Chạy thử (không cần build)

Mở trực tiếp bằng trình duyệt desktop:

- `mind-math/index.html` — nhấp đúp hoặc kéo vào Chrome/Edge, **hoặc**
- chạy server tĩnh: `npx serve mind-math` rồi mở URL hiển thị.

Không cần dependency, không cần mạng. Trạng thái workspace lưu ở `localStorage`.

## Cấu trúc

| File | Vai trò |
|---|---|
| `mind-math/index.html` | Khung workspace: header (kèm Dark/Light + undo/redo), rail, panel đại số, sân khấu 2D/3D, command bar, feature cards, panel trợ lý + gợi ý 3D, sóng đáy |
| `mind-math/styles.css` | Theme tím-indigo + `body[data-theme]`: Light = đồ thị nền trắng, Dark = nền đen; style cho theme-switch, mode-switch 2D/3D, view3d-bar |
| `mind-math/app.js` | Engine 2D (pan/zoom/trace, parser, marching squares) + engine 3D (mặt z=f(x,y), điểm 3D, orbit/zoom/pan, tô sáng Lambert), theme/mode, bảng, trang tính, undo/redo |

## Tính năng chính (tiếng Việt)

- **Header:** wordmark Mind Math, badge Workspace, **☀ Light / 🌙 Dark**, undo/redo, Chia sẻ, Trình bày.
- **Dark / Light mode:** Light = CENTER STAGE nền **trắng**, Dark = nền **đen**; lưu vào localStorage, đổi cả Canvas + HUD + toolbar.
- **Trung tâm 2D/3D:** nút chuyển **2D | 3D** góc trái đồ thị; toolbar phải (con trỏ, ±zoom, fullscreen, căn giữa, cài đặt); HUD tọa độ + tỉ lệ; trace f(x).
- **2D:** lưới, trục, nhãn, đường cong glow, điểm, `x=c`, ẩn `f(x,y)=0`.
- **3D (cảm hứng GeoGebra 3D open-source):** hệ trục Oxyz màu (x đỏ, y xanh lá, z xanh dương), lưới nền Oxy, mặt `z=f(x,y)` tô sáng Lambert + lưới mesh, điểm 3D có chân chiếu, đường cong 2D dựng trên mặt `y=0`, đường mức trên nền. Kéo để xoay orbit, lăn chuột zoom, Shift+kéo để di chuyển, nút Góc chuẩn / Top / Lưới / Xoay tự động, chỉnh chi tiết 3D trong Cài đặt.
- **Rail trái:** Đại số · Công cụ · Bảng · Trang tính · **Lượng giác** · **Markus AI** · Cài đặt.
- **Markus — trợ lý AI (điểm đột phá):** chat tiếng Việt ngay trong panel, thấy toàn bộ bối cảnh đồ thị (đối tượng, hàm đang chọn, góc α). Gọi **Gemini native** (`generativelanguage.googleapis.com`, header `x-goog-api-key` — key `AQ.` thế hệ mới bắt buộc đi đường này, model mặc định `gemini-3.6-flash`, đổi được trong ⚙). Markus **tự vẽ lên đồ thị** qua khối ` ```mm ...``` ` (mỗi dòng 1 biểu thức). Mất mạng/key lỗi → **Markus offline** (engine toán nội bộ: phân tích nghiệm/cực trị + đánh dấu điểm, lượng giác, vẽ mẫu 3D, đố vui) nên demo KHKT không bao giờ chết. Key lưu ở `localStorage` — **xóa key trước khi public code**.
- **Đường tròn lượng giác (R=1):** điểm M(cos α, sin α), cung α, hình chiếu sin/cos, trục tan (x=1) / cot (y=1), tam giác vuông, dấu 4 phần tư, sóng sin mini, góc đặc biệt 0°–315° + dạng chính xác (π/6, √2/2…), quay tự động, kéo trực tiếp trên vòng tròn, nút vẽ sin(x)/cos(x) và điểm M lên đồ thị chính.
- **Panel phải:** Hướng dẫn nhanh, Tính năng nổi bật, Gợi ý khám phá 2D + **Khám phá 3D ⧉** (nhấp là vẽ + tự chuyển sang 3D).
- **Command bar:** gợi ý `2D: x^2-2… · 3D: z=x^2+y^2…`, nút Thực thi, bàn phím toán học.
- **Sóng đáy:** tắt được trong Cài đặt.

## Ví dụ nhập liệu

- 2D: `x^2 - 2`, `x^3 - 3*x`, `sin(x)`, `sqrt(4 - x^2)`, `0.5*x + 1`
- `(2,3)` — điểm · `x = 2` — đường đứng · `x^2 + y^2 = 9` — đường tròn
- 3D mặt cong: `z = x^2 + y^2` (paraboloid), `z = sin(sqrt(x^2+y^2))` (sóng tròn), `z = x*y/4` (yên ngựa), `(1,2,3)` — điểm 3D
- 3D khối cơ bản: `cube(3)` lập phương, `box(4,3,2)` hộp chữ nhật, `sphere(2)` hình cầu, `cyl(1.5,3)` hình trụ, `cone(1.8,3)` hình nón, `pyramid(3,3)` hình chóp tứ giác
- 3D hình phẳng (nền z=0): `square(3)` hình vuông, `rect(4,2.5)` hình chữ nhật, `disk(2)` hình tròn, `tri(3)` tam giác đều
- Nhân ẩn: `2x`, `2(x+1)` · Hằng: `pi`, `e` · Hàm: `sin cos tan sqrt cbrt abs exp ln log`

## Tích hợp với engine hiện tại

Workspace này là **lớp frontend độc lập**, không sửa core toán của repo nên không gây vỡ build
Gradle/GWT. Điểm tích hợp đề xuất: nhúng applet hiện có (`graphing.html`) vào `.graph-wrap`
qua `<iframe>` khi cần engine đầy đủ, giữ nguyên shell Mind Math bên ngoài.
