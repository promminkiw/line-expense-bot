const COMMANDS = {
  'สรุป': 'menu',
  'สรุปวันนี้': 'today',
  'สรุปสัปดาห์นี้': 'week',
  'สรุปเดือนนี้': 'month',
};

function parseSummaryCommand(text) {
  const key = text.replace(/\s+/g, '');
  return Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : null;
}

module.exports = { parseSummaryCommand };
