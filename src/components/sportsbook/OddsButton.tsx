"use client";

type Props = {
  label: string;
  odds: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export function OddsButton({
  label,
  odds,
  selected = false,
  disabled = false,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-1.5 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "bg-brand text-white shadow-sm"
          : "bg-ink-muted/8 text-ink hover:bg-brand/10 active:bg-brand/15"
      }`}
    >
      <span
        className={`text-[10px] font-medium leading-none ${
          selected ? "text-white/80" : "text-ink-muted"
        }`}
      >
        {label}
      </span>
      <span className="mt-1 text-sm font-bold tabular-nums leading-none">
        {odds.toFixed(2)}
      </span>
    </button>
  );
}
