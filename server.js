// ═══════════════════════════════════════════════════════════
// 🔥 BCR VIP SERVER v4.0
// ✦ Dự đoán P / B / HÒA (T)
// ✦ Cảnh báo BẺ CẦU (đảo nhịp)
// ✦ Thuật toán 25 tầng siêu dài
// ✦ Confidence 52% - 80%, không số 0 đầu
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
const CONF_MIN = 0.52;
const CONF_MAX = 0.80;

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
function clampConf(v) {
  const r = Math.round(v * 1000) / 1000;
  return Math.max(CONF_MIN, Math.min(CONF_MAX, r));
}

// ═══════════════════════════════════════════════════════════
// 🧠 ANALYZER - 20 tầng phân tích
// ═══════════════════════════════════════════════════════════
class CauAnalyzer {
  constructor(chuoi) {
    this.chuoi = chuoi;
    this.len = chuoi.length;
  }

  // ═══ TẦNG 1: Basic ═══
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

  // ═══ TẦNG 2: Cầu 1-1 ═══
  detect11(length = 8) {
    if (this.len < length) return 0;
    const tail = this.chuoi.slice(-length);
    let ok = 0;
    for (let i = 0; i < tail.length - 1; i++) if (tail[i] !== tail[i + 1]) ok++;
    return ok / (tail.length - 1);
  }

  // ═══ TẦNG 3: Cầu 2-2 ═══
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

  // ═══ TẦNG 4: Cầu 3-3 ═══
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

  // ═══ TẦNG 5: Cầu 4-4 ═══
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

  // ═══ TẦNG 6: Cầu 5-5 ═══
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

  // ═══ TẦNG 7: Cầu bệt ═══
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

  // ═══ TẦNG 8: Cầu nghiêng ═══
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

