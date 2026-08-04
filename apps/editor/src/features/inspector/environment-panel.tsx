import type { FogConfig, SceneEnvironment } from '@prism/scene-schema';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/features/inspector/color-field';
import {
  INSPECTOR_DISPLAY_FALLBACKS,
  INSPECTOR_RANGES,
  INSPECTOR_SECTION_DEFAULTS,
} from '@/features/inspector/inspector-ranges';
import { NumberField } from '@/features/inspector/number-field';
import { PanelSection } from '@/features/inspector/panel-section';
import { SwitchField } from '@/features/inspector/switch-field';
import { useSceneDocument } from '@/hooks/use-scene-document';

const ENVIRONMENT_TYPE_LABELS: Record<SceneEnvironment['type'], string> = {
  hdri: 'HDRI 贴图',
  'procedural-sky': '程序化天空',
  'physical-atmosphere': '物理大气（experimental）',
};

/** 环境面板：类型展示 + 雾 + 各类型专属参数 */
export function EnvironmentPanel() {
  const { doc, updateSection } = useSceneDocument();
  if (!doc) {
    return null;
  }
  const environment = doc.environment;
  const setEnvironment = (next: SceneEnvironment) =>
    updateSection('environment', next);
  const setFog = (fog: FogConfig) => setEnvironment({ ...environment, fog });

  return (
    <div className="flex flex-col">
      <PanelSection title="环境类型">
        <div className="flex items-center justify-between">
          <Badge variant="primary">
            {ENVIRONMENT_TYPE_LABELS[environment.type]}
          </Badge>
          {environment.type === 'hdri' && (
            <span className="max-w-40 truncate text-xs text-ed-text-soft">
              {environment.url}
            </span>
          )}
        </div>
      </PanelSection>

      <PanelSection
        title="雾"
        action={
          environment.fog ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFog({ ...INSPECTOR_SECTION_DEFAULTS.fog })}
            >
              添加雾
            </Button>
          )
        }
      >
        {environment.fog ? (
          <>
            <SwitchField
              label="启用雾"
              checked={environment.fog.enabled}
              onCheckedChange={(enabled) =>
                setFog({ ...environment.fog!, enabled })
              }
            />
            <ColorField
              label="雾颜色"
              value={environment.fog.color}
              onChange={(color) => setFog({ ...environment.fog!, color })}
            />
            <NumberField
              label="起始距离"
              unit="米"
              value={environment.fog.near}
              range={INSPECTOR_RANGES.fog.near}
              onChange={(near) => setFog({ ...environment.fog!, near })}
            />
            <NumberField
              label="遮蔽距离"
              unit="米"
              value={environment.fog.far}
              range={INSPECTOR_RANGES.fog.far}
              onChange={(far) => setFog({ ...environment.fog!, far })}
            />
          </>
        ) : (
          <p className="text-xs text-ed-text-soft">当前环境没有雾配置</p>
        )}
      </PanelSection>

      {environment.type === 'hdri' && (
        <PanelSection title="HDRI 强度">
          <NumberField
            label="背景强度"
            value={environment.strength}
            range={INSPECTOR_RANGES.hdri.strength}
            onChange={(strength) =>
              setEnvironment({ ...environment, strength })
            }
          />
          <NumberField
            label="光照强度"
            value={environment.lightingStrength}
            range={INSPECTOR_RANGES.hdri.lightingStrength}
            onChange={(lightingStrength) =>
              setEnvironment({ ...environment, lightingStrength })
            }
          />
        </PanelSection>
      )}

      {environment.type === 'procedural-sky' && (
        <PanelSection title="天空参数">
          <NumberField
            label="太阳高度角"
            unit="度"
            value={environment.sunElevationDeg}
            range={INSPECTOR_RANGES.sky.sunElevationDeg}
            onChange={(sunElevationDeg) =>
              setEnvironment({ ...environment, sunElevationDeg })
            }
          />
          <NumberField
            label="太阳方位角"
            unit="度"
            value={environment.sunAzimuthDeg}
            range={INSPECTOR_RANGES.sky.sunAzimuthDeg}
            onChange={(sunAzimuthDeg) =>
              setEnvironment({ ...environment, sunAzimuthDeg })
            }
          />
          <NumberField
            label="浑浊度"
            value={
              environment.turbidity ?? INSPECTOR_DISPLAY_FALLBACKS.turbidity
            }
            range={INSPECTOR_RANGES.sky.turbidity}
            onChange={(turbidity) =>
              setEnvironment({ ...environment, turbidity })
            }
          />
        </PanelSection>
      )}

      {environment.type === 'physical-atmosphere' && (
        <PanelSection title="地理位置">
          <div className="flex items-center justify-between text-xs text-ed-text-sub">
            <span>纬度</span>
            <span>{environment.geo.latitudeDeg}°</span>
          </div>
          <div className="flex items-center justify-between text-xs text-ed-text-sub">
            <span>经度</span>
            <span>{environment.geo.longitudeDeg}°</span>
          </div>
        </PanelSection>
      )}
    </div>
  );
}
