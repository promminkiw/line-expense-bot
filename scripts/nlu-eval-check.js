function describeValue(value) {
  return JSON.stringify(value);
}

function checkCase(expected, actual) {
  const problems = [];
  for (const [key, want] of Object.entries(expected)) {
    if (key !== 'items') {
      if (actual[key] !== want) problems.push(`${key}: expected ${describeValue(want)}, got ${describeValue(actual[key])}`);
      continue;
    }
    const got = Array.isArray(actual.items) ? actual.items : [];
    if (got.length !== want.length) {
      problems.push(`items: expected ${want.length} items, got ${got.length}`);
      continue;
    }
    want.forEach((wantItem, index) => {
      for (const [field, value] of Object.entries(wantItem)) {
        if (got[index][field] !== value) {
          problems.push(`items[${index}].${field}: expected ${describeValue(value)}, got ${describeValue(got[index][field])}`);
        }
      }
    });
  }
  return problems;
}

module.exports = { checkCase };
