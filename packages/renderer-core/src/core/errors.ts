import type { ValidationIssue } from '@prism/scene-schema';

/** 当前浏览器不支持 WebGPU 时抛出（消息面向最终用户） */
export class WebGpuUnsupportedError extends Error {
  override readonly name = 'WebGpuUnsupportedError';

  constructor(
    message = '当前浏览器不支持 WebGPU：请使用最新版 Chrome 或 Edge 打开（Safari 需 26+ 并开启 WebGPU）。',
  ) {
    super(message);
  }
}

/** 契约已声明但渲染核 v1 明确不支持的能力 */
export class PrismUnsupportedError extends Error {
  override readonly name = 'PrismUnsupportedError';
}

/** 场景包校验失败：携带人读 issues，编辑器在校验面板逐条展示 */
export class ScenePackageValidationError extends Error {
  override readonly name = 'ScenePackageValidationError';

  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `场景包校验未通过（${issues.length} 个问题）：\n${issues
        .map((issue) => `- [${issue.severity}] ${issue.path}: ${issue.message}`)
        .join('\n')}`,
    );
    this.issues = issues;
  }
}
