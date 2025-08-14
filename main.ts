import { Plugin, Editor, Notice, Modal, App, Setting, MarkdownView, setIcon } from 'obsidian';
import { PasswordService } from './services/passwordService';
import { EditorService } from './services/editorService';
import { CryptoService } from './services/cryptoService';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, WidgetType, ViewUpdate, DecorationSet } from '@codemirror/view';
import { encryptText, decryptText, isEncryptedBlock } from './crypto';
import { MIN_ITERATIONS, MAX_ITERATIONS, BEGIN_MARKER, END_MARKER } from './constants';
import { clampIterations, clampMaxSize } from './utils';
import { getBlockRange } from './detect';
import { SecureSettingTab } from './settings';
import { SecureSettings } from './types';

declare module 'obsidian' {
  interface App {
    plugins: {
      plugins: {
        [key: string]: any;
        'secure-blocks'?: any;
      };
      getPlugin(id: string): any;
    };
  }
}

// --- WIDGET FOR HIDING ENCRYPTED BLOCKS ---
class EncryptedBlockWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'encrypted-block-widget';
    setIcon(span, 'lock'); // Add a lock icon
    span.createSpan({ text: 'Encrypted Content' });
    span.title = 'Click to decrypt';
    return span;
  }
}

// --- VIEWPLUGIN TO APPLY DECORATIONS ---
const encryptedBlockHiderPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const decorations: any[] = [];
    const cursor = view.state.selection.main.head;

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      let pos = text.indexOf(BEGIN_MARKER);
      
      while (pos !== -1) {
        const start = from + pos;
        const endMarkerPos = text.indexOf(END_MARKER, pos);
        
        if (endMarkerPos !== -1) {
          const end = from + endMarkerPos + END_MARKER.length;
          
          // Only hide the block if the cursor is not inside it
          if (cursor < start || cursor > end) {
            const widget = Decoration.widget({
              widget: new EncryptedBlockWidget(),
              side: 1,
              block: true
            });
            decorations.push(widget.range(start, end));
          }
          pos = text.indexOf(BEGIN_MARKER, endMarkerPos);
        } else {
          pos = -1; // Malformed block, stop searching
        }
      }
    }
    return Decoration.set(decorations);
  }
}, {
  decorations: (v) => v.decorations,
});

// Default settings with safe iteration count
export const DEFAULTS: SecureSettings = { 
    iterations: 600_000,
    maxDecryptSizeMB: 20
};

// Generic error message for user-facing errors
const GENERIC_ERROR_MSG = 'Operation failed. Please check the console for details.';

// Password prompt functionality moved to PasswordService

export default class MySecurePlugin extends Plugin {
  settings: SecureSettings;
  private editorLock: Compartment;
  private passwordService: PasswordService;
  private editorService: EditorService;
  private cryptoService: CryptoService;

  // --- LOAD STYLESHEET ---
  private async loadStylesheet(): Promise<void> {
    try {
      const plugin = this.app.plugins.getPlugin('secure-blocks');
      if (!plugin) {
        console.error('Could not find plugin instance');
        return;
      }
      const manifest = (plugin as any).manifest;
      if (!manifest) {
        console.error('Could not find plugin manifest');
        return;
      }
      const cssPath = `${manifest.dir}/styles.css`;
      const css = await this.app.vault.adapter.read(cssPath);
      const styleEl = document.createElement('style');
      styleEl.id = 'secure-blocks-styles';
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
    } catch (e) {
      console.error('Failed to load styles:', e);
    }
  }

  checkAndUpdateLockState(editor: Editor, forceLockState?: boolean): boolean {
    const cm6 = (editor as any).cm as EditorView;
    if (!cm6) return false;

    const content = editor.getValue();
    const shouldBeLocked = forceLockState !== undefined ? forceLockState : isEncryptedBlock(content.trim());
    const isLocked = cm6.state.readOnly;

    if (shouldBeLocked !== isLocked) {
      cm6.dispatch({
        effects: this.editorLock.reconfigure(EditorState.readOnly.of(shouldBeLocked))
      });

      if (shouldBeLocked) {
        new Notice('File is encrypted and locked. 🔒', 2000);
      }
      return true;
    }
    return false;
  }

