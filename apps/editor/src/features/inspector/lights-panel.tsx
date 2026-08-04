import type { LightType, SceneLight } from '@prism/scene-schema';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ColorField } from '@/features/inspector/color-field';
import { INSPECTOR_RANGES } from '@/features/inspector/inspector-ranges';
import { NumberField } from '@/features/inspector/number-field';
import { PanelSection } from '@/features/inspector/panel-section';
import { SwitchField } from '@/features/inspector/switch-field';
import { useSceneDocument } from '@/hooks/use-scene-document';

const LIGHT_TYPE_LABELS: Record<LightType, string> = {
  sun: '太阳灯',
  point: '点光',
  spot: '聚光',
  area: '面光',
};

/** 灯光面板：单灯选择 → color / energyWatts / intensityScale / shadow.castShadow */
export function LightsPanel() {
  const { doc, updateSection } = useSceneDocument();
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  if (!doc) {
    return null;
  }
  const lights = doc.lights;
  const light = lights.find((item) => item.id === selectedLightId) ?? lights[0];

  if (!light) {
    return <p className="p-3 text-xs text-ed-text-soft">场景包里没有灯光</p>;
  }

  const setLight = (next: SceneLight) =>
    updateSection(
      'lights',
      lights.map((item) => (item.id === next.id ? next : item)),
    );

  return (
    <div className="flex flex-col">
      <PanelSection title="灯光">
        <Select
          value={light.id}
          options={lights.map((item) => ({
            value: item.id,
            label: `${item.name}（${LIGHT_TYPE_LABELS[item.type]}）`,
          }))}
          onValueChange={(value) => setSelectedLightId(value)}
        />
        <div className="flex items-center gap-2">
          <Badge variant="primary">{LIGHT_TYPE_LABELS[light.type]}</Badge>
          <span className="text-xs text-ed-text-soft">{light.id}</span>
        </div>
      </PanelSection>

      <PanelSection title="参数">
        <ColorField
          label="颜色"
          value={light.color}
          onChange={(color) => setLight({ ...light, color })}
        />
        <NumberField
          label="功率"
          unit="瓦"
          value={light.energyWatts}
          range={INSPECTOR_RANGES.light.energyWatts}
          onChange={(energyWatts) => setLight({ ...light, energyWatts })}
        />
        <NumberField
          label="强度倍率"
          value={light.intensityScale}
          range={INSPECTOR_RANGES.light.intensityScale}
          onChange={(intensityScale) => setLight({ ...light, intensityScale })}
        />
      </PanelSection>

      {light.type !== 'area' && (
        <PanelSection title="阴影">
          <SwitchField
            label="投射阴影"
            checked={light.shadow?.castShadow ?? false}
            onCheckedChange={(castShadow) =>
              setLight({ ...light, shadow: { ...light.shadow, castShadow } })
            }
          />
          <p className="text-xs leading-relaxed text-ed-text-soft">
            面光（RectAreaLight）不支持阴影；其余灯缺省按全局阴影规则
          </p>
        </PanelSection>
      )}
    </div>
  );
}
