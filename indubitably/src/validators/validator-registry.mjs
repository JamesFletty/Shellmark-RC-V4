import { invariant } from '../domain/errors.mjs';

export class ValidatorRegistry {
  #validators = new Map();

  register(validator) {
    invariant(validator?.id && typeof validator.run === 'function', 'INVALID_VALIDATOR', 'Validator must define id and run().');
    invariant(!this.#validators.has(validator.id), 'DUPLICATE_VALIDATOR', `Validator ${validator.id} is already registered.`);
    this.#validators.set(validator.id, validator);
    return this;
  }

  list() {
    return [...this.#validators.values()].map((validator) => ({ id: validator.id, verification_type: validator.verificationType }));
  }

  async run(id, input) {
    const validator = this.#validators.get(id);
    invariant(validator, 'VALIDATOR_NOT_FOUND', `Validator ${id} is not registered.`, 404);
    return validator.run(input);
  }
}
