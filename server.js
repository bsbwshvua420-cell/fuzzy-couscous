// ═══════════════════════════════════════════════════════════
// 🔥 BCR VIP SERVER v4.1
// ✦ Dự đoán P / B / HÒA (T)
// ✦ Cảnh báo BẺ CẦU (đảo nhịp)
// ✦ Thuật toán 25 tầng siêu dài
// ✦ Confidence: 52 → 80 (số nguyên, KHÔNG có 0.xx)
// ═══════════════════════════════════════════════════════════

import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ═══════════ CONFIG ═══════════
const API_BASE = "https://fluffy-parakeet-dnxs.onrender.com/api/baccarat/";
const TABLES = [
  ...Array.from({ length: 20 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 14 }, (_, i) => String(i + 1)),
];
const CACHE_TTL = 8000;
const CONF_MIN = 52;   // số nguyên
const CONF_MAX = 80;   // số nguyên

// ═══════════ CACHE ═══════════
const dataCache = new Map();
const predCache = new Map();

function getCache(map, key) {
  const item = map.get(key);
  if (item && Date.now() - item.time < CACHE_TTL) return item.value;
  map.delete(key);
  return null;
}
function setCache(map, key, value) {
  map.set(key, { value, time: Date.now() });
}

// ═══════════ CLAMP CONFIDENCE: số nguyên 52-80 ═══════════
// Nhận vào 0.XX hoặc XX đều chuẩn hóa thành số nguyên XX
function clampConf(v) {
  let n = v;
  if (n <= 1) n = n * 100;        // 0.63 → 63
  n = Math.round(n);               // làm tròn
  return Math.max(CONF_MIN, Math.min(CONF_MAX, n));
}

// ═══════════════════════════════════════════════════════════
// 🧠 ANALYZER - 20 tầng phân tích
// ═══════════════════════════════════════════════════════════
class CauAnalyzer {
  constructor(chuoi) {
    this.chuoi = chuoi;
    this.len = chuoi.length;
  }

  basicInfo() {
    if (this.len < 3) return null;
    const last = this.chuoi[this.len - 1];
    let streak = 1;
    for (let i = this.len - 2; i >= 0; i--) {
      if (this.chuoi[i] === last) streak++;
      else break;
    }
    return { last, streak };
  }

  detect11(length = 8) {
    if (this.len < length) return 0;
    const tail = this.chuoi.slice(-length);
    let ok = 0;
    for (let i = 0; i < tail.length - 1; i++) if (tail[i] !== tail[i + 1]) ok++;
    return ok / (tail.length - 1);
  }

  detect22() {
    if (this.len < 8) return 0;
    const t = this.chuoi.slice(-8);
    const b = [t.slice(0, 2), t.slice(2, 4), t.slice(4, 6), t.slice(6, 8)];
    let s = 0;
    if (b[0] === b[2]) s += 0.5;
    if (b[1] === b[3]) s += 0.5;
    if (b[0] !== b[1]) s += 0.3;
    return Math.min(s, 1);
  }

  detect33() {
    if (this.len < 12) return 0;
    const t = this.chuoi.slice(-12);
    const b = [t.slice(0, 3), t.slice(3, 6), t.slice(6, 9), t.slice(9, 12)];
    let s = 0;
    if (b[0] === b[2]) s += 0.5;
    if (b[1] === b[3]) s += 0.5;
    if (b[0] !== b[1]) s += 0.3;
    return Math.min(s, 1);
  }

  detect44() {
    if (this.len < 16) return 0;
    const t = this.chuoi.slice(-16);
    const b = [t.slice(0, 4), t.slice(4, 8), t.slice(8, 12), t.slice(12, 16)];
    let s = 0;
    if (b[0] === b[2]) s += 0.5;
    if (b[1] === b[3]) s += 0.5;
    if (b[0] !== b[1]) s += 0.3;
    return Math.min(s, 1);
  }

  detect55() {
    if (this.len < 20) return 0;
    const t = this.chuoi.slice(-20);
    const b = [t.slice(0, 5), t.slice(5, 10), t.slice(10, 15), t.slice(15, 20)];
    let s = 0;
    if (b[0] === b[2]) s += 0.5;
    if (b[1] === b[3]) s += 0.5;
    if (b[0] !== b[1]) s += 0.3;
    return Math.min(s, 1);
  }

