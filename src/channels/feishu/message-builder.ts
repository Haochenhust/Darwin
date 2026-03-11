import type { OutboundMessage } from '../types.js';

export interface CreateImageMessageOptions {
  receiveId: OutboundMessage['receiveId'];
  receiveIdType: OutboundMessage['receiveIdType'];
  imageKey: string;
}

export interface FeishuPostTextBlock {
  tag: 'text';
  text: string;
  unEscape?: boolean;
}

export interface FeishuPostLinkBlock {
  tag: 'a';
  text: string;
  href: string;
}

export interface FeishuPostImageBlock {
  tag: 'img';
  imageKey: string;
}

export type FeishuPostBlock =
  | FeishuPostTextBlock
  | FeishuPostLinkBlock
  | FeishuPostImageBlock;

export interface FeishuPostOptions {
  title: string;
  lines: FeishuPostBlock[][];
  locale?: 'zh_cn' | 'en_us' | 'ja_jp';
}

type FeishuPostContentBlock =
  | {
      tag: 'text';
      text: string;
      un_escape?: boolean;
    }
  | {
      tag: 'a';
      text: string;
      href: string;
    }
  | {
      tag: 'img';
      image_key: string;
    };

const toPostContentBlock = (block: FeishuPostBlock): FeishuPostContentBlock => {
  switch (block.tag) {
    case 'text':
      return {
        tag: 'text',
        text: block.text.trim(),
        ...(typeof block.unEscape === 'boolean' ? { un_escape: block.unEscape } : {}),
      };
    case 'a':
      return {
        tag: 'a',
        text: block.text.trim(),
        href: block.href,
      };
    case 'img':
      return {
        tag: 'img',
        image_key: block.imageKey,
      };
  }
};

export const createImageMessage = (
  options: CreateImageMessageOptions,
): OutboundMessage => {
  return {
    receiveId: options.receiveId,
    receiveIdType: options.receiveIdType,
    content: JSON.stringify({
      image_key: options.imageKey,
    }),
    messageType: 'image',
  };
};

export const buildPostMessageContent = (options: FeishuPostOptions): string => {
  const locale = options.locale ?? 'zh_cn';

  return JSON.stringify({
    [locale]: {
      title: options.title.trim(),
      content: options.lines.map((line) => line.map(toPostContentBlock)),
    },
  });
};

export interface CreatePostMessageOptions {
  receiveId: OutboundMessage['receiveId'];
  receiveIdType: OutboundMessage['receiveIdType'];
  post: FeishuPostOptions;
}

export const createPostMessage = (
  options: CreatePostMessageOptions,
): OutboundMessage => {
  return {
    receiveId: options.receiveId,
    receiveIdType: options.receiveIdType,
    content: buildPostMessageContent(options.post),
    messageType: 'post',
  };
};
