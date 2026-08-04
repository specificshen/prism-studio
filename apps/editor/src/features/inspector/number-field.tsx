import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { SliderRange } from '@/features/inspector/inspector-ranges';

export interface NumberFieldProps {
  label: string;
  value: number;
  range: SliderRange;
  onChange: (value: number) => void;
  /** 单位说明，跟在标签后展示（如「米」「瓦」） */
  unit?: string;
  disabled?: boolean;
}

/** 数值字段：label + slider + 数字输入联动 */
export function NumberField({
  label,
  value,
  range,
  onChange,
  unit,
  disabled,
}: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>
          {label}
          {unit ? <span className="text-ed-text-soft">（{unit}）</span> : null}
        </Label>
        <Input
          type="number"
          className="h-6 w-20 px-1.5 text-right"
          value={value}
          min={range.min}
          max={range.max}
          step={range.step}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            if (!Number.isNaN(next)) {
              onChange(next);
            }
          }}
        />
      </div>
      <Slider
        value={value}
        min={range.min}
        max={range.max}
        step={range.step}
        disabled={disabled}
        onValueChange={onChange}
      />
    </div>
  );
}
