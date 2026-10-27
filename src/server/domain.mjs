export class DomainError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function evaluate(outcome, result) {
  if (result.void) return 'void';
  const { home, away } = result;
  if (![home, away].every(v => Number.isInteger(v) && v >= 0 && v <= 99)) throw new DomainError('Счёт должен состоять из целых чисел от 0 до 99.');
  if (outcome.kind === 'home') return home > away ? 'win' : 'loss';
  if (outcome.kind === 'away') return away > home ? 'win' : 'loss';
  if (outcome.kind === 'draw') return home === away ? 'win' : 'loss';
  if (['over','under'].includes(outcome.kind)) {
    const total = home + away;
    if (total === outcome.line) return 'void';
    return (outcome.kind === 'over' ? total > outcome.line : total < outcome.line) ? 'win' : 'loss';
  }
  throw new DomainError('Этот рынок пока не поддерживается.');
}
export function payout(stake, odds, result) {
  if (!Number.isSafeInteger(stake) || stake <= 0) throw new DomainError('Некорректный номинал.');
  const hundredths = Math.round(Number(odds) * 100);
  if (!Number.isSafeInteger(hundredths) || hundredths <= 100) throw new DomainError('Некорректный коэффициент.');
  return result === 'void' ? stake : result === 'win' ? Math.round(stake * hundredths / 100) : 0;
}
