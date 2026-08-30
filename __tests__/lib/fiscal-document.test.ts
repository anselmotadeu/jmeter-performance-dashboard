import { isValidCNPJ, isValidCPF, isValidFiscalDocument } from '@/lib/fiscal-document';

describe('fiscal document validation', () => {
  it('validates formatted CPF and rejects invalid CPF', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('529.982.247-24')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
  });

  it('validates formatted CNPJ and rejects invalid CNPJ', () => {
    expect(isValidCNPJ('48.847.227/0001-01')).toBe(true);
    expect(isValidCNPJ('48.847.227/0001-02')).toBe(false);
    expect(isValidCNPJ('11.111.111/1111-11')).toBe(false);
  });

  it('accepts either supported Brazilian fiscal document', () => {
    expect(isValidFiscalDocument('52998224725')).toBe(true);
    expect(isValidFiscalDocument('48847227000101')).toBe(true);
    expect(isValidFiscalDocument('123')).toBe(false);
  });
});
