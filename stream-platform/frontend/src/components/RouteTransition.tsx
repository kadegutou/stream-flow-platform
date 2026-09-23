import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** 线条方向：左侧竖线 / 右侧竖线 / 顶部横线 / 底部横线 / 交叉 */
type LineDir = 'left' | 'right' | 'top' | 'bottom' | 'cross';

/** 路由标题映射 */
const ROUTE_TITLES: Record<string, { no: string; title: string; sub: string; dir: LineDir }> = {
  '/home': { no: '00', title: '首页', sub: 'DASHBOARD', dir: 'top' },
  '/jobs': { no: '01', title: '作业管理', sub: 'JOB ORCHESTRATION', dir: 'left' },
  '/components': { no: '02', title: '控件列表', sub: 'COMPONENT REGISTRY', dir: 'right' },
  '/users': { no: '03', title: '用户管理', sub: 'USER ADMINISTRATION', dir: 'bottom' },
  '/monitor': { no: '04', title: '运行监控', sub: 'RUNTIME MONITOR', dir: 'cross' },
};

function resolveRoute(pathname: string): { no: string; title: string; sub: string; dir: LineDir } {
  if (pathname.startsWith('/jobs/') && pathname.endsWith('/editor')) {
    return { no: '01-E', title: '编辑画布', sub: 'DAG CANVAS EDITOR', dir: 'right' };
  }
  return ROUTE_TITLES[pathname] ?? { no: '00', title: '平台', sub: 'STREAM PLATFORM', dir: 'left' };
}

type TransitionKind = 'route' | 'login' | 'logout';

interface TransitionState {
  kind: TransitionKind;
  no: string;
  title: string;
  sub: string;
  dir: LineDir;
}

interface TransitionCtx {
  transitionTo: (path: string, opts?: { replace?: boolean; skipTransition?: boolean }) => void;
  transitionLogin: (path?: string, onComplete?: () => void) => void;
  transitionLogout: (onCovered?: () => void, onComplete?: () => void) => void;
}

const Ctx = createContext<TransitionCtx>(null!);

export function useRouteTransition() {
  return useContext(Ctx);
}

const COVER_MS = 600;
const REVEAL_MS = 800;
const AUTH_REVEAL_MS = 400; // 登录/退出扫出更快
const LOGIN_LOAD_MS = 2400;
const LOGOUT_LOAD_MS = 1600;
const LINE_EXIT_MS = 250; // 线条退出动画时长（速度翻倍）
const LINE_EXIT_WAIT_MS = 150; // 线条退出后多久扫出

const LOGIN_LOGS = [
  '> 验证用户凭证.........OK',
  '> 建立安全会话.........OK',
  '> 加载作业配置.........OK',
  '> 初始化执行引擎.......OK',
  '> 同步集群状态.........OK',
  '> 初始化完成',
];

const LOGOUT_LOGS = [
  '> 保存会话状态.........OK',
  '> 清理临时数据.........OK',
  '> 断开连接.............OK',
  '> 会话已安全终止',
];