  updateEditorLockState() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) return;

    this.checkAndUpdateLockState(editor);
  }

  async onload() {
    await this.loadSettings();
    
    // Initialize services
    this.passwordService = new PasswordService(this.app);
    this.editorService = new EditorService();
    this.cryptoService = new CryptoService(this.settings.iterations);
    
    this.addSettingTab(new SecureSettingTab(this.app, this));
    
    // --- MODIFICATIONS FOR NEW FEATURE ---
    this.editorLock = new Compartment();
    // Register both the lock compartment AND the new hider plugin
    this.registerEditorExtension([
        this.editorLock.of(EditorState.readOnly.of(false)),
        encryptedBlockHiderPlugin 
    ]);

    // Load the new stylesheet
    this.app.workspace.onLayoutReady(() => {
        this.loadStylesheet();
    });
    // --- END MODIFICATIONS ---

    this.addRibbonIcon('lock', 'Encrypt/Decrypt Block', (evt: MouseEvent) => {
        this.triggerEncryptDecrypt();
    });

    this.registerEvent(
        this.app.workspace.on('active-leaf-change', () => this.updateEditorLockState())
    );
    setTimeout(() => this.updateEditorLockState(), 100);

    this.addCommand({
      id: 'encrypt-decrypt-selection-or-block',
      name: 'Encrypt/Decrypt (ask for password)',
      editorCallback: (editor: Editor) => {
        this.encryptDecryptLogic(editor);
      }
    });

    this.addCommand({
      id: 'encrypt-decrypt-entire-file',
      name: 'Encrypt/Decrypt Entire File',
      editorCallback: async (editor: Editor) => {
        const fileContent = editor.getValue();
        if (!fileContent) {
            new Notice('File is empty. Nothing to do.');
            return;
        }

        let pwd = await this.passwordService.promptPassword();
        if (!pwd) {
            new Notice('Operation cancelled: Password is required.');
            return;
        }

        try {
            await this.handleFileEncryption(editor, fileContent, pwd);
        } catch (e: any) {
            new Notice(`Operation failed: ${e.message ?? 'Incorrect password or corrupted data.'}`);
        } finally {
            setTimeout(() => this.updateEditorLockState(), 0);
        }
      }
    });
  }

  triggerEncryptDecrypt() {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.editor) {
          this.encryptDecryptLogic(activeView.editor);
      } else {
          new Notice('Please open a markdown file to use this feature.');
      }
  }

  async encryptDecryptLogic(editor: Editor) {
    try {
        const selection = editor.getSelection();
        const cursorOffset = editor.posToOffset(editor.getCursor());

        // --- NEW LOGIC STRUCTURE ---
        // 1. Prioritize acting on a selection if one exists.
        if (selection) {
            if (isEncryptedBlock(selection.trim())) {
                // DECRYPT SELECTION
                let pwd = await this.passwordService.promptPassword();
                if (!pwd) return;
                const plain = await decryptText(selection.trim(), pwd, this.settings.iterations);
                pwd = null;
                
                // Unlock editor before replacing content
                // Check lock state and unlock for content update
                this.checkAndUpdateLockState(editor, false);
                
                // Replace selection with decrypted content
                editor.replaceSelection(plain);
                new Notice('Selection decrypted.');
                
                // Update lock state after content change
                setTimeout(() => this.checkAndUpdateLockState(editor), 0);
            } else {
                // ENCRYPT SELECTION
                let pwd = await this.passwordService.promptPassword();
                if (!pwd) return;
                const encryptedBlock = await encryptText(selection, pwd, { iterations: this.settings.iterations });
                pwd = null;
                
                editor.replaceSelection(`\n${encryptedBlock}\n`);
                new Notice('Selection encrypted.');
            }
        } 
        // 2. If no selection, check if the cursor is inside a block.
        else {
            const blockRange = getBlockRange(editor.getValue(), cursorOffset, cursorOffset);
            if (blockRange) {
                // DECRYPT BLOCK BY CURSOR POSITION
                let pwd = await this.passwordService.promptPassword();
                if (!pwd) return;
                const plain = await decryptText(blockRange.block, pwd, this.settings.iterations);
                pwd = null;
                
                // Check lock state and unlock for content update
                this.checkAndUpdateLockState(editor, false);
                
                editor.replaceRange(plain, editor.offsetToPos(blockRange.beginIdx), editor.offsetToPos(blockRange.endIdx));
                new Notice('Block decrypted.');
                
                // Update lock state after content change
                setTimeout(() => this.checkAndUpdateLockState(editor), 0);
            }
            // 3. If no selection and not in a block, perform full-file action.
            else {
                const fileContent = editor.getValue();
                if (!fileContent) {
                    new Notice('File is empty. Nothing to do.');
                    return;
                }

                let pwd = await this.passwordService.promptPassword();
                if (!pwd) return;

                await this.handleFileEncryption(editor, fileContent, pwd);
            }
        }
    } catch (e: any) {
        console.error('Operation failed:', e);
        new Notice(e.message ?? GENERIC_ERROR_MSG);
    } finally {
        setTimeout(() => this.updateEditorLockState(), 0);
    }
  }

  async loadSettings() {
    const savedSettings = await this.loadData() || {};
    this.settings = {
      iterations: clampIterations(savedSettings.iterations ?? DEFAULTS.iterations),
      maxDecryptSizeMB: clampMaxSize(savedSettings.maxDecryptSizeMB ?? DEFAULTS.maxDecryptSizeMB)
    };
  }

  async saveSettings() {
    const settingsToSave = {
      iterations: clampIterations(this.settings.iterations),
      maxDecryptSizeMB: clampMaxSize(this.settings.maxDecryptSizeMB)
    };
    await this.saveData(settingsToSave);
  }

  /**
   * Helper function to handle file-level encryption/decryption
   */
  private async handleFileEncryption(editor: Editor, fileContent: string, password: string): Promise<void> {
    if (isEncryptedBlock(fileContent.trim())) {
        // DECRYPT ENTIRE FILE
        const plainText = await decryptText(fileContent.trim(), password, this.settings.iterations);
        
        // Unlock editor before setting content
        this.checkAndUpdateLockState(editor, false);
        
        editor.setValue(plainText);
        new Notice('File decrypted successfully.');
        
        // Update lock state after content change
        setTimeout(() => this.checkAndUpdateLockState(editor), 0);
    } else {
        // ENCRYPT ENTIRE FILE
        const encryptedFile = await encryptText(fileContent, password, { iterations: this.settings.iterations });
        
        // Unlock editor before setting content
        const cm6 = (editor as any).cm as EditorView;
        if (cm6) {
            cm6.dispatch({ effects: this.editorLock.reconfigure(EditorState.readOnly.of(false)) });
        }
        
        editor.setValue(encryptedFile);
        new Notice('File encrypted successfully.');
    }
  }

  // Password prompt functionality moved to PasswordService
}