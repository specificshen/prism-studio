import type { PbrOverride, SceneMaterial } from '@prism/scene-schema';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ColorField } from '@/features/inspector/color-field';
import {
  INSPECTOR_DISPLAY_FALLBACKS,
  INSPECTOR_RANGES,
  type SliderRange,
} from '@/features/inspector/inspector-ranges';
import { NumberField } from '@/features/inspector/number-field';
import { PanelSection } from '@/features/inspector/panel-section';
import { useSceneDocument } from '@/hooks/use-scene-document';

const FALLBACKS = INSPECTOR_DISPLAY_FALLBACKS.pbr;

/**
 * 材质面板：材质条目选择 → pbr 覆盖编辑。
 * 未覆盖的字段展示中立值 +「GLB 原值」标记，拖动后才落数据。
 */
export function MaterialsPanel() {
  const { doc, updateSection } = useSceneDocument();
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );
  if (!doc) {
    return null;
  }
  const materials = doc.materials;
  const material =
    materials.find((item) => item.id === selectedMaterialId) ?? materials[0];

  if (!material) {
    return (
      <p className="p-3 text-xs text-ed-text-soft">
        场景包没有材质覆盖条目（材质映射走 materials[].match.names 显式名单）
      </p>
    );
  }

  const setMaterial = (next: SceneMaterial) =>
    updateSection(
      'materials',
      materials.map((item) => (item.id === next.id ? next : item)),
    );
  const setPbr = (patch: Partial<PbrOverride>) =>
    setMaterial({ ...material, pbr: { ...material.pbr, ...patch } });

  return (
    <div className="flex flex-col">
      <PanelSection title="材质">
        <Select
          value={material.id}
          options={materials.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          onValueChange={(value) => setSelectedMaterialId(value)}
        />
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-ed-text-soft">match.names</span>
          {material.match.names.map((name) => (
            <Badge key={name}>{name}</Badge>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="PBR 覆盖">
        <PbrNumberField
          label="金属度"
          override={material.pbr?.metalness}
          fallback={FALLBACKS.metalness}
          range={INSPECTOR_RANGES.pbr.unit}
          onChange={(metalness) => setPbr({ metalness })}
        />
        <PbrNumberField
          label="粗糙度"
          override={material.pbr?.roughness}
          fallback={FALLBACKS.roughness}
          range={INSPECTOR_RANGES.pbr.unit}
          onChange={(roughness) => setPbr({ roughness })}
        />
        <PbrNumberField
          label="不透明度"
          override={material.pbr?.opacity}
          fallback={FALLBACKS.opacity}
          range={INSPECTOR_RANGES.pbr.unit}
          onChange={(opacity) => setPbr({ opacity })}
        />
        <PbrNumberField
          label="透射率"
          override={material.pbr?.transmission}
          fallback={FALLBACKS.transmission}
          range={INSPECTOR_RANGES.pbr.unit}
          onChange={(transmission) => setPbr({ transmission })}
        />
        <PbrNumberField
          label="折射率 IOR"
          override={material.pbr?.ior}
          fallback={FALLBACKS.ior}
          range={INSPECTOR_RANGES.pbr.ior}
          onChange={(ior) => setPbr({ ior })}
        />
        <div className="flex items-center justify-between gap-2">
          <ColorField
            label="自发光颜色"
            value={material.pbr?.emissive ?? FALLBACKS.emissive}
            onChange={(emissive) => setPbr({ emissive })}
          />
          {material.pbr?.emissive === undefined && <GlbBadge />}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <PbrNumberField
              label="自发光强度"
              override={material.pbr?.emissiveIntensity}
              fallback={FALLBACKS.emissiveIntensity}
              range={INSPECTOR_RANGES.pbr.emissiveIntensity}
              onChange={(emissiveIntensity) => setPbr({ emissiveIntensity })}
            />
          </div>
          {material.pbr?.emissiveIntensity === undefined && <GlbBadge />}
        </div>
      </PanelSection>
    </div>
  );
}

function GlbBadge() {
  return <Badge className="shrink-0">GLB 原值</Badge>;
}

/** pbr 覆盖数值字段：未覆盖时展示中立兜底值并标「GLB 原值」 */
function PbrNumberField({
  label,
  override,
  fallback,
  range,
  onChange,
}: {
  label: string;
  override: number | undefined;
  fallback: number;
  range: SliderRange;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <NumberField
          label={label}
          value={override ?? fallback}
          range={range}
          onChange={onChange}
        />
      </div>
      {override === undefined && <GlbBadge />}
    </div>
  );
}
