import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type MySecurePlugin from './main';
import { SecureSettings } from './types';
import { MIN_ITERATIONS, MAX_ITERATIONS } from './constants';

export class SecureSettingTab extends PluginSettingTab {
  plugin: MySecurePlugin;

  constructor(app: App, plugin: MySecurePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Secure Blocks Settings' });

    // PBKDF2 Iterations Setting
    new Setting(containerEl)
      .setName('PBKDF2 Iterations')
      .setDesc(`Higher is safer but slower. Range: ${MIN_ITERATIONS.toLocaleString()} - ${MAX_ITERATIONS.toLocaleString()}`)
      .addText(t => t.setPlaceholder('600000')
        .setValue(String(this.plugin.settings.iterations))
        .onChange(async v => {
          const numValue = Number(v);
          if (isNaN(numValue) || numValue < MIN_ITERATIONS || numValue > MAX_ITERATIONS) {
            new Notice(`Please enter a number between ${MIN_ITERATIONS.toLocaleString()} and ${MAX_ITERATIONS.toLocaleString()}`);
            return;
          }
          this.plugin.settings.iterations = numValue;
          await this.plugin.saveSettings();
        }));

    // Max Decrypt Size Setting
    new Setting(containerEl)
      .setName('Maximum Decrypt Size (MB)')
      .setDesc('Maximum allowed size for decrypted content. Range: 1 - 100 MB')
      .addText(t => t.setPlaceholder('20')
        .setValue(String(this.plugin.settings.maxDecryptSizeMB))
        .onChange(async v => {
          const numValue = Number(v);
          if (isNaN(numValue) || numValue < 1 || numValue > 100) {
            new Notice('Please enter a number between 1 and 100');
            return;
          }
          this.plugin.settings.maxDecryptSizeMB = numValue;
          await this.plugin.saveSettings();
        }));
  }
}
