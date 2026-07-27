import React from 'react';

/* =========================================================================
   CAMPO DE VALOR EM REAIS — máscara automática
   O usuário só digita números; a formatação "R$ 1.234,56" aparece sozinha,
   sem precisar digitar vírgula, ponto ou "R$". Guarda o valor em reais
   (número) no estado de quem usa o componente — a conversão de/para centavos
   fica só aqui dentro.
   ========================================================================= */
export function CurrencyInput({ value, onChange, placeholder = 'R$ 0,00', style, autoFocus, id, disabled, onBlur }) {
  const cents = Math.round((Number(value) || 0) * 100);
  const displayValue = (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function handleChange(e) {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    const nextCents = parseInt(digitsOnly || '0', 10);
    onChange(nextCents / 100);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onBlur={onBlur}
      placeholder={placeholder}
      style={style}
      autoFocus={autoFocus}
      disabled={disabled}
    />
  );
}
