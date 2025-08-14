const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

// Read version from manifest.json
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

// Files to include in release
const filesToInclude = [
    'main.js',
    'manifest.json',
    'styles.css',
    'README.md'
];

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Create a file to stream archive data to
const zipPath = path.join('dist', `secure-blocks-${version}.zip`);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
});

// Listen for archive errors
archive.on('error', function(err) {
    throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Add files to the archive
filesToInclude.forEach(file => {
    if (fs.existsSync(file)) {
        archive.file(file, { name: file });
        console.log(`Added ${file} to archive`);
    } else {
        console.warn(`Warning: ${file} not found`);
    }
});

// Finalize the archive
archive.finalize();

// Create GitHub release notes
const releaseNotes = `## Secure Blocks v${version}

${version === '0.1.0' ? 'First release of' : 'New release of'} Secure Blocks for Obsidian, providing secure text encryption within your notes.

### Features
- 🔒 AES-GCM encryption for sensitive information
- 🔑 Password-based encryption with PBKDF2
- 🚀 Seamless integration with Obsidian
- 🔄 Easy encryption/decryption workflow
- 🛡️ Automatic file locking for encrypted content

### Installation
1. Download the files from this release
2. Extract them to your vault's plugins folder: \`<vault>/.obsidian/plugins/secure-blocks/\`
3. Enable the plugin in Obsidian settings

### Files
- \`main.js\` - Plugin code
- \`manifest.json\` - Plugin manifest
- \`styles.css\` - Plugin styles
- \`README.md\` - Documentation

### Security
- Uses AES-GCM with 256-bit keys
- PBKDF2 key derivation with SHA-256
- Minimum 100,000 iterations
- Unique random salt per encryption
`;

// Save release notes
fs.writeFileSync(path.join('dist', 'release-notes.md'), releaseNotes);

console.log(`\nRelease package created: ${zipPath}`);
console.log(`Release notes created: ${path.join('dist', 'release-notes.md')}`);
console.log('\nTo create a GitHub release:');
console.log(`1. Run: git tag -a ${version} -m "Release ${version}"`);
console.log(`2. Run: git push origin ${version}`);
console.log('3. Go to GitHub and create a new release using the generated files');
