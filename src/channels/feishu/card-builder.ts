import type { OutboundMessage } from '../types.js';

type FeishuCardTemplate =
  | 'blue'
  | 'wathet'
  | 'turquoise'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'carmine'
  | 'violet'
  | 'purple'
  | 'indigo'
  | 'grey';

export interface FeishuInfoCardField {
  label: string;
  value: string;
  short?: boolean;
}

export interface FeishuInfoCardOptions {
  title: string;
  summary?: string;
  fields?: FeishuInfoCardField[];
  note?: string;
  template?: FeishuCardTemplate;
}

export interface FeishuCardButtonAction {
  text: string;
  type?: 'default' | 'primary' | 'danger';
  value?: Record<string, string>;
  url?: string;
}

export interface FeishuConfirmationCardOptions {
  title: string;
  summary: string;
  actions: FeishuCardButtonAction[];
  note?: string;
  template?: FeishuCardTemplate;
}

export interface FeishuProgressStep {
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
}

export interface FeishuProgressStatusCardOptions {
  title: string;
  summary?: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'failed';
  progressPercent?: number;
  fields?: FeishuInfoCardField[];
  steps?: FeishuProgressStep[];
  note?: string;
  template?: FeishuCardTemplate;
}

interface FeishuCardText {
  tag: 'plain_text' | 'lark_md';
  content: string;
}

interface FeishuInfoCardPayload {
  config: {
    wide_screen_mode: boolean;
    enable_forward: boolean;
  };
  header: {
    template: FeishuCardTemplate;
    title: {
      tag: 'plain_text';
      content: string;
    };
  };
  elements: Array<Record<string, unknown>>;
}

const toPlainText = (value: string): string => value.trim();

const toMarkdownText = (value: string): FeishuCardText => ({
  tag: 'lark_md',
  content: value.trim(),
});

const createCardPayload = (
  title: string,
  template: FeishuCardTemplate,
  elements: FeishuInfoCardPayload['elements'],
): FeishuInfoCardPayload => {
  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      template,
      title: {
        tag: 'plain_text',
        content: toPlainText(title),
      },
    },
    elements,
  };
};

const buildFieldMarkdown = (field: FeishuInfoCardField): string => {
  return `**${field.label.trim()}**\n${field.value.trim()}`;
};

const buildFieldsElement = (fields: FeishuInfoCardField[]): Record<string, unknown> => {
  return {
    tag: 'div',
    fields: fields.map((field) => ({
      is_short: field.short ?? true,
      text: toMarkdownText(buildFieldMarkdown(field)),
    })),
  };
};

const buildNoteElement = (note: string): Record<string, unknown> => {
  return {
    tag: 'note',
    elements: [
      {
        tag: 'lark_md',
        content: note.trim(),
      },
    ],
  };
};

export const buildInfoDisplayCard = (options: FeishuInfoCardOptions): string => {
  const elements: FeishuInfoCardPayload['elements'] = [];

  if (options.summary?.trim()) {
    elements.push({
      tag: 'div',
      text: toMarkdownText(options.summary),
    });
  }

  if (options.fields?.length) {
    elements.push(buildFieldsElement(options.fields));
  }

  if (options.note?.trim()) {
    elements.push(buildNoteElement(options.note));
  }

  return JSON.stringify(createCardPayload(options.title, options.template ?? 'blue', elements));
};

export interface CreateInfoDisplayCardMessageOptions {
  receiveId: OutboundMessage['receiveId'];
  receiveIdType: OutboundMessage['receiveIdType'];
  card: FeishuInfoCardOptions;
}

export const createInfoDisplayCardMessage = (
  options: CreateInfoDisplayCardMessageOptions,
): OutboundMessage => {
  return {
    receiveId: options.receiveId,
    receiveIdType: options.receiveIdType,
    content: buildInfoDisplayCard(options.card),
    messageType: 'interactive',
  };
};