  detectBet() {
    const info = this.basicInfo();
    if (!info) return { type: null, score: 0, streak: 0 };
    const s = info.streak;
    if (s >= 10) return { type: "BET_ULTRA", score: 1.0, streak: s };
    if (s >= 8) return { type: "BET_EXTREME", score: 0.9, streak: s };
    if (s >= 6) return { type: "BET_LONG", score: 0.75, streak: s };
    if (s >= 4) return { type: "BET_MID", score: 0.55, streak: s };
    if (s >= 3) return { type: "BET_SAFE", score: 0.4, streak: s };
    return { type: null, score: 0, streak: s };
  }

  detectNghieng(window = 20) {
    if (this.len < window) window = this.len;
    const w = this.chuoi.slice(-window);
    let p = 0, b = 0;
    for (const c of w) c === "P" ? p++ : b++;
    const diff = Math.abs(p - b);
    if (diff >= 9) return { huong: p > b ? "P" : "B", do_lech: diff, score: 0.9 };
    if (diff >= 7) return { huong: p > b ? "P" : "B", do_lech: diff, score: 0.75 };
    if (diff >= 5) return { huong: p > b ? "P" : "B", do_lech: diff, score: 0.6 };
    if (diff >= 3) return { huong: p > b ? "P" : "B", do_lech: diff, score: 0.45 };
    return null;
  }

