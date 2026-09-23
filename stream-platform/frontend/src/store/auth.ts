import { create } from 'zustand';
import { NICKNAME_KEY, ROLE_KEY, TOKEN_KEY } from '../constants/storage';

interface AuthState {
  token: string | null;
  nickname: string;
  role: string;
  setAuth: (token: string, nickname: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  nickname: localStorage.getItem(NICKNAME_KEY) ?? '',
  role: localStorage.getItem(ROLE_KEY) ?? '',
  setAuth: (token, nickname, role) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(NICKNAME_KEY, nickname);
    localStorage.setItem(ROLE_KEY, role);
    set({ token, nickname, role });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NICKNAME_KEY);
    localStorage.removeItem(ROLE_KEY);
    set({ token: null, nickname: '', role: '' });
  },
}));
