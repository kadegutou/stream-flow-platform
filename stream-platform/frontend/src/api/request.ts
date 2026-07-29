import axios from 'axios';

export const TOKEN_KEY = 'stream_platform_token';

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

// 响应拦截器：401 跳回登录页
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default request;
