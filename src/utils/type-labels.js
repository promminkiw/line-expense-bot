const { t } = require('../i18n');

function typeLabel(lang, type) {
  return t(lang, `type.${type}`);
}

module.exports = { typeLabel };
