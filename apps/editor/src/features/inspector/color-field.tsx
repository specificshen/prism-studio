import { Label } from '@/components/ui/label';

export interface ColorFieldProps {
  label: string;
  /** '#rrggbb' 六位十六进制（契约统一口径） */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** 颜色字段：label + 原生取色器 + 当前 hex 展示 */
export function ColorField({
  label,
  value,
  onChange,
  disabled,
}: ColorFieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ed-text-soft">{value}</span>
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="size-6 cursor-pointer rounded border border-ed-border-strong bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}
