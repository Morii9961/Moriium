import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

export type MoriiumImageAttributes = {
  src: string;
  alt: string;
  title: string | null;
};

export function selectedImageAttributes(editor: Editor): MoriiumImageAttributes | null {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'moriiumImage') {
    return null;
  }
  return {
    src: String(selection.node.attrs.src ?? ''),
    alt: String(selection.node.attrs.alt ?? ''),
    title: selection.node.attrs.title == null ? null : String(selection.node.attrs.title),
  };
}

export function updateSelectedImage(editor: Editor, attributes: MoriiumImageAttributes): boolean {
  if (!selectedImageAttributes(editor)) return false;
  return editor.commands.updateAttributes('moriiumImage', {
    src: attributes.src,
    alt: attributes.alt,
    title: attributes.title === '' ? null : attributes.title,
  });
}
