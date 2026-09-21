import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** 路由标题映射（转场时显示） */
const ROUTE_TITLES: Record<string, { no: string; title: string; sub: string }> = {
  '/jobs': { no: '01', title: '作业管理', sub: 'JOB ORCHESTRATION' },
  '/components': { no: '02', title: '控件列表', sub: 'COMPONENT REGISTRY' },
  '/users': { no: '03', title: '用户管理', sub: 'USER ADMINISTRATION' },
  '/monitor': { no: '04', title: '运行监控', sub: 'RUNTIME MONITOR' },
};

function resolveRoute(pathname: string) {
  if (pathname.startsWith('/jobs/') && pathname.endsWith('/editor')) {
    return { no: '01-E', title: '编辑画布', sub: 'DAG CANVAS EDITOR' };
  }
  return ROUTE_TITLES[pathname] ?? { no: '00', title: '平台', sub: 'STREAM PLATFORM' };
}

/** 登录 / 退出专属转场文案 */
const AUTH_TRANSITIONS = {
  login: { no: 'SYS', title: '系统初始化', sub: 'BOOT / AUTHENTICATION VERIFIED' },
  logout: { no: 'SYS', title: '会话终止', sub: 'SHUTDOWN / SESSION CLOSED' },
} as const;

type TransitionKind = 'route' | 'login' | 'logout';

interface TransitionState {
  kind: TransitionKind;
  no: string;
  title: string;
  sub: string;
}

interface TransitionCtx {
  transitionTo: (path: string, opts?: { replace?: boolean }) => void;
  transitionLogin: (path?: string) => void;
  transitionLogout: () => void;
}

const Ctx = createContext<TransitionCtx>(null!);

export function useRouteTransition() {
  return useContext(Ctx);
}

/** 扫入耗时（与 CSS 动画一致） */
const COVER_MS = 430;
/** 扫出耗时（与 CSS 动画一致） */
const REVEAL_MS = 620;

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'entering'>('idle');
  const [info, setInfo] = useState<TransitionState | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const run = useCallback(
    (kind: TransitionKind, target: string | null, opts?: { replace?: boolean }) => {
      // 清掉上一次未完成的转场
      clearTimers();

      const route =
        kind === 'login'
          ? AUTH_TRANSITIONS.login
          : kind === 'logout'
            ? AUTH_TRANSITIONS.logout
            : resolveRoute(target ?? '/jobs');

      setInfo({ kind, ...route });
      setPhase('leaving');

      // 黑幕扫入完成后切换路由
      timers.current.push(
        setTimeout(() => {
          if (target) navigate(target, { replace: opts?.replace });
          setPhase('entering');
          // 扫出完成后归位
          timers.current.push(
            setTimeout(() => {
              setPhase('idle');
              setInfo(null);
            }, REVEAL_MS),
          );
        }, COVER_MS),
      );
    },
    [navigate],
  );

  const transitionTo = useCallback(
    (path: string, opts?: { replace?: boolean }) => {
      run('route', path, opts);
    },
    [run],
  );

  const transitionLogin = useCallback(
    (path = '/jobs') => run('login', path, { replace: true }),
    [run],
  );

  const transitionLogout = useCallback(() => run('logout', '/login', { replace: true }), [run]);

  return (
    <Ctx.Provider value={{ transitionTo, transitionLogin, transitionLogout }}>
      {children}
      {phase !== 'idle' && info && (
        <div className={`sp-route-transition is-${phase} sp-rt-${info.kind}`} aria-hidden>
          <i />
          <div className="sp-route-copy">
            <span>{info.kind === 'route' ? `ROUTE / ${info.no}` : info.sub}</span>
            <b>{info.title}</b>
            <small>{info.kind === 'route' ? info.sub : 'STREAM PLATFORM'}</small>
          </div>
          <em>{info.no}</em>
        </div>
      )}
    </Ctx.Provider>
  );
}
