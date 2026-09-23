import axios, { type AxiosError } from 'axios';
import { TOKEN_KEY } from '../constants/storage';
import { appMessage } from '../utils/antdApp';
import { notifyUnauthorized } from './session';

export { TOKEN_KEY };

/**
 * 规范化后的接口错误：业务层只需读 status / message，不必再解构 axios 错误体。
 * message 优先取后端统一返回的 {error:"..."}，取不到时按状态码兜底。
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public raw?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 无响应体时的兜底文案（后端未给出具体原因时使用） */
const STATUS_TEXT: Record<number, string> = {
  400: '请求参数有误',
  401: '登录已过期，请重新登录',
  403: '没有权限执行该操作',
  404: '请求的资源不存在',
  409: '操作冲突，请刷新后重试',
  500: '服务器内部错误',
};

/** 请求根本没到达后端时的原因：超时 / 服务未启动 / 断网 */
function networkMessage(error: AxiosError): string {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return '请求超时，请稍后重试';
  }
  return '无法连接服务器，请确认后端服务已启动';
}

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截器：自动携带 token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一把 axios 错误规范化成 ApiError，并处理登录过期
request.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<{ error?: string }>) => {
    const status = error.response?.status ?? 0;
    const backendMsg = error.response?.data?.error;
    const msg = backendMsg || (status ? STATUS_TEXT[status] ?? `请求失败（${status}）` : networkMessage(error));

    // 401 表示 token 失效：清掉本地 token 后交给 SessionBridge 做「清登录态 + 转场回登录页」。
    // 登录接口自身的 400/401 不走这里（见下方 isLoginRequest），
    // 否则「密码错误」会被误报成「登录已过期」。
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
      notifyUnauthorized();
    }

    return Promise.reject(new ApiError(status, msg, error));
  },
);

/**
 * 统一的错误提示出口：优先展示后端返回的具体原因，无则用调用方的兜底文案。
 * 用法：try { ... } catch (e) { showApiError(e, '加载作业列表失败'); }
 */
export function showApiError(e: unknown, fallback = '操作失败'): void {
  if (e instanceof ApiError && e.message) {
    appMessage().error(e.message);
    return;
  }
  // 非接口错误（前端运行时异常）：打印出来便于排查，同时给用户兜底提示
  console.error('[非接口错误]', e);
  appMessage().error(fallback);
}

export default request;
