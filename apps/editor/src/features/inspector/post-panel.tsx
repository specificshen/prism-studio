import type { ToneMappingType } from '@prism/scene-schema';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  INSPECTOR_RANGES,
  INSPECTOR_SECTION_DEFAULTS,
} from '@/features/inspector/inspector-ranges';
import { NumberField } from '@/features/inspector/number-field';
import { PanelSection } from '@/features/inspector/panel-section';
import { SwitchField } from '@/features/inspector/switch-field';
import { useSceneDocument } from '@/hooks/use-scene-document';

const TONE_MAPPING_OPTIONS = (
  ['AgX', 'ACESFilmic', 'Neutral'] as ToneMappingType[]
).map((type) => ({ value: type, label: type }));

/** 后期面板：bloom / ao / 色调映射（renderer.toneMapping） */
export function PostPanel() {
  const { doc, updateSection } = useSceneDocument();
  if (!doc) {
    return null;
  }
  const post = doc.post;
  const bloom = post.bloom;
  const ao = post.ao;
  const toneMapping = doc.renderer.toneMapping;

  return (
    <div className="flex flex-col">
      <PanelSection
        title="Bloom 泛光"
        action={
          bloom ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateSection('post', {
                  ...post,
                  bloom: { ...INSPECTOR_SECTION_DEFAULTS.bloom },
                })
              }
            >
              添加
            </Button>
          )
        }
      >
        {bloom ? (
          <>
            <SwitchField
              label="启用"
              checked={bloom.enabled}
              onCheckedChange={(enabled) =>
                updateSection('post', { ...post, bloom: { ...bloom, enabled } })
              }
            />
            <NumberField
              label="阈值"
              value={bloom.threshold}
              range={INSPECTOR_RANGES.bloom.threshold}
              onChange={(threshold) =>
                updateSection('post', {
                  ...post,
                  bloom: { ...bloom, threshold },
                })
              }
            />
            <NumberField
              label="强度"
              value={bloom.strength}
              range={INSPECTOR_RANGES.bloom.strength}
              onChange={(strength) =>
                updateSection('post', {
                  ...post,
                  bloom: { ...bloom, strength },
                })
              }
            />
            <NumberField
              label="半径"
              value={bloom.radius}
              range={INSPECTOR_RANGES.bloom.radius}
              onChange={(radius) =>
                updateSection('post', { ...post, bloom: { ...bloom, radius } })
              }
            />
          </>
        ) : (
          <p className="text-xs text-ed-text-soft">未配置 Bloom</p>
        )}
      </PanelSection>

      <PanelSection
        title="AO 环境光遮蔽（GTAO）"
        action={
          ao ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateSection('post', {
                  ...post,
                  ao: { ...INSPECTOR_SECTION_DEFAULTS.ao },
                })
              }
            >
              添加
            </Button>
          )
        }
      >
        {ao ? (
          <>
            <SwitchField
              label="启用"
              checked={ao.enabled}
              onCheckedChange={(enabled) =>
                updateSection('post', { ...post, ao: { ...ao, enabled } })
              }
            />
            <NumberField
              label="强度"
              value={ao.strength}
              range={INSPECTOR_RANGES.ao.strength}
              onChange={(strength) =>
                updateSection('post', { ...post, ao: { ...ao, strength } })
              }
            />
            <NumberField
              label="采样半径"
              unit="米"
              value={ao.radius}
              range={INSPECTOR_RANGES.ao.radius}
              onChange={(radius) =>
                updateSection('post', { ...post, ao: { ...ao, radius } })
              }
            />
            <NumberField
              label="分辨率缩放"
              value={ao.resolutionScale}
              range={INSPECTOR_RANGES.ao.resolutionScale}
              onChange={(resolutionScale) =>
                updateSection('post', {
                  ...post,
                  ao: { ...ao, resolutionScale },
                })
              }
            />
          </>
        ) : (
          <p className="text-xs text-ed-text-soft">未配置 AO</p>
        )}
      </PanelSection>

      <PanelSection title="色调映射">
        <div className="flex items-center justify-between gap-2">
          <Label>类型</Label>
          <Select
            className="w-36"
            value={toneMapping.type}
            options={TONE_MAPPING_OPTIONS}
            onValueChange={(type) =>
              updateSection('renderer', {
                ...doc.renderer,
                toneMapping: {
                  ...toneMapping,
                  type: type as ToneMappingType,
                },
              })
            }
          />
        </div>
        <NumberField
          label="曝光"
          unit="档"
          value={toneMapping.exposureStops}
          range={INSPECTOR_RANGES.toneMapping.exposureStops}
          onChange={(exposureStops) =>
            updateSection('renderer', {
              ...doc.renderer,
              toneMapping: { ...toneMapping, exposureStops },
            })
          }
        />
      </PanelSection>
    </div>
  );
}