  detectDao() {
    if (this.len < 10) return 0;
    const t = this.chuoi.slice(-10);
    let d = 0;
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) d++;
    return d / (t.length - 1);
  }

  detectDoiXung() {
    if (this.len < 6) return 0;
    const t = this.chuoi.slice(-6);
    const r = t.split("").reverse().join("");
    let m = 0;
    for (let i = 0; i < 6; i++) if (t[i] === r[i]) m++;
    return m / 6;
  }

  detectChuKy(maxLen = 8) {
    if (this.len < 18) return { len: 0, score: 0 };
    for (let L = 2; L <= maxLen; L++) {
      if (this.len < L * 3) continue;
      const a = this.chuoi.slice(-L * 3, -L * 2);
      const b = this.chuoi.slice(-L * 2, -L);
      const c = this.chuoi.slice(-L);
      if (a === b && b === c) return { len: L, score: 0.95 };
      if (a === b && b === c.slice(0, L)) return { len: L, score: 0.8 };
      if (a === b || b === c) return { len: L, score: 0.6 };
    }
    return { len: 0, score: 0 };
  }

  detect212() {
    if (this.len < 5) return 0;
    const t = this.chuoi.slice(-5);
    if (t[0] === t[1] && t[2] !== t[1] && t[3] === t[4] && t[3] !== t[2]) return 0.75;
    return 0;
  }

  detect121() {
    if (this.len < 4) return 0;
    const t = this.chuoi.slice(-4);
    if (t[0] !== t[1] && t[1] === t[2] && t[2] !== t[3] && t[0] === t[3]) return 0.7;
    return 0;
  }

  detect131() {
    if (this.len < 5) return 0;
    const t = this.chuoi.slice(-5);
    if (t[0] !== t[1] && t[1] === t[2] && t[2] === t[3] && t[3] !== t[4] && t[0] === t[4]) return 0.72;
    return 0;
  }

  detect313() {
    if (this.len < 7) return 0;
    const t = this.chuoi.slice(-7);
    if (t[0] === t[1] && t[1] === t[2] && t[3] !== t[2] && t[4] === t[5] && t[5] === t[6] && t[4] !== t[3]) return 0.78;
    return 0;
  }

  daoDong(window = 10) {
    const w = Math.min(window, this.len);
    const t = this.chuoi.slice(-w);
    let c = 0;
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) c++;
    return {
      so_lan_doi: c,
      ty_le_doi: +(c / Math.max(t.length - 1, 1)).toFixed(3),
      on_dinh: c <= Math.floor(t.length / 3),
      bien_dong: c >= Math.floor(t.length * 0.7),
    };
  }

  canBang(window = 20) {
    const w = Math.min(window, this.len);
    const t = this.chuoi.slice(-w);
    let p = 0, b = 0;
    for (const c of t) c === "P" ? p++ : b++;
    return { p, b, tong: w, chenh: Math.abs(p - b) };
  }

  trend() {
    if (this.len < 15) return 0;
    const l5 = this.chuoi.slice(-5);
    const l15 = this.chuoi.slice(-15);
    let p5 = 0, b5 = 0, p15 = 0, b15 = 0;
    for (const c of l5) c === "P" ? p5++ : b5++;
    for (const c of l15) c === "P" ? p15++ : b15++;
    const t5 = p5 > b5 ? "P" : "B";
    const t15 = p15 > b15 ? "P" : "B";
    return t5 === t15 ? 0.65 : 0.35;
  }

  detectHoa() {
    let score = 0;
    const reasons = [];
    const cb = this.canBang(20);
    if (cb.tong >= 15 && cb.chenh <= 1) {
      score += 0.25;
      reasons.push("cân bằng 20 tay");
    }
    const dd = this.daoDong(12);
    if (dd.ty_le_doi >= 0.85) {
      score += 0.2;
      reasons.push("dao động cực mạnh");
    }
    if (this.len >= 8) {
      const t = this.chuoi.slice(-8);
      const r = t.split("").reverse().join("");
      let m = 0;
      for (let i = 0; i < 8; i++) if (t[i] === r[i]) m++;
      if (m >= 7) {
        score += 0.2;
        reasons.push("đối xứng cao");
      }
    }
    if (this.len >= 12) {
      const t = this.chuoi.slice(-12);
      const runs = [];
      let cur = 1;
      for (let i = 1; i < t.length; i++) {
        if (t[i] === t[i - 1]) cur++;
        else { runs.push(cur); cur = 1; }
      }
      runs.push(cur);
      const allShort = runs.every((r) => r <= 2);
      const mixed = new Set(runs).size >= 2;
      if (allShort && mixed && runs.length >= 6) {
        score += 0.15;
        reasons.push("nhịp ngắn hỗn hợp");
      }
    }
    if (this.detect11(10) >= 0.9) {
      score += 0.1;
      reasons.push("cầu 1-1 dài");
    }
    return { score: Math.min(score, 1), reasons };
  }

  detectBeCau() {
    let score = 0;
    const reasons = [];
    const info = this.basicInfo();
    if (!info) return { score: 0, reasons: [] };
    const s = info.streak;

    if (s >= 10) { score += 0.4; reasons.push(`bệt cực dài ${s}`); }
    else if (s >= 8) { score += 0.3; reasons.push(`bệt dài ${s}`); }
    else if (s >= 6) { score += 0.2; reasons.push(`bệt ${s}`); }
    else if (s >= 4) { score += 0.1; reasons.push(`bệt ${s}`); }

    const cb = this.canBang(20);
    if (cb.tong >= 15 && cb.chenh >= 8) {
      score += 0.2;
      reasons.push(`lệch ${cb.chenh}`);
    }
    const ng = this.detectNghieng(20);
    if (ng && ng.score >= 0.85) {
      score += 0.15;
      reasons.push(`nghiêng ${ng.huong} lệch ${ng.do_lech}`);
    }
    const ck = this.detectChuKy(8);
    if (ck.score >= 0.8) {
      const pos = this.len % ck.len;
      if (pos === ck.len - 1) {
        score += 0.15;
        reasons.push(`chu kỳ ${ck.len} kết thúc`);
      }
    }
    if (this.detect11(10) >= 0.95) {
      score += 0.15;
      reasons.push("cầu 1-1 dài");
    }
    if (s >= 5 && this.daoDong(8).ty_le_doi <= 0.2) {
      score += 0.15;
      reasons.push("bệt không nghỉ");
    }
    return { score: Math.min(score, 1), reasons };
  }

  fullAnalysis() {
    return {
      basic: this.basicInfo(),
      cau_1_1: +this.detect11().toFixed(2),
      cau_2_2: +this.detect22().toFixed(2),
      cau_3_3: +this.detect33().toFixed(2),
      cau_4_4: +this.detect44().toFixed(2),
      cau_5_5: +this.detect55().toFixed(2),
      cau_bet: this.detectBet(),
      cau_nghieng: this.detectNghieng(),
      cau_dao: +this.detectDao().toFixed(2),
      cau_doi_xung: +this.detectDoiXung().toFixed(2),
      cau_chu_ky: this.detectChuKy(),
      cau_2_1_2: +this.detect212().toFixed(2),
      cau_1_2_1: +this.detect121().toFixed(2),
      cau_1_3_1: +this.detect131().toFixed(2),
      cau_3_1_3: +this.detect313().toFixed(2),
      dao_dong: this.daoDong(),
      can_bang: this.canBang(),
      trend: +this.trend().toFixed(2),
      hoa: this.detectHoa(),
      be_cau: this.detectBeCau(),
      tail_20: this.chuoi.slice(-20),
    };
  }
}

