import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { eventBus } from '@/lib/event';
import type { EditorStore } from './editorStore';
import type { OnSendContentType } from './type';
import { cloneDeep, isEqual } from 'lodash';
import { toJS } from 'mobx';

export type EditorSubmission = OnSendContentType & { canClear?: () => boolean };

function snapshotEditor(store: EditorStore) {
  return {
    content: store.vditor?.getValue() ?? '',
    attachments: store.files.map(i => ({ name: i.name, size: i.size, type: i.type, path: i.uploadPromise.value })),
    references: [...store.references],
    noteType: store.noteType,
    metadata: cloneDeep(toJS(store.metadata)),
  };
}

// Keep the lock until callbacks and cleanup finish, including navigation/dialog close.
export async function sendEditorContent(store: EditorStore) {
  if (!store.canSend || store.isSending) return;
  store.isSending = true;
  try {
    if (store.mode == 'create' && store.currentTagLabel != '') {
      store.vditor?.insertValue(`\n\n${store.currentTagLabel} `);
      store.onChange?.(store.vditor?.getValue() ?? '');
    }
    const snapshot = snapshotEditor(store);
    const editor = store.vditor;
    const submission: EditorSubmission = {
      content: snapshot.content,
      files: store.files.map((i) => ({ ...i, uploadPath: i.uploadPromise.value })),
      noteType: snapshot.noteType,
      references: snapshot.references,
      metadata: snapshot.metadata,
      canClear: () => store.vditor === editor && isEqual(snapshot, snapshotEditor(store)),
    };
    const sent = await store.onSend?.(submission);
    // False also preserves a newer draft after a successful save; legacy void still clears.
    if (sent === false) return;
    store.clearEditor();
    RootStore.Get(AiStore).isWriting = false;
    eventBus.emit('editor:setFullScreen', false);
  } catch (error) {
    console.error('Failed to send content:', error);
  } finally {
    store.isSending = false;
  }
}
