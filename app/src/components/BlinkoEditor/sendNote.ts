import type { NavigateFunction } from 'react-router-dom';
import type { BlinkoStore } from '@/store/blinkoStore';
import type { EditorSubmission } from '../Common/Editor/editorSubmission';
import { NoteType } from '@shared/lib/types';

type SendContext = {
  blinko: BlinkoStore;
  isCreateMode: boolean;
  navigate: NavigateFunction;
  searchParams: URLSearchParams;
  pathname: string;
  onSended?: () => void;
};

export async function sendBlinkoNote(
  { blinko, isCreateMode, navigate, searchParams, pathname, onSended }: SendContext,
  { content, files, references, noteType, metadata, canClear = () => true }: EditorSubmission,
) {
  if (blinko.upsertNote.loading.value) return false;
  const attachments = files.map(i => ({ name: i.name, path: i.uploadPath, size: i.size, type: i.type }));
  if (isCreateMode) {
    const saved = await blinko.upsertNote.call({
      type: noteType, references, refresh: false, content, metadata,
      // @ts-expect-error Existing upsert input types require persisted fields for new attachments.
      attachments,
    }, { clearEditor: false });
    if (!saved) return false;
    blinko.updateTicker++;
    if (!canClear()) return false;
    if (blinko.noteTypeDefault == NoteType.NOTE && searchParams.get('path') != 'notes') {
      await navigate('/?path=notes');
      blinko.forceQuery++;
    }
    if (blinko.noteTypeDefault == NoteType.BLINKO && pathname != '/') {
      await navigate('/');
      blinko.forceQuery++;
    }
    if (!canClear()) return false;
    blinko.createAttachmentsStorage.clear();
    blinko.noteContent = '';
    blinko.createContentStorage.save({ content: '' });
    blinko.createContentStorage.clear();
  } else {
    if (!blinko.curSelectedNote) return false;
    const noteId = blinko.curSelectedNote.id;
    const saved = await blinko.upsertNote.call({
      id: noteId, type: noteType, content,
      references, metadata, refresh: true,
      // @ts-expect-error Existing upsert input types require persisted fields for new attachments.
      attachments,
    }, { clearEditor: false });
    if (!saved || !canClear() || blinko.curSelectedNote?.id != noteId) return false;
    try {
      blinko.editAttachmentsStorage.save(blinko.editAttachmentsStorage.list.filter(i => i.id != noteId));
      blinko.editContentStorage.removeByFind(i => i.id == noteId);
    } catch (error) {
      console.error(error);
    }
  }
  if (!canClear()) return false;
  onSended?.();
}
