import { App, Notice, Modal, Setting, TextComponent, ButtonComponent } from 'obsidian';

export class PasswordService {
    private passwordModalPromise: Promise<string | null> | null = null;

    constructor(private app: App) {}

    async promptPassword(): Promise<string | null> {
        // Ensure only one password prompt at a time
        if (this.passwordModalPromise) {
            return this.passwordModalPromise;
        }

        this.passwordModalPromise = new Promise((resolve) => {
            new PasswordPromptModal(this.app, (result) => {
                this.passwordModalPromise = null;
                resolve(result || null);
            }).open();
        });

        return this.passwordModalPromise;
    }

}

class PasswordPromptModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Enter Password" });

        const form = contentEl.createEl("form");
        form.onsubmit = (e) => {
            e.preventDefault();
            this.close();
            this.onSubmit(this.result);
        };

        const setting = new Setting(form)
            .setName("Password")
            .setDesc("Required for the operation.")
            .addText((text: TextComponent) => {
                text.inputEl.type = 'password';
                text.onChange((value: string) => { this.result = value; });
                text.inputEl.focus();
            });

        setting.addButton((btn: ButtonComponent) =>
            btn
                .setButtonText("Submit")
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.result);
                }));
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }
}
