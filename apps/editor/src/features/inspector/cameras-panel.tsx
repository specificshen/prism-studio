import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { INSPECTOR_RANGES } from '@/features/inspector/inspector-ranges';
import { NumberField } from '@/features/inspector/number-field';
import { PanelSection } from '@/features/inspector/panel-section';
import { useSceneDocument } from '@/hooks/use-scene-document';

/** 相机面板：激活相机切换（updateCamera）+ lensMm/clipNear/clipFar 编辑 */
export function CamerasPanel() {
  const { doc, updateSection, activeCameraId, selectCamera } =
    useSceneDocument();
  if (!doc) {
    return null;
  }
  const cameras = doc.cameras;
  const camera =
    cameras.find((item) => item.id === activeCameraId) ?? cameras[0];

  if (!camera) {
    return (
      <p className="p-3 text-xs text-ed-text-soft">
        场景包没有相机，视口使用编辑器兜底视角
      </p>
    );
  }

  const setCamera = (next: typeof camera) =>
    updateSection(
      'cameras',
      cameras.map((item) => (item.id === next.id ? next : item)),
    );

  return (
    <div className="flex flex-col">
      <PanelSection title="激活相机">
        <Select
          value={camera.id}
          options={cameras.map((item) => ({
            value: item.id,
            label: item.isDefault ? `${item.name}（默认）` : item.name,
          }))}
          onValueChange={(value) => selectCamera(value)}
        />
        <div className="flex items-center gap-2">
          {camera.isDefault && <Badge variant="primary">默认相机</Badge>}
          <span className="text-xs text-ed-text-soft">
            传感器 {camera.sensorWidthMm}mm · {camera.sensorFit}
          </span>
        </div>
      </PanelSection>

      <PanelSection title="镜头">
        <NumberField
          label="焦距"
          unit="毫米"
          value={camera.lensMm}
          range={INSPECTOR_RANGES.camera.lensMm}
          onChange={(lensMm) => setCamera({ ...camera, lensMm })}
        />
        <NumberField
          label="近裁剪面"
          unit="米"
          value={camera.clipNear}
          range={INSPECTOR_RANGES.camera.clipNear}
          onChange={(clipNear) => setCamera({ ...camera, clipNear })}
        />
        <NumberField
          label="远裁剪面"
          unit="米"
          value={camera.clipFar}
          range={INSPECTOR_RANGES.camera.clipFar}
          onChange={(clipFar) => setCamera({ ...camera, clipFar })}
        />
      </PanelSection>
    </div>
  );
}