// ═══════════════════════════════════════════════════════════
// 🎯 PREDICTOR VIP - 25 tầng
// ═══════════════════════════════════════════════════════════
class VIPPredictor {
  constructor(chuoi) {
    this.chuoi = chuoi;
    this.analyzer = new CauAnalyzer(chuoi);
  }

  _opp(c) {
    return c === "P" ? "B" : "P";
  }

  predict() {
    const a = this.analyzer.fullAnalysis();
    const basic = a.basic;

    if (!basic) {
      return {
        ket_qua: "P",
        do_tin_cay: clampConf(52),
        ly_do: "Chưa đủ dữ liệu",
        hoa_canh_bao: null,
        be_cau_canh_bao: null,
      };
    }

    const last = basic.last;
    const opp = this._opp(last);
    const streak = basic.streak;

    // CẢNH BÁO HÒA
    let hoaCanhBao = null;
    if (a.hoa.score >= 0.6) {
      hoaCanhBao = {
        do_tin_cay_hoa: clampConf(Math.min(35, a.hoa.score * 35)),
        ly_do: a.hoa.reasons.join(" + "),
        khuyen_nghi: a.hoa.score >= 0.8 ? "Hạn chế vào lệnh - nguy cơ hòa cao" : "Cẩn thận hòa",
      };
    }

    // CẢNH BÁO BẺ CẦU
    let beCauCanhBao = null;
    if (a.be_cau.score >= 0.5) {
      beCauCanhBao = {
        do_tin_cay_be: clampConf(Math.min(75, a.be_cau.score * 75)),
        ly_do: a.be_cau.reasons.join(" + "),
        khuyen_nghi: a.be_cau.score >= 0.7
          ? `Nên BẺ sang ${opp}`
          : "Có dấu hiệu bẻ - quan sát thêm",
      };
    }

    // ═══ TẦNG 1 ═══
    if (a.cau_chu_ky.score >= 0.95) {
      const L = a.cau_chu_ky.len;
      const predict = this.chuoi[this.chuoi.length - L];
      return this._pack(predict, 80, `Cầu chu kỳ ${L} hoàn hảo`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 2 ═══
    if (a.cau_bet.type === "BET_ULTRA" && a.be_cau.score >= 0.7) {
      return this._pack(opp, 78, `Bệt ${streak} - BẺ MẠNH`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 3 ═══
    if (a.cau_1_1 >= 0.9) {
      return this._pack(opp, 79, `Cầu 1-1 mạnh ${(a.cau_1_1 * 100).toFixed(0)}%`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 4 ═══
    if (a.cau_3_1_3 >= 0.78) {
      const t = this.chuoi.slice(-7);
      return this._pack(t[3], 77, "Cầu 3-1-3", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 5 ═══
    if (a.cau_3_3 >= 0.8) {
      const t = this.chuoi.slice(-12);
      const cur = t.slice(-3), prev = t.slice(-6, -3);
      if (cur === prev) return this._pack(last, 76, "Cầu 3-3 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 74, "Cầu 3-3 - chuyển block", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 6 ═══
    if (a.cau_4_4 >= 0.8) {
      const t = this.chuoi.slice(-16);
      const cur = t.slice(-4), prev = t.slice(-8, -4);
      if (cur === prev) return this._pack(last, 75, "Cầu 4-4 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 73, "Cầu 4-4 - chuyển block", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 7 ═══
    if (a.cau_5_5 >= 0.8) {
      const t = this.chuoi.slice(-20);
      const cur = t.slice(-5), prev = t.slice(-10, -5);
      if (cur === prev) return this._pack(last, 74, "Cầu 5-5 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 72, "Cầu 5-5 - chuyển block", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 8 ═══
    if (a.cau_bet.type === "BET_EXTREME") {
      if (a.be_cau.score >= 0.6) return this._pack(opp, 72, `Bệt ${streak} - BẺ`, hoaCanhBao, beCauCanhBao);
      return this._pack(last, 68, `Bệt ${streak} - theo`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 9 ═══
    if (a.cau_2_2 >= 0.8) {
      const t = this.chuoi.slice(-8);
      const cur = t.slice(-2), prev = t.slice(-4, -2);
      if (cur === prev) return this._pack(last, 72, "Cầu 2-2 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 70, "Cầu 2-2 - chuyển block", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 10 ═══
    if (a.cau_chu_ky.score >= 0.8) {
      const L = a.cau_chu_ky.len;
      const predict = this.chuoi[this.chuoi.length - L];
      return this._pack(predict, 71, `Cầu chu kỳ ${L}`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 11 ═══
    if (a.cau_2_1_2 >= 0.7) {
      const t = this.chuoi.slice(-5);
      return this._pack(t[3], 68, "Cầu 2-1-2", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 12 ═══
    if (a.cau_1_3_1 >= 0.72) {
      const t = this.chuoi.slice(-5);
      return this._pack(t[2], 67, "Cầu 1-3-1", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 13 ═══
    if (a.cau_1_2_1 >= 0.7) {
      const t = this.chuoi.slice(-4);
      return this._pack(t[1], 66, "Cầu 1-2-1", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 14 ═══
    if (a.cau_nghieng && a.cau_nghieng.score >= 0.85) {
      const { huong, do_lech } = a.cau_nghieng;
      if (a.be_cau.score >= 0.6) {
        return this._pack(this._opp(huong), 70, `Nghiêng ${huong} lệch ${do_lech} - BẺ`, hoaCanhBao, beCauCanhBao);
      }
      return this._pack(huong, 70, `Cầu nghiêng ${huong} lệch ${do_lech}`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 15 ═══
    if (a.cau_bet.type === "BET_LONG") {
      if (a.be_cau.score >= 0.5) return this._pack(opp, 66, `Bệt ${streak} - có dấu hiệu bẻ`, hoaCanhBao, beCauCanhBao);
      return this._pack(last, 62, `Bệt ${streak} - theo`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 16 ═══
    if (a.cau_nghieng && a.cau_nghieng.score >= 0.7) {
      const { huong, do_lech } = a.cau_nghieng;
      return this._pack(huong, 63, `Cầu nghiêng ${huong} lệch ${do_lech}`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 17 ═══
    if (a.cau_doi_xung >= 0.85) {
      const t = this.chuoi.slice(-6);
      return this._pack(t[0], 61, "Cầu đối xứng cao", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 18 ═══
    if (a.cau_bet.type === "BET_MID") {
      return this._pack(last, 58, `Bệt ${streak} - theo`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 19 ═══
    if (a.trend >= 0.65) {
      const l5 = this.chuoi.slice(-5);
      let p = 0;
      for (const c of l5) if (c === "P") p++;
      const huong = p >= 3 ? "P" : "B";
      return this._pack(huong, 57, "Trend 5-15 đồng thuận", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 20 ═══
    if (a.cau_1_1 >= 0.7) {
      return this._pack(opp, 60, `Cầu 1-1 khá ${(a.cau_1_1 * 100).toFixed(0)}%`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 21 ═══
    if (a.dao_dong.bien_dong) {
      return this._pack(opp, 55, "Biến động mạnh - đảo", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 22 ═══
    if (a.dao_dong.on_dinh) {
      return this._pack(last, 54, "Dao động ổn định - theo", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 23 ═══
    const cb = a.can_bang;
    if (cb.tong >= 15 && cb.chenh <= 2) {
      return this._pack(opp, 53, "Cân bằng P/B - đảo nhẹ", hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 24 ═══
    if (a.be_cau.score >= 0.5) {
      return this._pack(opp, 60, `Dấu hiệu bẻ cầu (${a.be_cau.reasons.join(", ")})`, hoaCanhBao, beCauCanhBao);
    }
    // ═══ TẦNG 25 ═══
    return this._pack(opp, 52, "Fallback - đảo nhẹ", hoaCanhBao, beCauCanhBao);
  }

  _pack(ket_qua, tin_cay, ly_do, hoaCanhBao, beCauCanhBao) {
    return {
      ket_qua,
      do_tin_cay: clampConf(tin_cay),
      ly_do,
      hoa_canh_bao: hoaCanhBao,
      be_cau_canh_bao: beCauCanhBao,
    };
  }
}

// ═══════════ FETCH & PREDICT ═══════════
async function fetchTable(table) {
  const cached = getCache(dataCache, table);
  if (cached) return cached;
  const { data } = await axios.get(API_BASE + table, { timeout: 10000 });
  if (!data.success) throw new Error(`Không có dữ liệu bàn ${table}`);
  const chuoi = data.data.result;
  setCache(dataCache, table, chuoi);
  return chuoi;
}

function predictFor(chuoi) {
  const cached = getCache(predCache, chuoi);
  if (cached) return cached;
  const p = new VIPPredictor(chuoi);
  const result = p.predict();
  const full = {
    ...result,
    do_tin_cay: clampConf(result.do_tin_cay),
    phan_tich: p.analyzer.fullAnalysis(),
  };
  setCache(predCache, chuoi, full);
  return full;
}

// ═══════════ ROUTES ═══════════

app.get("/", (req, res) => {
  res.json({
    server: "🔥 BCR VIP SERVER",
    version: "4.1",
    status: "online",
    tables: TABLES.length,
    confidence_range: "52 - 80",
    confidence_type: "Số nguyên (không có 0.xx)",
    features: ["Dự đoán P/B", "Cảnh báo HÒA", "Cảnh báo BẺ CẦU", "25 tầng thuật toán"],
    endpoints: [
      "GET /predict/:table",
      "GET /predict-all",
      "GET /analysis/:table",
      "GET /scan-vip?min_confidence=65",
      "GET /scan-hoa",
      "GET /scan-be-cau",
      "GET /health",
    ],
  });
});

app.get("/health", (req, res) => res.json({ status: "ok", time: Date.now() }));

app.get("/predict/:table", async (req, res) => {
  const table = req.params.table.toUpperCase();
  if (!TABLES.includes(table)) {
    return res.status(404).json({ success: false, error: `Bàn ${table} không hợp lệ` });
  }
  try {
    const chuoi = await fetchTable(table);
    const kq = predictFor(chuoi);
    res.json({
      success: true,
      table,
      chuoi,
      du_doan: kq.ket_qua,
      do_tin_cay: kq.do_tin_cay,
      ly_do: kq.ly_do,
      hoa_canh_bao: kq.hoa_canh_bao,
      be_cau_canh_bao: kq.be_cau_canh_bao,
      len_chuoi: chuoi.length,
      tail: chuoi.slice(-20),
    });
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});

app.get("/predict-all", async (req, res) => {
  const results = [];
  const errors = [];
  await Promise.all(
    TABLES.map(async (table) => {
      try {
        const chuoi = await fetchTable(table);
        const kq = predictFor(chuoi);
        results.push({
          table,
          du_doan: kq.ket_qua,
          do_tin_cay: kq.do_tin_cay,
          ly_do: kq.ly_do,
          hoa_canh_bao: kq.hoa_canh_bao,
          be_cau_canh_bao: kq.be_cau_canh_bao,
          tail: chuoi.slice(-20),
          len_chuoi: chuoi.length,
        });
      } catch (e) {
        errors.push({ table, error: e.message });
      }
    })
  );
  results.sort((a, b) => b.do_tin_cay - a.do_tin_cay);
  res.json({
    success: true,
    tong_ban: TABLES.length,
    thanh_cong: results.length,
    loi: errors.length,
    top_tin_cay: results.slice(0, 5),
    tat_ca: results,
    errors,
  });
});

app.get("/analysis/:table", async (req, res) => {
  const table = req.params.table.toUpperCase();
  if (!TABLES.includes(table)) {
    return res.status(404).json({ success: false, error: `Bàn ${table} không hợp lệ` });
  }
  try {
    const chuoi = await fetchTable(table);
    const kq = predictFor(chuoi);
    res.json({
      success: true,
      table,
      chuoi,
      du_doan: kq.ket_qua,
      do_tin_cay: kq.do_tin_cay,
      ly_do: kq.ly_do,
      hoa_canh_bao: kq.hoa_canh_bao,
      be_cau_canh_bao: kq.be_cau_canh_bao,
      phan_tich_chi_tiet: kq.phan_tich,
    });
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});

app.get("/scan-vip", async (req, res) => {
  const minConf = Math.max(CONF_MIN, Math.min(CONF_MAX, parseInt(req.query.min_confidence) || 65));
  const vipList = [];
  await Promise.all(
    TABLES.map(async (table) => {
      try {
        const chuoi = await fetchTable(table);
        const kq = predictFor(chuoi);
        if (kq.do_tin_cay >= minConf) {
          vipList.push({
            table,
            du_doan: kq.ket_qua,
            do_tin_cay: kq.do_tin_cay,
            ly_do: kq.ly_do,
            be_cau_canh_bao: kq.be_cau_canh_bao,
          });
        }
      } catch (_) {}
    })
  );
  vipList.sort((a, b) => b.do_tin_cay - a.do_tin_cay);
  res.json({
    success: true,
    nguong_tin_cay: minConf,
    so_ban_vip: vipList.length,
    danh_sach: vipList,
  });
});

app.get("/scan-hoa", async (req, res) => {
  const minHoa = parseInt(req.query.min_hoa) || 60;
  const list = [];
  await Promise.all(
    TABLES.map(async (table) => {
      try {
        const chuoi = await fetchTable(table);
        const kq = predictFor(chuoi);
        if (kq.hoa_canh_bao && kq.hoa_canh_bao.do_tin_cay_hoa >= minHoa * 0.3) {
          list.push({
            table,
            tail: chuoi.slice(-20),
            hoa: kq.hoa_canh_bao,
          });
        }
      } catch (_) {}
    })
  );
  list.sort((a, b) => b.hoa.do_tin_cay_hoa - a.hoa.do_tin_cay_hoa);
  res.json({
    success: true,
    nguong: minHoa,
    so_ban_hoa: list.length,
    danh_sach: list,
  });
});

app.get("/scan-be-cau", async (req, res) => {
  const minBe = parseInt(req.query.min_be) || 50;
  const list = [];
  await Promise.all(
    TABLES.map(async (table) => {
      try {
        const chuoi = await fetchTable(table);
        const kq = predictFor(chuoi);
        if (kq.be_cau_canh_bao && kq.be_cau_canh_bao.do_tin_cay_be >= minBe) {
          list.push({
            table,
            tail: chuoi.slice(-20),
            du_doan_hien_tai: kq.ket_qua,
            be_cau: kq.be_cau_canh_bao,
          });
        }
      } catch (_) {}
    })
  );
  list.sort((a, b) => b.be_cau.do_tin_cay_be - a.be_cau.do_tin_cay_be);
  res.json({
    success: true,
    nguong: minBe,
    so_ban_be_cau: list.length,
    danh_sach: list,
  });
});

// ═══════════ START ═══════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 BCR VIP SERVER v4.1 chạy tại http://localhost:${PORT}`);
  console.log(`📊 Tổng ${TABLES.length} bàn: C01-C20 + 1-14`);
  console.log(`🎯 Tỷ lệ tin cậy: 52 - 80 (SỐ NGUYÊN)`);
  console.log(`✨ Features: P/B + HÒA + BẺ CẦU + 25 tầng`);
});
