export class DomainError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function invariant(condition, code, message, statusCode = 400, details = undefined) {
  if (!condition) {
    throw new DomainError(code, message, statusCode, details);
  }
}
