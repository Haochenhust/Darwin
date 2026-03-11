import type { OutboundMessage } from '../types.js';
import type {
  FeishuConfirmationCardOptions,
  FeishuInfoCardOptions,
  FeishuProgressStatusCardOptions,
} from './card-builder.js';
import type { FeishuPostOptions } from './message-builder.js';

export type FeishuDebugCommandName =
  | 'help'
  | 'card-info'
  | 'card-confirm'
  | 'card-progress'
  | 'post'
  | 'image';

export interface ParsedFeishuDebugCommand {
  name: FeishuDebugCommandName;
  args: string[];
}

export interface FeishuDebugCommandPayloads {
  infoCard: FeishuInfoCardOptions;
  confirmationCard: FeishuConfirmationCardOptions;
  progressCard: FeishuProgressStatusCardOptions;
  post: FeishuPostOptions;
}

const DEBUG_COMMAND_PREFIX = '/test';

export const parseFeishuDebugCommand = (
  text: string,
): ParsedFeishuDebugCommand | null => {
  const normalizedText = text.trim();

  if (!normalizedText.startsWith(DEBUG_COMMAND_PREFIX)) {
    return null;
  }

  const parts = normalizedText.split(/\s+/);
  const [, ...rawArgs] = parts;
  const [category = '', variant = '', ...remainingArgs] = rawArgs;

  if (category === 'help' || category === '') {
    return {
      name: 'help',
      args: [],
    };
  }

  if (category === 'card' && variant === 'info') {
    return { name: 'card-info', args: remainingArgs };
  }

  if (category === 'card' && variant === 'confirm') {
    return { name: 'card-confirm', args: remainingArgs };
  }

  if (category === 'card' && variant === 'progress') {
    return { name: 'card-progress', args: remainingArgs };
  }

  if (category === 'post') {
    return { name: 'post', args: [variant, ...remainingArgs].filter(Boolean) };
  }

  if (category === 'image') {
    return { name: 'image', args: [variant, ...remainingArgs].filter(Boolean) };
  }

  return {
    name: 'help',
    args: [],
  };
};

export const buildFeishuDebugHelpText = (): string => {
  return [
    'Feishu debug commands:',
    '/test help',
    '/test card info',
    '/test card confirm',
    '/test card progress',
    '/test post',
    '/test image <image_key>',
  ].join('\n');
};

export const buildFeishuDebugPayloads = (): FeishuDebugCommandPayloads => {
  return {
    infoCard: {
      title: 'Darwin 信息展示卡',
      summary: '这是一张用于验证飞书 interactive card 链路的信息展示卡。',
      fields: [
        { label: '消息类型', value: 'interactive' },
        { label: '卡片类型', value: 'info display' },
        { label: '环境', value: 'debug route', short: false },
      ],
      note: '这条消息来自临时 debug command 路由。',
      template: 'blue',
    },
    confirmationCard: {
      title: 'Darwin 确认卡',
      summary: '这是一张按钮确认卡，用来验证按钮渲染和交互外观。',
      actions: [
        {
          text: '确认',
          type: 'primary',
          value: {
            action: 'confirm',
          },
        },
        {
          text: '取消',
          type: 'default',
          value: {
            action: 'cancel',
          },
        },
      ],
      note: '按钮点击回调还没接，这一步只验证展示层。',
      template: 'orange',
    },
    progressCard: {
      title: 'Darwin 进度状态卡',
      summary: '这是一张进度卡，用来验证阶段信息和进度展示。',
      status: 'running',
      progressPercent: 60,
      fields: [
        { label: '任务', value: 'Feishu rich message testing' },
        { label: '阶段', value: 'Step 1/3 cards first' },
      ],
      steps: [
        { title: '信息卡', status: 'done', detail: '已打通发送接口' },
        { title: '确认卡', status: 'done', detail: '已支持按钮展示' },
        { title: '进度卡', status: 'running', detail: '当前正在验证显示效果' },
      ],
      note: '后续可以把真实 Agent 执行状态接到这里。',
    },
    post: {
      title: 'Darwin 富文本消息',
      lines: [
        [
          { tag: 'text', text: '这是一条 ' },
          { tag: 'text', text: 'post', unEscape: false },
          { tag: 'text', text: ' 富文本消息，用来验证多段内容排版。' },
        ],
        [
          { tag: 'text', text: '你也可以放链接：' },
          {
            tag: 'a',
            text: 'Open Feishu',
            href: 'https://open.feishu.cn/',
          },
        ],
      ],
    },
  };
};

export const resolveReplyTarget = (
  target: Pick<OutboundMessage, 'receiveId' | 'receiveIdType'>,
): Pick<OutboundMessage, 'receiveId' | 'receiveIdType'> => target;