const buildButtonElement = (button: FeishuCardButtonAction): Record<string, unknown> => {
  const element: Record<string, unknown> = {
    tag: 'button',
    text: {
      tag: 'plain_text',
      content: button.text.trim(),
    },
    type: button.type ?? 'default',
  };

  if (button.value) {
    element.value = button.value;
  }

  if (button.url) {
    element.url = button.url;
  }

  return element;
};

export const buildConfirmationCard = (options: FeishuConfirmationCardOptions): string => {
  const elements: FeishuInfoCardPayload['elements'] = [
    {
      tag: 'div',
      text: toMarkdownText(options.summary),
    },
    {
      tag: 'action',
      actions: options.actions.map(buildButtonElement),
    },
  ];

  if (options.note?.trim()) {
    elements.push(buildNoteElement(options.note));
  }

  return JSON.stringify(createCardPayload(options.title, options.template ?? 'orange', elements));
};

export interface CreateConfirmationCardMessageOptions {
  receiveId: OutboundMessage['receiveId'];
  receiveIdType: OutboundMessage['receiveIdType'];
  card: FeishuConfirmationCardOptions;
}

export const createConfirmationCardMessage = (
  options: CreateConfirmationCardMessageOptions,
): OutboundMessage => {
  return {
    receiveId: options.receiveId,
    receiveIdType: options.receiveIdType,
    content: buildConfirmationCard(options.card),
    messageType: 'interactive',
  };
};

const buildProgressBar = (progressPercent: number): string => {
  const safePercent = Math.max(0, Math.min(100, Math.round(progressPercent)));
  const filledSlots = Math.round(safePercent / 10);
  return `[${'#'.repeat(filledSlots)}${'-'.repeat(10 - filledSlots)}] ${safePercent}%`;
};

const statusToTemplate = (
  status: FeishuProgressStatusCardOptions['status'],
): FeishuCardTemplate => {
  switch (status) {
    case 'success':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'failed':
      return 'red';
    case 'running':
      return 'blue';
    case 'pending':
    default:
      return 'grey';
  }
};

const statusToLabel = (status: FeishuProgressStep['status']): string => {
  switch (status) {
    case 'done':
      return 'DONE';
    case 'running':
      return 'RUNNING';
    case 'failed':
      return 'FAILED';
    case 'pending':
    default:
      return 'PENDING';
  }
};

const buildStepMarkdown = (step: FeishuProgressStep, index: number): string => {
  const detail = step.detail?.trim() ? `\n${step.detail.trim()}` : '';
  return `${index + 1}. **${step.title.trim()}** [${statusToLabel(step.status)}]${detail}`;
};

export const buildProgressStatusCard = (
  options: FeishuProgressStatusCardOptions,
): string => {
  const elements: FeishuInfoCardPayload['elements'] = [];

  if (options.summary?.trim()) {
    elements.push({
      tag: 'div',
      text: toMarkdownText(options.summary),
    });
  }

  if (typeof options.progressPercent === 'number') {
    elements.push({
      tag: 'div',
      text: toMarkdownText(`**Progress**\n${buildProgressBar(options.progressPercent)}`),
    });
  }

  if (options.fields?.length) {
    elements.push(buildFieldsElement(options.fields));
  }

  if (options.steps?.length) {
    elements.push({
      tag: 'div',
      text: toMarkdownText(options.steps.map(buildStepMarkdown).join('\n\n')),
    });
  }

  if (options.note?.trim()) {
    elements.push(buildNoteElement(options.note));
  }

  return JSON.stringify(
    createCardPayload(
      options.title,
      options.template ?? statusToTemplate(options.status),
      elements,
    ),
  );
};

export interface CreateProgressStatusCardMessageOptions {
  receiveId: OutboundMessage['receiveId'];
  receiveIdType: OutboundMessage['receiveIdType'];
  card: FeishuProgressStatusCardOptions;
}

export const createProgressStatusCardMessage = (
  options: CreateProgressStatusCardMessageOptions,
): OutboundMessage => {
  return {
    receiveId: options.receiveId,
    receiveIdType: options.receiveIdType,
    content: buildProgressStatusCard(options.card),
    messageType: 'interactive',
  };
};