  // ═══ TẦNG 9: Cầu đảo ═══
  detectDao() {
    if (this.len < 10) return 0;
    const t = this.chuoi.slice(-10);
    let d = 0;
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) d++;
    return d / (t.length - 1);
  }

  // ═══ TẦNG 10: Đối xứng ═══
  detectDoiXung() {
    if (this.len < 6) return 0;
    const t = this.chuoi.slice(-6);
    const r = t.split("").reverse().join("");
    let m = 0;
    for (let i = 0; i < 6; i++) if (t[i] === r[i]) m++;
    return m / 6;
  }

  // ═══ TẦNG 11: Chu kỳ ═══
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

  // ═══ TẦNG 12: Cầu 2-1-2 ═══
  detect212() {
    if (this.len < 5) return 0;
    const t = this.chuoi.slice(-5);
    if (t[0] === t[1] && t[2] !== t[1] && t[3] === t[4] && t[3] !== t[2]) return 0.75;
    return 0;
  }

  // ═══ TẦNG 13: Cầu 1-2-1 ═══
  detect121() {
    if (this.len < 4) return 0;
    const t = this.chuoi.slice(-4);
    if (t[0] !== t[1] && t[1] === t[2] && t[2] !== t[3] && t[0] === t[3]) return 0.7;
    return 0;
  }

  // ═══ TẦNG 14: Cầu 1-3-1 ═══
  detect131() {
    if (this.len < 5) return 0;
    const t = this.chuoi.slice(-5);
    if (t[0] !== t[1] && t[1] === t[2] && t[2] === t[3] && t[3] !== t[4] && t[0] === t[4]) return 0.72;
    return 0;
  }

  // ═══ TẦNG 15: Cầu 3-1-3 ═══
  detect313() {
    if (this.len < 7) return 0;
    const t = this.chuoi.slice(-7);
    if (t[0] === t[1] && t[1] === t[2] && t[3] !== t[2] && t[4] === t[5] && t[5] === t[6] && t[4] !== t[3]) return 0.78;
    return 0;
  }

  // ═══ TẦNG 16: Dao động ═══
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

  // ═══ TẦNG 17: Cân bằng ═══
  canBang(window = 20) {
    const w = Math.min(window, this.len);
    const t = this.chuoi.slice(-w);
    let p = 0, b = 0;
    for (const c of t) c === "P" ? p++ : b++;
    return { p, b, tong: w, chenh: Math.abs(p - b) };
  }

  // ═══ TẦNG 18: Trend 5-15 ═══
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

  // ═══ TẦNG 19: Xác suất HÒA ═══
  detectHoa() {
    // Hòa trong Baccarat ~9.5% tổng thể
    // Nhưng có dấu hiệu cầu nhất định làm tăng xác suất:
    let score = 0;
    const reasons = [];

    // Dấu hiệu 1: Cân bằng tuyệt đối 20 tay
    const cb = this.canBang(20);
    if (cb.tong >= 15 && cb.chenh <= 1) {
      score += 0.25;
      reasons.push("cân bằng 20 tay");
    }

    // Dấu hiệu 2: Dao động cực mạnh
    const dd = this.daoDong(12);
    if (dd.ty_le_doi >= 0.85) {
      score += 0.2;
      reasons.push("dao động cực mạnh");
    }

    // Dấu hiệu 3: Chuỗi đối xứng gần đây
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

    // Dấu hiệu 4: Bệt ngắn liên tục xen kẽ
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

    // Dấu hiệu 5: Cầu 1-1 dài (dễ hòa bất chợt)
    if (this.detect11(10) >= 0.9) {
      score += 0.1;
      reasons.push("cầu 1-1 dài");
    }

    return { score: Math.min(score, 1), reasons };
  }

  // ═══ TẦNG 20: Dấu hiệu BẺ CẦU ═══
  detectBeCau() {
    let score = 0;
    const reasons = [];
    const info = this.basicInfo();
    if (!info) return { score: 0, reasons: [] };

    const s = info.streak;

    // Bệt càng dài càng dễ bẻ
    if (s >= 10) { score += 0.4; reasons.push(`bệt cực dài ${s}`); }
    else if (s >= 8) { score += 0.3; reasons.push(`bệt dài ${s}`); }
    else if (s >= 6) { score += 0.2; reasons.push(`bệt ${s}`); }
    else if (s >= 4) { score += 0.1; reasons.push(`bệt ${s}`); }

    // Độ lệch cân bằng
    const cb = this.canBang(20);
    if (cb.tong >= 15 && cb.chenh >= 8) {
      score += 0.2;
      reasons.push(`lệch ${cb.chenh}`);
    }

    // Cầu nghiêng mạnh sắp bẻ
    const ng = this.detectNghieng(20);
    if (ng && ng.score >= 0.85) {
      score += 0.15;
      reasons.push(`nghiêng ${ng.huong} lệch ${ng.do_lech}`);
    }

    // Cầu chu kỳ sắp kết thúc
    const ck = this.detectChuKy(8);
    if (ck.score >= 0.8) {
      const pos = this.len % ck.len;
      if (pos === ck.len - 1) {
        score += 0.15;
        reasons.push(`chu kỳ ${ck.len} kết thúc`);
      }
    }

    // Cầu 1-1 dài (dễ gãy)
    if (this.detect11(10) >= 0.95) {
      score += 0.15;
      reasons.push("cầu 1-1 dài");
    }

    // Bệt >= 5 liên tục không nghỉ
    if (s >= 5 && this.daoDong(8).ty_le_doi <= 0.2) {
      score += 0.15;
      reasons.push("bệt không nghỉ");
    }

    return { score: Math.min(score, 1), reasons };
  }

  // ═══ TỔNG HỢP ═══
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
// 🎯 PREDICTOR VIP - 25 tầng logic + Hòa + Bẻ cầu
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
        do_tin_cay: 0.52,
        ly_do: "Chưa đủ dữ liệu",
        hoa_canh_bao: null,
        be_cau_canh_bao: null,
      };
    }

    const last = basic.last;
    const opp = this._opp(last);
    const streak = basic.streak;

    // ═══════════════════════════════════════════════════
    // 🎯 ƯU TIÊN 0: CẢNH BÁO HÒA (nếu score cao)
    // ═══════════════════════════════════════════════════
    let hoaCanhBao = null;
    if (a.hoa.score >= 0.6) {
      hoaCanhBao = {
        do_tin_cay_hoa: +Math.min(0.35, a.hoa.score * 0.35).toFixed(2),
        ly_do: a.hoa.reasons.join(" + "),
        khuyen_nghi: a.hoa.score >= 0.8 ? "Hạn chế vào lệnh - nguy cơ hòa cao" : "Cẩn thận hòa",
      };
    }

    // ═══════════════════════════════════════════════════
    // 🎯 ƯU TIÊN 0.5: CẢNH BÁO BẺ CẦU
    // ═══════════════════════════════════════════════════
    let beCauCanhBao = null;
    if (a.be_cau.score >= 0.5) {
      beCauCanhBao = {
        do_tin_cay_be: +Math.min(0.75, a.be_cau.score * 0.75).toFixed(2),
        ly_do: a.be_cau.reasons.join(" + "),
        khuyen_nghi: a.be_cau.score >= 0.7
          ? `Nên BẺ sang ${opp}`
          : "Có dấu hiệu bẻ - quan sát thêm",
      };
    }

    // ═══ TẦNG 1: Cầu chu kỳ hoàn hảo ═══
    if (a.cau_chu_ky.score >= 0.95) {
      const L = a.cau_chu_ky.len;
      const predict = this.chuoi[this.chuoi.length - L];
      return this._pack(predict, 0.80, `Cầu chu kỳ ${L} hoàn hảo`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 2: Bệt cực dài >=10 + dấu hiệu bẻ ═══
    if (a.cau_bet.type === "BET_ULTRA" && a.be_cau.score >= 0.7) {
      return this._pack(opp, 0.78, `Bệt ${streak} - BẺ MẠNH`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 3: Cầu 1-1 mạnh ═══
    if (a.cau_1_1 >= 0.9) {
      return this._pack(opp, 0.79, `Cầu 1-1 mạnh ${(a.cau_1_1 * 100).toFixed(0)}%`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 4: Cầu 3-1-3 ═══
    if (a.cau_3_1_3 >= 0.78) {
      const t = this.chuoi.slice(-7);
      const predict = t[3];
      return this._pack(predict, 0.77, "Cầu 3-1-3", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 5: Cầu 3-3 ═══
    if (a.cau_3_3 >= 0.8) {
      const t = this.chuoi.slice(-12);
      const cur = t.slice(-3);
      const prev = t.slice(-6, -3);
      if (cur === prev) return this._pack(last, 0.76, "Cầu 3-3 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 0.74, "Cầu 3-3 - chuyển block", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 6: Cầu 4-4 ═══
    if (a.cau_4_4 >= 0.8) {
      const t = this.chuoi.slice(-16);
      const cur = t.slice(-4);
      const prev = t.slice(-8, -4);
      if (cur === prev) return this._pack(last, 0.75, "Cầu 4-4 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 0.73, "Cầu 4-4 - chuyển block", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 7: Cầu 5-5 ═══
    if (a.cau_5_5 >= 0.8) {
      const t = this.chuoi.slice(-20);
      const cur = t.slice(-5);
      const prev = t.slice(-10, -5);
      if (cur === prev) return this._pack(last, 0.74, "Cầu 5-5 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 0.72, "Cầu 5-5 - chuyển block", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 8: Bệt cực dài >=8 ═══
    if (a.cau_bet.type === "BET_EXTREME") {
      if (a.be_cau.score >= 0.6) {
        return this._pack(opp, 0.72, `Bệt ${streak} - BẺ`, hoaCanhBao, beCauCanhBao);
      }
      return this._pack(last, 0.68, `Bệt ${streak} - theo`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 9: Cầu 2-2 ═══
    if (a.cau_2_2 >= 0.8) {
      const t = this.chuoi.slice(-8);
      const cur = t.slice(-2);
      const prev = t.slice(-4, -2);
      if (cur === prev) return this._pack(last, 0.72, "Cầu 2-2 - theo block", hoaCanhBao, beCauCanhBao);
      return this._pack(opp, 0.70, "Cầu 2-2 - chuyển block", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 10: Cầu chu kỳ khá ═══
    if (a.cau_chu_ky.score >= 0.8) {
      const L = a.cau_chu_ky.len;
      const predict = this.chuoi[this.chuoi.length - L];
      return this._pack(predict, 0.71, `Cầu chu kỳ ${L}`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 11: Cầu 2-1-2 ═══
    if (a.cau_2_1_2 >= 0.7) {
      const t = this.chuoi.slice(-5);
      return this._pack(t[3], 0.68, "Cầu 2-1-2", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 12: Cầu 1-3-1 ═══
    if (a.cau_1_3_1 >= 0.72) {
      const t = this.chuoi.slice(-5);
      return this._pack(t[2], 0.67, "Cầu 1-3-1", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 13: Cầu 1-2-1 ═══
    if (a.cau_1_2_1 >= 0.7) {
      const t = this.chuoi.slice(-4);
      return this._pack(t[1], 0.66, "Cầu 1-2-1", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 14: Cầu nghiêng mạnh ═══
    if (a.cau_nghieng && a.cau_nghieng.score >= 0.85) {
      const { huong, do_lech } = a.cau_nghieng;
      if (a.be_cau.score >= 0.6) {
        return this._pack(this._opp(huong), 0.70, `Nghiêng ${huong} lệch ${do_lech} - BẺ`, hoaCanhBao, beCauCanhBao);
      }
      return this._pack(huong, 0.70, `Cầu nghiêng ${huong} lệch ${do_lech}`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 15: Bệt dài 6-7 ═══
    if (a.cau_bet.type === "BET_LONG") {
      if (a.be_cau.score >= 0.5) {
        return this._pack(opp, 0.66, `Bệt ${streak} - có dấu hiệu bẻ`, hoaCanhBao, beCauCanhBao);
      }
      return this._pack(last, 0.62, `Bệt ${streak} - theo`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 16: Cầu nghiêng vừa ═══
    if (a.cau_nghieng && a.cau_nghieng.score >= 0.7) {
      const { huong, do_lech } = a.cau_nghieng;
      return this._pack(huong, 0.63, `Cầu nghiêng ${huong} lệch ${do_lech}`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 17: Cầu đối xứng ═══
    if (a.cau_doi_xung >= 0.85) {
      const t = this.chuoi.slice(-6);
      const predict = t[0];
      return this._pack(predict, 0.61, "Cầu đối xứng cao", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 18: Bệt vừa 4-5 ═══
    if (a.cau_bet.type === "BET_MID") {
      return this._pack(last, 0.58, `Bệt ${streak} - theo`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 19: Trend ═══
    if (a.trend >= 0.65) {
      const l5 = this.chuoi.slice(-5);
      let p = 0;
      for (const c of l5) if (c === "P") p++;
      const huong = p >= 3 ? "P" : "B";
      return this._pack(huong, 0.57, "Trend 5-15 đồng thuận", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 20: Cầu 1-1 khá ═══
    if (a.cau_1_1 >= 0.7) {
      return this._pack(opp, 0.60, `Cầu 1-1 khá ${(a.cau_1_1 * 100).toFixed(0)}%`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 21: Dao động mạnh ═══
    if (a.dao_dong.bien_dong) {
      return this._pack(opp, 0.55, "Biến động mạnh - đảo", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 22: Dao động ổn định ═══
    if (a.dao_dong.on_dinh) {
      return this._pack(last, 0.54, "Dao động ổn định - theo", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 23: Cân bằng ═══
    const cb = a.can_bang;
    if (cb.tong >= 15 && cb.chenh <= 2) {
      return this._pack(opp, 0.53, "Cân bằng P/B - đảo nhẹ", hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 24: Bẻ cầu tự động ═══
    if (a.be_cau.score >= 0.5) {
      return this._pack(opp, 0.60, `Dấu hiệu bẻ cầu (${a.be_cau.reasons.join(", ")})`, hoaCanhBao, beCauCanhBao);
    }

    // ═══ TẦNG 25: Fallback ═══
    return this._pack(opp, 0.52, "Fallback - đảo nhẹ", hoaCanhBao, beCauCanhBao);
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
    version: "4.0",
    status: "online",
    tables: TABLES.length,
    confidence_range: "52% - 80%",
    features: ["Dự đoán P/B", "Cảnh báo HÒA", "Cảnh báo BẺ CẦU", "25 tầng thuật toán"],
    endpoints: [
      "GET /predict/:table",
      "GET /predict-all",
      "GET /analysis/:table",
      "GET /scan-vip?min_confidence=0.65",
      "GET /scan-hoa",
      "GET /scan-be-cau",
      "GET /health",
    ],
  });
});

app.get("/health", (req, res) => res.json({ status: "ok", time: Date.now() }));

// ═══ PREDICT 1 BÀN ═══
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

// ═══ PREDICT ALL ═══
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

// ═══ PHÂN TÍCH CHI TIẾT ═══
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

// ═══ SCAN VIP ═══
app.get("/scan-vip", async (req, res) => {
  const minConf = Math.max(CONF_MIN, Math.min(CONF_MAX, parseFloat(req.query.min_confidence) || 0.65));
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

// ═══ SCAN HÒA ═══
app.get("/scan-hoa", async (req, res) => {
  const minHoa = parseFloat(req.query.min_hoa) || 0.6;
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

// ═══ SCAN BẺ CẦU ═══
app.get("/scan-be-cau", async (req, res) => {
  const minBe = parseFloat(req.query.min_be) || 0.5;
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
  console.log(`🔥 BCR VIP SERVER v4.0 chạy tại http://localhost:${PORT}`);
  console.log(`📊 Tổng ${TABLES.length} bàn: C01-C20 + 1-14`);
  console.log(`🎯 Tỷ lệ tin cậy: 52% - 80%`);
  console.log(`✨ Features: Dự đoán P/B + Cảnh báo HÒA + Cảnh báo BẺ CẦU`);
  console.log(`⚙️  Endpoints: /predict/:table | /predict-all | /analysis/:table | /scan-vip | /scan-hoa | /scan-be-cau`);
});
