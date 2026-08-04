/**
 * 契约标识常量。
 * format + version 是场景包的身份凭证：校验器先查这两项，再谈字段。
 */

/** 场景包格式标识，v1 固定取值 */
export const SCHEMA_FORMAT = 'prism-scene' as const;

/** 场景包契约版本号，整数，破坏性变更时 +1 */
export const SCHEMA_VERSION = 1 as const;
