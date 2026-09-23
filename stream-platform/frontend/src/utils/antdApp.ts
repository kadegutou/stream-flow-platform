import { Modal as staticModal, message as staticMessage, notification as staticNotification } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { NotificationInstance } from 'antd/es/notification/interface';

/**
 * antd 的静态方法（message.xxx / Modal.confirm / notification.xxx）不消费 ConfigProvider
 * 上下文，副作用是暗色模式下提示框仍是浅色皮肤、语言也不跟随。
 *
 * 这里在 `<App>` 挂载后把「上下文内」的实例绑进来，非 React 代码（axios 拦截器、
 * 工具函数）统一通过 appMessage()/appModal() 取用；未绑定前回退到静态方法，
 * 保证 App 挂载前的调用不会报错。
 */
type AppInstances = {
  message: MessageInstance;
  modal: Omit<ModalStaticFunctions, 'warn'>;
  notification: NotificationInstance;
};

let bound: AppInstances | null = null;

export function bindAppInstances(next: AppInstances): void {
  bound = next;
}

export function appMessage(): MessageInstance {
  return bound?.message ?? staticMessage;
}

export function appModal(): Omit<ModalStaticFunctions, 'warn'> {
  return bound?.modal ?? staticModal;
}

export function appNotification(): NotificationInstance {
  return bound?.notification ?? staticNotification;
}
