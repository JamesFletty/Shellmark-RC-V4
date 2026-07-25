import { invariant } from './errors.mjs';
import { newId } from './ids.mjs';
import { parseCreditAmount } from './money.mjs';
import { MarketplaceBase, cloneSerializable, requireString } from './marketplace-base.mjs';

export class MarketplaceIdentityService extends MarketplaceBase {
  async registerOperator({ display_name, wallet_addresses = [], metadata = {} }, actorId = 'admin') {
    requireString(display_name, 'display_name', 2);
    invariant(Array.isArray(wallet_addresses), 'INVALID_INPUT', 'wallet_addresses must be an array.');
    const operatorId = newId('op');
    await this._append([
      this._input('operator', operatorId, 'operator.registered', 'admin', actorId, {
        display_name: display_name.trim(),
        wallet_addresses: [...new Set(wallet_addresses.map((value) => String(value).trim()).filter(Boolean))],
        metadata: cloneSerializable(metadata)
      })
    ]);
    return this.getOperator(operatorId);
  }

  async linkOperators(leftOperatorId, rightOperatorId, reason, actorId = 'admin') {
    this._requireOperator(leftOperatorId);
    this._requireOperator(rightOperatorId);
    invariant(leftOperatorId !== rightOperatorId, 'INVALID_INPUT', 'An operator cannot be linked to itself.');
    requireString(reason, 'reason', 3);
    const relationId = [leftOperatorId, rightOperatorId].sort().join('__');
    await this._append([
      this._input('operator_relation', relationId, 'operators.related', 'admin', actorId, {
        left_operator_id: leftOperatorId,
        right_operator_id: rightOperatorId,
        reason
      })
    ]);
    return { left_operator_id: leftOperatorId, right_operator_id: rightOperatorId, reason };
  }

  async registerAgent({ operator_id, display_name, public_key_pem, capabilities = [], metadata = {} }, actorId = 'admin') {
    this._requireOperator(operator_id);
    requireString(display_name, 'display_name', 2);
    requireString(public_key_pem, 'public_key_pem', 20);
    invariant(Array.isArray(capabilities), 'INVALID_INPUT', 'capabilities must be an array.');
    const agentId = newId('agt');
    await this._append([
      this._input('agent', agentId, 'agent.registered', 'admin', actorId, {
        operator_id,
        display_name: display_name.trim(),
        public_key_pem,
        capabilities: cloneSerializable(capabilities),
        metadata: cloneSerializable(metadata)
      })
    ]);
    return this.getAgent(agentId);
  }

  async revokeAgent(agentId, actorId = 'admin') {
    this._requireAgent(agentId);
    await this._append([this._input('agent', agentId, 'agent.revoked', 'admin', actorId, {})]);
    return this.getAgent(agentId);
  }

  async issueCredits(operatorId, amount, memo, actorId = 'admin') {
    this._requireOperator(operatorId);
    const units = parseCreditAmount(amount);
    requireString(memo, 'memo', 3);
    await this._append([
      this._input('credit_account', operatorId, 'credits.issued', 'admin', actorId, {
        operator_id: operatorId,
        amount_units: units.toString(),
        memo
      })
    ]);
    return this.getBalance(operatorId);
  }
}
