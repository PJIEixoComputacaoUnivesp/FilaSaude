import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className = "h-10", showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className="flex items-center gap-3 cursor-pointer select-none">
      <svg 
        viewBox="0 0 200 200" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className={className}
      >
        <defs>
          {/* Gradiente da Cruz: Ciano para Verde Saúde */}
          <linearGradient id="fsCrossGrad" x1="10%" y1="90%" x2="90%" y2="10%">
            <stop offset="0%" stopColor="#00A5E3" />
            <stop offset="55%" stopColor="#00A88F" />
            <stop offset="100%" stopColor="#009688" />
          </linearGradient>

          {/* Gradiente da Base Azul */}
          <linearGradient id="fsBaseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1266CC" />
            <stop offset="100%" stopColor="#0D47A1" />
          </linearGradient>
        </defs>

        {/* CRUZ ARREDONDADA (Fundo) */}
        <g fill="url(#fsCrossGrad)">
          <rect x="62" y="16" width="76" height="132" rx="32" />
          <rect x="18" y="50" width="164" height="76" rx="32" />
        </g>

        <g fill="white">
          {/* Pessoas Esquerda + Centro */}
          <path d="
            M 50 125
            C 50 106, 62 94, 74 94
            C 84 94, 90 88, 100 88
            C 110 88, 115 96, 115 125
            L 115 160
            L 50 160
            Z
          " />

          {/* Pessoa da Direita */}
          <path d="
            M 121 125
            C 121 106, 126 94, 136 94
            C 145 94, 149 106, 149 125
            L 149 160
            L 121 160
            Z
          " />

          {/* Cabeças */}
          <circle cx="100" cy="68" r="12" />
          <circle cx="74" cy="80" r="10" />
          <circle cx="136" cy="80" r="10" />
        </g>

        {/* BASE AZUL  */}
        <path
          d="M 48 122
             C 48 172, 152 172, 152 122
             C 130 137, 70 137, 48 122 Z"
          fill="url(#fsBaseGrad)"
        />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-fila-blue tracking-tight leading-none">
            Fila<span className="text-fila-green">Saúde</span>
          </span>
        </div>
      )}
    </div>
  );
}