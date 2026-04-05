// 브랜드명 기반 일관된 색상 아바타

const COLORS = [
  { bg: '#6366f1', text: '#fff' },
  { bg: '#0ea5e9', text: '#fff' },
  { bg: '#10b981', text: '#fff' },
  { bg: '#f97316', text: '#fff' },
  { bg: '#ec4899', text: '#fff' },
  { bg: '#8b5cf6', text: '#fff' },
  { bg: '#14b8a6', text: '#fff' },
];

function pickColor(name: string) {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE = {
  sm: { outer: 'w-8 h-8 text-xs', font: '13px' },
  md: { outer: 'w-10 h-10 text-sm', font: '15px' },
  lg: { outer: 'w-16 h-16 text-xl', font: '24px' },
};

export default function BrandAvatar({ name, size = 'sm' }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || 'B';
  const color = pickColor(name);
  const s = SIZE[size];

  return (
    <div
      className={`${s.outer} flex-shrink-0 rounded-full flex items-center justify-center font-semibold select-none`}
      style={{ background: color.bg, color: color.text, fontSize: s.font }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
