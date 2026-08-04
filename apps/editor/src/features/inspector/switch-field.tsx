import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface SwitchFieldProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** 布尔字段：label + switch 一行 */
export function SwitchField({
  label,
  checked,
  onCheckedChange,
  disabled,
}: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label>{label}</Label>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
