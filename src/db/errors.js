// unique_violation ของ Postgres ใช้แยกกรณีรหัสเพื่อนชนกับของคนอื่น
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const SAFE_CAUSE_FIELDS = ['message', 'code', 'hint'];

class DatabaseError extends Error {
  constructor(operation, cause) {
    super(`Database ${operation} failed: ${cause.message}`);
    this.name = 'DatabaseError';
    // details ของ Postgres อาจมีแถวที่พัง (ยอดเงิน โน้ต) จึงเก็บเฉพาะ field ที่ปลอดภัย
    this.cause = Object.fromEntries(
      SAFE_CAUSE_FIELDS.filter((field) => cause[field] !== undefined).map((field) => [field, cause[field]]),
    );
  }
}

function throwIfError(operation, error) {
  if (error) {
    throw new DatabaseError(operation, error);
  }
}

module.exports = { DatabaseError, throwIfError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION };
