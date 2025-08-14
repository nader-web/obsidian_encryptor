# Secure Blocks - Obsidian Plugin

A secure encryption plugin for Obsidian that allows you to encrypt and decrypt text blocks using AES-GCM encryption.

## Features

- 🔒 Encrypt sensitive information directly in your notes
- 🔑 Secure encryption using AES-GCM
- 🚀 Seamless integration with Obsidian's interface
- 🔄 Easy encryption/decryption with a single click
- 🔒🔑 Support for password-based encryption

## Installation

### From Obsidian

1. Open Obsidian
2. Go to Settings > Community plugins
3. Search for "Secure Blocks"
4. Click "Install" and then "Enable"

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/nader-web/obsidian-secure-blocks/releases)
2. Extract the zip file into your vault's plugins folder: `<vault>/.obsidian/plugins/secure-blocks`
3. Reload Obsidian
4. Enable the plugin in Settings > Community plugins

## Usage

1. Select the text you want to encrypt
2. Click the lock icon in the ribbon or use the command palette
3. Enter your encryption password when prompted
4. The selected text will be replaced with an encrypted block
5. To decrypt, click the lock icon on an encrypted block and enter your password

## Security Notes

- Always use a strong, unique password
- Remember that losing your password means losing access to your encrypted data
- The plugin uses AES-GCM encryption which provides both confidentiality and integrity
- The encryption process uses:
  - AES-GCM with 256-bit keys
  - PBKDF2 key derivation with SHA-256
  - Minimum 100,000 iterations for key derivation
  - Unique random salt for each encryption
  - Authentication tag validation for integrity
- No passwords are stored anywhere; they're only held in memory during operations

## Development

1. Clone this repo
2. Run `npm install` to install dependencies
3. Run `npm run dev` to compile in watch mode
4. Run `npm run build` to create a production build

### Testing

- Run `npm test` to run tests once
- Run `npm run test:watch` for development with test watching
- Run `npm run test:coverage` to generate coverage report

### Code Quality

- TypeScript for type safety
- Jest for testing
- ESLint for code quality
- 100% test coverage requirement for core crypto operations

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
