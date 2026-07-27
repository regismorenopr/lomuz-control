import React, { useId } from 'react';

/* =========================================================================
   LOGOMARCA — LOMUZ CONTROL

   Conceito: um "U" maiúsculo geométrico desenhado com um único traço de
   espessura constante, em que o braço DIREITO termina mais alto que o
   esquerdo. Isso mantém a leitura imediata da letra e, ao mesmo tempo,
   sugere movimento ascendente / evolução — sem usar cifrão, moeda, cofre
   nem gráfico literal. O gradiente sobe da esquerda-baixo (roxo luminoso)
   para a direita-alto (índigo), reforçando a subida.

   O símbolo funciona sozinho como ícone e continua legível em 16px porque
   é feito de duas retas e um arco, sem detalhes finos.
   ========================================================================= */

const PATH_U = 'M12 13 V23 A8 8 0 0 0 28 23 V8';

/**
 * Símbolo isolado do U.
 * @param {number} size        lado do quadrado, em px
 * @param {'gradient'|'solid'|'currentColor'} fill  como pintar o traço
 * @param {string} color       cor usada quando fill='solid'
 * @param {boolean} decorative true = esconde de leitores de tela (quando o
 *                             nome já aparece em texto ao lado)
 */
export function LogoSymbol({ size = 32, fill = 'gradient', color = '#6D28D9', decorative = false, style }) {
  const gid = useId();
  const stroke = fill === 'gradient' ? `url(#${gid})` : fill === 'currentColor' ? 'currentColor' : color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : 'Lomuz Control'}
      focusable="false"
      style={style}
    >
      {!decorative && <title>Lomuz Control</title>}
      {fill === 'gradient' && (
        <defs>
          {/* x1/y1 embaixo-esquerda → x2/y2 em cima-direita: o gradiente sobe. */}
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="50%" stopColor="#6D28D9" />
            <stop offset="100%" stopColor="#4338CA" />
          </linearGradient>
        </defs>
      )}
      <path
        d={PATH_U}
        fill="none"
        stroke={stroke}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Símbolo dentro do quadrado roxo escuro — usado no menu lateral e como base
 * do favicon. É a versão "aplicada" do ícone.
 */
export function LogoMark({ size = 36, radius, style }) {
  const r = radius != null ? radius : Math.round(size * 0.28);
  return (
    <span
      style={{
        width: size, height: size, borderRadius: r, background: '#18112B',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, ...style,
      }}
    >
      <LogoSymbol size={Math.round(size * 0.72)} decorative />
    </span>
  );
}

/**
 * Lockup horizontal: símbolo + "Lomuz Control".
 * O "u" de Lomuz recebe o roxo da marca; as outras letras ficam neutras.
 *
 * O texto é HTML real (não path de SVG) de propósito: renderiza mais nítido
 * em tamanho pequeno, herda a fonte Inter do app, permite busca/seleção e é
 * lido corretamente por leitores de tela. O símbolo ao lado é SVG e vai como
 * decorativo, para o nome não ser anunciado duas vezes.
 *
 * @param {'light'|'dark'} tone  'light' = para fundo claro, 'dark' = fundo escuro
 */
export function LogoHorizontal({ tone = 'light', size = 34, showSubtitle = true, style }) {
  const isDark = tone === 'dark';
  const nameColor = isDark ? '#FFFFFF' : '#17151F';
  const subColor = isDark ? '#A7A3B5' : '#667085';
  const uColor = isDark ? '#A78BFA' : '#6D28D9';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}>
      <LogoMark size={size} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
        <span style={{ fontSize: size * 0.5, fontWeight: 800, letterSpacing: '-0.02em', color: nameColor, whiteSpace: 'nowrap' }}>
          Lom<span style={{ color: uColor }}>u</span>z
        </span>
        {showSubtitle && (
          <span
            style={{
              fontSize: Math.max(8.5, size * 0.245), fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: subColor, marginTop: 4, whiteSpace: 'nowrap',
            }}
          >
            Control
          </span>
        )}
      </span>
    </span>
  );
}
