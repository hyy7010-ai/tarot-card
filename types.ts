/**
 * 从主项目 src/types.ts 里摘出来的、这里真正用到的那部分。
 */
export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  /**
   * 时间戳。三种形态都收：毫秒数、ISO 字符串、Firestore Timestamp。
   * `metrics.ts` 的 toMillis() 负责归一，解析不出来的消息会被丢弃。
   */
  timestamp: number | string | { seconds: number; nanoseconds?: number };
  type?: 'text' | 'image' | 'system';
}
