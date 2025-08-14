import { Editor } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment, StateEffect } from '@codemirror/state';

export class EditorService {
    private editorLockCompartment: Compartment;

    constructor() {
        this.editorLockCompartment = new Compartment();
    }

    getLockState(editor: Editor): boolean {
        const cm6 = (editor as any).cm as EditorView;
        if (!cm6) return false;
        return cm6.state.readOnly;
    }

    setLockState(editor: Editor, locked: boolean): boolean {
        const cm6 = (editor as any).cm as EditorView;
        if (!cm6) return false;

        const isLocked = this.getLockState(editor);
        if (isLocked === locked) return false;

        const compartment = this.editorLockCompartment;
        cm6.dispatch({
            effects: compartment.reconfigure(EditorState.readOnly.of(locked))
        });

        return true;
    }

    getEditorContent(editor: Editor): string {
        return editor.getValue();
    }

    setEditorContent(editor: Editor, content: string): void {
        // Ensure we're working with strings
        if (typeof content !== 'string') {
            throw new Error('Content must be a string');
        }
        editor.setValue(content);
    }

    replaceSelection(editor: Editor, content: string): void {
        editor.replaceSelection(content);
    }

    replaceRange(editor: Editor, content: string, from: number, to: number): void {
        const fromPos = editor.offsetToPos(from);
        const toPos = editor.offsetToPos(to);
        editor.replaceRange(content, fromPos, toPos);
    }

    getSelection(editor: Editor): string {
        return editor.getSelection();
    }

    getCursorOffset(editor: Editor): number {
        return editor.posToOffset(editor.getCursor());
    }
}
