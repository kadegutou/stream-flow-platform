/**
 * localStorage 键名统一出口。
 * 单独成模块是为了避免 `api/request` 与 `store/auth` 互相 import 形成循环依赖
 * （store 在模块初始化时就读取 token，循环依赖时键名可能是 undefined）。
 */
export const TOKEN_KEY = 'stream_platform_token';
export const NICKNAME_KEY = 'stream_platform_nickname';
export const ROLE_KEY = 'stream_platform_role';
