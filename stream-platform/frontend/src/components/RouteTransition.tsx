import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** 路由标题映射（转场时显示） */
const ROUTE_TITLES: Record<string, { no: string; title: string; sub: string }> = {
  '/home': { no: '00', title: '首页', sub: 'DASHBOARD' },
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

type TransitionKind = 'route' | 'login' | 'logout';

interface TransitionState {
  kind: TransitionKind;
  no: string;
  title: string;
  sub: string;
}

interface TransitionCtx {
  transitionTo: (path: string, opts?: { replace?: boolean }) => void;
  /** 登录转场，onComplete 在黑幕扫出完成后回调 */
  transitionLogin: (path?: string, onComplete?: () => void) => void;
  /** 退出登录转场，onCovered 在黑幕扫入完成后回调，onComplete 在扫出完成后回调 */
  transitionLogout: (onCovered?: () => void, onComplete?: () => void) => void;
}

const Ctx = createContext<TransitionCtx>(null!);

export function useRouteTransition() {
  return useContext(Ctx);
}

/** 普通路由转场时长 */
const COVER_MS = 430;
const REVEAL_MS = 620;

/** 登录加载总时长（进度条从0到100%） */
const LOGIN_LOAD_MS = 2400;
/** 退出关闭总时长（日志逐行出现） */
const LOGOUT_LOAD_MS = 1600;

/** 登录加载日志（随进度条逐行出现） */
const LOGIN_LOGS = [
  '> 验证用户凭证.........OK',
  '> 建立安全会话.........OK',
  '> 加载作业配置.........OK',
  '> 初始化执行引擎.......OK',
  '> 同步集群状态.........OK',
  '> 初始化完成',
];

/** 退出关闭日志（逐行出现） */
const LOGOUT_LOGS = [
  '> 保存会话状态.........OK',
  '> 清理临时数据.........OK',
  '> 断开连接.............OK',
  '> 会话已安全终止',
];

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'entering'>('idle');
  const [info, setInfo] = useState<TransitionState | null>(null);
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef<number>(0);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(raf.current);
  };

  /** 普通路由转场：扫入 → 跳转 → 扫出 */
  const runRoute = useCallback(
    (target: string, opts?: { replace?: boolean }) => {
      clearAll();
      const route = resolveRoute(target);
      setInfo({ kind: 'route', ...route });
      setPhase('leaving');
      setProgress(0);
      setLogLines([]);

      timers.current.push(
        setTimeout(() => {
          navigate(target, { replace: opts?.replace });
          setPhase('entering');
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

  /** 登录转场：扫入 → 进度条0→100% + 日志 → 跳转 → 扫出 */
  const runLogin = useCallback(
    (target: string, onComplete?: () => void) => {
      clearAll();
      setInfo({ kind: 'login', no: 'SYS', title: '系统初始化', sub: 'BOOT / AUTHENTICATION VERIFIED' });
      setPhase('leaving');
      setProgress(0);
      setLogLines([]);

      // 黑幕扫入后开始进度条
      timers.current.push(
        setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const pct = Math.min(100, Math.round((elapsed / LOGIN_LOAD_MS) * 100));
            setProgress(pct);

            // 按进度逐行显示日志
            const lineIdx = Math.floor((pct / 100) * LOGIN_LOGS.length);
            setLogLines(LOGIN_LOGS.slice(0, Math.max(1, lineIdx)));

            if (pct < 100) {
              raf.current = requestAnimationFrame(tick);
            } else {
              // 确保最后一行日志显示
              setLogLines(LOGIN_LOGS);
              // 100%后短暂停留再跳转
              timers.current.push(
                setTimeout(() => {
                  navigate(target, { replace: true });
                  setPhase('entering');
                  timers.current.push(
                    setTimeout(() => {
                      setPhase('idle');
                      setInfo(null);
                      setProgress(0);
                      setLogLines([]);
                      onComplete?.();
                    }, REVEAL_MS),
                  );
                }, 300),
              );
            }
          };
          raf.current = requestAnimationFrame(tick);
        }, COVER_MS),
      );
    },
    [navigate],
  );

  /** 退出转场：扫入 → 日志逐行 → 跳转 → 扫出 */
  const runLogout = useCallback((onCovered?: () => void, onComplete?: () => void) => {
    clearAll();
    setInfo({ kind: 'logout', no: 'SYS', title: '会话终止', sub: 'SHUTDOWN / SESSION CLOSED' });
    setPhase('leaving');
    setProgress(0);
    setLogLines([]);

    // 黑幕扫入后逐行显示日志
    timers.current.push(
      setTimeout(() => {
        // 黑幕已盖住页面，此时清除登录态不会闪跳
        onCovered?.();

        const lineDelay = LOGOUT_LOAD_MS / (LOGOUT_LOGS.length + 1);
        LOGOUT_LOGS.forEach((_, i) => {
          timers.current.push(
            setTimeout(() => {
              setLogLines(LOGOUT_LOGS.slice(0, i + 1));
            }, lineDelay * (i + 1)),
          );
        });

        // 日志全部显示后跳转
        timers.current.push(
          setTimeout(() => {
            navigate('/login', { replace: true });
            setPhase('entering');
            timers.current.push(
              setTimeout(() => {
                setPhase('idle');
                setInfo(null);
                setLogLines([]);
                onComplete?.();
              }, REVEAL_MS),
            );
          }, LOGOUT_LOAD_MS + 200),
        );
      }, COVER_MS),
    );
  }, [navigate]);

  const transitionTo = useCallback(
    (path: string, opts?: { replace?: boolean }) => runRoute(path, opts),
    [runRoute],
  );

  const transitionLogin = useCallback(
    (path = '/home', onComplete?: () => void) => runLogin(path, onComplete),
    [runLogin],
  );

  const transitionLogout = useCallback(
    (onCovered?: () => void, onComplete?: () => void) => runLogout(onCovered, onComplete),
    [runLogout],
  );

  // 卸载时清理
  useEffect(() => () => clearAll(), []);

  const isAuth = info?.kind === 'login' || info?.kind === 'logout';

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
          {/* 登录：进度条 */}
          {info.kind === 'login' && (
            <div className="sp-rt-progress">
              <div className="sp-rt-progress-bar">
                <div className="sp-rt-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="sp-rt-progress-pct">{progress}%</span>
            </div>
          )}
          {/* 登录/退出：终端日志 */}
          {isAuth && logLines.length > 0 && (
            <div className="sp-rt-logs">
              {logLines.map((line, i) => (
                <div key={i} className="sp-rt-log-line">{line}</div>
              ))}
            </div>
          )}
          <em>{info.no}</em>
        </div>
      )}
    </Ctx.Provider>
  );
}
