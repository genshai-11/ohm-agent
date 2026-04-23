# OHM Agent - Core Philosophy & Memory

Tài liệu này định nghĩa triết lý cốt lõi của OHM Agent, đóng vai trò là bộ nhớ nhận thức (core memory) để Agent hiểu đúng nhiệm vụ của mình khi bóc tách dữ liệu. Tài liệu này dành cho Agent và Developer, không hiển thị cho End-user.

## 1. Mục đích thật sự đằng sau của OHM Agent là gì?
Vượt xa việc chỉ "khớp chuỗi" (regex matching) vô tri, OHM Agent là một hệ thống **đánh giá ngữ nghĩa có khả năng suy luận (reasoning)** và **truy hồi ký ức (memory-orchestrated)**. Mục đích cốt lõi là thấu hiểu *"sắc thái" (nuance)* của giao tiếp tiếng Việt tự nhiên — từ các cụm từ mở đầu câu (GREEN), khung câu nền tảng (BLUE), đến thành ngữ thâm thúy (RED). Nó không chỉ chấm điểm, mà phải **lý giải được quyết định** và **tự học từ feedback** của con người để ngày càng tinh tế hơn.

## 2. OHM và "R" thật sự là gì?
Trong vật lý, OHM là đơn vị đo điện trở (R - Resistance). 
Trong hệ thống này, **R là sự cản trở (Resistance) khi dịch một câu/cụm từ từ tiếng Việt sang tiếng Anh**.
- Những câu nói giao tiếp thông thường, dịch word-by-word dễ dàng -> R thấp (ít cản trở).
- Những cụm từ lóng, thành ngữ, quán ngữ, cấu trúc đặc thù của tiếng Việt (rất khó dịch sát nghĩa sang tiếng Anh mà vẫn giữ được cái hồn) -> R cao (cản trở lớn).

**Nhiệm vụ tối thượng của Agent:** Đi tìm những cụm từ có "độ cản trở dịch thuật cao" này để bóc tách và gán nhãn. Bỏ qua những từ vựng cơ bản, dễ dịch.

*(Lưu ý kỹ thuật: Trong công thức tính điểm cuối cùng ở backend, hệ số `responseCoefficient` cũng dùng chữ R để đánh giá tốc độ phản xạ/reaction delay của user, nhưng bản chất triết lý sâu xa của khái niệm OHM để bóc tách từ vựng chính là độ cản trở dịch thuật).*

## 3. Có thật sự hiểu cách cho điểm không?
Cách cho điểm của OHM là một **ma trận 3 chiều**:
`Total OHM = Base × Length × Response_Coefficient`
- **Base (Chất lượng - Độ cản trở):** Tổng trọng số của các nhãn (RED=9, BLUE=7, GREEN=5, PINK=3). Đánh giá độ phong phú và độ khó dịch của từ vựng.
- **Length (Cấu trúc):** Hệ số thưởng (1.0 đến 2.5) dựa trên độ dài và số câu. Thưởng cho việc diễn đạt ý tưởng phức tạp.
- **Response Coefficient (Tốc độ):** Hệ số phạt (1.0 xuống 0.33) nếu phản xạ chậm. Trừng phạt sự ấp úng.

## 4. Q&A: Khả năng học hỏi và Bộ nhớ của Agent

**Q: Agent có thật sự học được từ feedback?**
- **Trong phiên bản UI/Frontend hiện tại:** **KHÔNG học realtime**. Component `FeedbackPanel.tsx` hiện tại chỉ đang *mô phỏng (simulate)* luồng UI. Khi bấm Submit, nó chỉ in ra `console.log` chứ chưa thực sự ghi đè vào file `database.ts` hay gọi API lưu trữ.
- **Trong kiến trúc thực tế (Production với Cloud Run + Firestore):** **CÓ**. Khi user submit feedback, dữ liệu sẽ được ghi vào collection `ohm_feedback_events`. Một luồng backend sẽ cập nhật lại collection `ohm_memory_entries` (tăng `supportCount` hoặc `rejectCount`). Ở các request tiếp theo, Agent sẽ kéo dữ liệu mới nhất từ DB này lên làm Memory, từ đó "học" được cách không lặp lại lỗi sai cũ.

**Q: Agent đang có bộ nhớ rõ ràng về DB không?**
- **CÓ, nhưng thông qua cơ chế RAG (Retrieval-Augmented Generation) chứ không phải học thuộc lòng vào model weights.**
- **Cách hoạt động (xem `agentService.ts`):**
  1. Trước khi gọi LLM, code sẽ quét chuỗi Transcript để tìm các từ khớp với `KNOWN_PHRASES` trong DB.
  2. Các từ khớp này được nhét thẳng vào Prompt dưới dạng `[Memory Assist] Potential matches found in validated database...`.
  3. LLM (Gemini) đọc Prompt này, nó "nhìn thấy" bộ nhớ DB được mớm cho nó. Nó dùng khả năng suy luận để quyết định xem có nên dùng gợi ý từ DB không (ví dụ: DB gợi ý chữ "ói", nhưng LLM đọc ngữ cảnh thấy chữ "nói" nên nó tự động bỏ qua gợi ý sai này).
  4. Ở bước hậu xử lý (Post-processing), code có logic `isMatchedInDb` để ưu tiên giữ lại các nhãn PINK có mặt trong DB khi bị vượt quá giới hạn số lượng.
- **Kết luận:** Agent có bộ nhớ rất rõ ràng về DB trong từng request cụ thể, và nó kết hợp bộ nhớ cứng (DB) với tư duy mềm (LLM) để ra quyết định cuối cùng.
