/** Shared numerical integration and computation-control errors. */
export class IntegrationError extends Error { constructor(message: string) { super(message); this.name = 'IntegrationError'; } }
export class CalculationCancelled extends Error { constructor(message = 'Calculation cancelled') { super(message); this.name = 'CalculationCancelled'; } }
export class CalculationTimeout extends Error { constructor() { super('Calculation time budget reached'); this.name = 'CalculationTimeout'; } }
