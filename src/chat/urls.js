const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// LINE จำกัดความยาว uri ของ action ที่ 1000 ตัวอักษร
const MAX_URI_LENGTH = 1000;

function createUrlBuilders({ liffUrl }) {
  // ลิงก์เข้าหน้าแก้ไขรายการ: ใส่วันที่ไปด้วยเพื่อให้หน้าเว็บเปิดเดือนที่ถูกต้องก่อนหารายการ
  function buildEditUrls(rows, ids) {
    if (!liffUrl || !Array.isArray(ids) || ids.length !== rows.length) {
      return undefined;
    }
    return ids.map((id, index) => buildEditUrl(id, rows[index].occurred_on));
  }

  function buildEditUrl(id, date) {
    try {
      const url = new URL(liffUrl);
      url.searchParams.set('tx', String(id));
      if (ISO_DATE_PATTERN.test(date)) url.searchParams.set('d', date);
      const text = url.toString();
      return url.protocol === 'https:' && text.length <= MAX_URI_LENGTH ? text : undefined;
    } catch {
      return undefined;
    }
  }

  // ลิงก์เปิดแท็บตรงๆ จาก Rich Menu หรือการ์ด
  function buildTabUrl(tab) {
    if (!liffUrl) {
      return undefined;
    }
    try {
      const url = new URL(liffUrl);
      url.searchParams.set('tab', tab);
      const text = url.toString();
      return url.protocol === 'https:' && text.length <= MAX_URI_LENGTH ? text : undefined;
    } catch {
      return undefined;
    }
  }

  function buildGoalsUrl() {
    return buildTabUrl('goals');
  }

  function buildSummaryUrl() {
    return buildTabUrl('summary');
  }

  // ลิงก์เปิดแท็บรายการของเดือนสิ้นสุดช่วง พร้อมคำค้น หมวด กระเป๋า และประเภท (ถามทั้งสองประเภทไม่กรองประเภท)
  function buildTotalsListUrl(question) {
    if (!liffUrl) {
      return undefined;
    }
    try {
      const url = new URL(liffUrl);
      url.searchParams.set('tab', 'list');
      url.searchParams.set('m', question.to.slice(0, 7));
      if (question.keyword) url.searchParams.set('q', question.keyword);
      if (question.category) url.searchParams.set('c', question.category);
      if (question.wallet) url.searchParams.set('w', question.wallet);
      if (question.type !== 'both') url.searchParams.set('type', question.type);
      const text = url.toString();
      return url.protocol === 'https:' && text.length <= MAX_URI_LENGTH ? text : undefined;
    } catch {
      return undefined;
    }
  }

  return { buildEditUrls, buildEditUrl, buildGoalsUrl, buildSummaryUrl, buildTotalsListUrl };
}

module.exports = { createUrlBuilders };
