// สีชุดเดียวกับ public/liff/tokens.css ให้การ์ดในแชตกับหน้าเว็บดูเป็นแอปเดียวกัน
const COLORS = {
  brand: '#1157C5',
  brandDark: '#0B3C8F',
  onBrandMuted: '#DBE6FA',
  brandSoft: '#E6EEFC',
  cta: '#FFDE59',
  onCta: '#111111',
  secondary: '#EFEFEF',
  white: '#FFFFFF',
  text: '#111111',
  muted: '#707070',
  income: '#1D7A35',
  incomeSoft: '#E6F4EA',
  incomeText: '#14632B',
  expense: '#D70015',
  warnBar: '#F59E0B',
  warnText: '#B64400',
  noticeBg: '#FFF1B8',
  noticeText: '#5C4300',
  track: '#E5E5EA',
  separator: '#E5E5EA',
};

// ตรงกับ --chart-1 ถึง --chart-6 ให้สีหมวดเรียงตามลำดับเหมือนกราฟในหน้าเว็บ
const CHART_COLORS = ['#1157C5', '#C26A00', '#E5484D', '#1D7A35', '#7B4FE0', '#007F96'];

function brandHeader(eyebrow, title, end) {
  const titleText = { type: 'text', text: title, weight: 'bold', size: 'xl', color: COLORS.white, wrap: true };
  const titleLine = end
    ? {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        margin: 'xs',
        contents: [
          { ...titleText, flex: 1 },
          { type: 'text', text: end, weight: 'bold', size: 'lg', color: COLORS.white, align: 'end', gravity: 'center', flex: 0 },
        ],
      }
    : { ...titleText, margin: 'xs' };
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.brand,
    paddingTop: '16px',
    paddingBottom: '16px',
    paddingStart: '20px',
    paddingEnd: '20px',
    contents: [{ type: 'text', text: eyebrow, size: 'xs', color: COLORS.onBrandMuted, wrap: true }, titleLine],
  };
}

// LINE ไม่รับ box ที่กว้าง 0% จึงใช้ filler เมื่อยังไม่ถึง 1%
function progressBar(percent, color) {
  const filled = Math.min(Math.floor(percent), 100);
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    height: '8px',
    cornerRadius: '4px',
    backgroundColor: COLORS.track,
    contents:
      filled > 0
        ? [{ type: 'box', layout: 'vertical', width: `${filled}%`, cornerRadius: '4px', backgroundColor: color, contents: [] }]
        : [{ type: 'filler' }],
  };
}

function stackBar(segments) {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    height: '8px',
    cornerRadius: '4px',
    spacing: '2px',
    contents: segments.map((segment) => ({
      type: 'box',
      layout: 'vertical',
      flex: segment.weight,
      backgroundColor: segment.color,
      contents: [],
    })),
  };
}

function gaugeRow(label, value, valueColor) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: [
      { type: 'text', text: label, size: 'xs', color: COLORS.text, flex: 1, wrap: true },
      { type: 'text', text: value, size: 'xs', weight: 'bold', color: valueColor, align: 'end', flex: 0 },
    ],
  };
}

// ปุ่ม primary ของ Flex บังคับตัวอักษรสีขาว ปุ่มเหลืองจึงต้องทำเป็น box ที่มี action
function boxButton(action, { background, color }) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    height: '40px',
    cornerRadius: '8px',
    justifyContent: 'center',
    backgroundColor: background,
    action,
    contents: [{ type: 'text', text: action.label, size: 'sm', weight: 'bold', color, align: 'center' }],
  };
}

// ปุ่มยกเลิก/ปฏิเสธอยู่ซ้าย ปุ่มหลักอยู่ขวา
function actionRow(primary, secondaries = []) {
  const contents = [
    ...secondaries.map((action) => boxButton(action, { background: COLORS.secondary, color: COLORS.text })),
    ...(primary ? [boxButton(primary, { background: COLORS.cta, color: COLORS.onCta })] : []),
  ];
  if (contents.length === 0) {
    return undefined;
  }
  return { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '10px', contents };
}

function softButton(action) {
  return boxButton(action, { background: COLORS.brandSoft, color: COLORS.brand });
}

function linkButton(action) {
  return { type: 'button', style: 'link', height: 'sm', color: COLORS.brand, action };
}

function separator() {
  return { type: 'separator', margin: 'lg', color: COLORS.separator };
}

module.exports = {
  COLORS,
  CHART_COLORS,
  brandHeader,
  progressBar,
  stackBar,
  gaugeRow,
  boxButton,
  actionRow,
  softButton,
  linkButton,
  separator,
};
