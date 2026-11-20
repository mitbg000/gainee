#!/usr/bin/env node
/**
 * Mock OpenAI-compatible AI server for development and tests – no API key, no cost.
 *   node scripts/mock-ai.mjs [port=4010]
 * Then add a provider in Settings: preset "Custom", base URL http://127.0.0.1:4010/v1, any key, model "mock".
 *
 * It recognises ReadLearn's prompts and answers with plausible JSON built from the text itself.
 * The FIRST lesson attempt deliberately contains mistakes (a word that is not in the text and a fake
 * quote) so the validation + retry path is exercised.
 */
import http from "node:http";

const port = Number(process.argv[2] || 4010);
const between = (s, a, b) => (s.includes(a) ? s.slice(s.indexOf(a) + a.length, s.indexOf(b, s.indexOf(a))) : s).trim();
const sentencesOf = (t) => t.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z])/).filter((s) => s.split(" ").length > 6);
const words = (s, n) => s.split(/\s+/).slice(0, n).join(" ");

function lessonJson(text, retry) {
  const sents = sentencesOf(text);
  const seen = new Set();
  const vocab = [];
  for (const w of text.match(/\b[a-z][a-z-]{8,}\b/g) || []) {
    if (seen.has(w) || vocab.length >= 9) continue;
    seen.add(w);
    vocab.push({ headword: w, match: w, ipa: "/ˈmɒk/", pos: "n.", meaningVi: `nghĩa của “${w}”`, definitionEn: `meaning of ${w}`, example: `This is an example with ${w}.`, note: `collocation with ${w}`, cefr: "B2" });
  }
  if (!retry) vocab.push({ headword: "flibbertigibbet", match: "flibbertigibbet", meaningVi: "từ không có trong bài", pos: "n." });
  const s = (i) => sents[i % Math.max(1, sents.length)] || text;
  return {
    title: `Part about “${words(s(0), 4)}…”`,
    titleVi: "Phần bài đọc",
    warmup: "Bạn nghĩ gì về chủ đề này?",
    summary: "Đây là bản tóm tắt giả lập gồm vài câu để kiểm thử. Nội dung tóm tắt ý chính của đoạn văn. Câu thứ ba cho đủ độ dài.",
    vocab,
    tfng: [
      { q: `The text says: ${words(s(0), 8)}…`, answer: "T", evidence: words(s(0), 12), explanation: "Giải thích cho câu đúng." },
      { q: `The text claims the opposite of: ${words(s(1), 8)}…`, answer: "F", evidence: retry ? words(s(1), 12) : "this quote does not exist in the text at all", explanation: "Giải thích cho câu sai." },
      { q: "The writer mentions the weather in Paris.", answer: "NG", evidence: null, explanation: "Bài không đề cập." },
      { q: `Another statement about ${words(s(2), 6)}…`, answer: "T", evidence: words(s(2), 10), explanation: "Giải thích." },
    ],
    mcq: [
      { q: "What is the main idea of the first sentence?", options: ["Option A", "Option B", "Option C", "Option D"], answer: 1, evidence: words(s(3), 10), explanation: "Giải thích MCQ." },
      { q: "Which statement is correct?", options: ["One", "Two", "Three", "Four"], answer: 2, evidence: words(s(4), 10), explanation: "Giải thích MCQ 2." },
    ],
    gaps: vocab.slice(0, 4).map((v) => ({ sentence: `Many students find ______ difficult at first.`, answers: [v.match] })),
    structures: [
      { sentence: s(1), explanation: "Cấu trúc câu hay để học." },
      { sentence: s(2), explanation: "Một cấu trúc khác." },
    ],
    paraphrase: { source: s(0), model: "A model paraphrase of the first sentence." },
    speaking: { question: "Do you think people need coaches to keep improving? Why?", ideas: ["Ý 1", "Ý 2", "Ý 3"], kind: "speaking" },
  };
}

function reply(messages) {
  const sys = messages.find((m) => m.role === "system")?.content || "";
  const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  if (sys.includes("classify reading passages")) {
    return JSON.stringify({ title: null, author: null, level: "C1", summary: "Bài báo bàn về việc người giỏi vẫn cần huấn luyện viên để tiến bộ (bản tóm tắt giả lập).", topics: ["Education", "Health & Medicine", "Coaching"], source: "The New Yorker" });
  }
  if (sys.includes("turns authentic reading passages")) {
    const retry = messages.length > 2;
    return JSON.stringify(lessonJson(between(user, "<text>", "</text>"), retry));
  }
  if (/Reply with exactly: OK/.test(user)) return "OK";
  const sel = (user.match(/Selection: "([^"]+)"/) || [])[1] || "this";
  return `**${sel}** – giải thích giả lập.\n\n- Nghĩa trong ngữ cảnh: …\n- Ví dụ: *${sel} is used here to…*\n- Mẹo IELTS: dùng trong Writing Task 2.`;
}

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    if (req.method === "GET" && req.url.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "mock" }, { id: "mock-large" }] }));
    }
    if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
      res.writeHead(404);
      return res.end("not found");
    }
    const json = JSON.parse(body || "{}");
    const text = reply(json.messages || []);
    await new Promise((r) => setTimeout(r, 300));
    if (json.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const piece of text.match(/.{1,12}/gs) || []) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        await new Promise((r) => setTimeout(r, 20));
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }], usage: { prompt_tokens: Math.round(body.length / 4), completion_tokens: Math.round(text.length / 4) } }));
  })
  .listen(port, "127.0.0.1", () => console.log(`[mock-ai] listening on http://127.0.0.1:${port}/v1`));