/** 登录/退出线条的 Y 位置（-160vh ~ 160vh），由 JS 驱动 */
type LineAnimState = 'idle' | 'entering' | 'following' | 'holding' | 'exiting';

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'entering'>('idle');
  const [info, setInfo] = useState<TransitionState | null>(null);
  const [progress, setProgress] = useState(0); // 浮点进度 0-100
  const [logLines, setLogLines] = useState<string[]>([]);
  const [lineAnim, setLineAnim] = useState<LineAnimState>('idle');
  const [linePct, setLinePct] = useState(0); // 0-100 线条跟随进度
  const [flashPct, setFlashPct] = useState(false); // 100% 闪烁
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef<number>(0);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(raf.current);
  };

  const runRoute = useCallback(
    (target: string, opts?: { replace?: boolean }) => {
      clearAll();
      const route = resolveRoute(target);
      setInfo({ kind: 'route', ...route });
      setPhase('leaving');
      setProgress(0);
      setLogLines([]);
      setLineAnim('idle');

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

  const runLogin = useCallback(
    (target: string, onComplete?: () => void) => {
      clearAll();
      setInfo({ kind: 'login', no: 'SYS', title: '系统初始化', sub: 'BOOT / AUTHENTICATION VERIFIED', dir: 'left' });
      setPhase('leaving');
      setProgress(0);
      setLogLines([]);
      setLineAnim('following');
      setLinePct(0);
      setFlashPct(false);

      timers.current.push(
        setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const pct = Math.min(100, (elapsed / LOGIN_LOAD_MS) * 100);
            setProgress(pct); // 浮点数，和线条同步
            setLinePct(pct);
            const lineIdx = Math.floor((pct / 100) * LOGIN_LOGS.length);
            setLogLines(LOGIN_LOGS.slice(0, Math.max(1, lineIdx)));

            if (pct < 100) {
              raf.current = requestAnimationFrame(tick);
            } else {
              setLogLines(LOGIN_LOGS);
              // 100% 闪烁 3 次（约 0.9s）
              setFlashPct(true);
              timers.current.push(
                setTimeout(() => {
                  setFlashPct(false);
                  // 线条从屏幕下方快速离开
                  setLineAnim('exiting');
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
                          setLineAnim('idle');
                          onComplete?.();
                        }, AUTH_REVEAL_MS),
                      );
                    }, LINE_EXIT_WAIT_MS),
                  );
                }, 900), // 闪烁 0.9s
              );
            }
          };
          raf.current = requestAnimationFrame(tick);
        }, COVER_MS),
      );
    },
    [navigate],
  );

  const runLogout = useCallback((onCovered?: () => void, onComplete?: () => void) => {
    clearAll();
    setInfo({ kind: 'logout', no: 'SYS', title: '会话终止', sub: 'SHUTDOWN / SESSION CLOSED', dir: 'left' });
    setPhase('leaving');
    setProgress(0);
    setLogLines([]);
    setLineAnim('entering'); // 线条从一开始就穿出
    setLinePct(0);

    timers.current.push(
      setTimeout(() => {
        onCovered?.();
        const lineDelay = LOGOUT_LOAD_MS / (LOGOUT_LOGS.length + 1);

        // 日志逐行出现
        LOGOUT_LOGS.forEach((_, i) => {
          timers.current.push(
            setTimeout(() => {
              setLogLines(LOGOUT_LOGS.slice(0, i + 1));
            }, lineDelay * (i + 1)),
          );
        });

        // 线条从上方外滑入到中央（0.6s），然后停住等日志
        const enterStart = performance.now();
        const ENTER_DUR = 600;
        const enterTick = (now: number) => {
          const elapsed = now - enterStart;
          const pct = Math.min(100, (elapsed / ENTER_DUR) * 100);
          setLinePct(pct);
          if (pct < 100) {
            raf.current = requestAnimationFrame(enterTick);
          } else {
            // 到达中央，停住等日志
            setLineAnim('holding');
          }
        };
        raf.current = requestAnimationFrame(enterTick);

        // 最后一行日志出来后 0.3s，线条快速离开
        timers.current.push(
          setTimeout(() => {
            setLineAnim('exiting');
            timers.current.push(
              setTimeout(() => {
                navigate('/login', { replace: true });
                setPhase('entering');
                timers.current.push(
                  setTimeout(() => {
                    setPhase('idle');
                    setInfo(null);
                    setLogLines([]);
                    setLineAnim('idle');
                    onComplete?.();
                  }, AUTH_REVEAL_MS),
                );
              }, LINE_EXIT_WAIT_MS),
            );
          }, LOGOUT_LOAD_MS + 300), // 最后一行 + 0.3s
        );
      }, COVER_MS),
    );
  }, [navigate]);

  const transitionTo = useCallback(
    (path: string, opts?: { replace?: boolean; skipTransition?: boolean }) => {
      if (opts?.skipTransition) {
        navigate(path, { replace: opts?.replace });
        return;
      }
      runRoute(path, opts);
    },
    [runRoute, navigate],
  );

  const transitionLogin = useCallback(
    (path = '/home', onComplete?: () => void) => runLogin(path, onComplete),
    [runLogin],
  );

  const transitionLogout = useCallback(
    (onCovered?: () => void, onComplete?: () => void) => runLogout(onCovered, onComplete),
    [runLogout],
  );

  useEffect(() => () => clearAll(), []);

  const isAuth = info?.kind === 'login' || info?.kind === 'logout';
  const dir = info?.dir ?? 'left';

  const copyPosClass =
    dir === 'left' ? 'sp-rt-copy-right' :
    dir === 'right' ? 'sp-rt-copy-left' :
    dir === 'top' ? 'sp-rt-copy-below' :
    dir === 'bottom' ? 'sp-rt-copy-above' :
    'sp-rt-copy-right';

  const emPosClass =
    dir === 'left' ? 'sp-rt-em-br' :
    dir === 'right' ? 'sp-rt-em-bl' :
    dir === 'top' ? 'sp-rt-em-br' :
    dir === 'bottom' ? 'sp-rt-em-tr' :
    'sp-rt-em-bl';

  // 登录/退出线条的 style（JS 驱动位置）
  const getAuthLineStyle = (): React.CSSProperties => {
    if (lineAnim === 'entering') {
      // 从屏幕上方外滑入到中央
      const y = -160 + (linePct / 100) * 160;
      return {
        transform: `skew(-18deg) translateY(${y}vh)`,
        opacity: Math.min(1, linePct / 20), // 前 20% 淡入
      };
    }
    if (lineAnim === 'following') {
      // 跟随进度：从屏幕上方外(-150vh)到屏幕中央(0vh)
      const y = -150 + (linePct / 100) * 150;
      return {
        transform: `skew(-18deg) translateY(${y}vh)`,
        opacity: 1,
      };
    }
    if (lineAnim === 'holding') {
      // 停在屏幕中央
      return {
        transform: 'skew(-18deg) translateY(0vh)',
        opacity: 1,
      };
    }
    if (lineAnim === 'exiting') {
      // 从屏幕下方快速离开
      return {
        transform: 'skew(-18deg) translateY(160vh)',
        opacity: 1,
        transition: `transform ${LINE_EXIT_MS}ms cubic-bezier(0.55, 0, 0.55, 0.2)`,
      };
    }
    return {};
  };

  return (
    <Ctx.Provider value={{ transitionTo, transitionLogin, transitionLogout }}>
      {children}
      {phase !== 'idle' && info && (
        <div className={`sp-route-transition is-${phase} sp-rt-${info.kind} sp-rt-dir-${dir}`} aria-hidden>
          {/* 普通路由转场：CSS 动画驱动 */}
          {!isAuth && (
            <>
              {(dir === 'left' || dir === 'cross') && <i className="sp-rt-line sp-rt-line-v sp-rt-line-left" />}
              {(dir === 'right' || dir === 'cross') && <i className="sp-rt-line sp-rt-line-v sp-rt-line-right" />}
              {(dir === 'top' || dir === 'cross') && <i className="sp-rt-line sp-rt-line-h sp-rt-line-top" />}
              {dir === 'bottom' && <i className="sp-rt-line sp-rt-line-h sp-rt-line-bottom" />}
            </>
          )}
          {/* 登录/退出转场：JS 驱动线条位置 */}
          {isAuth && (
            <i
              className={`sp-rt-line sp-rt-line-v sp-rt-line-left ${info.kind === 'login' ? 'sp-rt-line-login' : 'sp-rt-line-logout'}`}
              style={getAuthLineStyle()}
            />
          )}
          <div className={`sp-route-copy ${copyPosClass}`}>
            <span>{info.kind === 'route' ? `ROUTE / ${info.no}` : info.sub}</span>
            <b>{info.title}</b>
            <small>{info.kind === 'route' ? info.sub : 'STREAM PLATFORM'}</small>
          </div>
          {info.kind === 'login' && (
            <div className="sp-rt-progress">
              <div className="sp-rt-progress-bar">
                <div className="sp-rt-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className={`sp-rt-progress-pct ${flashPct ? 'sp-rt-pct-flash' : ''}`}>{Math.round(progress)}%</span>
            </div>
          )}
          {isAuth && logLines.length > 0 && (
            <div className="sp-rt-logs">
              {logLines.map((line, i) => (
                <div key={i} className="sp-rt-log-line">{line}</div>
              ))}
            </div>
          )}
          <em className={emPosClass}>{info.no}</em>
        </div>
      )}
    </Ctx.Provider>
  );
}
