import { create } from 'zustand';
import { TOKEN_KEY } from '../api/request';

interface AuthState {
  token: string | null;
  nickname: string;
  role: string;
  setAuth: (token: string, nickname: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  nickname: localStorage.getItem('stream_platform_nickname') ?? '',
  role: localStorage.getItem('stream_platform_role') ?? '',
  setAuth: (token, nickname, role) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem('stream_platform_nickname', nickname);
    localStorage.setItem('stream_platform_role', role);
    set({ token, nickname, role });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('stream_platform_nickname');
    localStorage.removeItem('stream_platform_role');
    set({ token: null, nickname: '', role: '' });
  },
}));
