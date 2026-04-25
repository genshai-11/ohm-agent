# OHM Agent - Pipeline Runbook

Tài liệu này mô tả chi tiết luồng thực thi (Execution Pipeline) hiện tại của OHM Agent, từ lúc nhận đầu vào (Transcript) cho đến khi trả ra kết quả chấm điểm cuối cùng (OHM Score). 

Luồng này được cài đặt chính trong file `services/agentService.ts`.

---

## 1. Tổng quan kiến trúc (Architecture Overview)
OHM Agent sử dụng mô hình **RAG (Retrieval-Augmented Generation)** kết hợp với **Self-Check (Tự kiểm duyệt)** để đảm bảo độ chính xác cao nhất, tránh tình trạng LLM bị ảo giác (hallucination) hoặc bóc tách sai ranh giới từ.

**Các thành phần chính:**
- **Input:** Transcript (văn bản tiếng Việt), Reaction Delay (thời gian phản xạ).
- **Memory (Database):** Tập hợp các cụm từ đã được xác thực (`database.ts`).
- **LLM Engine:** Google Gemini 2.5 Flash.
- **Scoring Engine:** Thuật toán tính điểm dựa trên Base, Length và Response Coefficient.

---

## 2. Chi tiết các bước trong Pipeline (Execution Steps)

### Bước 1: Khởi tạo & Nhận Request
- Hệ thống nhận `AgentRequest` bao gồm: `transcript` (câu nói của user), `reactionDelayMs` (độ trễ phản xạ), và các `flags` (như `useMemoryAssist`, `returnDebug`).

### Bước 2: Truy hồi Ký ức (Memory Retrieval - RAG)
- Hệ thống quét nhanh (scan) `transcript` để đối chiếu với cơ sở dữ liệu `KNOWN_PHRASES` (nằm trong `database.ts`).
- Nếu tìm thấy các chuỗi khớp (substring match), hệ thống sẽ gom chúng lại thành một danh sách **Memory Hints** (Gợi ý ký ức).
- *Lưu ý:* Bước này có thể bắt nhầm (false positive, ví dụ: chữ "ói" nằm trong chữ "nói"). Việc lọc lỗi này sẽ được giao cho LLM ở bước tiếp theo.

### Bước 3: Suy luận & Phân loại (LLM Detection & Reasoning)
- Hệ thống đóng gói `transcript` và `Memory Hints` (nếu có) cùng với `SYSTEM_PROMPT` (chứa định nghĩa nhãn, triết lý R - Cản trở dịch thuật, và Few-shot examples).
- Gửi toàn bộ gói này cho **Gemini 2.5 Flash**.
- LLM phân tích ngữ cảnh, loại bỏ các Memory Hints sai (false positives), bóc tách chính xác các khung câu (BLUE) và trả về một mảng JSON chứa các `chunks` (cụm từ, nhãn, độ tự tin, lý do).

### Bước 4: Tự kiểm duyệt & Lọc (Self-Check & Filtering)
- Parse chuỗi JSON trả về từ LLM.
- Chạy qua bộ lọc (Filter) với các quy tắc cứng (Hard Constraints):
  1. **Exact Substring Rule:** Cụm từ LLM bóc ra *bắt buộc* phải tồn tại chính xác trong `transcript` gốc. Nếu LLM tự bịa ra từ hoặc sửa lỗi chính tả của user -> **Loại (Drop)**.
  2. **Valid Label Rule:** Nhãn phải thuộc tập hợp cho phép (GREEN, BLUE, RED, PINK). Nếu sai -> **Loại (Drop)**.
  3. **Pink Limit Rule (Giới hạn nhãn PINK):** Trong 1 câu không được có quá nhiều nhãn PINK. 
     - Tối đa chọn 2 nhãn. 
     - Nhãn thứ 3 chỉ được chọn nếu độ tự tin (confidence) > 0.90. 
     - Từ nhãn thứ 4 trở đi sẽ bị loại. 
     - *Tiêu chí ưu tiên:* Có mặt trong Database (Memory Match) > Độ tự tin (Confidence).
- Hệ thống tính toán lại `startIndex` và `endIndex` cho từng chunk hợp lệ để phục vụ việc highlight trên UI. Các chunk bị loại sẽ được ghi log vào `dropReasons`.

### Bước 5: Tính điểm (Scoring Engine)
Hệ thống tính toán 3 chỉ số để ra điểm OHM cuối cùng:

1. **Base OHM (Chất lượng từ vựng):**
   - Cộng dồn điểm của các chunks hợp lệ.
   - Trọng số: `GREEN = 3`, `BLUE = 5`, `RED = 7`, `PINK = 9`.

2. **Length Coefficient (Hệ số cấu trúc):**
   - Đếm số từ (`wordCount`) và số câu (`sentenceCount`).
   - Phân loại vào các bucket:
     - `veryShort` (<= 1 câu, <= 25 từ): x1.0
     - `short` (<= 2 câu, <= 35 từ): x1.5
     - `medium` (<= 3 câu, <= 60 từ): x2.0
     - `long` (<= 5 câu, <= 110 từ): x2.5
     - `overLong` (> 5 câu hoặc > 110 từ): x2.5

3. **Response Coefficient (Hệ số phản xạ - R):**
   - Dựa vào `reactionDelayMs`.
   - `<= 2000ms`: x1.0 (Phản xạ xuất sắc).
   - `>= 5000ms`: x0.33 (Phản xạ quá chậm, bị phạt chia 3).
   - Từ `2000ms` đến `5000ms`: Giảm dần tuyến tính (Linear decay).

**Công thức cuối cùng:**
`Total OHM = Base OHM × Length Coefficient × Response Coefficient`

### Bước 6: Trả kết quả (Output Generation)
- Đóng gói toàn bộ dữ liệu thành `AgentResponse` chuẩn API Contract.
- Nếu cờ `returnDebug` = true, đính kèm block `debug` chứa: số lượng chunk thô, lý do drop chunk, số lượng memory hits, và trạng thái self-check.

---

## 3. Xử lý sự cố (Troubleshooting & Debugging)

Khi theo dõi kết quả trên UI hoặc Log, hãy chú ý block **Debug Information**:
- **Drop Reasons:** Nếu thấy LLM liên tục bị drop chunk, hãy đọc lý do ở đây. Thường là do LLM không tuân thủ quy tắc "Exact Substring" (tự ý sửa dấu câu, viết hoa/thường sai so với bản gốc), hoặc do vi phạm quy tắc giới hạn nhãn PINK.
- **Memory Hints Sent:** Nếu số này cao nhưng LLM không nhận diện được chunk nào, có thể `SYSTEM_PROMPT` đang quá khắt khe hoặc LLM đánh giá ngữ cảnh đó không phù hợp với Hint.
- **Pipeline Latency:** Thời gian thực thi toàn bộ luồng (bao gồm gọi API Gemini). Nếu > 4000ms, cần xem xét tối ưu lại Prompt hoặc kiểm tra kết nối mạng tới Google API.