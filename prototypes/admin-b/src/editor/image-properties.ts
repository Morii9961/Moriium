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

  // Tiptap 3 documents updateAttributes as the node/mark command for changing
  // the current selection. Keeping the command outside Vue also lets a real
  // editor test prove that serialization preserves untouched attributes.
  // https://tiptap.dev/docs/editor/api/commands/nodes-and-marks/update-attributes
  return editor.commands.updateAttributes('moriiumImage', {
    src: attributes.src,
    alt: attributes.alt,
    title: attributes.title === '' ? null : attributes.title,
  });
}
